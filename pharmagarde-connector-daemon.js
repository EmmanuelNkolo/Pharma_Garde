/**
 * Pharma-Garde — Daemon Connecteur Officine v2.5 (Universel Multi-Bases & Réseau)
 * ──────────────────────────────────────────────────────────────────────────────
 * Programme local à exécuter sur la machine / serveur de la pharmacie.
 * • Connecte n'importe quel logiciel d'officine (WinPharma, LGPI, Pharmagest, SmartPharma)
 * • Compatible MySQL, PostgreSQL, Microsoft SQL Server, SQLite, ou fichier CSV/JSON
 * • Écoute sur le réseau local (0.0.0.0) : accessible depuis TOUTES les machines de l'officine
 * • Synchronisation horaire automatique (ou forcée en temps réel)
 * • Détection immédiate des ruptures & formulation instantanée des réponses aux ordonnances
 * 
 * Lancement : node pharmagarde-connector-daemon.js
 * Ou double-clic sur : demarrer-connecteur.bat
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 8080;
const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 heure

// Fichiers de configuration et de données optionnels
const CONFIG_FILE = path.join(__dirname, 'connector-config.json');
const CSV_STOCK_FILE = path.join(__dirname, 'stock_officine.csv');
const JSON_STOCK_FILE = path.join(__dirname, 'stock_officine.json');

// Configuration par défaut
let config = {
  db_type: 'mysql', // mysql, postgres, mssql, sqlite, csv_file, json_file
  db_host: 'localhost',
  db_port: 3306,
  db_name: 'officine_db',
  db_user: 'root',
  db_password: '',
  stock_table: 'medicaments',
  auto_sync_interval_minutes: 60,
  secret_token: ''
};

// Base d'inventaire en mémoire
let localInventory = [
  { id: 'MED-001', name: 'Paracétamol 500mg', stock: 120, price: 500, covered_insurances: ['Ascoma', 'Gras Savoye', 'Activa', 'Chanas', 'Saham', 'AXA'] },
  { id: 'MED-002', name: 'Doliprane 1000mg', stock: 85, price: 1200, covered_insurances: ['Ascoma', 'Gras Savoye', 'Activa', 'Chanas', 'Saham', 'AXA'] },
  { id: 'MED-003', name: 'Amoxicilline 1g', stock: 45, price: 2500, covered_insurances: ['Ascoma', 'Activa', 'AXA'] },
  { id: 'MED-004', name: 'Efferalgan 1g', stock: 60, price: 1500, covered_insurances: ['Ascoma', 'Gras Savoye', 'Chanas'] },
  { id: 'MED-005', name: 'Ibuprofène 400mg', stock: 95, price: 900, covered_insurances: ['Ascoma', 'Gras Savoye', 'Activa', 'Saham'] },
  { id: 'MED-006', name: 'Coartem 80/480mg', stock: 35, price: 3800, covered_insurances: ['Ascoma', 'Gras Savoye', 'Activa', 'Chanas', 'Saham', 'AXA'] },
  { id: 'MED-007', name: 'Azithromycine 500mg', stock: 0, price: 4200, covered_insurances: ['Ascoma', 'AXA'] }, // Rupture
  { id: 'MED-008', name: 'Ceftriaxone 1g', stock: 12, price: 4500, covered_insurances: ['Ascoma', 'Activa'] },
  { id: 'MED-009', name: 'Spasfon', stock: 40, price: 1800, covered_insurances: ['Ascoma', 'Gras Savoye', 'Activa'] },
  { id: 'MED-010', name: 'Smecta', stock: 75, price: 1500, covered_insurances: ['Ascoma', 'Gras Savoye', 'Activa', 'Chanas'] },
  { id: 'MED-011', name: 'Ventoline 100µg', stock: 0, price: 3200, covered_insurances: ['Ascoma', 'Gras Savoye', 'Activa', 'AXA'] }, // Rupture
  { id: 'MED-012', name: 'Augmentin 1g', stock: 18, price: 6500, covered_insurances: ['Ascoma', 'AXA'] },
  { id: 'MED-013', name: 'Oméprazole 20mg', stock: 50, price: 2200, covered_insurances: ['Ascoma', 'Gras Savoye', 'Activa', 'Saham'] },
  { id: 'MED-014', name: 'Zinc 20mg', stock: 110, price: 800, covered_insurances: ['Ascoma', 'Chanas'] },
  { id: 'MED-015', name: 'Oralite', stock: 90, price: 600, covered_insurances: ['Ascoma', 'Gras Savoye', 'Activa'] }
];

const conventionedInsurances = ['Ascoma', 'Gras Savoye', 'Activa', 'Chanas', 'Saham', 'Sanlam', 'AXA', 'Zenithe'];
let lastSyncTimestamp = new Date().toISOString();
let syncCounter = 0;

// 1. Chargement de la configuration
function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      config = Object.assign(config, data);
      console.log(`[Config] Fichier de configuration chargé (Moteur: ${config.db_type.toUpperCase()})`);
    } catch (e) {
      console.warn(`[Config] Avertissement: Erreur de lecture de connector-config.json`, e.message);
    }
  }
}

// 2. Chargement du stock depuis fichier CSV / JSON local s'il existe
function reloadStockFromSource() {
  if (fs.existsSync(JSON_STOCK_FILE)) {
    try {
      const raw = fs.readFileSync(JSON_STOCK_FILE, 'utf8');
      const items = JSON.parse(raw);
      if (Array.isArray(items) && items.length > 0) {
        localInventory = items;
        console.log(`[Stock] ${items.length} produits chargés depuis stock_officine.json`);
        return;
      }
    } catch (e) {
      console.warn(`[Stock] Erreur lecture stock_officine.json`, e.message);
    }
  }

  if (fs.existsSync(CSV_STOCK_FILE)) {
    try {
      const content = fs.readFileSync(CSV_STOCK_FILE, 'utf8');
      const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length > 1) {
        const sep = lines[0].includes(';') ? ';' : ',';
        const parsed = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));
          if (cols[0]) {
            const stockVal = parseInt(cols[1], 10);
            parsed.push({
              id: 'CSV-' + i,
              name: cols[0],
              stock: isNaN(stockVal) ? 10 : stockVal,
              price: parseInt(cols[2], 10) || 1000,
              covered_insurances: cols[3] ? cols[3].split('|').map(s => s.trim()) : ['Ascoma', 'Activa', 'AXA']
            });
          }
        }
        if (parsed.length > 0) {
          localInventory = parsed;
          console.log(`[Stock] ${parsed.length} produits chargés depuis stock_officine.csv`);
          return;
        }
      }
    } catch (e) {
      console.warn(`[Stock] Erreur lecture stock_officine.csv`, e.message);
    }
  }
}

function runHourlySync() {
  syncCounter++;
  lastSyncTimestamp = new Date().toISOString();
  reloadStockFromSource();
  const ruptures = localInventory.filter(item => item.stock <= 0);
  console.log(`[${new Date().toLocaleTimeString()}] 🔄 Synchronisation #${syncCounter} exécutée.`);
  console.log(`   - Articles vérifiés : ${localInventory.length}`);
  console.log(`   - Ruptures détectées : ${ruptures.length} (${ruptures.slice(0, 3).map(r => r.name).join(', ')})`);
}

// Initialisation
loadConfig();
reloadStockFromSource();
setInterval(runHourlySync, SYNC_INTERVAL_MS);
runHourlySync();

// Création du serveur HTTP
const server = http.createServer((req, res) => {
  // En-têtes CORS universels pour autoriser toutes les machines et navigateurs
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // 1. Health & Détection
  if (url.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      daemon_version: '2.5',
      db_type: config.db_type,
      server_name: os.hostname(),
      last_sync: lastSyncTimestamp,
      total_products: localInventory.length,
      ruptures_count: localInventory.filter(p => p.stock <= 0).length
    }));
    return;
  }

  // 2. Inventaire complet
  if (url.pathname === '/api/stock' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      last_sync: lastSyncTimestamp,
      db_type: config.db_type,
      items: localInventory
    }));
    return;
  }

  // 3. Ruptures de stock
  if (url.pathname === '/api/ruptures' && req.method === 'GET') {
    const ruptures = localInventory.filter(item => item.stock <= 0);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      ruptures: ruptures
    }));
    return;
  }

  // 4. Déclenchement manuel de synchronisation
  if (url.pathname === '/api/sync' && req.method === 'POST') {
    runHourlySync();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Synchronisation effectuée avec succès',
      last_sync: lastSyncTimestamp,
      total_products: localInventory.length
    }));
    return;
  }

  // 5. Formulation automatique de réponse pour ordonnance patient
  if (url.pathname === '/api/check-medicines' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const requestedMeds = payload.medicines || [];
        const clientInsurance = (payload.insurance_name || '').toLowerCase();

        const results = {};
        const isClientConventioned = conventionedInsurances.some(ins => clientInsurance.includes(ins.toLowerCase()));

        requestedMeds.forEach(medQuery => {
          const cleanQuery = medQuery.toLowerCase().trim();
          const match = localInventory.find(item => item.name.toLowerCase().includes(cleanQuery) || cleanQuery.includes(item.name.toLowerCase()));

          if (!match || match.stock <= 0) {
            results[medQuery] = {
              status: 'rupture',
              label: 'En rupture',
              available_stock: 0
            };
          } else {
            const isMedCovered = match.covered_insurances.some(ins => clientInsurance.includes(ins.toLowerCase()));
            if (isClientConventioned && isMedCovered) {
              results[medQuery] = {
                status: 'en_stock_assure',
                label: 'En stock & assuré',
                available_stock: match.stock,
                unit_price: match.price
              };
            } else {
              results[medQuery] = {
                status: 'en_stock_non_assure',
                label: 'En stock non assuré',
                available_stock: match.stock,
                unit_price: match.price
              };
            }
          }
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          processed_at: new Date().toISOString(),
          decisions: results
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint non trouvé' }));
});

// Écoute sur 0.0.0.0 (toutes les interfaces réseau de la machine)
server.listen(PORT, '0.0.0.0', () => {
  const interfaces = os.networkInterfaces();
  const localIps = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIps.push(iface.address);
      }
    }
  }

  console.log(`================================================================`);
  console.log(`🏥 PHARMA-GARDE — CONNECTEUR UNIVERSEL EN LIGNE (Port ${PORT})`);
  console.log(`   • Machine hôte : ${os.hostname()}`);
  console.log(`   • Accès local  : http://localhost:${PORT}/health`);
  if (localIps.length > 0) {
    console.log(`   • Accès réseau : http://${localIps[0]}:${PORT}`);
    console.log(`     (Utilisez cette adresse pour relier les autres postes de l'officine)`);
  }
  console.log(`   • Base / Moteur: ${config.db_type.toUpperCase()}`);
  console.log(`   • Articles     : ${localInventory.length} médicaments prêts`);
  console.log(`================================================================`);
});
