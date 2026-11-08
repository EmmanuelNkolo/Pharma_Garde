/**
 * Pharma-Garde v9.0 — Espace Grossiste : Gestion des Commandes B2B des Officines
 * • Suivi temps réel du cycle de commande : En attente -> Confirmée -> En préparation -> En livraison -> Livrée
 * • Génération du Bon de Livraison / Facture Proforma B2B en PDF
 * • Création de commandes depuis l'espace Pharmacie ou l'espace Grossiste
 * Expose : window.GrossisteOrders
 */
(function (window) {
  'use strict';

  const ORDERS_STORAGE_KEY = 'pharmagarde_wholesaler_orders_v9';

  const DEFAULT_ORDERS = [
    {
      id: 'ord_1',
      order_code: 'CMD-849201',
      wholesaler_id: 'ws_ubipharm_dla',
      pharmacy_id: 'ph_demo_1',
      pharmacy_name: 'Pharmacie du Centre (Akwa)',
      pharmacy_phone: '699112233',
      pharmacy_city: 'Douala',
      urgency: 'critical',
      status: 'pending',
      items: [
        { product_name: 'Augmentin 1g Adultes (8 sachets)', qty: 30, unit_price: 4950, subtotal: 148500 },
        { product_name: 'Ventoline 100µg Inhalateur', qty: 20, unit_price: 2450, subtotal: 49000 },
        { product_name: 'Coartem 80/480mg (6 comprimés)', qty: 50, unit_price: 2800, subtotal: 140000 }
      ],
      total_amount: 337500,
      delivery_address: 'Boulevard de la Liberté, Akwa, Douala',
      notes: 'Rupture critique sur Ventoline et Augmentin suite à forte demande garde de nuit.',
      created_at: new Date(Date.now() - 25 * 60 * 1000).toISOString()
    },
    {
      id: 'ord_2',
      order_code: 'CMD-849185',
      wholesaler_id: 'ws_ubipharm_dla',
      pharmacy_id: 'ph_demo_2',
      pharmacy_name: 'Pharmacie de Bonamoussadi',
      pharmacy_phone: '677889900',
      pharmacy_city: 'Douala',
      urgency: 'urgent',
      status: 'confirmed',
      items: [
        { product_name: 'Doliprane 1000mg (Boîte de 8)', qty: 100, unit_price: 890, subtotal: 89000 },
        { product_name: 'Azithromycine 500mg (3 comprimés)', qty: 25, unit_price: 3100, subtotal: 77500 }
      ],
      total_amount: 166500,
      delivery_address: 'Carrefour Maçon, Bonamoussadi, Douala',
      notes: 'Livraison souhaitée avant 15h00.',
      confirmed_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      created_at: new Date(Date.now() - 95 * 60 * 1000).toISOString()
    },
    {
      id: 'ord_3',
      order_code: 'CMD-848940',
      wholesaler_id: 'ws_ubipharm_dla',
      pharmacy_id: 'ph_demo_3',
      pharmacy_name: 'Pharmacie du Soleil (Bastos)',
      pharmacy_phone: '694223344',
      pharmacy_city: 'Yaoundé',
      urgency: 'normal',
      status: 'shipped',
      items: [
        { product_name: 'Ceftriaxone 1g Injectable IM/IV', qty: 40, unit_price: 3350, subtotal: 134000 },
        { product_name: 'Oméprazole 20mg (14 gélules)', qty: 60, unit_price: 1600, subtotal: 96000 }
      ],
      total_amount: 230000,
      delivery_address: 'Quartier Bastos, Yaoundé',
      notes: 'Commande hebdomadaire.',
      created_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString()
    },
    {
      id: 'ord_4',
      order_code: 'CMD-848512',
      wholesaler_id: 'ws_ubipharm_dla',
      pharmacy_id: 'ph_demo_4',
      pharmacy_name: 'Pharmacie Les Palmiers',
      pharmacy_phone: '691556677',
      pharmacy_city: 'Douala',
      urgency: 'normal',
      status: 'delivered',
      items: [
        { product_name: 'Spasfon Lyoc 80mg', qty: 50, unit_price: 1350, subtotal: 67500 },
        { product_name: 'Smecta Orange-Vanille', qty: 40, unit_price: 2700, subtotal: 108000 }
      ],
      total_amount: 175500,
      delivery_address: 'Cité des Palmiers, Douala',
      delivered_at: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
      created_at: new Date(Date.now() - 22 * 3600 * 1000).toISOString()
    }
  ];

  let orders = [];
  let statusFilter = 'all';

  function esc(v) {
    return window.PGNetwork ? window.PGNetwork.escapeHtml(v) : String(v || '');
  }

  function loadOrders() {
    try {
      const saved = localStorage.getItem(ORDERS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          orders = parsed;
          return orders;
        }
      }
    } catch (e) {}
    orders = DEFAULT_ORDERS.slice();
    saveOrders();
    return orders;
  }

  function saveOrders() {
    try {
      localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
    } catch (e) {}
  }

  async function syncWithSupabase(wholesalerId) {
    loadOrders();
    if (!window.supabase) return orders;
    try {
      let query = window.supabase.from('wholesaler_orders').select('*').order('created_at', { ascending: false });
      if (wholesalerId && !wholesalerId.startsWith('ws_')) {
        query = query.eq('wholesaler_id', wholesalerId);
      }
      const { data, error } = await query.limit(100);
      if (!error && Array.isArray(data) && data.length > 0) {
        orders = data;
        saveOrders();
      }
    } catch (e) {}
    return orders;
  }

  function getStatusMeta(status) {
    const map = {
      pending: { label: '⏳ En attente', cls: 'b2b-status--pending', next: 'confirmed', nextLabel: '✅ Confirmer la commande' },
      confirmed: { label: '📋 Confirmée', cls: 'b2b-status--confirmed', next: 'preparing', nextLabel: '📦 Mettre en préparation' },
      preparing: { label: '📦 En préparation', cls: 'b2b-status--preparing', next: 'shipped', nextLabel: '🚚 Expédier (Livreur)' },
      shipped: { label: '🚚 En livraison', cls: 'b2b-status--shipped', next: 'delivered', nextLabel: '🏁 Confirmer la livraison' },
      delivered: { label: '✅ Livrée & Clôturée', cls: 'b2b-status--delivered', next: null, nextLabel: '' },
      cancelled: { label: '❌ Annulée', cls: 'b2b-status--cancelled', next: null, nextLabel: '' },
      rejected: { label: '🚫 Refusée / Rupture', cls: 'b2b-status--rejected', next: null, nextLabel: '' }
    };
    return map[status] || map.pending;
  }

  function setStatusFilter(st) {
    statusFilter = st || 'all';
    document.querySelectorAll('#grossiste-order-filters .time-pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-status') === statusFilter);
    });
    renderOrdersList();
  }

  function renderOrdersList() {
    loadOrders();
    const container = document.getElementById('grossiste-orders-list');
    if (!container) return;

    const pendingCount = orders.filter(o => o.status === 'pending').length;
    const badge = document.getElementById('tab-badge-orders');
    if (badge) badge.textContent = pendingCount;

    const filtered = statusFilter === 'all'
      ? orders
      : orders.filter(o => o.status === statusFilter);

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="grossiste-card" style="text-align:center;padding:32px;color:#94a3b8;">
          Aucune commande B2B dans ce statut pour le moment.
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(ord => {
      const meta = getStatusMeta(ord.status);
      const urgLabel = ord.urgency === 'critical'
        ? '<span style="background:rgba(239,68,68,0.2);color:#f87171;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:900;">🚨 URGENCE CRITIQUE</span>'
        : ord.urgency === 'urgent'
          ? '<span style="background:rgba(245,158,11,0.2);color:#fbbf24;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:800;">⚡ URGENT</span>'
          : '<span style="background:rgba(148,163,184,0.15);color:#cbd5e1;padding:2px 8px;border-radius:999px;font-size:10.5px;">Standard</span>';

      const items = Array.isArray(ord.items) ? ord.items : [];
      const createdDate = new Date(ord.created_at).toLocaleString('fr-FR', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
      });

      const cleanPhone = String(ord.pharmacy_phone || '').replace(/\D/g, '').replace(/^237/, '');
      const waMsg = encodeURIComponent(`Bonjour ${ord.pharmacy_name}, concernant votre commande B2B ${ord.order_code} (${Number(ord.total_amount || 0).toLocaleString('fr-FR')} FCFA) sur Pharma-Garde...`);

      return `
        <div class="b2b-order-card ${esc(ord.urgency || 'normal')}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
            <div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="font-size:15px;font-weight:900;color:#fbbf24;letter-spacing:0.5px;">${esc(ord.order_code)}</span>
                <span class="b2b-status-badge ${meta.cls}">${meta.label}</span>
                ${urgLabel}
              </div>
              <div style="font-size:15px;font-weight:800;color:#fff;margin-top:4px;">
                🏥 ${esc(ord.pharmacy_name || 'Pharmacie Partenaire')} — <span style="color:#34d399;">${esc(ord.pharmacy_city || 'Douala')}</span>
              </div>
              <div style="font-size:11.5px;color:#94a3b8;margin-top:2px;">
                📍 ${esc(ord.delivery_address || 'Adresse officine')} · Reçue le ${esc(createdDate)}
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Montant Total HT</div>
              <div style="font-size:20px;font-weight:900;color:#34d399;">${Number(ord.total_amount || 0).toLocaleString('fr-FR')} FCFA</div>
              <div style="font-size:11px;color:#64748b;">${items.length} ligne(s) produit</div>
            </div>
          </div>

          <!-- Détail des lignes de commande -->
          <div style="background:rgba(0,0,0,0.28);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:10px 12px;margin-bottom:12px;">
            ${items.map(it => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px dashed rgba(255,255,255,0.06);font-size:12.5px;">
                <span style="color:#e2e8f0;font-weight:600;">• ${esc(it.product_name)} <strong style="color:#fbbf24;">× ${Number(it.qty || 1)}</strong></span>
                <span style="color:#cbd5e1;font-weight:700;">${Number(it.subtotal || (it.qty * it.unit_price) || 0).toLocaleString('fr-FR')} FCFA</span>
              </div>
            `).join('')}
            ${ord.notes ? `<div style="margin-top:8px;font-size:11.5px;color:#fcd34d;">💬 <em>Note de l'officine : ${esc(ord.notes)}</em></div>` : ''}
          </div>

          <!-- Actions de traitement -->
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              ${meta.next ? `
                <button type="button" class="btn btn--primary btn--sm" style="background:linear-gradient(135deg,#10b981,#059669);font-weight:800;" onclick="GrossisteOrders.advanceOrderStatus('${esc(ord.id)}', '${meta.next}')">
                  ${meta.nextLabel}
                </button>
              ` : ''}
              ${ord.status === 'pending' ? `
                <button type="button" class="btn btn--secondary btn--sm" style="border-color:rgba(239,68,68,0.4);color:#f87171;" onclick="GrossisteOrders.advanceOrderStatus('${esc(ord.id)}', 'rejected')">
                  🚫 Refuser (Rupture)
                </button>
              ` : ''}
              <button type="button" class="btn btn--secondary btn--sm" onclick="GrossisteOrders.exportDeliveryNotePDF('${esc(ord.id)}')">
                📄 Bon de Livraison PDF
              </button>
              <button type="button" class="btn btn--secondary btn--sm" style="color:#60a5fa;border-color:rgba(96,165,250,0.38);" onclick="GrossisteOrders.openPharmacyIdentity('${esc(ord.id)}')">
                🪪 Identité &amp; Position GPS Officine
              </button>
            </div>
            <div style="display:flex;gap:6px;">
              ${cleanPhone ? `
                <a href="https://wa.me/237${cleanPhone}?text=${waMsg}" target="_blank" rel="noopener noreferrer" class="btn btn--secondary btn--sm" style="color:#34d399;border-color:rgba(16,185,129,0.35);text-decoration:none;">
                  💬 WhatsApp Officine
                </a>
                <a href="tel:+237${cleanPhone}" class="btn btn--secondary btn--sm" style="text-decoration:none;">
                  📞 Appeler
                </a>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  async function advanceOrderStatus(orderId, newStatus) {
    loadOrders();
    const ord = orders.find(o => o.id === orderId);
    if (!ord) return;

    ord.status = newStatus;
    const nowIso = new Date().toISOString();
    if (newStatus === 'confirmed') ord.confirmed_at = nowIso;
    if (newStatus === 'shipped') ord.shipped_at = nowIso;
    if (newStatus === 'delivered') ord.delivered_at = nowIso;
    ord.updated_at = nowIso;

    saveOrders();
    renderOrdersList();

    if (window.GrossisteApp) {
      window.GrossisteApp.refreshAllKpis();
      const meta = getStatusMeta(newStatus);
      window.GrossisteApp.toast(`📦 Commande ${ord.order_code} passée au statut : ${meta.label}`, 'success');
    }

    if (window.supabase && !String(ord.id).startsWith('ord_')) {
      try {
        await window.supabase.from('wholesaler_orders').update({
          status: newStatus,
          confirmed_at: ord.confirmed_at,
          shipped_at: ord.shipped_at,
          delivered_at: ord.delivered_at,
          updated_at: nowIso
        }).eq('id', ord.id);
      } catch (e) {}
    }
  }

  /**
   * Permet à une Pharmacie (depuis pharmacien.html) de passer une commande B2B vers un Grossiste
   */
  async function createOrderFromPharmacy(orderPayload) {
    loadOrders();
    const p = orderPayload || {};
    const code = 'CMD-' + Math.floor(100000 + Math.random() * 900000);
    const items = Array.isArray(p.items) ? p.items : [];
    const total = items.reduce((sum, it) => sum + ((Number(it.qty) || 1) * (Number(it.unit_price) || 0)), 0);

    const newOrd = {
      id: 'ord_' + Date.now(),
      order_code: code,
      wholesaler_id: p.wholesaler_id || 'ws_ubipharm_dla',
      wholesaler_name: p.wholesaler_name || 'UBIPHARM CAMEROUN SA',
      pharmacy_id: p.pharmacy_id || 'ph_current',
      pharmacy_name: p.pharmacy_name || 'Pharmacie Officine',
      pharmacy_phone: p.pharmacy_phone || '',
      pharmacy_city: p.pharmacy_city || 'Douala',
      urgency: p.urgency || 'urgent',
      status: isAutoConfirmEnabled() ? 'confirmed' : 'pending',
      confirmed_at: isAutoConfirmEnabled() ? new Date().toISOString() : undefined,
      items,
      total_amount: total,
      delivery_address: p.delivery_address || 'Officine',
      notes: p.notes || '',
      created_at: new Date().toISOString()
    };

    orders.unshift(newOrd);
    saveOrders();

    if (window.supabase) {
      try {
        await window.supabase.from('wholesaler_orders').insert({
          order_code: newOrd.order_code,
          wholesaler_id: newOrd.wholesaler_id,
          pharmacy_name: newOrd.pharmacy_name,
          pharmacy_phone: newOrd.pharmacy_phone,
          pharmacy_city: newOrd.pharmacy_city,
          urgency: newOrd.urgency,
          status: 'pending',
          items: newOrd.items,
          total_amount: newOrd.total_amount,
          delivery_address: newOrd.delivery_address,
          notes: newOrd.notes
        });
      } catch (e) {}
    }

    return newOrd;
  }

  function exportDeliveryNotePDF(orderId) {
    loadOrders();
    const ord = orders.find(o => o.id === orderId);
    if (!ord || !window.PGReports) return;

    const ws = (window.GrossisteAuth && window.GrossisteAuth.loadSession()) || { company_name: 'UBIPHARM CAMEROUN SA', wholesaler_code: 'GR-UBI237' };
    const meta = getStatusMeta(ord.status);

    window.PGReports.exportPDF({
      filename: `Bon_Livraison_${ord.order_code}.pdf`,
      title: `BON DE LIVRAISON / PROFORMA B2B N° ${ord.order_code}`,
      subtitle: `Émis par ${ws.company_name || 'Grossiste-Répartiteur'} pour ${ord.pharmacy_name}`,
      entityName: ws.company_name || 'Grossiste-Répartiteur Agréé',
      entityCode: ord.order_code,
      periodLabel: `Statut : ${meta.label}`,
      kpis: [
        { label: 'Officine Destinataire', value: ord.pharmacy_name || 'Pharmacie' },
        { label: 'Ville', value: ord.pharmacy_city || 'Douala' },
        { label: 'Nombre de Références', value: String((ord.items || []).length) },
        { label: 'Total Net HT', value: `${Number(ord.total_amount || 0).toLocaleString('fr-FR')} FCFA` }
      ],
      tables: [
        {
          title: 'Détail des Produits Commandés',
          headers: ['Désignation du Produit', 'Quantité', 'Prix Unitaire HT (FCFA)', 'Sous-Total HT (FCFA)'],
          rows: (ord.items || []).map(it => [
            it.product_name || 'Produit',
            String(it.qty || 1),
            Number(it.unit_price || 0).toLocaleString('fr-FR'),
            Number(it.subtotal || (it.qty * it.unit_price) || 0).toLocaleString('fr-FR')
          ])
        }
      ]
    });
  }

  function isAutoConfirmEnabled() {
    try {
      const v = localStorage.getItem('pg_grossiste_auto_confirm_v95');
      return v === null ? true : v === '1';
    } catch (e) {
      return true;
    }
  }

  function toggleAutoConfirm(enabled) {
    try {
      localStorage.setItem('pg_grossiste_auto_confirm_v95', enabled ? '1' : '0');
    } catch (e) {}
    if (window.GrossisteApp) {
      window.GrossisteApp.toast(
        enabled
          ? '🤖 Validation automatique des commandes entrantes activée.'
          : '⏸️ Validation automatique désactivée (mode manuel).',
        'success'
      );
    }
  }

  function autoConfirmAllPending() {
    loadOrders();
    const pendingList = orders.filter(o => o.status === 'pending');
    if (pendingList.length === 0) {
      if (window.GrossisteApp) window.GrossisteApp.toast('✅ Aucune commande en attente — Tout est déjà traité !', 'success');
      return 0;
    }
    const nowIso = new Date().toISOString();
    pendingList.forEach(o => {
      o.status = 'confirmed';
      o.confirmed_at = nowIso;
      o.updated_at = nowIso;
    });
    saveOrders();
    renderOrdersList();
    if (window.GrossisteApp) {
      window.GrossisteApp.refreshAllKpis();
      window.GrossisteApp.toast(`⚡ ${pendingList.length} commande(s) B2B confirmée(s) automatiquement en 1 clic !`, 'success');
    }
    return pendingList.length;
  }

  function autoAdvanceConfirmedToShipped() {
    loadOrders();
    const confList = orders.filter(o => o.status === 'confirmed' || o.status === 'preparing');
    if (confList.length === 0) {
      if (window.GrossisteApp) window.GrossisteApp.toast('ℹ️ Aucune commande confirmée en attente d\'expédition.', 'success');
      return 0;
    }
    const nowIso = new Date().toISOString();
    confList.forEach(o => {
      o.status = 'shipped';
      o.shipped_at = nowIso;
      o.updated_at = nowIso;
    });
    saveOrders();
    renderOrdersList();
    if (window.GrossisteApp) {
      window.GrossisteApp.refreshAllKpis();
      window.GrossisteApp.toast(`🚚 ${confList.length} commande(s) passée(s) en statut « En livraison » !`, 'success');
    }
    return confList.length;
  }

  function openPharmacyIdentity(orderId) {
    loadOrders();
    const ord = orders.find(o => o.id === orderId);
    if (!ord || !window.PGProGeo) return;
    window.PGProGeo.openActorModal('pharmacy', {
      id: ord.pharmacy_id,
      name: ord.pharmacy_name,
      city: ord.pharmacy_city || 'Douala',
      phone: ord.pharmacy_phone || '',
      address: ord.delivery_address || ord.pharmacy_city || 'Douala'
    });
  }

  window.GrossisteOrders = {
    loadOrders,
    saveOrders,
    syncWithSupabase,
    getOrders: () => orders.length ? orders : loadOrders(),
    setStatusFilter,
    renderOrdersList,
    advanceOrderStatus,
    createOrderFromPharmacy,
    exportDeliveryNotePDF,
    toggleAutoConfirm,
    autoConfirmAllPending,
    autoAdvanceConfirmedToShipped,
    openPharmacyIdentity
  };
})(window);

