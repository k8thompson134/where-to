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
// Route waypoint markers are Advanced Markers, which require a map ID.
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';
const MAX_ROUTES_TO_TEST = 10;
const ROUTE_CONCURRENCY = 4;

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
    route: google.maps.routes.Route;
    places: PlaceOption[]; // in visiting order
    duration: number; // in seconds
}

type MapStatus = 'loading' | 'ready' | 'error';

class MapsStatusError extends Error {
    constructor(readonly status: string) {
        super(mapsErrorMessage(status) ?? status);
    }
}

// Places (New) and Routes throw MapsRequestError carrying an RPC code; turn it into a user-facing error.
const asMapsError = (e: unknown) =>
    e instanceof google.maps.MapsRequestError && e.code ? new MapsStatusError(e.code) : e;

declare global {
    interface Window {
        gm_authFailure?: () => void;
    }
}

interface PlaceInputProps {
    id: string;
    ready: boolean;
    value: string;
    onChange: (text: string, location: google.maps.LatLng | null) => void;
}

/** Google's PlaceAutocompleteElement, mounted imperatively since it's a web component. */
function PlaceInput({ id, ready, value, onChange }: PlaceInputProps) {
    const hostRef = useRef<HTMLDivElement>(null);
    const onChangeRef = useRef(onChange);
    // The element owns its text after mount; this restores it when the form is shown again.
    const valueRef = useRef(value);

    useEffect(() => {
        onChangeRef.current = onChange;
        valueRef.current = value;
    }, [onChange, value]);

    useEffect(() => {
        if (!ready || !hostRef.current) return;
        const el = new google.maps.places.PlaceAutocompleteElement({ placeholder: 'Enter a location' });
        el.id = id;
        el.className = styles.placeAutocomplete;
        el.value = valueRef.current;
        // Typing clears any previously picked place so a stale location can't be used.
        el.addEventListener('input', () => onChangeRef.current(el.value, null));
        el.addEventListener('gmp-select', async (event) => {
            const place = event.placePrediction.toPlace();
            await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
            onChangeRef.current(place.formattedAddress ?? place.displayName ?? el.value, place.location ?? null);
        });
        hostRef.current.appendChild(el);
        return () => el.remove();
    }, [ready, id]);

    return (
        <div ref={hostRef}>
            {!ready && <input id={id} className={styles.input} placeholder="Enter a location" disabled />}
        </div>
    );
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

    const geocoder = useRef<google.maps.Geocoder | null>(null);
    const rendered = useRef<{ polylines: google.maps.Polyline[]; markers: google.maps.marker.AdvancedMarkerElement[] }>({ polylines: [], markers: [] });

    // Location of a place picked from the suggestions; null when the text was typed or edited.
    const startLocRef = useRef<google.maps.LatLng | null>(null);
    const endLocRef = useRef<google.maps.LatLng | null>(null);

    const mapInitRef = useRef(false);

    useEffect(() => {
        if (mapInitRef.current) return;
        mapInitRef.current = true;

        // Google calls this (instead of rejecting) when the key is invalid or the referrer isn't allowed.
        window.gm_authFailure = () => setMapStatus('error');

        const loadMaps = async () => {
            try {
                setOptions({ key: API_KEY, v: "weekly" });

                const mapsLib = await importLibrary("maps") as google.maps.MapsLibrary;
                await Promise.all([
                    importLibrary("places"),
                    importLibrary("geocoding"),
                    importLibrary("routes"),
                    importLibrary("marker"),
                ]);

                if (mapRef.current) {
                    const map = new mapsLib.Map(mapRef.current, {
                        center: { lat: 39.50, lng: -98.35 },
                        zoom: 4,
                        mapId: MAP_ID,
                        mapTypeControl: false,
                        streetViewControl: false
                    });
                    setMapInstance(map);
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

    const handleStartChange = (text: string, location: google.maps.LatLng | null) => {
        setStartQuery(text);
        startLocRef.current = location;
        if (location && mapInstance) {
            mapInstance.setCenter(location);
            mapInstance.setZoom(12);
        }
    };

    const handleEndChange = (text: string, location: google.maps.LatLng | null) => {
        setEndQuery(text);
        endLocRef.current = location;
    };

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
            const startLoc = await resolveLocation(startQuery, startLocRef.current, 'starting location');
            const endLoc = sameStartEnd
                ? startLoc
                : await resolveLocation(endQuery, endLocRef.current, 'ending location');

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
        picked: google.maps.LatLng | null,
        label: string
    ): Promise<google.maps.LatLng> => {
        if (picked) return Promise.resolve(picked);
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

    const searchForPlace = async (query: string, center: google.maps.LatLng, radius: number): Promise<PlaceOption[]> => {
        let places: google.maps.places.Place[];
        try {
            ({ places } = await google.maps.places.Place.searchByText({
                textQuery: query,
                fields: ['displayName', 'formattedAddress', 'location', 'types'],
                locationBias: { center, radius },
                maxResultCount: 20,
            }));
        } catch (e) {
            const err = asMapsError(e);
            if (err instanceof MapsStatusError && !mapsErrorMessage(err.status)) return [];
            throw err;
        }

        const found = places.flatMap(p => p.location && p.displayName && p.formattedAddress
            ? [{ name: p.displayName, vicinity: p.formattedAddress, location: p.location, types: p.types }]
            : []);

        // locationBias only biases text search, so drop matches well outside the search area.
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

    const routeFor = async (origin: google.maps.LatLng, destination: google.maps.LatLng, combo: PlaceOption[]): Promise<RouteResult> => {
        let routes: google.maps.routes.Route[] | undefined;
        try {
            ({ routes } = await google.maps.routes.Route.computeRoutes({
                origin,
                destination,
                intermediates: combo.map(place => ({ location: place.location })),
                optimizeWaypointOrder: combo.length > 1,
                travelMode: 'DRIVING',
                fields: ['durationMillis', 'legs', 'optimizedIntermediateWaypointIndices', 'path', 'viewport'],
            }));
        } catch (e) {
            throw asMapsError(e);
        }
        const route = routes?.[0];
        if (!route) throw new MapsStatusError('ZERO_RESULTS');
        const order = route.optimizedIntermediateWaypointIndices;
        return {
            route,
            places: order?.length === combo.length ? order.map(i => combo[i]) : combo,
            duration: (route.durationMillis ?? 0) / 1000,
        };
    };

    const clearRoute = () => {
        rendered.current.polylines.forEach(p => p.setMap(null));
        rendered.current.markers.forEach(m => { m.map = null; });
        rendered.current = { polylines: [], markers: [] };
    };

    const showRoute = async (route: google.maps.routes.Route) => {
        if (!mapInstance) return;
        clearRoute();
        const polylines = route.createPolylines();
        polylines.forEach(p => p.setMap(mapInstance));
        rendered.current.polylines = polylines;
        if (route.viewport) mapInstance.fitBounds(route.viewport);
        const markers = await route.createWaypointAdvancedMarkers({ map: mapInstance });
        // A newer route may have been drawn while these markers were being created.
        if (rendered.current.polylines === polylines) rendered.current.markers = markers;
        else markers.forEach(m => { m.map = null; });
    };

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
        await showRoute(topResults[0].route);
    };

    const handleReset = () => {
        setResults([]);
        setSelectedIndex(0);
        clearRoute();
    };

    const handleSelectRoute = (index: number) => {
        setSelectedIndex(index);
        if (results[index]) showRoute(results[index].route);
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
                            <PlaceInput id="startLocation" ready={mapStatus === 'ready'} value={startQuery} onChange={handleStartChange} />
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
                                <PlaceInput id="endLocation" ready={mapStatus === 'ready'} value={endQuery} onChange={handleEndChange} />
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
