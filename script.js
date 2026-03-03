const map = L.map('map', { zoomControl: false })
  .setView([48.112, 5.14], 15);

L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  { maxZoom: 20 }
).addTo(map);

L.control.zoom({ position: 'topright' }).addTo(map);

let userLatLng = null;
let userMarker = null;
let accuracyCircle = null;
let routeLayer = null;
let bancs = [];

// =======================
// CONFIGURATION DES TYPES
// =======================
const TYPE_COLORS = {
  "banc": "#1a73e8",      // Bleu (Classique)
  "assise": "#1aa2e8",    // Cyan
  "banquette": "#7b1fa2", // Violet
  "fauteuil": "#e65100",  // Orange
  "default": "#5f6368"    // Gris
};

function getBenchColor(type) {
  const t = type.toLowerCase();
  if (t.includes("banc") && !t.includes("banquette")) return TYPE_COLORS["banc"];
  if (t.includes("assise")) return TYPE_COLORS["assise"];
  if (t.includes("banquette")) return TYPE_COLORS["banquette"];
  if (t.includes("fauteuil")) return TYPE_COLORS["fauteuil"];
  return TYPE_COLORS["default"];
}

// Fonction pour générer l'icône avec la bonne couleur
function createBenchIcon(color) {
  return L.divIcon({
    html: `
    <div class="bench-marker" style="border-color: ${color};">
      <svg width="14" height="14" viewBox="0 0 24 24">
        <path d="M3 11h18v3H3zM6 7h12v3H6zM6 14h2v5H6zm10 0h2v5h-2z" fill="${color}"/>
      </svg>
    </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
    className: ""
  });
}

// =======================
// LOAD BANCS
// =======================

// Groupe pour gérer tous les marqueurs de bancs ensemble
const benchesLayer = L.layerGroup().addTo(map);

fetch("bancs.geojson")
.then(res => res.json())
.then(data => {
  data.features.forEach(f => {
    if (f.properties.TYPE.toLowerCase().includes("bus")) return;

    const latlng = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
    const color = getBenchColor(f.properties.TYPE);
    
    const marker = L.marker(latlng, { 
      icon: createBenchIcon(color) 
    }).bindPopup(`<strong>${f.properties.TYPE}</strong>`);
    
    marker.addTo(benchesLayer);
    bancs.push(L.latLng(latlng));
  });
});

// Fonction pour ajuster la visibilité et la taille
function updateMarkersStyle() {
  const currentZoom = map.getZoom();
  
  // 1. Disparition totale si trop dézoomé (ex: zoom < 14)
  if (currentZoom < 14) {
    if (map.hasLayer(benchesLayer)) map.removeLayer(benchesLayer);
  } else {
    if (!map.hasLayer(benchesLayer)) map.addLayer(benchesLayer);
    
    // 2. Réduction de la taille selon le zoom
    // On calcule une échelle (ex: 1 à zoom 18, 0.5 à zoom 15)
    const scale = Math.max(0.4, (currentZoom - 13) / 5);
    const size = 24 * scale;

    benchesLayer.eachLayer(marker => {
      const icon = marker.getIcon();
      // On met à jour l'élément HTML du marqueur directement pour la performance
      const el = marker.getElement();
      if (el) {
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        // Ajustement du centrage
        el.style.marginLeft = `-${size/2}px`;
        el.style.marginTop = `-${size/2}px`;
      }
    });
  }
}

// Écouter les changements de zoom
map.on('zoomend', updateMarkersStyle);




// =======================
// GEOLOC
// =======================

map.locate({
  watch: true,
  enableHighAccuracy: true
});

map.on("locationfound", e => {

  userLatLng = e.latlng;

  if (!userMarker) {

    userMarker = L.circleMarker(e.latlng, {
      radius: 7,
      fillColor: "#1a73e8",
      color: "#fff",
      weight: 2,
      fillOpacity: 1
    }).addTo(map);

    accuracyCircle = L.circle(e.latlng, {
      radius: e.accuracy,
      fillColor: "#1a73e8",
      fillOpacity: 0.1,
      weight: 0
    }).addTo(map);

  } else {
    userMarker.setLatLng(e.latlng);
    accuracyCircle.setLatLng(e.latlng);
    accuracyCircle.setRadius(e.accuracy);
  }

});

// =======================
// LOGIQUE DU BOUTON RECENTER
// =======================
document.getElementById("recenterBtn").addEventListener("click", () => {
  if (userLatLng) {
    map.flyTo(userLatLng, 17, {
      animate: true,
      duration: 1.5
    });
  } else {
    alert("Localisation en cours... assurez-vous d'avoir activé le GPS.");
  }
});


// =======================
// RECHERCHE DISTANCE
// =======================

/*const ORS_API_KEY = "5b3ce3597851110001cf6248578d54540441499fbbd75d50340a9c02";

document.getElementById("findBtn").onclick = async () => {

  if (!userLatLng) return;

  document.getElementById("distance").innerText = "Recherche...";

  const candidats = [...bancs]
    .sort((a,b) => map.distance(userLatLng, a) - map.distance(userLatLng, b))
    .slice(0,6);

  let bestRoute = null;
  let bestDistance = Infinity;

  for (let banc of candidats) {

    try {

      const response = await fetch(
        "https://api.openrouteservice.org/v2/directions/foot-walking/geojson",
        {
          method: "POST",
          headers: {
            "Authorization": ORS_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            coordinates: [
              [userLatLng.lng, userLatLng.lat],
              [banc.lng, banc.lat]
            ]
          })
        }
      );

      const data = await response.json();

      if (!data.features) continue;

      const route = data.features[0];
      const distance = route.properties.summary.distance;

      if (distance < bestDistance) {
        bestDistance = distance;
        bestRoute = route;
      }

    } catch (e) {
      console.log("ORS error", e);
    }
  }

  if (!bestRoute) {
    document.getElementById("distance").innerText = "Aucun accès";
    return;
  }

  if (routeLayer) map.removeLayer(routeLayer);

  routeLayer = L.geoJSON(bestRoute.geometry, {
    style: { color: "#1a73e8", weight: 5 }
  }).addTo(map);

  map.fitBounds(routeLayer.getBounds(), { padding: [40,40] });

  document.getElementById("distance").innerText =
    Math.round(bestDistance) + " m";
};*/
const ORS_API_KEY = "5b3ce3597851110001cf6248578d54540441499fbbd75d50340a9c02";

findBtn.addEventListener("click", async () => {

  if (!userLatLng) return;

  document.getElementById("distance").innerText = "Recherche...";
  findBtn.disabled = true;

  const candidats = [...bancs]
    .sort((a,b) => map.distance(userLatLng, a) - map.distance(userLatLng, b))
    .slice(0,3); // ⚠️ 3 au lieu de 6

  let bestRoute = null;
  let bestDistance = Infinity;

  for (let banc of candidats) {

    try {

      const response = await fetch(
        "https://api.openrouteservice.org/v2/directions/foot-walking/geojson",
        {
          method: "POST",
          headers: {
            "Authorization": ORS_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            coordinates: [
              [userLatLng.lng, userLatLng.lat],
              [banc.lng, banc.lat]
            ]
          })
        }
      );

      const data = await response.json();

      if (!data.features) continue;

      const route = data.features[0];
      const distance = route.properties.summary.distance;

      if (distance < bestDistance) {
        bestDistance = distance;
        bestRoute = route;
      }

    } catch (e) {
      console.log("ORS error", e);
    }
  }

  if (!bestRoute) {
    document.getElementById("distance").innerText = "Aucun accès";
    findBtn.disabled = false;
    return;
  }

  if (routeLayer) map.removeLayer(routeLayer);

  routeLayer = L.geoJSON(bestRoute.geometry, {
    style: { color: "#1a73e8", weight: 5 }
  }).addTo(map);

  map.fitBounds(routeLayer.getBounds(), { padding: [40,40] });

  document.getElementById("distance").innerText =
    Math.round(bestDistance) + " m";

  findBtn.disabled = false;
});

// =======================
// DRAW ROUTE
// =======================

function drawRoute(dest, distance) {

  if (routeLayer) map.removeLayer(routeLayer);

  const url = `https://router.project-osrm.org/route/v1/foot/${userLatLng.lng},${userLatLng.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;

  fetch(url)
  .then(res => res.json())
  .then(data => {

    routeLayer = L.geoJSON(data.routes[0].geometry, {
      style: { color: "#1a73e8", weight: 5 }
    }).addTo(map);

    map.fitBounds(routeLayer.getBounds(), { padding: [50,50] });

    document.getElementById("distance").innerText =
      Math.round(distance) + " m";
  });
}
