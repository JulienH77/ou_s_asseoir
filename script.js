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
// SVG BENCH PROPRE
// =======================

const benchIcon = L.divIcon({
  html: `
  <svg width="16" height="16" viewBox="0 0 24 24">
    <path d="M3 11h18v3H3zM6 7h12v3H6zM6 14h2v5H6zm10 0h2v5h-2z"
          fill="#222"/>
  </svg>`,
  iconSize: [16,16],
  iconAnchor: [8,8],
  className: ""
});

// =======================
// LOAD BANCS
// =======================

fetch("bancs.geojson")
.then(res => res.json())
.then(data => {

  data.features.forEach(f => {

    if (f.properties.TYPE.toLowerCase().includes("bus")) return;

    const latlng = [
      f.geometry.coordinates[1],
      f.geometry.coordinates[0]
    ];

    L.marker(latlng, { icon: benchIcon })
      .bindPopup(f.properties.TYPE)
      .addTo(map);

    bancs.push(L.latLng(latlng));
  });

});

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
// RECENTER
// =======================

document.getElementById("recenterBtn").onclick = () => {
  if (userLatLng) map.setView(userLatLng, 17);
};

// =======================
// FIND NEAREST (RAPIDE)
// =======================

document.getElementById("findBtn").onclick = async () => {

  if (!userLatLng) return;

  document.getElementById("distance").innerText = "Recherche...";

  // 10 plus proches à vol d’oiseau
  const candidats = [...bancs]
    .sort((a,b) => map.distance(userLatLng, a) - map.distance(userLatLng, b))
    .slice(0,10);

  // Construire la liste de coordonnées
  const coords = [
    `${userLatLng.lng},${userLatLng.lat}`,
    ...candidats.map(b => `${b.lng},${b.lat}`)
  ].join(";");

  try {

    const tableUrl =
      `https://router.project-osrm.org/table/v1/foot/${coords}?sources=0`;

    const res = await fetch(tableUrl);
    const data = await res.json();

    if (!data.distances) return;

    // distances[0] = distances depuis l'utilisateur vers chaque banc
    const distances = data.distances[0];

    let min = Infinity;
    let bestIndex = -1;

    for (let i = 1; i < distances.length; i++) {
      if (distances[i] < min) {
        min = distances[i];
        bestIndex = i - 1;
      }
    }

    if (bestIndex === -1) return;

    const bestBanc = candidats[bestIndex];

    drawRoute(bestBanc, min);

  } catch (e) {
    console.log("Erreur table", e);
  }
};
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
