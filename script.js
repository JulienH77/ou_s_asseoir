// =======================
// CONFIGURATION INITIALE
// =======================
const map = L.map('map', {
    zoomControl: false,
    attributionControl: false
}).setView([48.112, 5.14], 15);

// Couches
const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
const osmHOT = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', { maxZoom: 19 });
const GeoportailFrance_orthos = L.tileLayer('https://data.geopf.fr/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&STYLE={style}&TILEMATRIXSET=PM&FORMAT={format}&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', {
    bounds: [[-75, -180], [81, 180]],
    minZoom: 2,
    maxZoom: 19,
    format: 'image/jpeg',
    style: 'normal'
});

const layers = {
    "Standard": osmLayer,
    "Standard bis": osmHOT,
    "Satellite": GeoportailFrance_orthos
};

osmLayer.addTo(map);

// Variables Globales (UNE SEULE DÉCLARATION ICI)
let userLatLng = null;
let userMarker = null;
let accuracyCircle = null;
let routeLayer = null;
let bancs = [];
let statsBancs = { total: 0, dossier: 0, standard: 0, detente: 0, autre: 0 };

const ORS_API_KEY = "5b3ce3597851110001cf6248578d54540441499fbbd75d50340a9c02";

const TYPE_COLORS = {
    "dossier": "#1a73e8",
    "standard": "#34a853",
    "detente": "#fbbc04",
    "autre": "#70757a"
};

// =======================
// GESTION DES COUCHES & MENU
// =======================
function toggleMenu() {
    document.getElementById('map-style-menu').classList.toggle('hidden');
}

function changeLayer(name, element) {
    Object.values(layers).forEach(layer => { if (map.hasLayer(layer)) map.removeLayer(layer); });
    if (layers[name]) layers[name].addTo(map);
    document.querySelectorAll('.style-option').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    toggleMenu();
}

// =======================
// CHARGEMENT DES BANCS
// =======================
const benchesLayer = L.layerGroup().addTo(map);

function getBenchColor(type) {
    const t = type.toLowerCase();
    if (t.includes("dossier")) return TYPE_COLORS["dossier"];
    if (t === "simple" || t === "double") return TYPE_COLORS["standard"];
    if (t === "transat") return TYPE_COLORS["detente"];
    return TYPE_COLORS["autre"];
}

function createBenchIcon(color) {
    return L.divIcon({
        html: `<div class="bench-marker" style="border-color: ${color};"><svg viewBox="0 0 24 24"><path d="M3 11h18v3H3zM6 7h12v3H6zM6 14h2v5H6zm10 0h2v5h-2z" fill="${color}"/></svg></div>`,
        iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -10], className: ""
    });
}

fetch("bancs.geojson")
    .then(res => res.json())
    .then(data => {
        data.features.forEach(f => {
            if (!f.geometry || !f.geometry.coordinates) return;
            const typeRaw = f.properties.TYPE || "autre";
            const t = typeRaw.toLowerCase();
            if (t.includes("bus")) return;

            const color = getBenchColor(typeRaw);
            statsBancs.total++;
            if (color === TYPE_COLORS["dossier"]) statsBancs.dossier++;
            else if (color === TYPE_COLORS["standard"]) statsBancs.standard++;
            else if (color === TYPE_COLORS["detente"]) statsBancs.detente++;
            else statsBancs.autre++;

            const latlng = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
            let priority = t.includes("dossier") ? 200 : (t === "autre" ? 10 : 100);

            const marker = L.marker(latlng, {
                icon: createBenchIcon(color),
                zIndexOffset: priority
            }).bindPopup(typeRaw);
            
            marker.typeBench = t;
            marker.addTo(benchesLayer);
            bancs.push(L.latLng(latlng));
        });
    });

// =======================
// GÉOLOCALISATION
// =======================
function startLocating() {
    map.locate({ watch: true, enableHighAccuracy: true, setView: false });
}

map.on("locationfound", e => {
    userLatLng = e.latlng;
    const findBtn = document.getElementById("findBtn");
    if (findBtn && findBtn.disabled) {
        findBtn.disabled = false;
        findBtn.querySelector("span").innerText = "Trouver un banc";
    }

    if (!userMarker) {
        userMarker = L.circleMarker(e.latlng, { radius: 7, fillColor: "#1a73e8", color: "#fff", weight: 2, fillOpacity: 1 }).addTo(map);
        accuracyCircle = L.circle(e.latlng, { radius: e.accuracy || 0, fillColor: "#1a73e8", fillOpacity: 0.1, weight: 0 }).addTo(map);
    } else {
        userMarker.setLatLng(e.latlng);
        if (accuracyCircle) {
            accuracyCircle.setLatLng(e.latlng);
            accuracyCircle.setRadius(e.accuracy || 0);
        }
    }
    updateRouteProgress(e.latlng);
});

map.on("locationerror", (e) => {
    console.warn("Erreur GPS :", e.message);
    setTimeout(startLocating, 5000);
});

startLocating();

// =======================
// RECHERCHE ET ITINÉRAIRE
// =======================
const findBtn = document.getElementById("findBtn");
findBtn.addEventListener("click", async () => {
    if (!userLatLng || bancs.length === 0) return;

    document.getElementById("distance").innerText = "Recherche...";
    findBtn.disabled = true;

    const candidats = [...bancs]
        .sort((a, b) => userLatLng.distanceTo(a) - userLatLng.distanceTo(b))
        .slice(0, 3);

    let bestRoute = null;
    let bestDistance = Infinity;

    try {
        for (let banc of candidats) {
            const response = await fetch("https://api.openrouteservice.org/v2/directions/foot-walking/geojson", {
                method: "POST",
                headers: { "Authorization": ORS_API_KEY, "Content-Type": "application/json" },
                body: JSON.stringify({ coordinates: [[userLatLng.lng, userLatLng.lat], [banc.lng, banc.lat]] })
            });

            if (!response.ok) continue;
            const data = await response.json();
            if (data.features && data.features.length > 0) {
                const route = data.features[0];
                const d = route.properties.summary.distance;
                if (d < bestDistance) { bestDistance = d; bestRoute = route; }
            }
        }

        if (bestRoute) {
            if (routeLayer) map.removeLayer(routeLayer);
            // On utilise L.polyline pour être plus robuste que L.geoJSON sur les mises à jour
            const coords = bestRoute.geometry.coordinates.map(c => [c[1], c[0]]);
            routeLayer = L.polyline(coords, { color: "#1a73e8", weight: 5, opacity: 0.8 }).addTo(map);
            map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });
            document.getElementById("distance").innerText = Math.round(bestDistance) + " m";
        }
    } catch (err) {
        console.error("Erreur itinéraire:", err);
        document.getElementById("distance").innerText = "Erreur itinéraire";
    } finally {
        findBtn.disabled = false;
    }
});

function updateRouteProgress(currentPos) {
    if (!routeLayer || !(routeLayer instanceof L.Polyline)) return;
    let coords = routeLayer.getLatLngs();
    if (coords.length < 2) return;

    let startIndex = 0;
    for (let i = 0; i < coords.length; i++) {
        if (currentPos.distanceTo(coords[i]) < 10) startIndex = i;
    }
    if (startIndex > 0) coords.splice(0, startIndex);
    coords[0] = currentPos;
    routeLayer.setLatLngs(coords);

    let total = 0;
    for (let i = 0; i < coords.length - 1; i++) total += coords[i].distanceTo(coords[i+1]);
    document.getElementById("distance").innerText = Math.round(total) + " m";
}

// =======================
// AUTRES FONCTIONS
// =======================
document.getElementById("recenterBtn").addEventListener("click", () => {
    if (userLatLng) map.flyTo(userLatLng, 17);
});

function openStats() {
    const modal = document.getElementById('stats-modal');
    const container = document.getElementById('stats-container');
    let aMoinsDe250m = 0;
    if (userLatLng) {
        bancs.forEach(b => { if (map.distance(userLatLng, b) <= 250) aMoinsDe250m++; });
    }

    container.innerHTML = `
        <div class="stat-card"><span>Total : ${statsBancs.total}</span></div>
        <div class="stat-card" style="border-left:4px solid ${TYPE_COLORS.dossier}">Dossier : ${statsBancs.dossier}</div>
        <div class="stat-card" style="border-left:4px solid ${TYPE_COLORS.standard}">Standard : ${statsBancs.standard}</div>
        ${userLatLng ? `<div class="stat-card">À moins de 250m : ${aMoinsDe250m}</div>` : ''}
    `;
    modal.classList.remove('hidden');
}

function closeStats() { document.getElementById('stats-modal').classList.add('hidden'); }
