/**
 * Pharma-Garde — Core v6
 * Utilitaires partagés par les 3 espaces : sécurité (échappement, codes
 * cryptographiques), géolocalisation haute précision, accès base de données
 * tolérant aux migrations, tableaux, exports, notifications, PWA.
 */
(function () {
  'use strict';

  const sb = () => window.supabase;

  // ── Sécurité & formats ────────────────────────────────────────
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  /** Code lisible généré par CSPRNG (pas de 0/O/1/I). */
  function code(prefix, len) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const arr = new Uint32Array(len || 6);
    (window.crypto || window.msCrypto).getRandomValues(arr);
    let out = '';
    arr.forEach(n => { out += chars[n % chars.length]; });
    return (prefix || '') + out;
  }
  function normalize(name) {
    return String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\bpharmacie\b|\bpharmacy\b|\bdu\b|\bde\b|\bla\b|\ble\b|\bdes\b|\bd'/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function cleanText(v, max) { return String(v || '').replace(/[<>]/g, '').trim().slice(0, max || 500); }
  function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim()); }
  function phoneDigits(p) {
    let d = String(p || '').replace(/\D/g, '');
    if (d.length === 9 && /^[26]/.test(d)) d = '237' + d;
    return d;
  }
  function telLink(p) { const d = phoneDigits(p); return d ? 'tel:+' + d : null; }
  function waLink(p, text) {
    const d = phoneDigits(p); if (!d) return null;
    return 'https://wa.me/' + d + (text ? '?text=' + encodeURIComponent(text) : '');
  }
  function haversine(lat1, lon1, lat2, lon2) {
    if ([lat1, lon1, lat2, lon2].some(v => v === null || v === undefined || isNaN(v))) return Infinity;
    const R = 6371, toR = Math.PI / 180;
    const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  const locale = () => ((window.I18n && I18n.getLang && I18n.getLang()) === 'en' ? 'en-GB' : 'fr-FR');
  function fmtDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString(locale(), { day: '2-digit', month: 'short', year: 'numeric' }); }
  function fmtTime(d) { if (!d) return '—'; return new Date(d).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }); }
  function fmtDateTime(d) { if (!d) return '—'; return fmtDate(d) + ' · ' + fmtTime(d); }
  function timeAgo(d) {
    const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (m < 1) return "à l'instant";
    if (m < 60) return 'il y a ' + m + ' min';
    const h = Math.floor(m / 60);
    if (h < 24) return 'il y a ' + h + ' h';
    return 'il y a ' + Math.floor(h / 24) + ' j';
  }
  /** Début de période : day | week | month | year | all */
  function periodStart(period) {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    if (period === 'day') return d;
    if (period === 'week') { const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d; }
    if (period === 'month') { d.setDate(1); return d; }
    if (period === 'year') { d.setMonth(0, 1); return d; }
    return new Date(2000, 0, 1);
  }
  const PERIOD_LABELS = { day: "Aujourd'hui", week: 'Cette semaine', month: 'Ce mois', year: 'Cette année', all: 'Tout' };
  function tr(key, fallback) {
    if (window.I18n && I18n.t) { const v = I18n.t(key); if (v && v !== key) return v; }
    return fallback !== undefined ? fallback : key;
  }

  // ── Notifications ─────────────────────────────────────────────
  function toast(message, type) {
    let stack = document.getElementById('pg-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'pg-toast-stack'; stack.className = 'pg-toast-stack';
      stack.setAttribute('role', 'status'); stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = 'pg-toast pg-toast--' + (type || 'success');
    el.textContent = message;
    stack.appendChild(el);
    while (stack.children.length > 3) stack.removeChild(stack.firstChild);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 320); }, 3800);
  }
  let audioCtx = null;
  function sound() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime;
      [[880, 0], [1100, 0.18], [1320, 0.36]].forEach(([f, s]) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination); o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.5, t + s); g.gain.exponentialRampToValueAtTime(0.01, t + s + 0.16);
        o.start(t + s); o.stop(t + s + 0.17);
      });
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    } catch (e) { /* audio indisponible */ }
  }

  // ── Géolocalisation haute précision ───────────────────────────
  /**
   * Affine la position via watchPosition jusqu'à atteindre la précision
   * souhaitée (mètres) ou expiration ; retourne la meilleure mesure.
   */
  function locate(opts) {
    const o = Object.assign({ desired: 25, maxWait: 25000, onProgress: null }, opts || {});
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Géolocalisation non supportée par cet appareil.'));
      if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        console.warn('Géolocalisation demandée sur contexte non sécurisé (https recommandé).');
      }
      let best = null, done = false, wid = null;
      const finish = (err) => {
        if (done) return; done = true;
        if (wid !== null) navigator.geolocation.clearWatch(wid);
        clearTimeout(timer);
        if (best) resolve(best); else reject(err || new Error('Position introuvable. Activez le GPS et réessayez.'));
      };
      const timer = setTimeout(() => finish(new Error('Délai dépassé : activez le GPS (mode haute précision) puis réessayez.')), o.maxWait);
      wid = navigator.geolocation.watchPosition((p) => {
        const c = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy || 9999), ts: Date.now() };
        if (!best || c.accuracy < best.accuracy) { best = c; if (o.onProgress) o.onProgress(best); }
        if (best.accuracy <= o.desired) finish();
      }, (err) => {
        if (err.code === 1) { done = true; clearTimeout(timer); if (wid !== null) navigator.geolocation.clearWatch(wid); reject(new Error('Autorisation de localisation refusée. Autorisez-la dans les réglages du navigateur.')); }
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: o.maxWait });
    });
  }
  async function reverse(lat, lng) {
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=fr&lat=' + lat + '&lon=' + lng);
      const d = await r.json(); const a = d.address || {};
      return {
        city: a.city || a.town || a.village || a.municipality || a.county || a.state || '',
        quarter: a.suburb || a.neighbourhood || a.quarter || a.city_district || '',
        road: a.road || '', display: d.display_name || ''
      };
    } catch (e) { return { city: '', quarter: '', road: '', display: '' }; }
  }
  async function searchPlace(q) {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=fr&countrycodes=cm&q=' + encodeURIComponent(q);
    let r = await fetch(url); let d = await r.json();
    if (!d || !d.length) { r = await fetch(url.replace('&countrycodes=cm', '')); d = await r.json(); }
    return (d || []).map(x => ({ lat: parseFloat(x.lat), lng: parseFloat(x.lon), label: x.display_name }));
  }

  // ── Base de données tolérante (fonctionne avant/après migration v6) ──
  async function dbWrite(kind, table, payload, match, opts) {
    const o = opts || {};
    let data = Array.isArray(payload) ? payload.map(p => Object.assign({}, p)) : Object.assign({}, payload);
    const rows = () => (Array.isArray(data) ? data : [data]);
    let checkFallbackUsed = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      let q;
      if (kind === 'insert') q = sb().from(table).insert(Array.isArray(data) ? data : [data]);
      else { q = sb().from(table).update(data); Object.entries(match || {}).forEach(([k, v]) => { q = q.eq(k, v); }); }
      if (o.select) q = q.select(o.select === true ? '*' : o.select);
      const res = await q;
      if (!res.error) return res;
      const e = res.error; const msg = (e.message || '') + ' ' + (e.details || '');
      const col = (msg.match(/'([^']+)' column/) || msg.match(/column "?([a-z_]+)"? (?:of relation "?\w+"? )?does not exist/i) || [])[1];
      if (col && (e.code === 'PGRST204' || e.code === '42703' || /column/i.test(msg))) {
        let removed = false;
        rows().forEach(r => { if (col in r) { delete r[col]; removed = true; } });
        if (removed) continue;
      }
      if (e.code === '23514' && o.onCheckFail && !checkFallbackUsed) {
        checkFallbackUsed = true;
        if (Array.isArray(data)) data = data.map(o.onCheckFail); else data = o.onCheckFail(data);
        continue;
      }
      return res;
    }
    return { error: { message: 'Écriture impossible après plusieurs tentatives.' } };
  }
  const db = {
    insert: (table, payload, opts) => dbWrite('insert', table, payload, null, opts),
    update: (table, values, match, opts) => dbWrite('update', table, values, match, opts),
  };

  // ── Statuts métier ────────────────────────────────────────────
  const PROMO_STATUS = {
    sent: { label: 'En attente', cls: 'chip--gray', group: 'pending' },
    read: { label: 'Reçu · en attente', cls: 'chip--blue', group: 'pending' },
    interested: { label: 'Reçu & intéressé', cls: 'chip--green', group: 'positive' },
    ordered: { label: 'Acheté / Commandé', cls: 'chip--gold', group: 'positive' },
    already_stocked: { label: 'Reçu · déjà en stock', cls: 'chip--purple', group: 'negative' },
    not_interested: { label: 'Reçu & non intéressé', cls: 'chip--red', group: 'negative' },
    ignored: { label: 'Reçu & non intéressé', cls: 'chip--red', group: 'negative' },
  };
  const VISIT_STATUS = {
    requested: { label: 'Sollicitée par la pharmacie', cls: 'chip--gold' },
    pending: { label: 'En attente de confirmation', cls: 'chip--blue' },
    confirmed: { label: 'Confirmée', cls: 'chip--green' },
    rescheduled: { label: 'Nouvelle date proposée', cls: 'chip--purple' },
    cancelled: { label: 'Rejetée', cls: 'chip--red' },
    completed: { label: 'Effectuée', cls: 'chip--gray' },
  };
  const OBJECT_LABELS = { promotion: 'Promotion', livraison: 'Livraison', presentation: 'Présentation produit', reapprovisionnement: 'Réapprovisionnement', formation: 'Formation équipe', autre: 'Autre' };
  function chip(map, status) { const s = map[status] || { label: status || '—', cls: 'chip--gray' }; return '<span class="chip ' + s.cls + '">' + esc(s.label) + '</span>'; }

  // ── Tableaux & exports ────────────────────────────────────────
  /** cols: [{key,label,render?}] ; rows: objets ou {__section:'Titre', cls:'is-red'} */
  function table(cols, rows, emptyText) {
    if (!rows || !rows.length) return '<div class="pg-empty"><div class="pg-empty__icon">📭</div>' + esc(emptyText || 'Aucune donnée pour cette période.') + '</div>';
    let h = '<div class="pg-table-wrap"><table class="pg-table"><thead><tr>';
    cols.forEach(c => { h += '<th>' + esc(c.label) + '</th>'; });
    h += '</tr></thead><tbody>';
    rows.forEach(r => {
      if (r.__section) { h += '<tr class="pg-row-section ' + (r.cls || '') + '"><td colspan="' + cols.length + '">' + esc(r.__section) + '</td></tr>'; return; }
      h += '<tr>';
      cols.forEach(c => { h += '<td>' + (c.render ? c.render(r) : esc(r[c.key])) + '</td>'; });
      h += '</tr>';
    });
    return h + '</tbody></table></div>';
  }
  function exportCSV(filename, headers, rows) {
    const escCsv = v => '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
    const csv = '\ufeff' + [headers.map(escCsv).join(';')].concat(rows.map(r => r.map(escCsv).join(';'))).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  async function exportPDF(html, filename) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff;color:#111;';
    wrap.innerHTML = html; document.body.appendChild(wrap);
    try {
      if (window.html2pdf) {
        await window.html2pdf().set({ margin: 10, filename, html2canvas: { scale: 2, backgroundColor: '#ffffff' }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'] } }).from(wrap.firstElementChild || wrap).save();
      } else {
        const w = window.open('', '_blank'); w.document.write(html); w.document.close(); w.print();
      }
    } finally { wrap.remove(); }
  }
  function reportShell(title, subtitle, bodyHtml) {
    return '<div style="font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111;font-size:12px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #059669;padding-bottom:10px;margin-bottom:16px;">' +
      '<div><div style="font-size:22px;font-weight:900;color:#059669;">✚ Pharma-Garde</div><div style="font-size:11px;color:#b8860b;font-weight:700;text-transform:uppercase;letter-spacing:1px;">' + esc(subtitle) + '</div></div>' +
      '<div style="text-align:right;font-size:11px;color:#555;">Édité le ' + fmtDateTime(new Date()) + '</div></div>' +
      '<h1 style="font-size:18px;margin:0 0 12px;">' + esc(title) + '</h1>' + bodyHtml +
      '<div style="margin-top:28px;font-size:10px;color:#888;border-top:1px solid #ddd;padding-top:8px;">Document confidentiel — généré par Pharma-Garde. Données protégées.</div></div>';
  }
  function reportTable(headers, rows) {
    let h = '<table style="width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:11px;"><thead><tr>';
    headers.forEach(x => { h += '<th style="background:#ecfdf5;color:#065f46;text-align:left;padding:6px;border:1px solid #d1fae5;">' + esc(x) + '</th>'; });
    h += '</tr></thead><tbody>';
    if (!rows.length) h += '<tr><td colspan="' + headers.length + '" style="padding:8px;border:1px solid #eee;color:#888;">Aucune donnée</td></tr>';
    rows.forEach(r => { h += '<tr>' + r.map(c => '<td style="padding:6px;border:1px solid #eee;vertical-align:top;">' + esc(c) + '</td>').join('') + '</tr>'; });
    return h + '</tbody></table>';
  }

  // ── UI helpers ────────────────────────────────────────────────
  function openModal(id) { const m = document.getElementById(id); if (m) { m.classList.add('active'); m.style.display = ''; } }
  function closeModal(id) { const m = document.getElementById(id); if (m) m.classList.remove('active'); }
  function bindModalClose() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-close]');
      if (btn) { const m = btn.closest('.modal-overlay'); if (m) m.classList.remove('active'); return; }
      if (e.target.classList && e.target.classList.contains('modal-overlay') && !e.target.hasAttribute('data-static')) e.target.classList.remove('active');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.active').forEach(m => { if (!m.hasAttribute('data-static')) m.classList.remove('active'); });
    });
  }
  /** Retour visuel : tout bouton cliqué passe au vert ; les groupes gardent l'état actif. */
  function bindPressFeedback() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('.pg-btn, .btn--primary, .btn--secondary, .pg-tool');
      if (!b || b.disabled) return;
      const group = b.closest('[data-group]');
      if (group) {
        group.querySelectorAll('.pg-btn, .pg-seg__item').forEach(x => x.classList.remove('is-active'));
        b.classList.add('is-active');
      } else {
        b.classList.add('is-pressed');
        clearTimeout(b._pgT); b._pgT = setTimeout(() => b.classList.remove('is-pressed'), 700);
      }
    }, true);
  }
  function syncHeaderHeight() {
    const h = document.querySelector('.pg-header');
    if (!h) return;
    const apply = () => document.documentElement.style.setProperty('--pg-header-h', h.offsetHeight + 'px');
    apply();
    if (window.ResizeObserver) new ResizeObserver(apply).observe(h);
    window.addEventListener('resize', apply);
  }
  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn._pgHtml = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> ' + esc(label || 'Patientez...'); }
    else { btn.disabled = false; if (btn._pgHtml) btn.innerHTML = btn._pgHtml; }
  }
  function panelToggle(panelId, handleId) {
    const p = document.getElementById(panelId), h = document.getElementById(handleId);
    if (!p || !h) return;
    h.addEventListener('click', () => {
      if (p.classList.contains('is-collapsed')) { p.classList.remove('is-collapsed'); }
      else if (!p.classList.contains('is-full')) { p.classList.add('is-full'); }
      else { p.classList.remove('is-full'); p.classList.add('is-collapsed'); }
    });
  }
  function toggleFullscreen() {
    if (!document.fullscreenElement) { (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen || function () {}).call(document.documentElement); }
    else { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
  }
  /** Anti double-clic / anti-spam */
  const lastHit = {};
  function throttle(key, ms) { const now = Date.now(); if (lastHit[key] && now - lastHit[key] < ms) return false; lastHit[key] = now; return true; }

  // ── Carte (Leaflet) ───────────────────────────────────────────
  function baseMap(containerId, center, zoom) {
    const map = L.map(containerId, { zoomControl: false, attributionControl: true, preferCanvas: true }).setView([center.lat, center.lng], zoom || 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    return map;
  }
  function meIcon() { return L.divIcon({ className: '', html: '<div class="pg-me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }); }
  function pharmacyIcon(status, partner) {
    const cls = status === 'guard' ? 'pg-marker--guard' : status === 'open' ? 'pg-marker--open' : 'pg-marker--closed';
    const emoji = status === 'guard' ? '🌙' : '✚';
    return L.divIcon({ className: '', html: '<div class="pg-marker ' + cls + (partner ? ' pg-marker--partner' : '') + '"><span>' + emoji + '</span></div>', iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28] });
  }
  function radiusZoom(km) { return km <= 2 ? 15 : km <= 5 ? 13 : km <= 10 ? 12 : km <= 15 ? 11 : 11; }

  // ── PWA : service worker réseau-d'abord (évite les anciennes versions en cache) ──
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then(reg => { if (reg && reg.update) reg.update(); }).catch(() => {});
    });
  }

  window.PG = {
    esc, code, normalize, cleanText, isEmail, phoneDigits, telLink, waLink, haversine,
    fmtDate, fmtTime, fmtDateTime, timeAgo, periodStart, PERIOD_LABELS, tr,
    toast, sound, locate, reverse, searchPlace, db,
    PROMO_STATUS, VISIT_STATUS, OBJECT_LABELS, chip, table, exportCSV, exportPDF, reportShell, reportTable,
    openModal, closeModal, busy, panelToggle, toggleFullscreen, throttle, syncHeaderHeight,
    baseMap, meIcon, pharmacyIcon, radiusZoom,
  };

  document.addEventListener('DOMContentLoaded', () => {
    bindModalClose(); bindPressFeedback(); syncHeaderHeight();
  });
  registerSW();
})();
