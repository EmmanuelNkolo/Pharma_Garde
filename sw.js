/* Pharma-Garde — Service Worker v6 (réseau d'abord)
 * Les fichiers de l'application sont toujours récupérés en ligne en priorité
 * afin que chaque mise à jour soit visible immédiatement. Le cache ne sert
 * qu'en mode hors-ligne. Les anciennes versions de cache sont supprimées.
 */
const CACHE_NAME = 'pharma-garde-v21-2026-10-04';
const CORE = ['/', '/index.html', '/pharmacien.html', '/delegue.html', '/css/design-system.css', '/css/pro.css', '/js/core.js', '/icon.svg'];

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
  // API & services externes temps réel : jamais de cache
  if (url.hostname.includes('supabase.co') || url.hostname.includes('overpass') || url.hostname.includes('nominatim')) return;
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
