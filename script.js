const map = L.map('map', {
  zoomControl: false,
  attributionControl: false
}).setView([48.112, 5.14], 15);

// Définition des couches
const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
const osmHOT = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', { maxZoom: 19 });
const GeoportailFrance_orthos = L.tileLayer('https://data.geopf.fr/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&STYLE={style}&TILEMATRIXSET=PM&FORMAT={format}&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', {
    bounds: [[-75, -180], [81, 180]],
    minZoom: 2,
    maxZoom: 19,
    format: 'image/jpeg',
    style: 'normal'
});

// Objet de correspondance (les clés doivent être IDENTIQUES aux noms dans le onclick du HTML)
const layers = {
    "Standard": osmLayer,
    "Standard bis": osmHOT,
    "Satellite": GeoportailFrance_orthos
};

// Indispensable : Ajouter la couche initiale
osmLayer.addTo(map);

function toggleMenu() {
    document.getElementById('map-style-menu').classList.toggle('hidden');
}

function changeLayer(name, element) {
    // Retirer les couches existantes
    Object.values(layers).forEach(layer => {
        if (map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    });
    
    // Ajouter la nouvelle
    if (layers[name]) {
        layers[name].addTo(map);
    }
    
    // Mise à jour visuelle
    document.querySelectorAll('.style-option').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    
    // Fermeture automatique
    toggleMenu();
}

let userLatLng = null;
let userMarker = null;
let accuracyCircle = null;
let routeLayer = null;
let bancs = [];

// NOUVEAU : Objets pour stocker le nombre de bancs ET le nombre de places
let statsBancs = {
    total: 0,
    placesTotal: 0,
    dossier: 0,
    placesDossier: 0,
    standard: 0,
    placesStandard: 0,
    detente: 0,
    placesDetente: 0,
    autre: 0,
    placesAutre: 0
};

// =======================
// CONFIGURATION DES TYPES (Groupés par confort)
// =======================
const TYPE_COLORS = {
  "dossier": "#1a73e8",   // Bleu : Confort (Simple dossier, Double dossier)
  "standard": "#34a853",  // Vert : Classique (Simple, Double)
  "detente": "#fbbc04",   // Jaune/Orange : (Transat)
  "autre": "#70757a",     // Gris : (Autre, Pierre)
  "default": "#70757a"
};

function getBenchColor(type) {
  const t = type.toLowerCase();
  
  if (t.includes("dossier")) return TYPE_COLORS["dossier"];
  if (t === "simple" || t === "double") return TYPE_COLORS["standard"];
  if (t === "transat") return TYPE_COLORS["detente"];
  return TYPE_COLORS["autre"];
}

// Fonction pour générer l'icône avec la bonne couleur
function createBenchIcon(color) {
  return L.divIcon({
    html: `
    <div class="bench-marker" style="border-color: ${color};">
      <svg viewBox="0 0 24 24">
        <path d="M3 11h18v3H3zM6 7h12v3H6zM6 14h2v5H6zm10 0h2v5h-2z" fill="${color}"/>
      </svg>
    </div>`,
    iconSize: [20, 20], // Taille par défaut pour l'ancrage
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
    className: ""
  });
}

// =======================
// CHARGEMENT DES DONNÉES ET MISE À JOUR DES STATS
// =======================
const benchesLayer = L.layerGroup().addTo(map);

fetch("bancs.geojson")
.then(res => res.json())
.then(data => {
  data.features.forEach(f => {
    if (!f.geometry || !f.geometry.coordinates) {
        return; 
    }

    const typeRaw = f.properties.TYPE || "autre";
    const t = typeRaw.toLowerCase();

    if (t.includes("bus")) return;

    const color = getBenchColor(typeRaw);
    
    // On récupère le nombre de places (0 par défaut si non renseigné ou null)
    const places = f.properties.PLACE || 0;

    // --- Comptage pour les statistiques ---
    statsBancs.total++;
    statsBancs.placesTotal += places;

    if (color === TYPE_COLORS["dossier"]) {
        statsBancs.dossier++;
        statsBancs.placesDossier += places;
    } else if (color === TYPE_COLORS["standard"]) {
        statsBancs.standard++;
        statsBancs.placesStandard += places;
    } else if (color === TYPE_COLORS["detente"]) {
        statsBancs.detente++;
        statsBancs.placesDetente += places;
    } else {
        statsBancs.autre++;
        statsBancs.placesAutre += places;
    }

    const latlng = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
    
    let priority = 100; // Par défaut
    if (t === "autre" || t === "pierre") priority = 10;
    if (t.includes("dossier")) priority = 200;

    // Ajout des places dans la popup
    const popupContent = `<b>${typeRaw.charAt(0).toUpperCase() + typeRaw.slice(1)}</b><br><i>${places > 0 ? places + ' place(s)' : 'Capacité inconnue'}</i>`;

    const marker = L.marker(latlng, { 
      icon: createBenchIcon(color),
      zIndexOffset: priority
    }).bindPopup(popupContent);
    
    marker.typeBench = t; 
    marker.addTo(benchesLayer);
    bancs.push(L.latLng(latlng));
  });
});

// Fonction pour ajuster la visibilité et la taille
function updateMarkersStyle() {
  const currentZoom = map.getZoom();
  
  if (currentZoom < 14) {
    if (map.hasLayer(benchesLayer)) map.removeLayer(benchesLayer);
  } else {
    if (!map.hasLayer(benchesLayer)) map.addLayer(benchesLayer);
    
    const baseSize = Math.max(12, (currentZoom - 13) * 4); 

    benchesLayer.eachLayer(marker => {
      const el = marker.getElement();
      if (el) {
        const isSmallType = (marker.typeBench === "autre" || marker.typeBench === "pierre");
        const finalSize = isSmallType ? (baseSize * 0.8) : baseSize;

        el.style.setProperty('--m-size', `${finalSize}px`);
        el.style.marginLeft = `-${finalSize / 2}px`;
        el.style.marginTop = `-${finalSize / 2}px`;
      }
    });
  }
}

map.on('zoomend', updateMarkersStyle);

// =======================
// GEOLOC AMÉLIORÉE
// =======================
function startLocating() {
  map.locate({
    watch: true,
    enableHighAccuracy: true,
    setView: false 
  });
}

map.on("locationfound", e => {
  if (!e.latlng) return; 
  
  userLatLng = e.latlng;
  
  const findBtn = document.getElementById("findBtn");
  if (findBtn && findBtn.disabled) {
      findBtn.disabled = false;
      findBtn.querySelector("span").innerText = "Trouver un banc";
  }

  if (!userMarker) {
    userMarker = L.circleMarker(e.latlng, {
      radius: 7,
      fillColor: "#1a73e8",
      color: "#fff",
      weight: 2,
      fillOpacity: 1
    }).addTo(map);

    accuracyCircle = L.circle(e.latlng, {
      radius: e.accuracy || 0,
      fillColor: "#1a73e8",
      fillOpacity: 0.1,
      weight: 0
    }).addTo(map);
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
  
  if (e.code === 1) {
    alert("L'accès au GPS est bloqué. Modifiez les permissions de votre navigateur pour utiliser cette fonction.");
    document.getElementById("findBtn").querySelector("span").innerText = "GPS bloqué";
  } else {
    console.log("Nouvelle tentative dans 5s...");
    setTimeout(startLocating, 5000);
  }
});

startLocating();

// =======================
// RÉDUCTION DYNAMIQUE DU TRAJET
// =======================
function updateRouteProgress(currentPos) {
  if (!routeLayer) return;

  routeLayer.eachLayer(layer => {
    if (layer instanceof L.Polyline) {
      let coords = layer.getLatLngs();
      if (coords.length < 2) return;

      let startIndex = 0;
      for (let i = 0; i < coords.length; i++) {
        if (currentPos.distanceTo(coords[i]) < 5) {
          startIndex = i;
        }
      }

      if (startIndex > 0) {
        coords.splice(0, startIndex);
      }

      coords[0] = currentPos;
      layer.setLatLngs(coords);
      
      const remainingDist = calculateRouteDistance(coords);
      document.getElementById("distance").innerText = Math.round(remainingDist) + " m";
    }
  });
}

function calculateRouteDistance(latlngs) {
    let total = 0;
    for (let i = 0; i < latlngs.length - 1; i++) {
        total += latlngs[i].distanceTo(latlngs[i+1]);
    }
    return total;
}

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
const ORS_API_KEY = "5b3ce3597851110001cf6248578d54540441499fbbd75d50340a9c02";

findBtn.addEventListener("click", async () => {
  if (!userLatLng || bancs.length === 0) {
    alert("Position ou données des bancs non disponibles.");
    return;
  }

  document.getElementById("distance").innerText = "Recherche...";
  findBtn.disabled = true;

  const candidats = [...bancs]
    .sort((a, b) => userLatLng.distanceTo(a) - userLatLng.distanceTo(b))
    .slice(0, 3); 

  let bestRoute = null;
  let bestDistance = Infinity;

  try {
    for (let banc of candidats) {
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

      if (!response.ok) continue;

      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const route = data.features[0];
        const dist = route.properties.summary.distance;
        
        if (dist < bestDistance) {
          bestDistance = dist;
          bestRoute = route;
        }
      }
    }

    if (bestRoute && bestRoute.geometry) {
      if (routeLayer) {
        map.removeLayer(routeLayer);
      }

      routeLayer = L.geoJSON(bestRoute, {
        style: { 
            color: "#1a73e8", 
            weight: 5,
            opacity: 0.8
        }
      }).addTo(map);

      map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });
      
      document.getElementById("distance").innerText = Math.round(bestDistance) + " m";
    } else {
      document.getElementById("distance").innerText = "Aucun accès";
    }

  } catch (err) {
    console.error("Erreur itinéraire détaillée:", err);
    document.getElementById("distance").innerText = "Erreur itinéraire";
  } finally {
    findBtn.disabled = false;
  }
});

// =======================
// STATISTIQUES
// =======================
function openStats() {
    const modal = document.getElementById('stats-modal');
    const container = document.getElementById('stats-container');
    
    let aMoinsDe250m = 0;
    let aMoinsDe500m = 0;
    
    if (userLatLng) {
        bancs.forEach(b => {
            const dist = map.distance(userLatLng, b);
            if (dist <= 250) aMoinsDe250m++;
            if (dist <= 500) aMoinsDe500m++;
        });
    }

    let html = `
        <div class="stat-card">
            <div class="stat-info">
                <span class="stat-title">Total des bancs référencés</span>
                <span class="stat-value" style="color: var(--primary-color);">
                    ${statsBancs.total} 
                    <span style="font-size: 16px; font-weight: 500; color: var(--text-secondary);">(${statsBancs.placesTotal} places)</span>
                </span>
            </div>
        </div>

        <h3 class="section-title">Répartition par confort</h3>

        <div class="stat-card" style="border-left: 4px solid ${TYPE_COLORS['dossier']};">
            <div class="stat-info">
                <span class="stat-title">Avec dossier (Confort)</span>
                <span class="stat-value">
                    ${statsBancs.dossier} 
                    <span style="font-size: 14px; font-weight: 500; color: var(--text-secondary);">(${statsBancs.placesDossier} pl.)</span>
                </span>
            </div>
        </div>
        
        <div class="stat-card" style="border-left: 4px solid ${TYPE_COLORS['standard']};">
            <div class="stat-info">
                <span class="stat-title">Sans dossier (Classique)</span>
                <span class="stat-value">
                    ${statsBancs.standard}
                    <span style="font-size: 14px; font-weight: 500; color: var(--text-secondary);">(${statsBancs.placesStandard} pl.)</span>
                </span>
            </div>
        </div>

        <div class="stat-card" style="border-left: 4px solid ${TYPE_COLORS['detente']};">
            <div class="stat-info">
                <span class="stat-title">Transats (Détente)</span>
                <span class="stat-value">
                    ${statsBancs.detente}
                    <span style="font-size: 14px; font-weight: 500; color: var(--text-secondary);">(${statsBancs.placesDetente} pl.)</span>
                </span>
            </div>
        </div>

        <div class="stat-card" style="border-left: 4px solid ${TYPE_COLORS['autre']};">
            <div class="stat-info">
                <span class="stat-title">Pierres / Autres</span>
                <span class="stat-value">
                    ${statsBancs.autre}
                    <span style="font-size: 14px; font-weight: 500; color: var(--text-secondary);">(${statsBancs.placesAutre} pl.)</span>
                </span>
            </div>
        </div>
    `;

    if (userLatLng) {
        html += `
            <h3 class="section-title">Autour de vous</h3>
            <div class="stat-card">
                <div class="stat-info">
                    <span class="stat-title">Bancs à moins de 250m</span>
                    <span class="stat-value">${aMoinsDe250m}</span>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-info">
                    <span class="stat-title">Bancs à moins de 500m</span>
                    <span class="stat-value">${aMoinsDe500m}</span>
                </div>
            </div>
        `;
    } else {
        html += `
            <div class="stat-card" style="background-color: #e8f0fe; justify-content: center; text-align: center; margin-top: 10px;">
                <span class="stat-title" style="color: var(--primary-color);">Activez le GPS pour voir les bancs proches de vous !</span>
            </div>
        `;
    }

    container.innerHTML = html;
    modal.classList.remove('hidden');
}

function closeStats() {
    document.getElementById('stats-modal').classList.add('hidden');
}