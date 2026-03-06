const map = L.map('map', {
  zoomControl: false,
  attributionControl: false
}).setView([48.112, 5.14], 15);

// Couches de tuiles
const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
const osmHOT = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', { maxZoom: 19,	attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/" target="_blank">Humanitarian OpenStreetMap Team</a> hosted by <a href="https://openstreetmap.fr/" target="_blank">OpenStreetMap France</a>' });
const osmCAT = L.tileLayer('https://tile.openstreetmap.bzh/ca/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles courtesy of <a href="https://www.openstreetmap.cat" target="_blank">Breton OpenStreetMap Team</a>' });
const CartoDB_Positron = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
	attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
	subdomains: 'abcd',
	maxZoom: 20
});
const CartoDB_Voyager = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
	attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
	subdomains: 'abcd',
	maxZoom: 20
});
const GeoportailFrance_orthos = L.tileLayer('https://data.geopf.fr/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&STYLE={style}&TILEMATRIXSET=PM&FORMAT={format}&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', {
	attribution: '<a target="_blank" href="https://www.geoportail.gouv.fr/">Geoportail France</a>',
	bounds: [[-75, -180], [81, 180]],
	minZoom: 2,
	maxZoom: 19,
	format: 'image/jpeg',
	style: 'normal'
});



const esriTOPO = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community' });
const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: '© CartoDB' });




// Ajouter la couche par défaut
osmLayer.addTo(map);

// Contrôle de couches
/*const baseLayers = {
  "OpenStreetMap": osmLayer,
  "osmHOT": osmHOT,
  "osmCAT": osmCAT,
  "CartoDB_Positron": CartoDB_Positron,
  "CartoDB_Voyager": CartoDB_Voyager,
  "GeoportailFrance_orthos": GeoportailFrance_orthos,
  "esriTOPO": esriTOPO,
  "Fond sombre": darkLayer
};
L.control.layers(baseLayers).addTo(map);
*/

// On stocke les couches dans un objet pour y accéder facilement
const layers = {
    "Standard": osmLayer,
    "Hybride": GeoportailFrance_orthos,
    "Sombre": darkLayer
};

// Fonction pour afficher/cacher le menu
function toggleMenu() {
    document.getElementById('map-style-menu').classList.toggle('hidden');
}

// Fonction pour changer la couche
function changeLayer(name, element) {
    // 1. Retirer toutes les couches de base de la carte
    Object.values(layers).forEach(layer => map.removeLayer(layer));
    
    // 2. Ajouter la couche sélectionnée
    layers[name].addTo(map);
    
    // 3. Gérer l'UI (bordure bleue)
    document.querySelectorAll('.style-option').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    
    // 4. Fermer le menu sur mobile après sélection
    toggleMenu();
}


























/*L.control.zoom({ position: 'topright' }).addTo(map);*/

let userLatLng = null;
let userMarker = null;
let accuracyCircle = null;
let routeLayer = null;
let bancs = [];

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
  
  // 1. Confort avec dossier
  if (t.includes("dossier")) return TYPE_COLORS["dossier"];
  
  // 2. Classiques sans dossier
  if (t === "simple" || t === "double") return TYPE_COLORS["standard"];
  
  // 3. Détente
  if (t === "transat") return TYPE_COLORS["detente"];
  
  // 4. Le reste (autre, pierre)
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
// MISE À JOUR DU CHARGEMENT
// =======================
// Groupe pour gérer tous les marqueurs de bancs ensemble
const benchesLayer = L.layerGroup().addTo(map);

fetch("bancs.geojson")
.then(res => res.json())
.then(data => {
  data.features.forEach(f => {
    const typeRaw = f.properties.TYPE || "autre";
    const t = typeRaw.toLowerCase();

    if (t.includes("bus")) return;

    const latlng = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
    const color = getBenchColor(typeRaw);
    
    // Déterminer la priorité d'affichage
    let priority = 100; // Par défaut
    if (t === "autre" || t === "pierre") priority = 10; // Priorité basse
    if (t.includes("dossier")) priority = 200; // Priorité haute

    const marker = L.marker(latlng, { 
      icon: createBenchIcon(color),
      zIndexOffset: priority // <--- Ajout du zIndex
    }).bindPopup(`${typeRaw}`);
    
    // On stocke le type dans le marqueur pour l'utiliser dans le style
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
    
    // Taille de base un peu plus grande pour qu'ils soient lisibles (16px à 22px)
    const baseSize = Math.max(12, (currentZoom - 13) * 4); 

    benchesLayer.eachLayer(marker => {
      const el = marker.getElement();
      if (el) {
        const isSmallType = (marker.typeBench === "autre" || marker.typeBench === "pierre");
        const finalSize = isSmallType ? (baseSize * 0.8) : baseSize;

        // On injecte la taille dans la variable CSS
        el.style.setProperty('--m-size', `${finalSize}px`);
        
        // Leaflet a besoin de recalculer la position centrale
        el.style.marginLeft = `-${finalSize / 2}px`;
        el.style.marginTop = `-${finalSize / 2}px`;
      }
    });
  }
}

// Écouter les changements de zoom
map.on('zoomend', updateMarkersStyle);




// =======================
// GEOLOC AMÉLIORÉE
// =======================

// Fonction pour démarrer la surveillance
function startLocating() {
  map.locate({
    watch: true,
    enableHighAccuracy: true,
    setView: false // On ne veut pas que la carte bouge toute seule sans arrêt
  });
}

map.on("locationfound", e => {
  userLatLng = e.latlng;
  
  // Activer le bouton si il était désactivé
const findBtn = document.getElementById("findBtn");
if (findBtn.disabled) {
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

  // LOGIQUE DE RÉDUCTION DU TRAJET (Calcul local)
  updateRouteProgress(e.latlng);
});

map.on("locationerror", () => {
  console.log("GPS non disponible, nouvelle tentative dans 5s...");
  setTimeout(startLocating, 5000); // Réessaie automatiquement
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

      // 1. On cherche si on a dépassé des points (seuil 15m)
      let startIndex = 0;
      for (let i = 0; i < coords.length; i++) {
        if (currentPos.distanceTo(coords[i]) < 15) {
          startIndex = i;
        }
      }

      // 2. On nettoie les points passés
      if (startIndex > 0) {
        coords.splice(0, startIndex);
      }

      // 3. L'ASTUCE : On force le premier point à être ta position GPS
      // Cela crée l'effet "élastique" si tu t'éloignes
      coords[0] = currentPos;

      // 4. On met à jour le dessin
      layer.setLatLngs(coords);
      
      // 5. Mise à jour de la distance en temps réel
      const remainingDist = calculateRouteDistance(coords);
      document.getElementById("distance").innerText = Math.round(remainingDist) + " m";
    }
  });
}

// Calcule la distance totale d'un tableau de coordonnées
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
    .slice(0,3); // 3 au lieu de 6

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
