// =============================
// INITIALISATION CARTE
// =============================

const map = L.map('map').setView([48.112, 5.14], 14);

// =============================
// FONDS DE CARTE
// =============================

// OSM
const osm = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
        attribution: '&copy; OpenStreetMap'
    }
);

// Google Street (plan)
const googleStreet = L.tileLayer(
    'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    {
        maxZoom: 20,
        subdomains:['mt0','mt1','mt2','mt3']
    }
);

// Google Satellite
const googleSat = L.tileLayer(
    'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    {
        maxZoom: 20,
        subdomains:['mt0','mt1','mt2','mt3']
    }
);

// Ajouter OSM par défaut
osm.addTo(map);

// Contrôle couches
const baseMaps = {
    "OSM": osm,
    "Google Plan": googleStreet,
    "Google Satellite": googleSat
};

L.control.layers(baseMaps).addTo(map);


// =============================
// VARIABLES GLOBALES
// =============================

let bancsLayer;
let userMarker;
let routeLayer;


// =============================
// CHARGEMENT DES BANCS
// =============================

fetch("bancs.geojson")
.then(response => response.json())
.then(data => {

    bancsLayer = L.geoJSON(data, {

        pointToLayer: function (feature, latlng) {

            return L.marker(latlng).bindPopup(
                "Type : " + feature.properties.TYPE
            );
        }

    }).addTo(map);

})
.catch(error => {
    console.error("Erreur chargement bancs :", error);
});


// =============================
// BOUTON LOCALISATION
// =============================

document.getElementById("locateBtn").addEventListener("click", () => {

    if (!navigator.geolocation) {
        alert("Géolocalisation non supportée");
        return;
    }

    navigator.geolocation.getCurrentPosition(position => {

        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;

        if (userMarker) map.removeLayer(userMarker);

        userMarker = L.marker([userLat, userLng])
            .addTo(map)
            .bindPopup("Vous êtes ici")
            .openPopup();

        map.setView([userLat, userLng], 16);

        findNearestBench(userLat, userLng);

    }, () => {
        alert("Impossible de récupérer votre position");
    });

});


// =============================
// TROUVER LE BANC LE PLUS PROCHE
// =============================

function findNearestBench(userLat, userLng) {

    let minDist = Infinity;
    let nearestLayer = null;

    bancsLayer.eachLayer(layer => {

        const type = layer.feature.properties.TYPE.toLowerCase();

        // On exclut les arrêts de bus
        if (type.includes("bus")) return;

        const benchLatLng = layer.getLatLng();
        const dist = map.distance([userLat, userLng], benchLatLng);

        if (dist < minDist) {
            minDist = dist;
            nearestLayer = layer;
        }

    });

    if (nearestLayer) {

        const nearestLatLng = nearestLayer.getLatLng();

        nearestLayer.openPopup();

        drawRoute(
            userLat,
            userLng,
            nearestLatLng.lat,
            nearestLatLng.lng,
            Math.round(minDist)
        );
    }
}


// =============================
// CALCUL ET TRACE ITINERAIRE
// =============================

function drawRoute(lat1, lng1, lat2, lng2, distanceEuclidienne) {

    const url = `https://router.project-osrm.org/route/v1/foot/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;

    fetch(url)
    .then(response => response.json())
    .then(data => {

        if (!data.routes || data.routes.length === 0) {
            alert("Pas d'itinéraire trouvé");
            return;
        }

        if (routeLayer) map.removeLayer(routeLayer);

        const route = data.routes[0].geometry;
        const routeDistance = Math.round(data.routes[0].distance);

        routeLayer = L.geoJSON(route, {
            style: {
                color: "blue",
                weight: 5
            }
        }).addTo(map);

        map.fitBounds(routeLayer.getBounds());

        alert(
            "Distance à vol d’oiseau : " + distanceEuclidienne + " m\n" +
            "Distance réelle à pied : " + routeDistance + " m"
        );

    })
    .catch(error => {
        console.error("Erreur OSRM :", error);
    });

}
