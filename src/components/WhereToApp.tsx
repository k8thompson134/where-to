'use client';

import { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import {
  getDistanceFromLatLonInM,
  generateCombinations,
  getGoogleMapsLink as buildGoogleMapsLink,
  validateSearchParams,
  sortCombinationsByPathDistance,
} from '@/lib/where-to';
import styles from './WhereToApp.module.scss';

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

interface PlaceOption {
    name: string;
    vicinity: string;
    geometry: google.maps.places.PlaceGeometry;
    place_id: string;
}

interface WaypointData {
    id: number;
    value: string;
    options: PlaceOption[];
}

interface RouteResult {
    response: google.maps.DirectionsResult;
    places: PlaceOption[];
    duration: number; // in seconds
}

export default function WhereToApp() {
    const mapRef = useRef<HTMLDivElement>(null);
    const [googleInfo, setGoogleInfo] = useState<{ maps: google.maps.MapsLibrary & { places: google.maps.PlacesLibrary } } | null>(null);
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
    const [results, setResults] = useState<RouteResult[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Services
    const directionsService = useRef<google.maps.DirectionsService | null>(null);
    const directionsRenderer = useRef<google.maps.DirectionsRenderer | null>(null);
    const placesService = useRef<google.maps.places.PlacesService | null>(null);

    // Starting place object (for geometry)
    const startPlaceRef = useRef<google.maps.places.PlaceResult | null>(null);
    const endPlaceRef = useRef<google.maps.places.PlaceResult | null>(null);

    const mapInitRef = useRef(false);
    const acStartRef = useRef<google.maps.places.Autocomplete | null>(null);
    const acEndRef = useRef<google.maps.places.Autocomplete | null>(null);

    // Load Google Maps API using new functional API
    useEffect(() => {
        if (mapInitRef.current) return;
        mapInitRef.current = true;

        const loadMaps = async () => {
            try {
                // Set options for the loader
                setOptions({
                    key: API_KEY,
                    v: "weekly",
                });

                // Import required libraries
                const mapsLib = await importLibrary("maps") as google.maps.MapsLibrary;
                const placesLib = await importLibrary("places") as google.maps.PlacesLibrary;

                setGoogleInfo({ maps: { ...mapsLib, places: placesLib } });

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
                }
            } catch (e) {
                console.error("Error loading Google Maps", e);
            }
        };

        loadMaps();
    }, []);

    const startInputRef = useRef<HTMLInputElement>(null);
    const endInputRef = useRef<HTMLInputElement>(null);

    // Start autocomplete — attach once
    useEffect(() => {
        if (!googleInfo || !mapInstance || acStartRef.current || !startInputRef.current) return;
        const ac = new googleInfo.maps.places.Autocomplete(startInputRef.current);
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
    }, [googleInfo, mapInstance]);

    // End autocomplete — re-attach whenever end input becomes visible
    useEffect(() => {
        if (!googleInfo || !mapInstance || sameStartEnd || !endInputRef.current) return;
        const ac = new googleInfo.maps.places.Autocomplete(endInputRef.current);
        acEndRef.current = ac;
        ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            endPlaceRef.current = place;
            setEndQuery(place.formatted_address || place.name || '');
        });
    }, [googleInfo, mapInstance, sameStartEnd]);

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
        if (!mapInstance || !placesService.current) return;

        const validation = validateSearchParams({
            startQuery,
            endQuery,
            sameStartEnd,
            waypoints,
        });
        if (!validation.valid) {
            alert(validation.error);
            return;
        }

        const activeWaypoints = waypoints.filter((w) => w.value.trim().length > 0);

        setIsSearching(true);
        setStatusMessage("Searching for places...");

        try {
            const waypointOptions: WaypointData[] = [];

            // 1. Search for places for each waypoint query
            for (const wp of activeWaypoints) {
                setStatusMessage(`Searching for "${wp.value}"...`);
                const options = await searchForPlace(wp.value);
                waypointOptions.push({
                    id: wp.id,
                    value: wp.value,
                    options: options
                });
            }

            // 2. Route Optimization
            setStatusMessage("Calculating best route...");
            const finalEnd = sameStartEnd ? startQuery : endQuery;
            await findBestRoute(startQuery, finalEnd, waypointOptions);

        } catch (error: unknown) {
            console.error(error);
            alert("An error occurred: " + (error instanceof Error ? error.message : String(error)));
        } finally {
            setIsSearching(false);
            setStatusMessage("");
        }
    };

    const searchForPlace = (query: string): Promise<PlaceOption[]> => {
        return new Promise((resolve) => {
            const startLoc = startPlaceRef.current?.geometry?.location;
            const endLoc = sameStartEnd ? startLoc : endPlaceRef.current?.geometry?.location;

            let searchLocation = startLoc;
            let searchRadius = 50000; // default 50km

            if (startLoc && endLoc) {
                // Calculate midpoint
                const lat1 = startLoc.lat();
                const lng1 = startLoc.lng();
                const lat2 = endLoc.lat();
                const lng2 = endLoc.lng();

                searchLocation = new google.maps.LatLng((lat1 + lat2) / 2, (lng1 + lng2) / 2);

                const distanceM = getDistanceFromLatLonInM(lat1, lng1, lat2, lng2);
                // Radius is half the distance plus a 10km buffer, max 50km minimum 10km
                searchRadius = Math.min(50000, Math.max(10000, (distanceM / 2) + 10000));
            }

            const callback = async (results: google.maps.places.PlaceResult[] | null, status: `${google.maps.places.PlacesServiceStatus}`) => {
                if (status === 'OK' && results && results.length > 0) {
                    // LLM Filtering
                    const candidates = results.slice(0, 15);
                    try {
                        // We need to map options to a serializable format for the API
                        const serializablePlaces = candidates.map(p => ({
                            name: p.name,
                            types: p.types,
                            vicinity: p.vicinity
                        }));

                        const apiRes = await fetch('/api/filter', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userQuery: query, places: serializablePlaces })
                        });

                        const data = await apiRes.json();
                        const indices: number[] = data.filteredIndices || [];

                        // If filter returns empty, fallback to top 5 original
                        const finalIndices = indices.length > 0 ? indices : [0, 1, 2, 3, 4];

                        const filtered = finalIndices
                            .map(i => candidates[i])
                            .filter((p): p is google.maps.places.PlaceResult =>
                                p !== undefined &&
                                !!p.geometry?.location &&
                                !!p.name &&
                                !!p.vicinity
                            )
                            .map(p => ({
                                name: p.name!,
                                vicinity: p.vicinity!,
                                geometry: p.geometry!,
                                place_id: p.place_id ?? ''
                            }));

                        resolve(filtered.slice(0, 5));
                    } catch (e) {
                        console.error("LLM Filter failed", e);
                        // Fallback
                        const fallback = candidates
                            .filter((p): p is google.maps.places.PlaceResult =>
                                !!p.geometry?.location && !!p.name && !!p.vicinity
                            )
                            .slice(0, 5)
                            .map(p => ({
                                name: p.name!,
                                vicinity: p.vicinity!,
                                geometry: p.geometry!,
                                place_id: p.place_id ?? ''
                            }));
                        resolve(fallback);
                    }
                } else {
                    resolve([]);
                }
            };

            if (searchLocation) {
                placesService.current!.textSearch({
                    location: searchLocation,
                    radius: searchRadius,
                    query: query
                }, callback);
            } else {
                placesService.current!.textSearch({ query }, callback);
            }
        });
    };

    const findBestRoute = async (start: string, end: string, waypointData: WaypointData[]) => {
        // Check if any waypoint has no options
        for (const wp of waypointData) {
            if (wp.options.length === 0) {
                throw new Error(`Could not find any places for: ${wp.value}`);
            }
        }

        const optionArrays: PlaceOption[][] = waypointData.map((wp) => wp.options);
        let combinations: PlaceOption[][] = generateCombinations(optionArrays);

        console.log(`Testing ${combinations.length} initial combinations`);

        const startLoc = startPlaceRef.current?.geometry?.location;
        const endLoc = sameStartEnd ? startLoc : endPlaceRef.current?.geometry?.location;

        if (startLoc && endLoc) {
            const startPoint = { lat: startLoc.lat(), lng: startLoc.lng() };
            const endPoint = { lat: endLoc.lat(), lng: endLoc.lng() };
            const getPoint = (p: PlaceOption) => ({
                lat: p.geometry?.location?.lat() ?? 0,
                lng: p.geometry?.location?.lng() ?? 0,
            });
            combinations = sortCombinationsByPathDistance(
                startPoint,
                endPoint,
                combinations,
                getPoint
            );
        }

        combinations = combinations
            .filter(combo => combo.every(place => !!place.geometry?.location))
            .slice(0, 10);

        const allResults: RouteResult[] = [];

        for (const combo of combinations) {
            const waypts = combo.map(place => ({
                location: place.geometry.location!,
                stopover: true
            }));

            try {
                const dirResult = await new Promise<google.maps.DirectionsResult>((resolve, reject) => {
                    directionsService.current!.route({
                        origin: start,
                        destination: end,
                        waypoints: waypts,
                        optimizeWaypoints: true,
                        travelMode: 'DRIVING' as google.maps.TravelMode
                    }, (res, status) => {
                        if (status === 'OK' && res) resolve(res);
                        else reject(status);
                    });
                });

                let duration = 0;
                dirResult.routes[0].legs.forEach(leg => duration += leg.duration?.value || 0);
                allResults.push({ response: dirResult, places: combo, duration });
            } catch (e) {
                console.warn("Route failed", e);
            }
        }

        allResults.sort((a, b) => a.duration - b.duration);
        const topResults = allResults.slice(0, 3);

        if (topResults.length > 0) {
            setResults(topResults);
            setSelectedIndex(0);
            if (directionsRenderer.current) {
                directionsRenderer.current.setMap(mapInstance);
                directionsRenderer.current.setDirections(topResults[0].response);
            }
        } else {
            throw new Error("Could not calculate any valid route.");
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
                        <h2 className={styles.title}>Where To?</h2>
                        <p className={styles.subtitle}>Plan your errand run.</p>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Starting Location:</label>
                            <input
                                ref={startInputRef}
                                className={styles.input}
                                value={startQuery}
                                onChange={(e) => setStartQuery(e.target.value)}
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
                                <label className={styles.label}>Ending Location:</label>
                                <input
                                    ref={endInputRef}
                                    className={styles.input}
                                    value={endQuery}
                                    onChange={(e) => setEndQuery(e.target.value)}
                                    placeholder="Enter a location"
                                />
                            </div>
                        )}

                        <hr className={styles.divider} />

                        {waypoints.map((wp, index) => (
                            <div key={wp.id} className={styles.formGroup}>
                                <label className={styles.label}>Location {index + 1}</label>
                                <div className={styles.stopRow}>
                                    <input
                                        className={styles.input}
                                        value={wp.value}
                                        onChange={(e) => updateWaypoint(wp.id, e.target.value)}
                                        placeholder="e.g. coffee, bank, groceries"
                                    />
                                    {waypoints.length > 1 && (
                                        <button
                                            onClick={() => removeWaypoint(wp.id)}
                                            className={styles.removeBtn}
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

                        <button className={styles.button} onClick={handleSearch} disabled={isSearching}>
                            {isSearching ? 'Searching...' : 'Search'}
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
