/**
 * Pharma-Garde v9.0 — Espace Grossiste : Gestion du Catalogue & Stocks B2B
 * • Recherche, filtres (catégorie, statut stock, promotions)
 * • Ajout / Modification / Suppression de références
 * • Import / Export CSV anti-injection & Export PDF
 * Expose : window.GrossisteCatalog
 */
(function (window) {
  'use strict';

  const CATALOG_STORAGE_KEY = 'pharmagarde_wholesaler_catalog_v9';

  const DEFAULT_CATALOG = [
    { id: 'cat_1', wholesaler_id: 'ws_ubipharm_dla', product_code: 'CIP-34009301', product_name: 'Doliprane 1000mg (Boîte de 8)', dci: 'Paracétamol', lab_name: 'Sanofi', category: 'Antalgique', wholesale_price: 890, pharmacy_price: 1200, stock_quantity: 2400, alert_threshold: 200, min_order_qty: 10, in_stock: true, is_promoted: true, promo_offer: '20+2 gratuits' },
    { id: 'cat_2', wholesaler_id: 'ws_ubipharm_dla', product_code: 'CIP-34009302', product_name: 'Augmentin 1g Adultes (8 sachets)', dci: 'Amoxicilline / Ac. Clavulanique', lab_name: 'GSK', category: 'Antibiotique', wholesale_price: 4950, pharmacy_price: 6500, stock_quantity: 650, alert_threshold: 80, min_order_qty: 5, in_stock: true, is_promoted: true, promo_offer: '10+1 gratuit' },
    { id: 'cat_3', wholesaler_id: 'ws_ubipharm_dla', product_code: 'CIP-34009303', product_name: 'Coartem 80/480mg (6 comprimés)', dci: 'Artéméther + Luméfantrine', lab_name: 'Novartis', category: 'Antipaludéen', wholesale_price: 2800, pharmacy_price: 3800, stock_quantity: 1800, alert_threshold: 150, min_order_qty: 10, in_stock: true, is_promoted: false, promo_offer: '' },
    { id: 'cat_4', wholesaler_id: 'ws_ubipharm_dla', product_code: 'CIP-34009304', product_name: 'Ventoline 100µg Inhalateur', dci: 'Salbutamol', lab_name: 'GSK', category: 'Pneumologie', wholesale_price: 2450, pharmacy_price: 3200, stock_quantity: 420, alert_threshold: 60, min_order_qty: 5, in_stock: true, is_promoted: true, promo_offer: 'Arrivage frais -8%' },
    { id: 'cat_5', wholesaler_id: 'ws_ubipharm_dla', product_code: 'CIP-34009305', product_name: 'Azithromycine 500mg (3 comprimés)', dci: 'Azithromycine', lab_name: 'Pfizer / Générique', category: 'Antibiotique', wholesale_price: 3100, pharmacy_price: 4200, stock_quantity: 540, alert_threshold: 50, min_order_qty: 5, in_stock: true, is_promoted: false, promo_offer: '' },
    { id: 'cat_6', wholesaler_id: 'ws_ubipharm_dla', product_code: 'CIP-34009306', product_name: 'Ceftriaxone 1g Injectable IM/IV', dci: 'Ceftriaxone', lab_name: 'Roche / Denk', category: 'Antibiotique', wholesale_price: 3350, pharmacy_price: 4500, stock_quantity: 35, alert_threshold: 50, min_order_qty: 10, in_stock: true, is_promoted: false, promo_offer: '' },
    { id: 'cat_7', wholesaler_id: 'ws_ubipharm_dla', product_code: 'CIP-34009307', product_name: 'Oméprazole 20mg (14 gélules)', dci: 'Oméprazole', lab_name: 'Biogaran', category: 'Gastro-entérologie', wholesale_price: 1600, pharmacy_price: 2200, stock_quantity: 950, alert_threshold: 100, min_order_qty: 10, in_stock: true, is_promoted: true, promo_offer: '15+2 gratuits' },
    { id: 'cat_8', wholesaler_id: 'ws_ubipharm_dla', product_code: 'CIP-34009308', product_name: 'Insuline Lantus Solostar 100 UI/ml', dci: 'Insuline glargine', lab_name: 'Sanofi', category: 'Diabétologie', wholesale_price: 18500, pharmacy_price: 23500, stock_quantity: 0, alert_threshold: 30, min_order_qty: 2, in_stock: false, is_promoted: false, promo_offer: '' },
    { id: 'cat_9', wholesaler_id: 'ws_laborex_dla', product_code: 'CIP-34009309', product_name: 'Spasfon Lyoc 80mg (10 lyophilisats)', dci: 'Phloroglucinol', lab_name: 'Teva', category: 'Antispasmodique', wholesale_price: 1350, pharmacy_price: 1800, stock_quantity: 1120, alert_threshold: 80, min_order_qty: 10, in_stock: true, is_promoted: false, promo_offer: '' },
    { id: 'cat_10', wholesaler_id: 'ws_laborex_dla', product_code: 'CIP-34009310', product_name: 'Smecta Orange-Vanille (30 sachets)', dci: 'Diosmectite', lab_name: 'Ipsen', category: 'Gastro-entérologie', wholesale_price: 2700, pharmacy_price: 3600, stock_quantity: 780, alert_threshold: 80, min_order_qty: 5, in_stock: true, is_promoted: true, promo_offer: '-10% dès 20 boîtes' }
  ];

  let catalogItems = [];
  let filterState = {
    query: '',
    category: 'all',
    stockStatus: 'all'
  };

  function esc(v) {
    return window.PGNetwork ? window.PGNetwork.escapeHtml(v) : String(v || '');
  }

  function normalizeCatalogItem(item) {
    if (!item) return item;
    const qty = Number(item.stock_quantity) || 0;
    const threshold = Number(item.alert_threshold) || 20;
    item.retail_price = Number(item.retail_price || item.pharmacy_price || Math.round((Number(item.wholesale_price) || 0) * 1.33));
    item.pharmacy_price = Number(item.pharmacy_price || item.retail_price);
    item.cip_code = item.cip_code || item.product_code || '';
    item.product_code = item.product_code || item.cip_code || '';
    item.stock_status = qty <= 0 ? 'out_of_stock' : (qty <= threshold ? 'low_stock' : 'in_stock');
    return item;
  }

  function loadCatalog() {
    try {
      const saved = localStorage.getItem(CATALOG_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          catalogItems = parsed.map(normalizeCatalogItem);
          return catalogItems;
        }
      }
    } catch (e) {}
    catalogItems = DEFAULT_CATALOG.slice().map(normalizeCatalogItem);
    saveCatalog();
    return catalogItems;
  }

  function saveCatalog() {
    try {
      localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalogItems));
    } catch (e) {}
  }

  async function syncWithSupabase(wholesalerId) {
    loadCatalog();
    if (!window.supabase) return catalogItems;
    try {
      let query = window.supabase.from('wholesaler_catalog').select('*').order('product_name', { ascending: true });
      if (wholesalerId && !wholesalerId.startsWith('ws_')) {
        query = query.eq('wholesaler_id', wholesalerId);
      }
      const { data, error } = await query.limit(300);
      if (!error && Array.isArray(data) && data.length > 0) {
        catalogItems = data.map(normalizeCatalogItem);
        saveCatalog();
      }
    } catch (e) {}
    return catalogItems;
  }

  function getFilteredItems() {
    const q = (filterState.query || '').toLowerCase().trim();
    return catalogItems.filter(item => {
      if (q) {
        const match = (item.product_name || '').toLowerCase().includes(q) ||
                      (item.dci || '').toLowerCase().includes(q) ||
                      (item.lab_name || '').toLowerCase().includes(q) ||
                      (item.product_code || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      if (filterState.category !== 'all' && (item.category || '') !== filterState.category) {
        return false;
      }
      const qty = Number(item.stock_quantity) || 0;
      const threshold = Number(item.alert_threshold) || 20;
      if (filterState.stockStatus === 'in_stock' && qty <= 0) return false;
      if (filterState.stockStatus === 'low_stock' && (qty <= 0 || qty > threshold)) return false;
      if (filterState.stockStatus === 'rupture' && qty > 0) return false;
      if (filterState.stockStatus === 'promoted' && !item.is_promoted) return false;
      return true;
    });
  }

  function renderTable() {
    const tbody = document.getElementById('grossiste-catalog-tbody');
    if (!tbody) return;

    const items = getFilteredItems();
    const countEl = document.getElementById('catalog-count-label');
    if (countEl) {
      countEl.textContent = `${items.length} référence(s) affichée(s) sur ${catalogItems.length}`;
    }

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="padding:28px;text-align:center;color:#94a3b8;">
            Aucune référence trouvée pour ces critères. Cliquez sur « + Ajouter une Référence » pour enrichir votre catalogue.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = items.map(item => {
      const qty = Number(item.stock_quantity) || 0;
      const threshold = Number(item.alert_threshold) || 20;
      let statusBadge = '';
      if (qty <= 0 || !item.in_stock) {
        statusBadge = `<span class="b2b-status-badge b2b-status--cancelled">🔴 Rupture (0)</span>`;
      } else if (qty <= threshold) {
        statusBadge = `<span class="b2b-status-badge b2b-status--pending">🟠 Stock faible (${qty})</span>`;
      } else {
        statusBadge = `<span class="b2b-status-badge b2b-status--delivered">🟢 En stock (${qty.toLocaleString('fr-FR')})</span>`;
      }

      const marginPct = item.wholesale_price > 0 && item.pharmacy_price > item.wholesale_price
        ? Math.round(((item.pharmacy_price - item.wholesale_price) / item.wholesale_price) * 100)
        : 0;

      return `
        <tr>
          <td>
            <div style="font-weight:800;color:#fff;font-size:13.5px;">${esc(item.product_name)}</div>
            <div style="font-size:11px;color:#94a3b8;">${esc(item.product_code || 'CIP-N/A')} · DCI: ${esc(item.dci || '—')}</div>
          </td>
          <td>
            <span style="font-weight:700;color:#60a5fa;">${esc(item.lab_name || '—')}</span>
            <div style="font-size:11px;color:#64748b;">${esc(item.category || 'Médicament')}</div>
          </td>
          <td style="font-weight:900;color:#34d399;font-size:14px;">
            ${Number(item.wholesale_price || 0).toLocaleString('fr-FR')} FCFA
          </td>
          <td>
            <div style="font-weight:700;color:#cbd5e1;">${Number(item.pharmacy_price || 0).toLocaleString('fr-FR')} FCFA</div>
            ${marginPct > 0 ? `<div style="font-size:10.5px;color:#fbbf24;">Marge officine: +${marginPct}%</div>` : ''}
          </td>
          <td>${statusBadge}</td>
          <td>
            ${item.is_promoted && item.promo_offer
              ? `<span style="display:inline-block;padding:3px 8px;border-radius:999px;background:rgba(251,191,36,0.18);border:1px solid rgba(251,191,36,0.4);color:#fbbf24;font-size:11px;font-weight:800;">🎁 ${esc(item.promo_offer)}</span>`
              : `<span style="color:#64748b;font-size:11.5px;">Standard (Min: ${Number(item.min_order_qty || 1)})</span>`
            }
          </td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button type="button" class="btn btn--secondary btn--sm" style="padding:4px 8px;font-size:11px;" onclick="GrossisteCatalog.adjustStock('${esc(item.id)}', 50)" title="Ajouter +50 boîtes">+50</button>
              <button type="button" class="btn btn--secondary btn--sm" style="padding:4px 8px;font-size:11px;" onclick="GrossisteCatalog.toggleRupture('${esc(item.id)}')">
                ${qty > 0 ? 'Mettre Rupture' : 'Réappro'}
              </button>
              <button type="button" class="btn btn--ghost btn--sm" style="padding:4px 8px;font-size:11px;color:#fbbf24;" onclick="GrossisteCatalog.openEditModal('${esc(item.id)}')">✏️</button>
              <button type="button" class="btn btn--ghost btn--sm" style="padding:4px 8px;font-size:11px;color:#f87171;" onclick="GrossisteCatalog.deleteItem('${esc(item.id)}')">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function setFilter(key, val) {
    filterState[key] = val;
    renderTable();
  }

  async function adjustStock(itemId, delta) {
    const item = catalogItems.find(i => i.id === itemId);
    if (!item) return;
    item.stock_quantity = Math.max(0, (Number(item.stock_quantity) || 0) + Number(delta));
    item.in_stock = item.stock_quantity > 0;
    item.updated_at = new Date().toISOString();
    saveCatalog();
    renderTable();
    if (window.GrossisteApp) window.GrossisteApp.refreshAllKpis();
    if (window.supabase && !String(item.id).startsWith('cat_')) {
      try {
        await window.supabase.from('wholesaler_catalog').update({
          stock_quantity: item.stock_quantity,
          in_stock: item.in_stock,
          updated_at: item.updated_at
        }).eq('id', item.id);
      } catch (e) {}
    }
  }

  async function toggleRupture(itemId) {
    const item = catalogItems.find(i => i.id === itemId);
    if (!item) return;
    if ((Number(item.stock_quantity) || 0) > 0) {
      item.stock_quantity = 0;
      item.in_stock = false;
    } else {
      item.stock_quantity = 200;
      item.in_stock = true;
    }
    item.updated_at = new Date().toISOString();
    saveCatalog();
    renderTable();
    if (window.GrossisteApp) {
      window.GrossisteApp.refreshAllKpis();
      window.GrossisteApp.toast(item.in_stock ? `✅ ${item.product_name} remis en stock (200 boîtes)` : `⚠️ ${item.product_name} marqué en rupture`, 'info');
    }
  }

  function openEditModal(itemId) {
    const modal = document.getElementById('grossiste-product-modal');
    if (!modal) return;

    const item = itemId ? catalogItems.find(i => i.id === itemId) : null;
    document.getElementById('gprod-id').value = item ? item.id : '';
    document.getElementById('gprod-code').value = item ? (item.product_code || '') : ('CIP-' + Math.floor(10000000 + Math.random() * 90000000));
    document.getElementById('gprod-name').value = item ? (item.product_name || '') : '';
    document.getElementById('gprod-dci').value = item ? (item.dci || '') : '';
    document.getElementById('gprod-lab').value = item ? (item.lab_name || '') : '';
    document.getElementById('gprod-cat').value = item ? (item.category || 'Antibiotique') : 'Antibiotique';
    document.getElementById('gprod-wprice').value = item ? (item.wholesale_price || '') : '';
    document.getElementById('gprod-pprice').value = item ? (item.pharmacy_price || '') : '';
    document.getElementById('gprod-stock').value = item ? (item.stock_quantity ?? 100) : 100;
    document.getElementById('gprod-threshold').value = item ? (item.alert_threshold ?? 30) : 30;
    document.getElementById('gprod-minqty').value = item ? (item.min_order_qty ?? 5) : 5;
    document.getElementById('gprod-promo').value = item ? (item.promo_offer || '') : '';

    const titleEl = document.getElementById('gprod-modal-title');
    if (titleEl) titleEl.textContent = item ? '✏️ Modifier la Référence B2B' : '➕ Nouvelle Référence Catalogue B2B';

    modal.classList.add('active');
  }

  async function saveFromModal(currentWholesaler) {
    const id = document.getElementById('gprod-id').value;
    const name = (document.getElementById('gprod-name').value || '').trim();
    const wprice = Number(document.getElementById('gprod-wprice').value) || 0;
    if (!name || wprice <= 0) {
      if (window.GrossisteApp) window.GrossisteApp.toast('❌ Veuillez renseigner le nom du médicament et son prix de cession HT.', 'error');
      return;
    }

    const stockQty = Math.max(0, parseInt(document.getElementById('gprod-stock').value, 10) || 0);
    const promoOffer = (document.getElementById('gprod-promo').value || '').trim();

    const record = {
      id: id || ('cat_' + Date.now()),
      wholesaler_id: (currentWholesaler && currentWholesaler.id) || 'ws_ubipharm_dla',
      product_code: (document.getElementById('gprod-code').value || '').trim(),
      product_name: name,
      product_key: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
      dci: (document.getElementById('gprod-dci').value || '').trim(),
      lab_name: (document.getElementById('gprod-lab').value || '').trim() || 'Laboratoire Certifié',
      category: document.getElementById('gprod-cat').value || 'Médicament',
      wholesale_price: wprice,
      pharmacy_price: Number(document.getElementById('gprod-pprice').value) || Math.round(wprice * 1.33),
      stock_quantity: stockQty,
      alert_threshold: parseInt(document.getElementById('gprod-threshold').value, 10) || 20,
      min_order_qty: parseInt(document.getElementById('gprod-minqty').value, 10) || 1,
      in_stock: stockQty > 0,
      is_promoted: Boolean(promoOffer),
      promo_offer: promoOffer,
      updated_at: new Date().toISOString()
    };

    const existingIdx = catalogItems.findIndex(i => i.id === record.id);
    if (existingIdx >= 0) {
      catalogItems[existingIdx] = record;
    } else {
      catalogItems.unshift(record);
    }

    saveCatalog();
    renderTable();
    document.getElementById('grossiste-product-modal').classList.remove('active');
    if (window.GrossisteApp) {
      window.GrossisteApp.refreshAllKpis();
      window.GrossisteApp.toast(`✅ Référence « ${name} » enregistrée dans le catalogue B2B.`, 'success');
    }
  }

  function deleteItem(itemId) {
    catalogItems = catalogItems.filter(i => i.id !== itemId);
    saveCatalog();
    renderTable();
    if (window.GrossisteApp) {
      window.GrossisteApp.refreshAllKpis();
      window.GrossisteApp.toast('🗑️ Référence retirée du catalogue.', 'info');
    }
  }

  /**
   * Import CSV sécurisé (anti-injection via PGNetwork.parseSafeCsv)
   */
  function importCatalogCsv(fileInput, currentWholesaler) {
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = window.PGNetwork
        ? window.PGNetwork.parseSafeCsv(e.target.result)
        : { rows: [] };

      let count = 0;
      parsed.rows.forEach((cols, idx) => {
        const name = cols[0];
        if (!name) return;
        const wPrice = parseInt(cols[1], 10) || 1000;
        const pPrice = parseInt(cols[2], 10) || Math.round(wPrice * 1.33);
        const qty = isNaN(parseInt(cols[3], 10)) ? 100 : parseInt(cols[3], 10);
        const lab = cols[4] || 'Générique';
        const dci = cols[5] || name;
        const promo = cols[6] || '';

        catalogItems.unshift({
          id: 'csv_cat_' + Date.now() + '_' + idx,
          wholesaler_id: (currentWholesaler && currentWholesaler.id) || 'ws_ubipharm_dla',
          product_code: 'CIP-CSV-' + (idx + 1),
          product_name: name,
          product_key: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
          dci,
          lab_name: lab,
          category: 'Médicament',
          wholesale_price: wPrice,
          pharmacy_price: pPrice,
          stock_quantity: qty,
          alert_threshold: 25,
          min_order_qty: 5,
          in_stock: qty > 0,
          is_promoted: Boolean(promo),
          promo_offer: promo,
          updated_at: new Date().toISOString()
        });
        count++;
      });

      saveCatalog();
      renderTable();
      if (window.GrossisteApp) {
        window.GrossisteApp.refreshAllKpis();
        window.GrossisteApp.toast(`✅ ${count} références importées avec protection anti-injection CSV !`, 'success');
      }
      fileInput.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  }

  function exportCatalogCSV(wholesaler) {
    if (!window.PGReports) return;
    const items = getFilteredItems();
    window.PGReports.exportCSV({
      filename: `Catalogue_B2B_${(wholesaler && wholesaler.wholesaler_code) || 'Grossiste'}_${new Date().toISOString().slice(0, 10)}.csv`,
      headers: ['Code CIP', 'Produit', 'DCI', 'Laboratoire', 'Categorie', 'Prix Cession HT (FCFA)', 'Prix Officine (FCFA)', 'Stock', 'Offre Promo'],
      rows: items.map(i => [
        i.product_code || '',
        i.product_name || '',
        i.dci || '',
        i.lab_name || '',
        i.category || '',
        i.wholesale_price || 0,
        i.pharmacy_price || 0,
        i.stock_quantity || 0,
        i.promo_offer || ''
      ])
    });
  }

  function exportCatalogPDF(wholesaler) {
    if (!window.PGReports) return;
    const items = getFilteredItems();
    const inStockCount = items.filter(i => i.stock_quantity > 0).length;
    window.PGReports.exportPDF({
      filename: `Catalogue_Officiel_${(wholesaler && wholesaler.wholesaler_code) || 'Grossiste'}.pdf`,
      title: 'CATALOGUE OFFICIEL & TARIFS DE CESSION B2B',
      subtitle: 'Grille tarifaire réservée aux Pharmacies d\'Officine agréées',
      entityName: (wholesaler && wholesaler.company_name) || 'Grossiste-Répartiteur Pharma-Garde',
      entityCode: (wholesaler && wholesaler.wholesaler_code) || 'GR-PRO',
      periodLabel: `Tarif en vigueur au ${new Date().toLocaleDateString('fr-FR')}`,
      kpis: [
        { label: 'Total Références', value: String(items.length) },
        { label: 'Disponibles en Stock', value: String(inStockCount) },
        { label: 'Offres Promotionnelles', value: String(items.filter(i => i.is_promoted).length) },
        { label: 'Délai Livraison', value: `${(wholesaler && wholesaler.delivery_delay_hours) || 6}h` }
      ],
      tables: [
        {
          title: 'Références Pharmaceutiques & Conditions B2B',
          headers: ['Code', 'Désignation & DCI', 'Laboratoire', 'Prix Cession HT', 'Prix Public', 'Stock', 'Condition / Promo'],
          rows: items.map(i => [
            i.product_code || '—',
            `${i.product_name} (${i.dci || '—'})`,
            i.lab_name || '—',
            `${Number(i.wholesale_price || 0).toLocaleString('fr-FR')} F`,
            `${Number(i.pharmacy_price || 0).toLocaleString('fr-FR')} F`,
            i.stock_quantity > 0 ? `${i.stock_quantity} btes` : 'RUPTURE',
            i.promo_offer || `Min. ${i.min_order_qty || 1}`
          ])
        }
      ]
    });
  }

  window.GrossisteCatalog = {
    loadCatalog,
    saveCatalog,
    syncWithSupabase,
    getCatalog: () => catalogItems.length ? catalogItems : loadCatalog(),
    getFilteredItems,
    renderTable,
    setFilter,
    adjustStock,
    toggleRupture,
    openEditModal,
    saveFromModal,
    deleteItem,
    importCatalogCsv,
    exportCatalogCSV,
    exportCatalogPDF
  };
})(window);

