var map;
var placesResults = [];
var directionsService;
var directionsRenderer;

function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: {lat: 39.50, lng: -98.35},
        zoom: 4
    });

    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer();
    directionsRenderer.setMap(map);

    var startingInput = document.getElementById('startingLocation');
    var endingInput = document.getElementById('endingLocation');

    var startingAutocomplete = new google.maps.places.Autocomplete(startingInput);
    var endingAutocomplete = new google.maps.places.Autocomplete(endingInput);

    var searchButton = document.getElementById('searchButton');

    searchButton.addEventListener('click', function() {
        var service = new google.maps.places.PlacesService(map);

        placesResults = []
        var totalWaypoints = document.querySelectorAll('[id^="field"]').length;

        for (let i = 1; i <= totalWaypoints; i++) {
            let input = document.getElementById('field' + i);
            if (input) {
                let query = input.value;
                service.textSearch({query: query}, function(results, status) {
                    if (status === google.maps.places.PlacesServiceStatus.OK) {
                        // Save the results to the global array
                        placesResults.push({
                            field: 'field' + i,
                            results: results
                        });

                        if (placesResults.length >= totalWaypoints) {
                            calculateAndDisplayRoute();
                        }
                    }
                });
            }
        }
    });

}

function generateDirectionsURL() {
    var start = encodeURIComponent(document.getElementById('startingLocation').value);
    var end = encodeURIComponent(document.getElementById('endingLocation').value);
    var checkbox = document.getElementById('sameStartEnd');

    if (checkbox.checked) {
        end = start;
    }

    var waypoints = placesResults.map(function (placeResult) {
        return "waypoints=" + encodeURIComponent(placeResult.results[0].formatted_address);
    });

    var url = "https://www.google.com/maps/dir/?api=1&origin=" + start + "&destination=" + end+ "&waypoints=";

    console.log(waypoints);

    if (waypoints.length > 0) {
        url += waypoints[0];
        for (let i = 1; i < waypoints.length; i++) {
            url += "|" + waypoints[i];
            console.log(i)
            console.log(url);
        }

    }

    return url;
}

function calculateAndDisplayRoute() {
    var start = document.getElementById('startingLocation').value;
    var end = document.getElementById('endingLocation').value;
    var checkbox = document.getElementById('sameStartEnd');

    if (checkbox.checked) {
        end = start;
    }

    var waypts = placesResults.map(function(placeResult) {
        return {
            location: { lat: placeResult.results[0].geometry.location.lat(), lng: placeResult.results[0].geometry.location.lng() },
            stopover: true
        };
    });

    directionsService.route({
        origin: start,
        destination: end,
        waypoints: waypts,
        optimizeWaypoints: true,
        travelMode: 'DRIVING'
    }, function(response, status) {
        if (status === 'OK') {
            directionsRenderer.setDirections(response);

            var directionsURL = generateDirectionsURL();
            window.open(directionsURL, '_blank');
        } else {
            window.alert('Directions request failed due to ' + status);
        }
    });
}

