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
/*
const osmCAT = L.tileLayer('https://tile.openstreetmap.bzh/ca/{z}/{x}/{y}.png', { maxZoom: 19});
const CartoDB_Positron = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20
});
const CartoDB_Voyager = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20});
const esriTOPO = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {});
const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19});
*/

/*// Contrôle de couches
const baseLayers = {
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


/*L.control.zoom({ position: 'topright' }).addTo(map);*/

let userLatLng = null;
let userMarker = null;
let accuracyCircle = null;
let routeLayer = null;
let bancs = [];
let statsBancs = {
    total: 0,
    places: 0,
    dossier: 0,
    standard: 0,
    detente: 0,
    autre: 0
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
    if (!f.geometry || !f.geometry.coordinates) {
        return; 
    }

    const typeRaw = f.properties.TYPE || "autre";
    const t = typeRaw.toLowerCase();

    if (t.includes("bus")) return;

    // On calcule la couleur
    const color = getBenchColor(typeRaw);

    // --- Comptage pour les statistiques ---
    statsBancs.total++;
    
    // Ajout du compteur de places (si la valeur existe et n'est pas null)
    if (f.properties.PLACE) {
        statsBancs.places += f.properties.PLACE;
    }

    if (color === TYPE_COLORS["dossier"]) statsBancs.dossier++;
    else if (color === TYPE_COLORS["standard"]) statsBancs.standard++;
    else if (color === TYPE_COLORS["detente"]) statsBancs.detente++;
    else statsBancs.autre++;

    const latlng = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
    
    // Déterminer la priorité d'affichage
    let priority = 100; // Par défaut
    if (t === "autre" || t === "pierre") priority = 10; // Priorité basse
    if (t.includes("dossier")) priority = 200; // Priorité haute

    // Création du texte de la popup avec le nombre de places
    let popupContent = `<b>${typeRaw.charAt(0).toUpperCase() + typeRaw.slice(1)}</b>`;
    if (f.properties.PLACE) {
        popupContent += `<br><i>${f.properties.PLACE} place(s)</i>`;
    }

    const marker = L.marker(latlng, { 
      icon: createBenchIcon(color),
      zIndexOffset: priority
    }).bindPopup(popupContent);
    
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
  if (!e.latlng) return; // Sécurité : si pas de coordonnées, on stoppe
  
  userLatLng = e.latlng;
  
  const findBtn = document.getElementById("findBtn");
  if (findBtn && findBtn.disabled) {
      findBtn.disabled = false;
      findBtn.querySelector("span").innerText = "Trouver un banc";
  }

  // Si le marqueur n'existe pas encore, on le crée
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
    // Si il existe, on met à jour proprement
    userMarker.setLatLng(e.latlng);
    if (accuracyCircle) {
        accuracyCircle.setLatLng(e.latlng);
        accuracyCircle.setRadius(e.accuracy || 0);
    }
  }

  // Mise à jour du trajet seulement si on bouge de plus de 2 mètres
  updateRouteProgress(e.latlng);
});

map.on("locationerror", (e) => {
  console.warn("Erreur GPS :", e.message);
  
  // Si l'utilisateur ou le navigateur a refusé la permission (Code 1)
  if (e.code === 1) {
    alert("L'accès au GPS est bloqué. Modifiez les permissions de votre navigateur pour utiliser cette fonction.");
    document.getElementById("findBtn").querySelector("span").innerText = "GPS bloqué";
  } else {
    // Pour les autres erreurs (signal faible, etc.), on réessaie
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

      // 1. On cherche si on a dépassé des points (seuil 5m)
      let startIndex = 0;
      for (let i = 0; i < coords.length; i++) {
        if (currentPos.distanceTo(coords[i]) < 5) {
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
  if (!userLatLng || bancs.length === 0) {
    alert("Position ou données des bancs non disponibles.");
    return;
  }

  document.getElementById("distance").innerText = "Recherche...";
  findBtn.disabled = true;

  // On trie les bancs par distance "à vol d'oiseau" (plus rapide)
  const candidats = [...bancs]
    .sort((a, b) => userLatLng.distanceTo(a) - userLatLng.distanceTo(b))
    .slice(0, 3); // On ne demande l'itinéraire que pour les 3 plus proches

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
      // NETTOYAGE de l'ancien tracé
      if (routeLayer) {
        map.removeLayer(routeLayer);
      }

      // CRÉATION du nouveau tracé avec sécurité
      routeLayer = L.geoJSON(bestRoute, {
        style: { 
            color: "#1a73e8", 
            weight: 5,
            opacity: 0.8
        }
      }).addTo(map);

      // Zoom sur le trajet
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





// =======================
// STATISTIQUES
// =======================

function openStats() {
    const modal = document.getElementById('stats-modal');
    const container = document.getElementById('stats-container');
    
    // Calcul de la distance des bancs par rapport à l'utilisateur
    let aMoinsDe250m = 0;
    let aMoinsDe500m = 0;
    
    if (userLatLng) {
        bancs.forEach(b => {
            const dist = map.distance(userLatLng, b);
            if (dist <= 250) aMoinsDe250m++;
            if (dist <= 500) aMoinsDe500m++;
        });
    }

// Génération du contenu HTML de la popup
    let html = `
        <div class="stat-card">
            <div class="stat-info">
                <span class="stat-title">Total des bancs référencés</span>
                <span class="stat-value" style="color: var(--primary-color);">${statsBancs.total}</span>
            </div>
        </div>

        <div class="stat-card">
            <div class="stat-info">
                <span class="stat-title">Capacité d'accueil totale</span>
                <span class="stat-value" style="color: var(--primary-color);">${statsBancs.places} places</span>
            </div>
        </div>
        <h3 class="section-title">Répartition par confort</h3>

        <div class="stat-card" style="border-left: 4px solid ${TYPE_COLORS['dossier']};">
            <div class="stat-info">
                <span class="stat-title">Avec dossier (Confort)</span>
                <span class="stat-value">${statsBancs.dossier}</span>
            </div>
        </div>
        
        <div class="stat-card" style="border-left: 4px solid ${TYPE_COLORS['standard']};">
            <div class="stat-info">
                <span class="stat-title">Sans dossier (Classique)</span>
                <span class="stat-value">${statsBancs.standard}</span>
            </div>
        </div>

        <div class="stat-card" style="border-left: 4px solid ${TYPE_COLORS['detente']};">
            <div class="stat-info">
                <span class="stat-title">Transats (Détente)</span>
                <span class="stat-value">${statsBancs.detente}</span>
            </div>
        </div>

        <div class="stat-card" style="border-left: 4px solid ${TYPE_COLORS['autre']};">
            <div class="stat-info">
                <span class="stat-title">Pierres / Autres</span>
                <span class="stat-value">${statsBancs.autre}</span>
            </div>
        </div>
    `;

    // Si on a la position GPS, on affiche les stats de proximité
    if (userLatLng) {
        html += `
            <h3 class="section-title">Autour de vous</h3>
            <div class="stat-card">
                <div class="stat-info">
                    <span class="stat-title">Bancs à moins de 250m</span>
                    <span class="stat-value">${aMoinsDe250m}</span>
                </div>
                <div style="font-size: 24px;"></div>
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
