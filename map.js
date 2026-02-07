var map;
var waypointOptions = []; // Store multiple options per waypoint
var directionsService;
var directionsRenderer;
var startingPlace = null;
var bestRoute = null;

function initMap() {
    console.log('[initMap] Google Maps API loaded, initializing map...');

    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 39.50, lng: -98.35 },
        zoom: 4
    });
    console.log('[initMap] Map created successfully');

    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer();
    directionsRenderer.setMap(map);
    console.log('[initMap] Directions service initialized');

    var startingInput = document.getElementById('startingLocation');
    var endingInput = document.getElementById('endingLocation');

    var startingAutocomplete = new google.maps.places.Autocomplete(startingInput);
    var endingAutocomplete = new google.maps.places.Autocomplete(endingInput);
    console.log('[initMap] Autocomplete attached to input fields');

    startingAutocomplete.addListener('place_changed', function () {
        startingPlace = startingAutocomplete.getPlace();
        if (startingPlace.geometry) {
            console.log('[initMap] Starting location set:', startingPlace.formatted_address);
            map.setCenter(startingPlace.geometry.location);
            map.setZoom(12);
        }
    });

    var searchButton = document.getElementById('searchButton');

    searchButton.addEventListener('click', function (e) {
        e.preventDefault();
        console.log('[Search] Button clicked, starting search...');

        var service = new google.maps.places.PlacesService(map);
        waypointOptions = [];

        var allFields = document.querySelectorAll('[id^="field"]');
        var nonEmptyFields = [];
        allFields.forEach(function (input) {
            if (input.value.trim()) {
                nonEmptyFields.push(input);
            }
        });

        var totalWaypoints = nonEmptyFields.length;
        console.log('[Search] Total waypoints to search:', totalWaypoints);

        if (totalWaypoints === 0) {
            console.warn('[Search] No waypoints entered!');
            alert('Please enter at least one location to search for.');
            return;
        }

        var searchesCompleted = 0;

        nonEmptyFields.forEach(function (input, index) {
            var query = input.value.trim();
            console.log('[Search] Searching for:', query);

            if (startingPlace && startingPlace.geometry) {
                console.log('[Search] Searching near starting location...');
                service.nearbySearch({
                    location: startingPlace.geometry.location,
                    rankBy: google.maps.places.RankBy.DISTANCE,
                    keyword: query
                }, function (results, status) {
                    handleSearchResults(results, status, query, input, index, function () {
                        searchesCompleted++;
                        if (searchesCompleted >= totalWaypoints) {
                            console.log('[Search] All searches complete, finding best route...');
                            findBestRoute();
                        }
                    });
                });
            } else {
                service.textSearch({ query: query }, function (results, status) {
                    handleSearchResults(results, status, query, input, index, function () {
                        searchesCompleted++;
                        if (searchesCompleted >= totalWaypoints) {
                            findBestRoute();
                        }
                    });
                });
            }
        });
    });

    // Add listener for back button
    document.getElementById('back-button').addEventListener('click', resetSearch);

    console.log('[initMap] Setup complete!');
}

// Handle search results and filter with LLM
async function handleSearchResults(results, status, query, input, index, callback) {
    if (status === google.maps.places.PlacesServiceStatus.OK && results.length > 0) {
        // Get more results to give LLM better options to filter
        var candidateResults = results.slice(0, 15);
        console.log('[Search] Got', candidateResults.length, 'candidates for "' + query + '"');

        // Filter with LLM
        try {
            var filteredResults = await filterWithLLM(query, candidateResults);
            console.log('[LLM] Filtered to', filteredResults.length, 'results');

            if (filteredResults.length === 0) {
                console.warn('[LLM] No results passed filter, using top 5 unfiltered');
                filteredResults = candidateResults.slice(0, 5);
            }

            waypointOptions[index] = {
                field: input.id,
                query: query,
                options: filteredResults.slice(0, 5) // Keep top 5 after filtering
            };

            filteredResults.slice(0, 5).forEach(function (r, i) {
                console.log('  ' + (i + 1) + '. ' + r.name);
            });
        } catch (error) {
            console.error('[LLM] Filter error:', error);
            // Fallback: use unfiltered results
            waypointOptions[index] = {
                field: input.id,
                query: query,
                options: candidateResults.slice(0, 5)
            };
        }
    } else {
        console.error('[Search] Failed to find:', query);
        waypointOptions[index] = { field: input.id, query: query, options: [] };
    }

    callback();
}

// Filter places using Claude via backend
async function filterWithLLM(userQuery, places) {
    console.log('[LLM] Filtering', places.length, 'places for query:', userQuery);

    // Prepare places data for the API (can't send Google's complex objects directly)
    var placesData = places.map(function (p) {
        return {
            name: p.name,
            types: p.types || [],
            vicinity: p.vicinity || ''
        };
    });

    try {
        var response = await fetch(CONFIG.BACKEND_URL + '/api/filter-places', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userQuery: userQuery,
                places: placesData
            })
        });

        var data = await response.json();
        console.log('[LLM] Got filtered indices:', data.filteredIndices);

        // Return only the places at the filtered indices
        var filteredPlaces = data.filteredIndices.map(function (i) {
            return places[i];
        }).filter(function (p) {
            return p !== undefined;
        });

        return filteredPlaces;
    } catch (error) {
        console.error('[LLM] API error:', error);
        throw error;
    }
}

// Generate all combinations of waypoint options
function generateCombinations(arrays) {
    if (arrays.length === 0) return [[]];

    var result = [];
    var first = arrays[0];
    var rest = generateCombinations(arrays.slice(1));

    for (var i = 0; i < first.length; i++) {
        for (var j = 0; j < rest.length; j++) {
            result.push([first[i]].concat(rest[j]));
        }
    }
    return result;
}

function findBestRoute() {
    var start = document.getElementById('startingLocation').value.trim();
    var end = document.getElementById('endingLocation').value.trim();
    var checkbox = document.getElementById('sameStartEnd');

    if (!start) {
        alert('Please enter a starting location.');
        return;
    }

    if (checkbox.checked) {
        end = start;
    } else if (!end) {
        alert('Please enter an ending location or check "Same start and end".');
        return;
    }

    // Get arrays of options for each waypoint
    var optionArrays = waypointOptions.map(function (wp) {
        return wp.options.length > 0 ? wp.options : [];
    });

    // Check if any waypoint has no options
    for (var i = 0; i < optionArrays.length; i++) {
        if (optionArrays[i].length === 0) {
            alert('Could not find: ' + waypointOptions[i].query);
            return;
        }
    }

    // Generate all combinations
    var combinations = generateCombinations(optionArrays);
    console.log('[Route] Testing', combinations.length, 'combinations to find shortest trip...');

    // Limit combinations to limit API calls
    var maxCombinations = 10;
    if (combinations.length > maxCombinations) {
        console.log('[Route] Limiting to first', maxCombinations, 'combinations');
        combinations = combinations.slice(0, maxCombinations);
    }

    var bestDuration = Infinity;
    bestRoute = null;
    var testedCount = 0;

    combinations.forEach(function (combo, comboIndex) {
        var waypts = combo.map(function (place) {
            return {
                location: { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() },
                stopover: true
            };
        });

        directionsService.route({
            origin: start,
            destination: end,
            waypoints: waypts,
            optimizeWaypoints: true,
            travelMode: 'DRIVING'
        }, function (response, status) {
            testedCount++;

            if (status === 'OK') {
                // Calculate total duration
                var totalDuration = 0;
                response.routes[0].legs.forEach(function (leg) {
                    totalDuration += leg.duration.value;
                });

                var comboNames = combo.map(function (p) { return p.name; }).join(' + ');
                console.log('[Route] Combo ' + (comboIndex + 1) + ': ' + comboNames + ' = ' + Math.round(totalDuration / 60) + ' min');

                if (totalDuration < bestDuration) {
                    bestDuration = totalDuration;
                    bestRoute = {
                        response: response,
                        places: combo,
                        duration: totalDuration
                    };
                }
            }

            //Display best option
            if (testedCount >= combinations.length) {
                if (bestRoute) {
                    console.log('[Route] BEST ROUTE: ' + Math.round(bestRoute.duration / 60) + ' min');
                    bestRoute.places.forEach(function (p) {
                        console.log('  → ' + p.name + ' - ' + p.vicinity);
                    });
                    directionsRenderer.setDirections(bestRoute.response);
                    var directionsURL = generateDirectionsURL(bestRoute.places);

                    // Show results in panel instead of opening new tab
                    showResults(bestRoute, directionsURL);
                } else {
                    alert('Could not find a route.');
                }
            }
        });
    });
}

function showResults(route, url) {
    // Hide form, show results
    document.getElementById('myForm').style.display = 'none';
    document.getElementById('results-panel').style.display = 'block';

    // Update stats
    var durationMin = Math.round(route.duration / 60);
    document.getElementById('route-stats').innerText = 'Total Time: ' + durationMin + ' min';

    // Update link
    document.getElementById('maps-link').href = url;

    // Update stops list
    var stopsList = document.getElementById('route-stops');
    stopsList.innerHTML = '';

    route.places.forEach(function (place, index) {
        var li = document.createElement('li');
        li.className = 'list-group-item';
        // Use vicinity or formatted_address, or fallback to empty string
        var address = place.vicinity || place.formatted_address || '';
        li.innerHTML = '<strong>' + (index + 1) + '. ' + place.name + '</strong><br><small>' + address + '</small>';
        stopsList.appendChild(li);
    });
}

function resetSearch() {
    // Hide results, show form
    document.getElementById('results-panel').style.display = 'none';
    document.getElementById('myForm').style.display = 'block';

    // Clear map
    directionsRenderer.setMap(null);
    directionsRenderer = new google.maps.DirectionsRenderer();
    directionsRenderer.setMap(map);

    // Optional: Keep form inputs or clear them? keeping them for now as "Edit search" behavior
}

function generateDirectionsURL(places) {
    var start = encodeURIComponent(document.getElementById('startingLocation').value);
    var end = encodeURIComponent(document.getElementById('endingLocation').value);
    var checkbox = document.getElementById('sameStartEnd');

    if (checkbox.checked) {
        end = start;
    }

    var waypointAddresses = places.map(function (place) {
        return encodeURIComponent(place.name + ', ' + place.vicinity);
    });

    var url = "https://www.google.com/maps/dir/?api=1&origin=" + start + "&destination=" + end;

    if (waypointAddresses.length > 0) {
        url += "&waypoints=" + waypointAddresses.join('|');
    }

    return url;
}
