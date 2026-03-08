// On change la version ici à chaque grosse mise à jour !
const cacheName = 'carto-v2'; 
const assets = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './bancs.geojson'
];

// 1. Installation du Service Worker et mise en cache
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(cacheName).then(cache => {
      return cache.addAll(assets);
    })
  );
});

// 2. NOUVEAU : Activation et nettoyage des vieux caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys
        .filter(key => key !== cacheName)
        .map(key => caches.delete(key)) // Supprime la v1
      );
    })
  );
});

// 3. Récupération des ressources depuis le cache si hors-ligne
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(response => {
      return response || fetch(e.request);
    })
  );
});
