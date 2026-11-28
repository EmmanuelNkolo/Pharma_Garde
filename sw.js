/* Pharma-Garde — Service Worker v6 (réseau d'abord)
 * Les fichiers de l'application sont toujours récupérés en ligne en priorité
 * afin que chaque mise à jour soit visible immédiatement. Le cache ne sert
 * qu'en mode hors-ligne. Les anciennes versions de cache sont supprimées.
 */
const CACHE_NAME = 'pharma-garde-v17.0';
const CORE = [
  '/',
  '/index.html',
  '/pharmacien.html',
  '/delegue.html',
  '/grossiste.html',
  '/medecin.html',
  '/etablissement.html',
  '/manifest.json',
  '/css/design-system.css',
  '/css/pro.css',
  '/css/grossiste.css',
  '/css/admin-portal.css',
  '/css/wellness-v12.css',
  '/css/pro-polish-v15.css',
  '/js/core/core.js',
  '/js/core/i18n.js',
  '/js/core/geolocation.js',
  '/js/shared/subscription.js',
  '/js/shared/push-notifications.js',
  '/js/client/location-intel.js',
  '/js/client/pharmacy-service.js',
  '/js/client/patient-pro.js',
  '/js/client/patient-dmp-ui.js',
  '/js/client/patient-care.js',
  '/js/shared/patient-dmp.js',
  '/js/medecin/store.js',
  '/js/medecin/app.js',
  '/js/etablissement/store.js',
  '/js/etablissement/lab-results-module.js',
  '/js/etablissement/app.js',
  '/js/pharmacie/pharmacy-pro.js',
  '/js/delegue/delegate-pro.js',
  '/js/grossiste/wholesaler-pro.js',
  '/js/shared/admin-portal.js',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // API & services externes temps réel : jamais de cache SW
  if (url.hostname.includes('supabase.co') || url.hostname.includes('overpass') || url.hostname.includes('nominatim') || url.hostname.includes('project-osrm.org')) return;
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('/index.html')))
  );
});

// v17.0 — Réception Web Push & Ouverture / Focus direct de l'application
self.addEventListener('push', (event) => {
  let data = { title: 'Pharma-Garde Cameroun', body: 'Nouvelle notification temps réel.', url: '/index.html' };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = Object.assign(data, parsed || {});
    }
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/icon-192.png',
      tag: data.tag || 'pg_push',
      vibrate: [180, 80, 180],
      data: { url: data.url || '/index.html' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification && event.notification.data && event.notification.data.url) || '/index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url && client.url.includes(targetUrl.replace(/^\//, '')) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clientsList.length > 0 && 'focus' in clientsList[0]) {
        return clientsList[0].focus();
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
