// =============================
// INITIALISATION
// =============================

const map = L.map('map', {
    zoomControl: false
}).setView([48.112, 5.14], 14);

L.control.zoom({
    position: 'topright'
}).addTo(map);


// =============================
// FONDS DE CARTE
// =============================

const osm = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '&copy; OpenStreetMap' }
);

const googleStreet = L.tileLayer(
    'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    { maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3'] }
);

const googleSat = L.tileLayer(
    'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    { maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3'] }
);

osm.addTo(map);

L.control.layers({
    "OSM": osm,
    "Google Plan": googleStreet,
    "Google Satellite": googleSat
}, null, {
    position: 'topright'
}).addTo(map);


// =============================
// VARIABLES
// =============================

let bancsLayer;
let userLatLng = null;
let routeLayer;
let locationCircle;


// =============================
// CHARGEMENT DES BANCS
// =============================

fetch("bancs.geojson")
.then(res => res.json())
.then(data => {

    bancsLayer = L.geoJSON(data, {

        pointToLayer: function(feature, latlng) {
            return L.circleMarker(latlng, {
                radius: 5,
                color: "#333",
                weight: 1,
                fillColor: "#555",
                fillOpacity: 0.9
            }).bindPopup(feature.properties.TYPE);
        }

    }).addTo(map);

});


// =============================
// GEOLOCALISATION CONTINUE
// =============================

map.locate({
    setView: true,
    watch: true,
    enableHighAccuracy: true
});

map.on("locationfound", function(e) {

    userLatLng = e.latlng;

    if (!locationCircle) {
        locationCircle = L.circleMarker(e.latlng, {
            radius: 8,
            color: "#007AFF",
            fillColor: "#007AFF",
            fillOpacity: 0.4,
            weight: 2
        }).addTo(map);
    } else {
        locationCircle.setLatLng(e.latlng);
    }

});


// =============================
// BOUTON TROUVER BANC
// =============================

document.getElementById("locateBtn").addEventListener("click", () => {

    if (!userLatLng || !bancsLayer) return;

    findNearestBench(userLatLng);

});


// =============================
// TROUVER BANC LE PLUS PROCHE
// =============================

function findNearestBench(userLatLng) {

    let minDist = Infinity;
    let nearest = null;

    bancsLayer.eachLayer(layer => {

        const type = layer.feature.properties.TYPE.toLowerCase();

        if (type.includes("bus")) return;

        const dist = map.distance(userLatLng, layer.getLatLng());

        if (dist < minDist) {
            minDist = dist;
            nearest = layer.getLatLng();
        }

    });

    if (nearest) {
        drawRoute(userLatLng, nearest);
    }

}


// =============================
// ROUTAGE OSRM
// =============================

function drawRoute(start, end) {

    const url = `https://router.project-osrm.org/route/v1/foot/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;

    fetch(url)
    .then(res => res.json())
    .then(data => {

        if (!data.routes || data.routes.length === 0) return;

        if (routeLayer) map.removeLayer(routeLayer);

        const route = data.routes[0].geometry;
        const distance = Math.round(data.routes[0].distance);

        routeLayer = L.geoJSON(route, {
            style: {
                color: "#007AFF",
                weight: 4
            }
        }).addTo(map);

        map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });

        displayDistance(distance);

    });

}


// =============================
// AFFICHAGE DISTANCE UI
// =============================

function displayDistance(distance) {

    const distanceBox = document.getElementById("distanceBox");
    distanceBox.innerHTML = `
        <div class="distance-content">
            <span class="icon">🚶</span>
            <span class="distance">${distance} m</span>
        </div>
    `;

    distanceBox.classList.add("visible");

}
