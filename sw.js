const cacheName = 'carto-v1';
const assets = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './bancs.geojson'
];

// Installation du Service Worker et mise en cache des fichiers
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(cacheName).then(cache => {
      return cache.addAll(assets);
    })
  );
});

// Récupération des ressources depuis le cache si hors-ligne
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(response => {
      return response || fetch(e.request);
    })
  );
});
