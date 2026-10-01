'use client';

import { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import {
  getDistanceFromLatLonInM,
  generateCombinations,
  getGoogleMapsLink as buildGoogleMapsLink,
  validateSearchParams,
  sortCombinationsByPathDistance,
  mapsErrorMessage,
  mapWithConcurrency,
  filterByDistance,
} from '@/lib/where-to';
import styles from './WhereToApp.module.scss';

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const MAX_ROUTES_TO_TEST = 10;
const ROUTE_CONCURRENCY = 4;

// Text Search results carry formatted_address; only Nearby Search fills vicinity.
const addressOf = (p: google.maps.places.PlaceResult) => p.vicinity ?? p.formatted_address;

const toPoint = (l: google.maps.LatLng) => ({ lat: l.lat(), lng: l.lng() });

interface PlaceOption {
    name: string;
    vicinity: string;
    location: google.maps.LatLng;
}

interface WaypointData {
    value: string;
    options: PlaceOption[];
}

interface RouteResult {
    response: google.maps.DirectionsResult;
    places: PlaceOption[];
    duration: number; // in seconds
}

type MapStatus = 'loading' | 'ready' | 'error';

class MapsStatusError extends Error {
    constructor(readonly status: string) {
        super(mapsErrorMessage(status) ?? status);
    }
}

declare global {
    interface Window {
        gm_authFailure?: () => void;
    }
}

export default function WhereToApp() {
    const mapRef = useRef<HTMLDivElement>(null);
    const [mapStatus, setMapStatus] = useState<MapStatus>('loading');
    const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);

    // Form State
    const [startQuery, setStartQuery] = useState('');
    const [endQuery, setEndQuery] = useState('');
    const [sameStartEnd, setSameStartEnd] = useState(false);
    const [waypoints, setWaypoints] = useState<{ id: number, value: string }[]>([
        { id: 1, value: '' },
        { id: 2, value: '' }
    ]);

    // App State
    const [isSearching, setIsSearching] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<RouteResult[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Services
    const directionsService = useRef<google.maps.DirectionsService | null>(null);
    const directionsRenderer = useRef<google.maps.DirectionsRenderer | null>(null);
    const placesService = useRef<google.maps.places.PlacesService | null>(null);
    const geocoder = useRef<google.maps.Geocoder | null>(null);

    // Place picked from autocomplete; cleared when the user edits the text so it can't go stale.
    const startPlaceRef = useRef<google.maps.places.PlaceResult | null>(null);
    const endPlaceRef = useRef<google.maps.places.PlaceResult | null>(null);

    const mapInitRef = useRef(false);
    const acStartRef = useRef<google.maps.places.Autocomplete | null>(null);

    useEffect(() => {
        if (mapInitRef.current) return;
        mapInitRef.current = true;

        // Google calls this (instead of rejecting) when the key is invalid or the referrer isn't allowed.
        window.gm_authFailure = () => setMapStatus('error');

        const loadMaps = async () => {
            try {
                setOptions({ key: API_KEY, v: "weekly" });

                const mapsLib = await importLibrary("maps") as google.maps.MapsLibrary;
                await importLibrary("places");
                await importLibrary("geocoding");
                await importLibrary("routes");

                if (mapRef.current) {
                    const map = new mapsLib.Map(mapRef.current, {
                        center: { lat: 39.50, lng: -98.35 },
                        zoom: 4,
                        mapTypeControl: false,
                        streetViewControl: false
                    });
                    setMapInstance(map);

                    directionsService.current = new google.maps.DirectionsService();
                    directionsRenderer.current = new google.maps.DirectionsRenderer();
                    directionsRenderer.current.setMap(map);
                    placesService.current = new google.maps.places.PlacesService(map);
                    geocoder.current = new google.maps.Geocoder();
                    setMapStatus('ready');
                }
            } catch (e) {
                console.error("Error loading Google Maps", e);
                setMapStatus('error');
            }
        };

        loadMaps();
    }, []);

    const startInputRef = useRef<HTMLInputElement>(null);
    const endInputRef = useRef<HTMLInputElement>(null);

    // Start autocomplete — attach once
    useEffect(() => {
        if (!mapInstance || acStartRef.current || !startInputRef.current) return;
        const ac = new google.maps.places.Autocomplete(startInputRef.current);
        acStartRef.current = ac;
        ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            startPlaceRef.current = place;
            setStartQuery(place.formatted_address || place.name || '');
            if (place.geometry?.location) {
                mapInstance.setCenter(place.geometry.location);
                mapInstance.setZoom(12);
            }
        });
    }, [mapInstance]);

    // End autocomplete — re-attach whenever end input becomes visible
    useEffect(() => {
        if (!mapInstance || sameStartEnd || !endInputRef.current) return;
        const ac = new google.maps.places.Autocomplete(endInputRef.current);
        ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            endPlaceRef.current = place;
            setEndQuery(place.formatted_address || place.name || '');
        });
    }, [mapInstance, sameStartEnd]);

    const addWaypoint = () => {
        setWaypoints([...waypoints, { id: Date.now(), value: '' }]);
    };

    const updateWaypoint = (id: number, val: string) => {
        setWaypoints(waypoints.map(w => w.id === id ? { ...w, value: val } : w));
    };

    const removeWaypoint = (id: number) => {
        setWaypoints(waypoints.filter(w => w.id !== id));
    };

    // --- CORE LOGIC ---

    const handleSearch = async () => {
        if (mapStatus !== 'ready') return;
        setError(null);

        const validation = validateSearchParams({
            startQuery,
            endQuery,
            sameStartEnd,
            waypoints,
        });
        if (!validation.valid) {
            setError(validation.error ?? 'Please check the form.');
            return;
        }

        const activeWaypoints = waypoints.filter((w) => w.value.trim().length > 0);

        setIsSearching(true);
        setStatusMessage("Finding your start and end...");

        try {
            const startLoc = await resolveLocation(startQuery, startPlaceRef.current, 'starting location');
            const endLoc = sameStartEnd
                ? startLoc
                : await resolveLocation(endQuery, endPlaceRef.current, 'ending location');

            // Search around the midpoint, wide enough to cover both ends: half the distance + 10km, clamped to 10–50km.
            const center = new google.maps.LatLng(
                (startLoc.lat() + endLoc.lat()) / 2,
                (startLoc.lng() + endLoc.lng()) / 2
            );
            const distanceM = getDistanceFromLatLonInM(startLoc.lat(), startLoc.lng(), endLoc.lat(), endLoc.lng());
            const radius = Math.min(50000, Math.max(10000, distanceM / 2 + 10000));

            const waypointOptions: WaypointData[] = [];
            for (const wp of activeWaypoints) {
                setStatusMessage(`Searching for "${wp.value}"...`);
                const options = await searchForPlace(wp.value, center, radius);
                if (options.length === 0) {
                    throw new Error(`No "${wp.value}" found near your route. Try a different word for that stop.`);
                }
                waypointOptions.push({ value: wp.value, options });
            }

            setStatusMessage("Calculating best route...");
            await findBestRoute(startLoc, endLoc, waypointOptions);
        } catch (e: unknown) {
            console.warn(e);
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setIsSearching(false);
            setStatusMessage("");
        }
    };

    const resolveLocation = (
        text: string,
        picked: google.maps.places.PlaceResult | null,
        label: string
    ): Promise<google.maps.LatLng> => {
        if (picked?.geometry?.location) return Promise.resolve(picked.geometry.location);
        return new Promise((resolve, reject) => {
            geocoder.current!.geocode({ address: text }, (res, status) => {
                const location = res?.[0]?.geometry.location;
                if (status === 'OK' && location) resolve(location);
                else reject(mapsErrorMessage(status)
                    ? new MapsStatusError(status)
                    : new Error(`Couldn't find your ${label} "${text}". Try picking it from the suggestions.`));
            });
        });
    };

    const textSearch = (query: string, center: google.maps.LatLng, radius: number) =>
        new Promise<google.maps.places.PlaceResult[]>((resolve, reject) => {
            placesService.current!.textSearch({ location: center, radius, query }, (res, status) => {
                if (status === 'OK' && res) resolve(res);
                else if (mapsErrorMessage(status)) reject(new MapsStatusError(status));
                else resolve([]);
            });
        });

    const searchForPlace = async (query: string, center: google.maps.LatLng, radius: number): Promise<PlaceOption[]> => {
        const found = (await textSearch(query, center, radius))
            .filter(p => !!p.geometry?.location && !!p.name && !!addressOf(p))
            .map(p => ({ name: p.name!, vicinity: addressOf(p)!, location: p.geometry!.location!, types: p.types }));

        // Location/radius only bias text search, so drop matches well outside the search area.
        const candidates = filterByDistance(found, toPoint(center), radius * 1.5, p => toPoint(p.location)).slice(0, 15);
        if (candidates.length === 0) return [];

        let indices: number[] = [];
        try {
            const apiRes = await fetch('/api/filter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userQuery: query,
                    places: candidates.map(p => ({ name: p.name, types: p.types, vicinity: p.vicinity })),
                }),
            });
            const data = await apiRes.json();
            if (!apiRes.ok) console.warn(`[filter] ${apiRes.status}: ${data.error}; using unfiltered results`);
            indices = data.filteredIndices ?? [];
        } catch (e) {
            console.warn("[filter] request failed; using unfiltered results", e);
        }

        // An empty or failed filter falls back to the closest-ranked results rather than blocking the search.
        const chosen = indices.length > 0 ? indices.map(i => candidates[i]).filter(Boolean) : candidates;
        return chosen.slice(0, 5).map(({ name, vicinity, location }) => ({ name, vicinity, location }));
    };

    const routeFor = (origin: google.maps.LatLng, destination: google.maps.LatLng, combo: PlaceOption[]) =>
        new Promise<RouteResult>((resolve, reject) => {
            directionsService.current!.route({
                origin,
                destination,
                waypoints: combo.map(place => ({ location: place.location, stopover: true })),
                optimizeWaypoints: true,
                travelMode: google.maps.TravelMode.DRIVING
            }, (res, status) => {
                if (status !== 'OK' || !res) return reject(new MapsStatusError(status));
                const duration = res.routes[0].legs.reduce((sum, leg) => sum + (leg.duration?.value ?? 0), 0);
                resolve({ response: res, places: combo, duration });
            });
        });

    const findBestRoute = async (start: google.maps.LatLng, end: google.maps.LatLng, waypointData: WaypointData[]) => {
        const combinations = sortCombinationsByPathDistance(
            toPoint(start),
            toPoint(end),
            generateCombinations(waypointData.map((wp) => wp.options)),
            p => toPoint(p.location)
        ).slice(0, MAX_ROUTES_TO_TEST);

        const settled = await mapWithConcurrency(combinations, ROUTE_CONCURRENCY, combo => routeFor(start, end, combo));
        const routes = settled.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);

        if (routes.length === 0) {
            const failure = settled.find(r => r.status === 'rejected');
            const status = failure?.status === 'rejected' && failure.reason instanceof MapsStatusError ? failure.reason.status : '';
            throw new Error(mapsErrorMessage(status) ?? "Couldn't find a drivable route between these stops.");
        }

        const topResults = routes.sort((a, b) => a.duration - b.duration).slice(0, 3);
        setResults(topResults);
        setSelectedIndex(0);
        if (directionsRenderer.current) {
            directionsRenderer.current.setMap(mapInstance);
            directionsRenderer.current.setDirections(topResults[0].response);
        }
    };

    const handleReset = () => {
        setResults([]);
        setSelectedIndex(0);
        if (directionsRenderer.current) {
            directionsRenderer.current.setMap(null);
        }
    };

    const handleSelectRoute = (index: number) => {
        setSelectedIndex(index);
        if (directionsRenderer.current && results[index]) {
            directionsRenderer.current.setDirections(results[index].response);
        }
    };

    const getGoogleMapsLink = () => {
        const current = results[selectedIndex];
        if (!current) return '#';
        return buildGoogleMapsLink({
            origin: startQuery,
            destination: sameStartEnd ? startQuery : endQuery,
            places: current.places.map((p) => ({ name: p.name, vicinity: p.vicinity })),
        });
    };

    return (
        <div className={styles.container}>
            {/* Sidebar / Panel */}
            <div className={styles.panel}>
                {results.length === 0 ? (
                    <>
                        {mapStatus === 'error' && (
                            <p className={styles.error} role="alert">
                                Google Maps couldn&apos;t load, so search is unavailable right now. Try refreshing the page.
                            </p>
                        )}

                        <div className={styles.formGroup}>
                            <label className={styles.label} htmlFor="startLocation">Starting Location:</label>
                            <input
                                id="startLocation"
                                ref={startInputRef}
                                className={styles.input}
                                value={startQuery}
                                onChange={(e) => { startPlaceRef.current = null; setStartQuery(e.target.value); }}
                                placeholder="Enter a location"
                            />
                            <div className={styles.checkboxGroup}>
                                <input
                                    type="checkbox"
                                    id="sameStartEnd"
                                    checked={sameStartEnd}
                                    onChange={(e) => setSameStartEnd(e.target.checked)}
                                />
                                <label htmlFor="sameStartEnd">Same start and end location</label>
                            </div>
                        </div>

                        {!sameStartEnd && (
                            <div className={styles.formGroup}>
                                <label className={styles.label} htmlFor="endLocation">Ending Location:</label>
                                <input
                                    id="endLocation"
                                    ref={endInputRef}
                                    className={styles.input}
                                    value={endQuery}
                                    onChange={(e) => { endPlaceRef.current = null; setEndQuery(e.target.value); }}
                                    placeholder="Enter a location"
                                />
                            </div>
                        )}

                        <hr className={styles.divider} />

                        {waypoints.map((wp, index) => (
                            <div key={wp.id} className={styles.formGroup}>
                                <label className={styles.label} htmlFor={`stop-${wp.id}`}>Location {index + 1}</label>
                                <div className={styles.stopRow}>
                                    <input
                                        id={`stop-${wp.id}`}
                                        className={styles.input}
                                        value={wp.value}
                                        onChange={(e) => updateWaypoint(wp.id, e.target.value)}
                                        placeholder="e.g. coffee, bank, groceries"
                                    />
                                    {waypoints.length > 1 && (
                                        <button
                                            onClick={() => removeWaypoint(wp.id)}
                                            className={styles.removeBtn}
                                            aria-label={`Remove location ${index + 1}`}
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}

                        <button className={`${styles.button} ${styles.secondary}`} onClick={addWaypoint}>
                            Add Location
                        </button>

                        {error && <p className={styles.error} role="alert">{error}</p>}

                        <button className={styles.button} onClick={handleSearch} disabled={isSearching || mapStatus !== 'ready'}>
                            {mapStatus === 'loading' ? 'Loading map...' : isSearching ? 'Searching...' : 'Search'}
                        </button>
                    </>
                ) : (
                    <>
                        <h2 className={styles.title}>Route Ready!</h2>

                        {results.length > 1 && (
                            <div className={styles.routeTabs}>
                                {results.map((r, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleSelectRoute(i)}
                                        className={`${styles.routeTab} ${i === selectedIndex ? styles.routeTabActive : ''}`}
                                    >
                                        Option {i + 1}
                                        <small>{Math.round(r.duration / 60)} min</small>
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className={styles.routeStats}>
                            🕐 {Math.round(results[selectedIndex].duration / 60)} min total
                        </div>

                        <ul className={styles.stopsList}>
                            {results[selectedIndex].places.map((p, i) => (
                                <li key={i} className={styles.stopItem}>
                                    <strong>{i + 1}. {p.name}</strong>
                                    <small>{p.vicinity}</small>
                                </li>
                            ))}
                        </ul>

                        <a href={getGoogleMapsLink()} target="_blank" rel="noopener noreferrer" className={styles.button}>
                            Open in Google Maps
                        </a>

                        <button className={`${styles.button} ${styles.secondary}`} onClick={handleReset}>
                            Start New Search
                        </button>
                    </>
                )}
            </div>

            {/* Map */}
            <div ref={mapRef} className={styles.mapContainer}></div>

            {isSearching && (
                <div className={styles.loadingOverlay}>
                    <span>{statusMessage}</span>
                </div>
            )}
        </div>
    );
}
