// =============================
// INITIALISATION CARTE
// =============================

const map = L.map('map', {
    zoomControl: false
}).setView([48.112, 5.14], 15);

L.control.zoom({ position: 'topright' }).addTo(map);


// =============================
// FONDS
// =============================

const osm = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
).addTo(map);

const googleStreet = L.tileLayer(
    'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    { maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3'] }
);

const googleSat = L.tileLayer(
    'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    { maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3'] }
);

L.control.layers({
    "OSM": osm,
    "Google Plan": googleStreet,
    "Google Satellite": googleSat
}, null, { position: "topright" }).addTo(map);


// =============================
// VARIABLES
// =============================

let bancs = [];
let routeLayer;
let userMarker;
let directionCone;
let userLatLng = null;


// =============================
// SVG ICON BANCS
// =============================

const benchIcon = L.divIcon({
    className: "",
    html: `
    <svg width="18" height="18" viewBox="0 0 24 24">
      <rect x="3" y="10" width="18" height="4" rx="1" fill="#111"/>
      <rect x="6" y="6" width="12" height="3" rx="1" fill="#111"/>
      <rect x="6" y="14" width="2" height="6" fill="#111"/>
      <rect x="16" y="14" width="2" height="6" fill="#111"/>
    </svg>
    `,
    iconSize: [18,18],
    iconAnchor: [9,9]
});


// =============================
// CHARGEMENT BANCS
// =============================

fetch("bancs.geojson")
.then(res => res.json())
.then(data => {

    data.features.forEach(feature => {

        const coords = feature.geometry.coordinates;
        const latlng = [coords[1], coords[0]];

        const marker = L.marker(latlng, { icon: benchIcon })
            .bindPopup(feature.properties.TYPE)
            .addTo(map);

        bancs.push({
            latlng: L.latLng(latlng),
            marker: marker,
            type: feature.properties.TYPE
        });

    });

});


// =============================
// LOCALISATION GOOGLE STYLE
// =============================

map.locate({
    watch: true,
    enableHighAccuracy: true,
    setView: true
});

map.on("locationfound", function(e) {

    userLatLng = e.latlng;

    if (!userMarker) {

        userMarker = L.circleMarker(e.latlng, {
            radius: 8,
            color: "#fff",
            weight: 2,
            fillColor: "#1a73e8",
            fillOpacity: 1
        }).addTo(map);

        L.circle(e.latlng, {
            radius: e.accuracy,
            color: "#1a73e8",
            fillColor: "#1a73e8",
            fillOpacity: 0.15,
            weight: 0
        }).addTo(map);

    } else {
        userMarker.setLatLng(e.latlng);
    }

});


// =============================
// DIRECTION (BOUSSOLE)
// =============================

if (window.DeviceOrientationEvent) {
    window.addEventListener("deviceorientationabsolute", function(event) {

        if (!userMarker || event.alpha === null) return;

        const heading = event.alpha;

        if (directionCone) map.removeLayer(directionCone);

        directionCone = L.polygon(getCone(userLatLng, heading), {
            color: "#1a73e8",
            fillColor: "#1a73e8",
            fillOpacity: 0.3,
            weight: 0
        }).addTo(map);

    });
}

function getCone(latlng, heading) {

    const length = 0.0005;
    const angle = 20;

    const left = heading - angle;
    const right = heading + angle;

    const p1 = latlng;
    const p2 = destinationPoint(latlng, left, length);
    const p3 = destinationPoint(latlng, right, length);

    return [p1, p2, p3];
}

function destinationPoint(latlng, bearing, distance) {

    const R = 6378137;
    const δ = distance;
    const θ = bearing * Math.PI/180;

    const φ1 = latlng.lat * Math.PI/180;
    const λ1 = latlng.lng * Math.PI/180;

    const φ2 = Math.asin(
        Math.sin(φ1)*Math.cos(δ) +
        Math.cos(φ1)*Math.sin(δ)*Math.cos(θ)
    );

    const λ2 = λ1 + Math.atan2(
        Math.sin(θ)*Math.sin(δ)*Math.cos(φ1),
        Math.cos(δ)-Math.sin(φ1)*Math.sin(φ2)
    );

    return L.latLng(φ2*180/Math.PI, λ2*180/Math.PI);
}


// =============================
// VRAI PLUS PROCHE (DISTANCE RÉSEAU)
// =============================

document.getElementById("locateBtn").addEventListener("click", async () => {

    if (!userLatLng) return;

    let shortestDistance = Infinity;
    let bestRoute = null;

    for (let banc of bancs) {

        if (banc.type.toLowerCase().includes("bus")) continue;

        const url = `https://router.project-osrm.org/route/v1/foot/${userLatLng.lng},${userLatLng.lat};${banc.latlng.lng},${banc.latlng.lat}?overview=false`;

        const res = await fetch(url);
        const data = await res.json();

        if (!data.routes || data.routes.length === 0) continue;

        const dist = data.routes[0].distance;

        if (dist < shortestDistance) {
            shortestDistance = dist;
            bestRoute = banc.latlng;
        }
    }

    if (bestRoute) {
        drawFinalRoute(userLatLng, bestRoute, shortestDistance);
    }

});


function drawFinalRoute(start, end, distance) {

    if (routeLayer) map.removeLayer(routeLayer);

    const url = `https://router.project-osrm.org/route/v1/foot/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;

    fetch(url)
    .then(res => res.json())
    .then(data => {

        const route = data.routes[0].geometry;

        routeLayer = L.geoJSON(route, {
            style: {
                color: "#1a73e8",
                weight: 5
            }
        }).addTo(map);

        map.fitBounds(routeLayer.getBounds(), { padding: [50,50] });

        document.getElementById("distanceBox").innerHTML =
            `<span class="walker">🚶</span> ${Math.round(distance)} m`;

        document.getElementById("distanceBox").classList.add("visible");

    });
}
