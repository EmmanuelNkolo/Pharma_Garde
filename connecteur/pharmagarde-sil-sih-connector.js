/**
 * Pharma-Garde v13.0 — Daemon Connecteur Universel SIL / SIH (Laboratoires, Hôpitaux & Cliniques)
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * Programme local léger (zéro dépendance externe) à exécuter sur le serveur du laboratoire,
 * de l'hôpital ou de la clinique :
 *   • Compatible OpenLIS, SENAITE / Bika LIMS, OpenMRS, OpenClinic GA, GNU Health, GLIMS, SilLab
 *   • Supporte JSON, CSV, HL7 v2 (ORU^R01) et FHIR R4 (DiagnosticReport)
 *   • Surveille automatiquement le dossier d'export `./exports_analyses/` (toutes les 15s)
 *   • Pousse instantanément chaque résultat validé vers Pharma-Garde (Webhook Cloud sécurisé)
 *     → Dépose le résultat horodaté dans le Carnet Médical Numérique (DMP) du patient
 *     → Signale automatiquement au patient que ses résultats sont disponibles !
 *   • Expose une API locale sur http://0.0.0.0:8090 (/health, /api/results, /api/sync-now)
 *
 * Lancement : node pharmagarde-sil-sih-connector.js
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8090);
const CONFIG_FILE = path.join(__dirname, 'sil-sih-config.json');
const WATCH_DIR = path.join(__dirname, 'exports_analyses');
const SENT_LOG = path.join(__dirname, 'sent_results_index.json');

let config = {
  facility_id: 'fac_cpc_dla',
  facility_name: 'Laboratoire / Hôpital Connecté',
  facility_type: 'laboratory', // laboratory | hospital | clinic | imaging
  software_vendor: 'openlis',  // openlis | senaite | openmrs | openclinic | glims | hl7_fhir | csv_watch
  webhook_url: 'https://kcbcvdinuhckrpotngbw.supabase.co/functions/v1/lab-results-webhook',
  api_key: process.env.PG_FACILITY_API_KEY || '',
  poll_interval_ms: 15000,
  local_token: ''
};

let sentHashes = new Set();
let recentResults = [];
let lastSyncAt = new Date().toISOString();

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      config = Object.assign(config, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')));
      console.log(`[SIL/SIH] Configuration chargée (${config.software_vendor.toUpperCase()} — ${config.facility_name})`);
    } catch (e) {
      console.warn('[SIL/SIH] Erreur lecture sil-sih-config.json:', e.message);
    }
  }
  if (fs.existsSync(SENT_LOG)) {
    try {
      const arr = JSON.parse(fs.readFileSync(SENT_LOG, 'utf8'));
      if (Array.isArray(arr)) sentHashes = new Set(arr);
    } catch (e) {}
  }
  if (!fs.existsSync(WATCH_DIR)) {
    try { fs.mkdirSync(WATCH_DIR, { recursive: true }); } catch (e) {}
  }
}

function saveSentHashes() {
  try {
    fs.writeFileSync(SENT_LOG, JSON.stringify(Array.from(sentHashes).slice(-2000), null, 2));
  } catch (e) {}
}

function sha256(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

function postToPharmaGarde(payload, contentType) {
  return new Promise((resolve) => {
    if (!config.webhook_url || !config.api_key) {
      resolve({ ok: false, skipped: true, reason: 'Clé API cloud non renseignée (mode local uniquement)' });
      return;
    }
    try {
      const urlObj = new URL(config.webhook_url);
      const bodyStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const lib = urlObj.protocol === 'https:' ? https : http;
      const req = lib.request({
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': contentType || 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          'X-Facility-Key': config.api_key
        },
        timeout: 8000
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: data }));
      });
      req.on('error', (err) => resolve({ ok: false, error: err.message }));
      req.write(bodyStr);
      req.end();
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

async function scanExportFolder() {
  lastSyncAt = new Date().toISOString();
  if (!fs.existsSync(WATCH_DIR)) return { processed: 0 };
  const files = fs.readdirSync(WATCH_DIR).filter((f) => /\.(json|hl7|txt|csv)$/i.test(f));
  let processed = 0;

  for (const file of files) {
    const fullPath = path.join(WATCH_DIR, file);
    try {
      const raw = fs.readFileSync(fullPath, 'utf8');
      const sig = sha256(file + '::' + raw);
      if (sentHashes.has(sig)) continue;

      let pushRes;
      if (/\.(hl7|txt)$/i.test(file) && raw.includes('MSH|')) {
        pushRes = await postToPharmaGarde(raw, 'text/plain');
        recentResults.unshift({ file, protocol: 'HL7_V2', received_at: new Date().toISOString(), pushed: !!pushRes.ok });
      } else if (file.endsWith('.json')) {
        const parsed = JSON.parse(raw);
        pushRes = await postToPharmaGarde(parsed, 'application/json');
        recentResults.unshift({
          file,
          protocol: parsed.resourceType === 'DiagnosticReport' ? 'FHIR_R4' : 'JSON',
          patient_code: parsed.patient_code || '—',
          exam_name: parsed.exam_name || file,
          received_at: new Date().toISOString(),
          pushed: !!pushRes.ok
        });
      } else if (file.endsWith('.csv')) {
        const lines = raw.split(/\r?\n/).filter(Boolean);
        const sep = lines[0] && lines[0].includes(';') ? ';' : ',';
        const params = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(sep).map((c) => c.trim().replace(/^["']|["']$/g, ''));
          if (cols[0]) params.push({ name: cols[0], value: cols[1] || '', unit: cols[2] || '', ref_range: cols[3] || '', flag: (cols[4] || 'normal').toLowerCase() });
        }
        const payload = {
          patient_code: file.split('_')[0].toUpperCase(),
          exam_name: file.replace(/\.csv$/i, ''),
          facility_type: config.facility_type,
          parameters: params,
          source_system: 'sih_connector'
        };
        pushRes = await postToPharmaGarde(payload, 'application/json');
        recentResults.unshift({ file, protocol: 'CSV', patient_code: payload.patient_code, exam_name: payload.exam_name, received_at: new Date().toISOString(), pushed: !!pushRes.ok });
      }

      sentHashes.add(sig);
      processed++;
      console.log(`[SIL/SIH] Résultat traité : ${file} (Cloud: ${pushRes && pushRes.ok ? 'TRANSMIS & PATIENT NOTIFIÉ' : 'LOCAL'})`);
    } catch (e) {
      console.warn(`[SIL/SIH] Erreur fichier ${file}:`, e.message);
    }
  }
  if (processed > 0) saveSentHashes();
  recentResults = recentResults.slice(0, 100);
  return { processed, total_indexed: recentResults.length };
}

loadConfig();

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Connector-Token');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (config.local_token) {
    const auth = req.headers['x-connector-token'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (auth !== config.local_token) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Token connecteur invalide' }));
      return;
    }
  }

  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      service: 'Pharma-Garde SIL/SIH Universal Connector v13.0',
      software_vendor: config.software_vendor,
      facility_name: config.facility_name,
      total_results: recentResults.length,
      last_sync: lastSyncAt
    }));
    return;
  }

  if (req.url === '/api/results' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, items: recentResults, last_sync: lastSyncAt }));
    return;
  }

  if (req.url === '/api/sync-now' && (req.method === 'POST' || req.method === 'GET')) {
    const summary = await scanExportFolder();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, ...summary, last_sync: lastSyncAt }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, error: 'Route inconnue' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🧬 Pharma-Garde SIL/SIH Connector v13.0 actif sur http://0.0.0.0:${PORT}`);
  console.log(`   Dossier surveillé : ${WATCH_DIR}`);
  console.log(`   Logiciel cible    : ${config.software_vendor.toUpperCase()}`);
  scanExportFolder();
  setInterval(scanExportFolder, Math.max(5000, config.poll_interval_ms || 15000));
});
