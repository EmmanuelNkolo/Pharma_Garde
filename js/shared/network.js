/**
 * Pharma-Garde — Module Partagé : Sécurité, Réseau, Anti-XSS, Anti-CSV-Injection & Daemon
 * Expose : window.PGNetwork
 */
(function (window) {
  'use strict';

  const CACHE_PREFIX = 'pg_net_cache_';
  let isOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
  const listeners = [];

  // ═══════════════════════════════════════════════════════════════════
  // 1. PROTECTION ANTI-XSS & SANITIZATION URL
  // ═══════════════════════════════════════════════════════════════════
  function escapeHtml(val) {
    if (val === null || val === undefined) return '';
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(val) {
    return escapeHtml(val).replace(/`/g, '&#96;');
  }

  function sanitizeUrl(url) {
    if (!url) return '';
    const trimmed = String(url).trim();
    if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) {
      return escapeAttr(trimmed);
    }
    return '';
  }

  // ═══════════════════════════════════════════════════════════════════
  // 2. PROTECTION ANTI-CSV INJECTION (CWE-1236)
  // Neutralise les formules Excel/Calc commençant par =, +, -, @, \t, \r
  // ═══════════════════════════════════════════════════════════════════
  function sanitizeCsvCell(val) {
    if (val === null || val === undefined) return '';
    let str = String(val).replace(/\r?\n/g, ' ').trim();
    if (/^[=+\-@\t\r]/.test(str)) {
      // Ne pas préfixer les nombres négatifs simples (ex: -15), uniquement les formules
      if (!/^-\d+(\.\d+)?%?$/.test(str)) {
        str = "'" + str;
      }
    }
    // Échapper les guillemets doubles et entourer de guillemets si nécessaire
    if (str.includes(';') || str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function cleanImportedCsvValue(val) {
    if (val === null || val === undefined) return '';
    let str = String(val).trim().replace(/^["']|["']$/g, '').trim();
    // Supprimer tout préfixe d'injection de formule
    while (/^[=+\-@|!]/.test(str) && !/^-\d+(\.\d+)?$/.test(str)) {
      str = str.slice(1).trim();
    }
    return str;
  }

  function parseSafeCsv(content) {
    if (!content) return { headers: [], rows: [] };
    const cleanContent = String(content).replace(/^\uFEFF/, '');
    const lines = cleanContent.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };

    const sep = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(sep).map(cleanImportedCsvValue);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(sep).map(cleanImportedCsvValue);
      if (cols.some(Boolean)) {
        rows.push(cols);
      }
    }
    return { headers, rows, separator: sep };
  }

  // ═══════════════════════════════════════════════════════════════════
  // 3. RÉSILIENCE RÉSEAU, RETRY & CACHE LOCAL
  // ═══════════════════════════════════════════════════════════════════
  async function withRetry(fn, options) {
    const opts = Object.assign({ retries: 2, delayMs: 800, factor: 1.8 }, options || {});
    let lastError = null;
    let delay = opts.delayMs;

    for (let attempt = 0; attempt <= opts.retries; attempt++) {
      try {
        return await fn(attempt);
      } catch (err) {
        lastError = err;
        if (attempt < opts.retries) {
          await new Promise(r => setTimeout(r, delay));
          delay = Math.round(delay * opts.factor);
        }
      }
    }
    throw lastError;
  }

  function saveCache(key, data, ttlMinutes) {
    try {
      const ttl = (ttlMinutes || 60) * 60 * 1000;
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
        ts: Date.now(),
        exp: Date.now() + ttl,
        data
      }));
    } catch (e) {}
  }

  function loadCache(key, allowExpired) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed) return null;
      if (!allowExpired && parsed.exp && Date.now() > parsed.exp) {
        return null;
      }
      return parsed.data;
    } catch (e) {
      return null;
    }
  }

  async function cachedQuery(cacheKey, queryFn, ttlMinutes) {
    try {
      const fresh = await withRetry(queryFn, { retries: 1, delayMs: 600 });
      if (fresh !== undefined && fresh !== null) {
        saveCache(cacheKey, fresh, ttlMinutes || 30);
      }
      return { data: fresh, fromCache: false };
    } catch (err) {
      const fallback = loadCache(cacheKey, true);
      if (fallback !== null) {
        return { data: fallback, fromCache: true, error: err };
      }
      return { data: null, fromCache: false, error: err };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 4. REQUÊTES AUTHENTIFIÉES VERS LE DAEMON CONNECTEUR LOCAL
  // ═══════════════════════════════════════════════════════════════════
  async function fetchDaemon(baseUrl, endpointPath, options) {
    const opts = options || {};
    const cleanBase = String(baseUrl || 'http://localhost:8080').replace(/\/+$/, '');
    const cleanPath = '/' + String(endpointPath || '').replace(/^\/+/, '');
    const token = opts.token || localStorage.getItem('pharmagarde_connector_token') || '';

    const headers = Object.assign({
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }, opts.headers || {});

    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
      headers['X-Connector-Token'] = token;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs || 5000);

    try {
      const res = await fetch(cleanBase + cleanPath, {
        method: opts.method || 'GET',
        headers,
        body: opts.body ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || `Erreur HTTP ${res.status}`);
      }
      return json;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 5. SURVEILLANCE CONNEXION ONLINE / OFFLINE
  // ═══════════════════════════════════════════════════════════════════
  function updateBanner() {
    let banner = document.getElementById('pg-net-banner');
    if (isOnline) {
      if (banner) banner.style.display = 'none';
      return;
    }
    if (!banner && document && document.body) {
      banner = document.createElement('div');
      banner.id = 'pg-net-banner';
      banner.style.cssText = 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:9999;background:rgba(239,68,68,0.95);color:#fff;padding:8px 16px;border-radius:999px;font-size:12px;font-weight:700;box-shadow:0 6px 20px rgba(0,0,0,0.45);display:flex;align-items:center;gap:8px;';
      banner.innerHTML = '<span>📡</span><span>Mode hors-ligne actif — Données locales affichées, synchronisation dès le retour du réseau.</span>';
      document.body.appendChild(banner);
    } else if (banner) {
      banner.style.display = 'flex';
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      isOnline = true;
      updateBanner();
      listeners.forEach(cb => { try { cb(true); } catch (e) {} });
    });
    window.addEventListener('offline', () => {
      isOnline = false;
      updateBanner();
      listeners.forEach(cb => { try { cb(false); } catch (e) {} });
    });
  }

  window.PGNetwork = {
    escapeHtml,
    escapeAttr,
    sanitizeUrl,
    sanitizeCsvCell,
    cleanImportedCsvValue,
    parseSafeCsv,
    withRetry,
    saveCache,
    loadCache,
    cachedQuery,
    fetchDaemon,
    isOnline: () => isOnline,
    onStatusChange: (cb) => { if (typeof cb === 'function') listeners.push(cb); }
  };
})(window);

