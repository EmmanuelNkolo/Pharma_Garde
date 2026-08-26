/**
 * Pharma-Garde — Service Worker
 * Handles offline caching for the PWA
 */

const CACHE_NAME = 'pharma-garde-v1';
const STATIC_ASSETS = [
  '/index.html',
  '/pharmacien.html',
  '/css/index.css',
  '/css/app.css',
  '/css/pharmacien.css',
  '/js/app.js',
  '/js/map.js',
  '/js/geolocation.js',
  '/js/pharmacies.js',
  '/js/search.js',
  '/js/payment.js',
  '/js/pharmacien.js',
  '/manifest.json',
];

const EXTERNAL_ASSETS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

// Install: Cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll([...STATIC_ASSETS, ...EXTERNAL_ASSETS]);
    })
  );
  self.skipWaiting();
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: Network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // For map tiles, use cache-first strategy
  if (event.request.url.includes('basemaps.cartocdn.com') ||
      event.request.url.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // For everything else, network first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          return cached || new Response('Mode hors-ligne. Contenu non disponible.', {
            headers: { 'Content-Type': 'text/plain' },
          });
        });
      })
  );
});
