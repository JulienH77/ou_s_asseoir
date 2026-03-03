const map = L.map('map').setView([48.112, 5.14], 14);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

let bancsLayer;
let userMarker;
let routeLayer;

// Charger les bancs
fetch("bancs.geojson")
.then(response => response.json())
.then(data => {
    bancsLayer = L.geoJSON(data).addTo(map);
});

document.getElementById("locateBtn").addEventListener("click", () => {

    if (!navigator.geolocation) {
        alert("Géolocalisation non supportée");
        return;
    }

    navigator.geolocation.getCurrentPosition(position => {

        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;

        if (userMarker) map.removeLayer(userMarker);

        userMarker = L.marker([userLat, userLng]).addTo(map)
            .bindPopup("Vous êtes ici")
            .openPopup();

        findNearestBench(userLat, userLng);

    });
});

function findNearestBench(userLat, userLng) {

    let minDist = Infinity;
    let nearest;

    bancsLayer.eachLayer(layer => {
        const benchLatLng = layer.getLatLng();
        const dist = map.distance([userLat, userLng], benchLatLng);

        if (dist < minDist) {
            minDist = dist;
            nearest = benchLatLng;
        }
    });

    if (nearest) {
        drawRoute(userLat, userLng, nearest.lat, nearest.lng);
    }
}

function drawRoute(lat1, lng1, lat2, lng2) {

    const url = `https://router.project-osrm.org/route/v1/foot/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;

    fetch(url)
    .then(response => response.json())
    .then(data => {

        if (routeLayer) map.removeLayer(routeLayer);

        const route = data.routes[0].geometry;

        routeLayer = L.geoJSON(route, {
            style: { color: "blue", weight: 5 }
        }).addTo(map);

        map.fitBounds(routeLayer.getBounds());
    });
}
