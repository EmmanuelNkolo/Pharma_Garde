/**
 * Pharma-Garde — Intelligence de localisation (Espace Client) v10
 * ─────────────────────────────────────────────────────────────────
 * • Géocodage inverse détaillé (quartier, zone, arrondissement, ville, région)
 *   avec cache mémoire + localStorage (7 jours) et délai maximal de 6 s.
 * • Couche cartographique « Quartiers & Zones » : noms des quartiers,
 *   zones et localités affichés en surimpression lisible sur la carte
 *   (données OpenStreetMap via Overpass, cache 3 jours, miroirs de secours).
 * • Étiquette permanente « Vous êtes ici » sur le marqueur utilisateur.
 *
 * Expose : window.PGLocation
 */
(function () {
  'use strict';

  const REV_TTL = 7 * 24 * 3600 * 1000;
  const AREA_TTL = 3 * 24 * 3600 * 1000;
  const OVERPASS_MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];
  const memo = new Map();

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function cacheGet(key, ttl) {
    if (memo.has(key)) return memo.get(key);
    try {
      const raw = localStorage.getItem('pg_loc_' + key);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || Date.now() - o.ts > ttl) return null;
      memo.set(key, o.data);
      return o.data;
    } catch (e) { return null; }
  }
  function cacheSet(key, data) {
    memo.set(key, data);
    try { localStorage.setItem('pg_loc_' + key, JSON.stringify({ ts: Date.now(), data })); } catch (e) { /* quota */ }
  }

  async function fetchJson(url, opts, timeoutMs) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs || 6000) : null;
    try {
      const r = await fetch(url, Object.assign({}, opts || {}, ctrl ? { signal: ctrl.signal } : {}));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { if (t) clearTimeout(t); }
  }

  // ── 1. Géocodage inverse détaillé ─────────────────────────────
  async function reverse(lat, lng) {
    const key = 'rev_' + Number(lat).toFixed(4) + '_' + Number(lng).toFixed(4);
    const hit = cacheGet(key, REV_TTL);
    if (hit) return hit;
    try {
      const lang = (window.I18n && I18n.getLang && I18n.getLang() === 'en') ? 'en' : 'fr';
      const d = await fetchJson('https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=' + lang + '&lat=' + lat + '&lon=' + lng, null, 6000);
      const a = d.address || {};
      const info = {
        quarter: a.neighbourhood || a.quarter || a.suburb || a.hamlet || a.residential || '',
        zone: a.suburb && a.suburb !== (a.neighbourhood || a.quarter) ? a.suburb : (a.city_district || ''),
        district: a.city_district || a.municipality || a.county || '',
        city: a.city || a.town || a.village || a.municipality || '',
        region: a.state || a.region || '',
        road: a.road || a.pedestrian || '',
        display: d.display_name || ''
      };
      info.short = [info.quarter, info.district && info.district !== info.quarter ? info.district : '', !info.district ? info.city : '']
        .filter(Boolean).join(' · ') || info.city || '';
      info.full = [info.quarter, info.zone !== info.quarter ? info.zone : '', info.district, info.city, info.region]
        .filter((v, i, arr) => v && arr.indexOf(v) === i).join(', ');
      cacheSet(key, info);
      return info;
    } catch (e) {
      return { quarter: '', zone: '', district: '', city: '', region: '', road: '', display: '', short: '', full: '' };
    }
  }

  // ── 2. Couche « Quartiers & Zones » ───────────────────────────
  let areaLayer = null;
  let areaMap = null;
  let areaData = [];
  let areaReq = 0;

  const PLACE_RANK = { city: 0, town: 1, suburb: 2, quarter: 3, village: 3, neighbourhood: 4, hamlet: 5, locality: 5 };

  async function fetchAreas(lat, lng, radiusKm) {
    const r = Math.min(Math.max(radiusKm || 5, 2), 20);
    const key = 'areas_' + Number(lat).toFixed(2) + '_' + Number(lng).toFixed(2) + '_' + Math.ceil(r / 5) * 5;
    const hit = cacheGet(key, AREA_TTL);
    if (hit) return hit;
    const q = '[out:json][timeout:15];(node["place"~"^(city|town|suburb|quarter|neighbourhood|village|hamlet|locality)$"]["name"](around:' +
      Math.round((Math.ceil(r / 5) * 5) * 1000 + 1500) + ',' + lat + ',' + lng + '););out body 400;';
    let lastErr = null;
    for (const base of OVERPASS_MIRRORS) {
      try {
        const d = await fetchJson(base + '?data=' + encodeURIComponent(q), null, 9000);
        const list = (d.elements || []).filter((e) => e.tags && e.tags.name).map((e) => ({
          name: e.tags['name:fr'] || e.tags.name,
          place: e.tags.place,
          lat: e.lat,
          lng: e.lon
        }));
        cacheSet(key, list);
        return list;
      } catch (e) { lastErr = e; }
    }
    console.warn('[PGLocation] Quartiers indisponibles :', lastErr && lastErr.message);
    return [];
  }

  function minZoomFor(place) {
    if (place === 'city' || place === 'town') return 9;
    if (place === 'suburb' || place === 'village') return 12;
    if (place === 'quarter') return 13;
    return 14; // neighbourhood, hamlet, locality
  }

  function renderAreas() {
    if (!areaMap || !areaLayer) return;
    areaLayer.clearLayers();
    const z = areaMap.getZoom();
    const bounds = areaMap.getBounds().pad(0.1);
    const placed = [];
    const sorted = areaData.slice().sort((a, b) => (PLACE_RANK[a.place] || 9) - (PLACE_RANK[b.place] || 9));
    for (const p of sorted) {
      if (z < minZoomFor(p.place) || !bounds.contains([p.lat, p.lng])) continue;
      // Anti-chevauchement : distance écran minimale entre deux étiquettes
      const pt = areaMap.latLngToContainerPoint([p.lat, p.lng]);
      if (placed.some((q) => Math.abs(q.x - pt.x) < 90 && Math.abs(q.y - pt.y) < 22)) continue;
      placed.push(pt);
      const cls = (p.place === 'city' || p.place === 'town') ? 'pg-area-label--city'
        : (p.place === 'suburb' || p.place === 'quarter' || p.place === 'village') ? 'pg-area-label--zone' : 'pg-area-label--quarter';
      L.marker([p.lat, p.lng], {
        interactive: false,
        keyboard: false,
        zIndexOffset: -500,
        icon: L.divIcon({ className: 'pg-area-label ' + cls, html: '<span>' + esc(p.name) + '</span>', iconSize: null })
      }).addTo(areaLayer);
      if (placed.length > 60) break;
    }
  }

  async function showAreaLabels(map, center, radiusKm) {
    if (!map || typeof L === 'undefined' || !center) return;
    if (areaMap !== map) {
      areaMap = map;
      areaLayer = L.layerGroup().addTo(map);
      let raf = null;
      map.on('zoomend moveend', () => { if (raf) cancelAnimationFrame(raf); raf = requestAnimationFrame(renderAreas); });
    }
    const id = ++areaReq;
    const list = await fetchAreas(center.lat, center.lng, radiusKm);
    if (id !== areaReq) return; // une requête plus récente a pris le relais
    areaData = list;
    renderAreas();
  }

  // ── 3. Étiquette « Vous êtes ici » ────────────────────────────
  function labelUserMarker(marker, info, accuracy) {
    if (!marker || !marker.bindTooltip) return;
    const name = (info && (info.quarter || info.zone || info.district || info.city)) || '';
    const sub = info ? [info.district !== name ? info.district : '', info.city !== name ? info.city : ''].filter(Boolean).join(', ') : '';
    const acc = accuracy ? ' <em>±' + Math.round(accuracy) + ' m</em>' : '';
    const html = '<div class="pg-here"><strong>📍 ' + (name ? esc(name) : 'Vous êtes ici') + '</strong>' +
      (sub ? '<small>' + esc(sub) + acc + '</small>' : (acc ? '<small>' + acc + '</small>' : '')) + '</div>';
    marker.unbindTooltip();
    marker.bindTooltip(html, { permanent: true, direction: 'top', offset: [0, -14], className: 'pg-here-tip', opacity: 1 });
  }

  window.PGLocation = { reverse, showAreaLabels, labelUserMarker, fetchAreas };
})();

