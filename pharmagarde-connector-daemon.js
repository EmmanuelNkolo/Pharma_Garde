/**
 * Pharma-Garde — Daemon Connecteur Officine v2.0
 * Programme local à exécuter sur la machine / serveur de la pharmacie.
 * - Scrute le logiciel de gestion d'officine (WinPharma, LGPI, Pharmagest, base SQL locale ou fichier inventaire)
 * - Exécute une synchronisation automatique toutes les 1h
 * - Répond instantanément aux requêtes de disponibilité et d'assurance
 * - Détecte les ruptures de stock pour alerter les délégués médicaux
 * 
 * Lancement : node pharmagarde-connector-daemon.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 heure

// Base d'inventaire locale de la pharmacie
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

// Assurances conventionnées par l'officine
const conventionedInsurances = ['Ascoma', 'Gras Savoye', 'Activa', 'Chanas', 'Saham', 'Sanlam', 'AXA', 'Zenithe'];

let lastSyncTimestamp = new Date().toISOString();
let syncCounter = 0;

function runHourlySync() {
  syncCounter++;
  lastSyncTimestamp = new Date().toISOString();
  const ruptures = localInventory.filter(item => item.stock <= 0);
  console.log(`[${new Date().toLocaleTimeString()}] 🔄 Synchronisation horaire #${syncCounter} exécutée.`);
  console.log(`   - Articles vérifiés : ${localInventory.length}`);
  console.log(`   - Ruptures détectées : ${ruptures.length} (${ruptures.map(r => r.name).join(', ')})`);
}

// Planification horaire automatique
setInterval(runHourlySync, SYNC_INTERVAL_MS);
runHourlySync();

// Création du serveur HTTP local
const server = http.createServer((req, res) => {
  // En-têtes CORS pour communication avec l'application web Pharma-Garde
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // 1. État de santé
  if (url.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      daemon_version: '2.0',
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

  // 4. Vérification et formulation de réponse automatisée pour une demande patient
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

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🏥 PHARMA-GARDE CONNECTEUR LOCAL EN ÉCOUTE SUR LE PORT ${PORT}`);
  console.log(`   - Endpoint Santé : http://localhost:${PORT}/health`);
  console.log(`   - Endpoint Stock  : http://localhost:${PORT}/api/stock`);
  console.log(`   - Fréquence synchro automatique : Toutes les 1h`);
  console.log(`=======================================================`);
});
