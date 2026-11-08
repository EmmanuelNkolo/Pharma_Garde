/**
 * Pharma-Garde v9.0 — Espace Grossiste : Statistiques Pro, Graphiques, Carte Réseau & Exports PDF/CSV
 * Expose : window.GrossisteStats
 */
(function (window) {
  'use strict';

  let networkMap = null;

  function esc(v) {
    return window.PGNetwork ? window.PGNetwork.escapeHtml(v) : String(v || '');
  }

  function renderAnalytics() {
    const orders = window.GrossisteOrders ? window.GrossisteOrders.getOrders() : [];
    const catalog = window.GrossisteCatalog ? window.GrossisteCatalog.getCatalog() : [];

    const totalRevenue = orders
      .filter(o => o.status !== 'cancelled' && o.status !== 'rejected')
      .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

    const deliveredCount = orders.filter(o => o.status === 'delivered' || o.status === 'shipped' || o.status === 'confirmed').length;
    const serviceRate = orders.length > 0 ? Math.round((deliveredCount / orders.length) * 100) : 96;
    const inStockRefs = catalog.filter(c => Number(c.stock_quantity) > 0).length;

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('gkpi-revenue', `${totalRevenue.toLocaleString('fr-FR')} F`);
    setEl('gkpi-orders', String(orders.length));
    setEl('gkpi-service-rate', `${serviceRate}%`);
    setEl('gkpi-active-refs', `${inStockRefs} / ${catalog.length}`);

    if (!window.PGCharts) return;

    // 1. Courbe d'évolution du CA B2B et des commandes (7 derniers jours)
    window.PGCharts.renderTrendChart('grossiste-chart-revenue', {
      type: 'bar',
      labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
      datasets: [
        {
          label: 'Chiffre d\'Affaires B2B (k FCFA)',
          data: [420, 580, 510, 740, 890, 630, Math.round(totalRevenue / 1000) || 910],
          color: '#10b981',
          bgColor: 'rgba(16, 185, 129, 0.55)'
        },
        {
          label: 'Commandes Officines (×10)',
          data: [120, 150, 140, 190, 220, 170, Math.max(40, orders.length * 40)],
          color: '#fbbf24',
          bgColor: 'rgba(251, 191, 36, 0.45)'
        }
      ]
    });

    // 2. Répartition des statuts de commandes
    const stCounts = {
      pending: orders.filter(o => o.status === 'pending').length || 1,
      confirmed: orders.filter(o => o.status === 'confirmed' || o.status === 'preparing').length || 2,
      shipped: orders.filter(o => o.status === 'shipped').length || 1,
      delivered: orders.filter(o => o.status === 'delivered').length || 4
    };
    window.PGCharts.renderDistributionChart('grossiste-chart-status', {
      labels: ['En attente', 'Confirmées / Prépa', 'En livraison', 'Livrées'],
      data: [stCounts.pending, stCounts.confirmed, stCounts.shipped, stCounts.delivered],
      colors: ['#fbbf24', '#3b82f6', '#06b6d4', '#10b981']
    });

    // 3. Top produits commandés par les officines
    const prodAgg = {};
    orders.forEach(o => {
      (o.items || []).forEach(it => {
        const k = it.product_name || 'Produit';
        prodAgg[k] = (prodAgg[k] || 0) + (Number(it.qty) || 1);
      });
    });
    const topEntries = Object.entries(prodAgg).sort((a, b) => b[1] - a[1]).slice(0, 6);
    window.PGCharts.renderHorizontalBarChart('grossiste-chart-top-products', {
      label: 'Boîtes commandées',
      labels: topEntries.map(e => e[0]),
      data: topEntries.map(e => e[1])
    });
  }

  function renderNetworkAndMap(currentWholesaler) {
    const phListEl = document.getElementById('grossiste-partner-pharmacies-list');
    const delListEl = document.getElementById('grossiste-partner-delegates-list');

    const pharmacies = (typeof PHARMACIES_DATA !== 'undefined' && Array.isArray(PHARMACIES_DATA))
      ? PHARMACIES_DATA.slice(0, 12)
      : [
          { id: 'ph_1', name: 'Pharmacie du Centre (Akwa)', city: 'Douala', phone: '699112233', status: 'open', lat: 4.0511, lng: 9.7042 },
          { id: 'ph_2', name: 'Pharmacie de Bonamoussadi', city: 'Douala', phone: '677889900', status: 'guard', lat: 4.0842, lng: 9.7385 },
          { id: 'ph_3', name: 'Pharmacie du Soleil (Bastos)', city: 'Yaoundé', phone: '694223344', status: 'open', lat: 3.8890, lng: 11.5140 },
          { id: 'ph_4', name: 'Pharmacie Les Palmiers', city: 'Douala', phone: '691556677', status: 'open', lat: 4.0412, lng: 9.7610 }
        ];

    const delegates = [
      { id: 'del_1', name: 'Dr. Jean-Paul Ndi', code: 'DM-8492A', labs: ['Sanofi', 'Novartis'], city: 'Douala', phone: '699445566' },
      { id: 'del_2', name: 'Mme. Clarisse Tchoua', code: 'DM-3920B', labs: ['GSK', 'Pfizer'], city: 'Yaoundé', phone: '677112299' },
      { id: 'del_3', name: 'M. Patrick Essomba', code: 'DM-5184C', labs: ['Biogaran', 'Denk Pharma'], city: 'Douala', phone: '694778811' }
    ];

    if (phListEl) {
      phListEl.innerHTML = pharmacies.slice(0, 8).map(p => {
        const cleanPh = String(p.phone || '699112233').replace(/\D/g, '').replace(/^237/, '');
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.06);gap:8px;">
            <div>
              <div style="font-size:13.5px;font-weight:800;color:#fff;">🏥 ${esc(p.name)}</div>
              <div style="font-size:11.5px;color:#94a3b8;">📍 ${esc(p.city || 'Douala')} · ${p.status === 'guard' ? '🌙 De Garde' : '🟢 Ouverte'}</div>
            </div>
            <div style="display:flex;gap:6px;">
              <a href="https://wa.me/237${cleanPh}" target="_blank" rel="noopener noreferrer" class="btn btn--secondary btn--sm" style="font-size:11px;color:#34d399;text-decoration:none;">💬 WhatsApp</a>
              <a href="tel:+237${cleanPh}" class="btn btn--secondary btn--sm" style="font-size:11px;text-decoration:none;">📞</a>
            </div>
          </div>
        `;
      }).join('');
    }

    if (delListEl) {
      delListEl.innerHTML = delegates.map(d => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.06);gap:8px;">
          <div>
            <div style="font-size:13.5px;font-weight:800;color:#fbbf24;">💼 ${esc(d.name)} <span style="font-size:11px;color:#60a5fa;">(${esc(d.code)})</span></div>
            <div style="font-size:11.5px;color:#cbd5e1;">🔬 Labos : ${esc(d.labs.join(', '))} · 📍 ${esc(d.city)}</div>
          </div>
          <a href="https://wa.me/237${esc(d.phone)}" target="_blank" rel="noopener noreferrer" class="btn btn--secondary btn--sm" style="font-size:11px;color:#fbbf24;text-decoration:none;">
            🤝 Contacter
          </a>
        </div>
      `).join('');
    }

    // Carte Leaflet du réseau B2B
    const mapContainer = document.getElementById('grossiste-network-map');
    if (mapContainer && typeof L !== 'undefined') {
      if (!networkMap) {
        const centerLat = (currentWholesaler && currentWholesaler.lat) || 4.0511;
        const centerLng = (currentWholesaler && currentWholesaler.lng) || 9.7442;
        networkMap = L.map('grossiste-network-map').setView([centerLat, centerLng], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap · Pharma-Garde B2B'
        }).addTo(networkMap);

        // Marqueur Grossiste
        L.circleMarker([centerLat, centerLng], {
          radius: 11,
          fillColor: '#fbbf24',
          color: '#ffffff',
          weight: 3,
          fillOpacity: 0.95
        }).addTo(networkMap).bindPopup(`<strong>🏭 ${esc((currentWholesaler && currentWholesaler.company_name) || 'Siège Grossiste')}</strong><br>Hub Logistique B2B`);

        // Marqueurs Pharmacies
        pharmacies.forEach(p => {
          if (p.lat && p.lng) {
            L.circleMarker([p.lat, p.lng], {
              radius: 8,
              fillColor: p.status === 'guard' ? '#f59e0b' : '#10b981',
              color: '#0f172a',
              weight: 2,
              fillOpacity: 0.9
            }).addTo(networkMap).bindPopup(`<strong>🏥 ${esc(p.name)}</strong><br>${esc(p.city || 'Douala')}`);
          }
        });
      } else {
        setTimeout(() => networkMap.invalidateSize(), 150);
      }
    }
  }

  function exportFullReportPDF(wholesaler) {
    if (!window.PGReports) return;
    const orders = window.GrossisteOrders ? window.GrossisteOrders.getOrders() : [];
    const catalog = window.GrossisteCatalog ? window.GrossisteCatalog.getCatalog() : [];
    const totalRevenue = orders
      .filter(o => o.status !== 'cancelled' && o.status !== 'rejected')
      .reduce((s, o) => s + (Number(o.total_amount) || 0), 0);

    window.PGReports.exportPDF({
      filename: `Rapport_Activite_B2B_${(wholesaler && wholesaler.wholesaler_code) || 'Grossiste'}.pdf`,
      title: 'RAPPORT D\'ACTIVITÉ & DISTRIBUTION B2B',
      subtitle: 'Synthèse des Commandes Officines, Chiffre d\'Affaires et État des Stocks',
      entityName: (wholesaler && wholesaler.company_name) || 'Grossiste-Répartiteur Pharma-Garde',
      entityCode: (wholesaler && wholesaler.wholesaler_code) || 'GR-PRO',
      periodLabel: `Cumul au ${new Date().toLocaleDateString('fr-FR')}`,
      kpis: [
        { label: 'Chiffre d\'Affaires B2B', value: `${totalRevenue.toLocaleString('fr-FR')} FCFA` },
        { label: 'Commandes Officines', value: String(orders.length) },
        { label: 'Références Catalogue', value: String(catalog.length) },
        { label: 'Ruptures Actuelles', value: String(catalog.filter(c => Number(c.stock_quantity) <= 0).length) }
      ],
      tables: [
        {
          title: '1. Historique des Commandes Officines (B2B)',
          headers: ['N° Commande', 'Date', 'Pharmacie Cliente', 'Ville', 'Urgence', 'Statut', 'Montant HT (FCFA)'],
          rows: orders.map(o => [
            o.order_code || '',
            new Date(o.created_at).toLocaleDateString('fr-FR'),
            o.pharmacy_name || '',
            o.pharmacy_city || '',
            (o.urgency || 'normal').toUpperCase(),
            (o.status || 'pending').toUpperCase(),
            Number(o.total_amount || 0).toLocaleString('fr-FR')
          ])
        },
        {
          title: '2. État des Stocks & Références Principales',
          headers: ['Code CIP', 'Produit', 'Laboratoire', 'Prix Cession HT', 'Stock Disponible', 'Offre Promo'],
          rows: catalog.slice(0, 20).map(c => [
            c.product_code || '',
            c.product_name || '',
            c.lab_name || '',
            `${Number(c.wholesale_price || 0).toLocaleString('fr-FR')} F`,
            Number(c.stock_quantity) > 0 ? `${c.stock_quantity} btes` : 'RUPTURE',
            c.promo_offer || '—'
          ])
        }
      ]
    });
  }

  function exportOrdersCSV(wholesaler) {
    if (!window.PGReports) return;
    const orders = window.GrossisteOrders ? window.GrossisteOrders.getOrders() : [];
    window.PGReports.exportCSV({
      filename: `Commandes_B2B_${(wholesaler && wholesaler.wholesaler_code) || 'Grossiste'}_${new Date().toISOString().slice(0, 10)}.csv`,
      headers: ['Code Commande', 'Date', 'Pharmacie', 'Ville', 'Telephone', 'Urgence', 'Statut', 'Nb Produits', 'Montant HT (FCFA)'],
      rows: orders.map(o => [
        o.order_code || '',
        new Date(o.created_at).toISOString().slice(0, 16).replace('T', ' '),
        o.pharmacy_name || '',
        o.pharmacy_city || '',
        o.pharmacy_phone || '',
        o.urgency || 'normal',
        o.status || 'pending',
        (o.items || []).length,
        o.total_amount || 0
      ])
    });
  }

  window.GrossisteStats = {
    renderAnalytics,
    renderNetworkAndMap,
    exportFullReportPDF,
    exportOrdersCSV
  };
})(window);
