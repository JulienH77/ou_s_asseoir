const map = L.map('map', { zoomControl: false }).setView([48.112, 5.14], 15);

// FOND PREMIUM (remplace TA_CLE par la tienne)
L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  /*,
    {attribution: '&copy; OpenStreetMap'
    }*/
);.addTo(map);


// ============================
// VARIABLES
// ============================

let userLatLng = null;
let userMarker;
let directionCone;
let routeLayer;
let bancs = [];


// ============================
// SVG BENCH PREMIUM
// ============================

const benchIcon = L.divIcon({
  html: `
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path d="M3 11h18v3H3zM6 7h12v3H6zM6 14h2v5H6zm10 0h2v5h-2z"
          fill="#1a1a1a"/>
  </svg>`,
  iconSize: [20,20],
  iconAnchor: [10,10],
  className: ""
});


// ============================
// CHARGEMENT BANCS
// ============================

fetch("bancs.geojson")
.then(res => res.json())
.then(data => {

  data.features.forEach(f => {

    const latlng = [f.geometry.coordinates[1], f.geometry.coordinates[0]];

    const marker = L.marker(latlng, { icon: benchIcon })
      .bindPopup(f.properties.TYPE)
      .addTo(map);

    bancs.push({
      latlng: L.latLng(latlng),
      type: f.properties.TYPE
    });

  });

});


// ============================
// LOCALISATION GOOGLE STYLE
// ============================

map.locate({
  watch: true,
  enableHighAccuracy: true,
  setView: true
});

map.on("locationfound", e => {

  userLatLng = e.latlng;

  if (!userMarker) {
    userMarker = L.circleMarker(e.latlng, {
      radius: 8,
      fillColor: "#1a73e8",
      color: "#fff",
      weight: 2,
      fillOpacity: 1
    }).addTo(map);
  } else {
    userMarker.setLatLng(e.latlng);
  }

});


// ============================
// CALCUL RÉSEAU OPTIMISÉ
// ============================

document.getElementById("findBtn").addEventListener("click", async () => {

  if (!userLatLng) return;

  let best = null;
  let min = Infinity;

  // On limite aux 6 plus proches à vol d’oiseau pour éviter 40 requêtes OSRM
  const sorted = bancs
    .filter(b => !b.type.toLowerCase().includes("bus"))
    .sort((a,b) =>
      map.distance(userLatLng, a.latlng) -
      map.distance(userLatLng, b.latlng)
    )
    .slice(0,6);

  for (let b of sorted) {

    const url = `https://router.project-osrm.org/route/v1/foot/${userLatLng.lng},${userLatLng.lat};${b.latlng.lng},${b.latlng.lat}?overview=false`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.routes) continue;

    const d = data.routes[0].distance;

    if (d < min) {
      min = d;
      best = b.latlng;
    }
  }

  if (best) drawRoute(best, min);

});


// ============================
// TRACE FINAL
// ============================

function drawRoute(dest, distance) {

  if (routeLayer) map.removeLayer(routeLayer);

  const url = `https://router.project-osrm.org/route/v1/foot/${userLatLng.lng},${userLatLng.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;

  fetch(url)
  .then(res => res.json())
  .then(data => {

    routeLayer = L.geoJSON(data.routes[0].geometry, {
      style: { color: "#1a73e8", weight: 5 }
    }).addTo(map);

    map.fitBounds(routeLayer.getBounds(), { padding: [60,60] });

    document.getElementById("distanceText").innerText =
      Math.round(distance) + " m";
  });

}
