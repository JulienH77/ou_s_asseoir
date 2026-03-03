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

  // 3 plus proches à vol d’oiseau
  const candidats = bancs
    .sort((a,b) => map.distance(userLatLng, a) - map.distance(userLatLng, b))
    .slice(0,3);

  let bestBanc = null;
  let bestDistance = Infinity;
  let bestSnap = null;

  for (let banc of candidats) {

    // Crée 8 points autour du banc
    const radius = 15; // mètres
    const angles = Array.from({length:8}, (_,i) => i * Math.PI/4);
    const snapPoints = angles.map(a => {
      const dx = radius * Math.cos(a);
      const dy = radius * Math.sin(a);
      // convert meter offset to lat/lng approximatif
      const dLat = dy / 111320;
      const dLng = dx / (40075000 * Math.cos(banc.lat * Math.PI/180) / 360);
      return [banc.lat + dLat, banc.lng + dLng];
    });

    let minLocalDist = Infinity;
    let localSnap = null;

    for (let pt of snapPoints) {
      try {
        const nearestUrl = `https://router.project-osrm.org/nearest/v1/foot/${pt[1]},${pt[0]}?number=1`;
        const nearestRes = await fetch(nearestUrl);
        const nearestData = await nearestRes.json();
        if (!nearestData.waypoints) continue;
        const snap = nearestData.waypoints[0].location;

        const routeUrl = `https://router.project-osrm.org/route/v1/foot/${userLatLng.lng},${userLatLng.lat};${snap[0]},${snap[1]}?overview=false`;
        const routeRes = await fetch(routeUrl);
        const routeData = await routeRes.json();
        if (!routeData.routes) continue;

        const dist = routeData.routes[0].distance;
        if (dist < minLocalDist) {
          minLocalDist = dist;
          localSnap = snap;
        }

      } catch(e) {
        console.log("Erreur OSRM", e);
      }
    }

    if (minLocalDist < bestDistance) {
      bestDistance = minLocalDist;
      bestBanc = banc;
      bestSnap = localSnap;
    }

  }

  if (bestBanc && bestSnap) {
    drawRoute(bestSnap, bestDistance);
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
