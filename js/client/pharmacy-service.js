/**
 * Pharma-Garde — Service de données Pharmacies (Espace Client) v10
 * ─────────────────────────────────────────────────────────────────
 * Centralise la récupération et la fusion des pharmacies :
 *   1. Pharmacies locales embarquées (instantané, 0 ms)
 *   2. Officines inscrites sur Supabase (cache mémoire 60 s + secours hors-ligne)
 *   3. Pharmacies OpenStreetMap (Overpass : nœuds + bâtiments, cache 24 h par zone)
 * Déduplication en O(n) par nom normalisé + proximité, calcul de distance.
 *
 * Expose : window.PGPharmacyService
 */
(function () {
  'use strict';

  const REG_TTL = 60 * 1000;
  const OSM_TTL = 24 * 3600 * 1000;
  const OVERPASS_MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  let regCache = { ts: 0, data: null, pending: null };
  const osmMemo = new Map();

  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\bpharmacie\b|\bpharmacy\b|\bde la\b|\bdu\b|\bdes\b|\bde\b/g, '').replace(/[^a-z0-9]/g, '');

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371, toR = Math.PI / 180;
    const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async function fetchJson(url, timeoutMs) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs || 9000) : null;
    try {
      const r = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { if (t) clearTimeout(t); }
  }

  function getLocal() {
    return (typeof LOCAL_PHARMACIES !== 'undefined' && Array.isArray(LOCAL_PHARMACIES)) ? LOCAL_PHARMACIES : [];
  }

  // ── Officines inscrites (Supabase) ──────────────────────────
  function mapRegistered(p) {
    return {
      id: p.id,
      name: p.name,
      address: p.address,
      phone: p.phone,
      whatsapp: p.whatsapp,
      lat: Number(p.lat),
      lng: Number(p.lng),
      isOpen: p.is_open !== false,
      isOnDuty: !!p.is_on_duty,
      hours: p.opening_hours || '08h00 - 20h00',
      isRegistered: true
    };
  }

  async function getRegistered(force) {
    if (!window.supabase || !window.supabase.from) return [];
    if (!force && regCache.data && Date.now() - regCache.ts < REG_TTL) return regCache.data;
    if (regCache.pending) return regCache.pending;
    regCache.pending = (async () => {
      try {
        const { data, error } = await window.supabase.from('pharmacies').select('*');
        if (error) throw error;
        const list = (data || []).filter((p) => p && p.name && p.lat && p.lng).map(mapRegistered);
        regCache = { ts: Date.now(), data: list, pending: null };
        try { localStorage.setItem('pg_reg_pharmacies', JSON.stringify(list)); } catch (e) { /* quota */ }
        return list;
      } catch (err) {
        console.warn('[PGPharmacyService] Supabase indisponible, cache hors-ligne utilisé :', err && err.message);
        regCache.pending = null;
        try { return JSON.parse(localStorage.getItem('pg_reg_pharmacies') || '[]'); } catch (e) { return []; }
      }
    })();
    return regCache.pending;
  }

  /** Invalidation (ex. : changement de statut de garde reçu en temps réel). */
  function invalidate() { regCache.ts = 0; }

  // ── Pharmacies OpenStreetMap ────────────────────────────────
  function osmAddress(t) {
    const parts = [t['addr:street'] || t['addr:place'], t['addr:suburb'] || t['addr:neighbourhood'] || t['addr:quarter'], t['addr:city']]
      .filter(Boolean);
    return parts.length ? parts.join(', ') : (t.address || t.description || '');
  }

  async function getOSM(pos) {
    const key = Number(pos.lat).toFixed(2) + '_' + Number(pos.lng).toFixed(2);
    const now = Date.now();
    const m = osmMemo.get(key);
    if (m && now - m.ts < OSM_TTL) return m.data;
    try {
      const raw = localStorage.getItem('pg_osm_' + key);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && now - o.ts < OSM_TTL) { osmMemo.set(key, o); return o.data; }
      }
    } catch (e) { /* ignore */ }

    const q = '[out:json][timeout:20];(node["amenity"="pharmacy"](around:21000,' + pos.lat + ',' + pos.lng + ');' +
      'way["amenity"="pharmacy"](around:21000,' + pos.lat + ',' + pos.lng + '););out center tags 600;';
    for (const base of OVERPASS_MIRRORS) {
      try {
        const d = await fetchJson(base + '?data=' + encodeURIComponent(q), 10000);
        const list = (d.elements || []).filter((el) => el.tags).map((el) => {
          const t = el.tags;
          return {
            id: 'osm_' + el.id,
            name: t.name || t['name:fr'] || 'Pharmacie',
            address: osmAddress(t) || 'Adresse non renseignée',
            phone: t.phone || t['contact:phone'] || '',
            whatsapp: t.whatsapp || t['contact:whatsapp'] || '',
            lat: el.lat != null ? el.lat : (el.center && el.center.lat),
            lng: el.lon != null ? el.lon : (el.center && el.center.lon),
            isOpen: true,
            isOnDuty: false,
            hours: t.opening_hours || '08h00 - 20h00',
            isRegistered: false,
            source: 'osm'
          };
        }).filter((p) => p.lat && p.lng);
        const entry = { ts: now, data: list };
        osmMemo.set(key, entry);
        try { localStorage.setItem('pg_osm_' + key, JSON.stringify(entry)); } catch (e) { /* quota */ }
        return list;
      } catch (e) { /* miroir suivant */ }
    }
    return m ? m.data : [];
  }

  // ── Fusion + distances ──────────────────────────────────────
  function merge(lists) {
    const out = [];
    const byName = new Map();
    for (const list of lists) {
      for (const p of list || []) {
        if (!p || !isFinite(p.lat) || !isFinite(p.lng)) continue;
        const k = norm(p.name);
        const prev = k ? byName.get(k) : null;
        if (prev && prev.some((q) => Math.abs(q.lat - p.lat) < 0.01 && Math.abs(q.lng - p.lng) < 0.01)) continue;
        out.push(p);
        if (k) { if (prev) prev.push(p); else byName.set(k, [p]); }
      }
    }
    return out;
  }

  function withDistance(list, pos) {
    return list.map((p) => Object.assign({}, p, { distance: parseFloat(haversine(pos.lat, pos.lng, p.lat, p.lng).toFixed(1)) }));
  }

  /**
   * Rendu progressif : `onPartial` reçoit immédiatement les données disponibles
   * (locales + caches), puis la promesse retourne la liste complète.
   */
  async function load(pos, onPartial) {
    const local = getLocal();
    const regCached = regCache.data || (() => { try { return JSON.parse(localStorage.getItem('pg_reg_pharmacies') || '[]'); } catch (e) { return []; } })();
    const osmKey = Number(pos.lat).toFixed(2) + '_' + Number(pos.lng).toFixed(2);
    const osmCached = (osmMemo.get(osmKey) || {}).data || [];
    if (onPartial) onPartial(withDistance(merge([regCached, local, osmCached]), pos));
    const [reg, osm] = await Promise.all([getRegistered(), getOSM(pos)]);
    // Les officines inscrites sont prioritaires (statut de garde réel)
    return withDistance(merge([reg, local, osm]), pos);
  }

  window.PGPharmacyService = { load, getRegistered, getOSM, merge, withDistance, invalidate, haversine };
})();

