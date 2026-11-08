/**
 * Pharma-Garde v9.0 — Espace Grossiste : Campagnes B2B, Arrivages & Réponse aux Ruptures Officines
 * • Diffusion d'arrivages et promotions B2B vers les Pharmacies et Délégués Médicaux
 * • Réception des alertes de ruptures des pharmacies avec proposition de réapprovisionnement immédiat
 * Expose : window.GrossisteCampaigns
 */
(function (window) {
  'use strict';

  const CAMPAIGNS_STORAGE_KEY = 'pharmagarde_wholesaler_campaigns_v9';

  const DEFAULT_CAMPAIGNS = [
    {
      id: 'wcamp_1',
      wholesaler_id: 'ws_ubipharm_dla',
      wholesaler_name: 'UBIPHARM CAMEROUN SA',
      title: 'Grand Arrivage Antibiotiques & Antipaludéens (Saison des pluies)',
      product_name: 'Augmentin 1g / Coartem 80/480mg',
      lab_name: 'GSK / Novartis',
      offer_type: 'gratuites',
      discount_percent: 15,
      offer_details: 'Offre B2B : 10 boîtes achetées = +2 boîtes gratuites · Livraison express 4h sur Douala & Yaoundé.',
      min_quantity: 10,
      unit_price: 4950,
      target_audience: 'both',
      target_cities: ['Douala', 'Yaoundé', 'Bafoussam'],
      valid_until: '2026-12-31',
      views_count: 142,
      orders_count: 28,
      is_active: true,
      created_at: new Date(Date.now() - 2 * 86400000).toISOString()
    },
    {
      id: 'wcamp_2',
      wholesaler_id: 'ws_laborex_dla',
      wholesaler_name: 'LABOREX CAMEROUN',
      title: 'Disponibilité Immédiate : Ventoline 100µg & Cardiologie',
      product_name: 'Ventoline 100µg Inhalateur',
      lab_name: 'GSK',
      offer_type: 'arrivage',
      discount_percent: 8,
      offer_details: 'Stock sécurisé de 2 500 unités pour couvrir les ruptures signalées par les officines.',
      min_quantity: 5,
      unit_price: 2450,
      target_audience: 'pharmacies',
      target_cities: ['Douala', 'Yaoundé', 'Bamenda', 'Garoua'],
      valid_until: '2026-12-15',
      views_count: 98,
      orders_count: 19,
      is_active: true,
      created_at: new Date(Date.now() - 5 * 86400000).toISOString()
    }
  ];

  const DEFAULT_RUPTURE_ALERTS = [
    {
      id: 'ral_1',
      pharmacy_name: 'Pharmacie du Centre (Akwa)',
      pharmacy_city: 'Douala',
      pharmacy_phone: '699112233',
      product_name: 'Ventoline 100µg Inhalateur',
      urgency: 'critical',
      message: 'Rupture totale depuis ce matin, 8 demandes patients en attente.',
      created_at: new Date(Date.now() - 35 * 60000).toISOString()
    },
    {
      id: 'ral_2',
      pharmacy_name: 'Pharmacie de la Paix (Biyem-Assi)',
      pharmacy_city: 'Yaoundé',
      pharmacy_phone: '677334455',
      product_name: 'Insuline Lantus Solostar 100 UI/ml',
      urgency: 'urgent',
      message: 'Besoin de 15 boîtes en chaîne du froid certifiée.',
      created_at: new Date(Date.now() - 3 * 3600000).toISOString()
    },
    {
      id: 'ral_3',
      pharmacy_name: 'Pharmacie de Bonamoussadi',
      pharmacy_city: 'Douala',
      pharmacy_phone: '677889900',
      product_name: 'Azithromycine 500mg',
      urgency: 'normal',
      message: 'Stock sous le seuil critique, réapprovisionnement souhaité.',
      created_at: new Date(Date.now() - 6 * 3600000).toISOString()
    }
  ];

  let campaigns = [];
  let ruptureAlerts = DEFAULT_RUPTURE_ALERTS.slice();

  function esc(v) {
    return window.PGNetwork ? window.PGNetwork.escapeHtml(v) : String(v || '');
  }

  function loadCampaigns() {
    try {
      const saved = localStorage.getItem(CAMPAIGNS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          campaigns = parsed;
          return campaigns;
        }
      }
    } catch (e) {}
    campaigns = DEFAULT_CAMPAIGNS.slice();
    saveCampaigns();
    return campaigns;
  }

  function saveCampaigns() {
    try {
      localStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(campaigns));
    } catch (e) {}
  }

  async function syncWithSupabase() {
    loadCampaigns();
    if (!window.supabase) return;
    try {
      const { data: campData } = await window.supabase
        .from('wholesaler_campaigns')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (Array.isArray(campData) && campData.length > 0) {
        campaigns = campData;
        saveCampaigns();
      }

      const { data: alertData } = await window.supabase
        .from('stock_alerts')
        .select('*')
        .eq('is_resolved', false)
        .order('created_at', { ascending: false })
        .limit(30);
      if (Array.isArray(alertData) && alertData.length > 0) {
        ruptureAlerts = alertData.map(a => ({
          id: a.id,
          pharmacy_name: a.pharmacy_name || 'Officine du Réseau',
          pharmacy_city: a.city || 'Cameroun',
          pharmacy_phone: a.pharmacy_phone || '',
          product_name: a.product_name,
          urgency: a.urgency || 'urgent',
          message: a.message || 'Rupture de stock signalée par l\'officine.',
          created_at: a.created_at
        }));
      }
    } catch (e) {}
  }

  function renderCampaignsAndAlerts() {
    loadCampaigns();
    const campContainer = document.getElementById('grossiste-campaigns-list');
    if (campContainer) {
      if (campaigns.length === 0) {
        campContainer.innerHTML = `<div class="grossiste-card" style="text-align:center;color:#94a3b8;">Aucune campagne diffusée.</div>`;
      } else {
        campContainer.innerHTML = campaigns.map(c => {
          const audBadge = c.target_audience === 'both'
            ? '🏥 Pharmacies & 💼 Délégués'
            : c.target_audience === 'delegates'
              ? '💼 Délégués Médicaux'
              : '🏥 Pharmacies d\'Officine';

          return `
            <div class="grossiste-card" style="border-color:rgba(16,185,129,0.3);">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
                <div>
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
                    <span style="background:rgba(251,191,36,0.2);color:#fbbf24;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:800;text-transform:uppercase;">
                      🎁 ${esc(c.offer_type || 'Arrivage')}
                    </span>
                    <span style="font-size:11.5px;color:#34d399;font-weight:700;">Cible : ${audBadge}</span>
                  </div>
                  <h4 style="font-size:15px;font-weight:900;color:#fff;margin:4px 0;">${esc(c.title)}</h4>
                  <div style="font-size:13px;font-weight:700;color:#60a5fa;">
                    💊 ${esc(c.product_name)} ${c.lab_name ? `· <span style="color:#cbd5e1;">Labo: ${esc(c.lab_name)}</span>` : ''}
                  </div>
                  <p style="font-size:12.5px;color:#cbd5e1;margin:8px 0;line-height:1.45;">${esc(c.offer_details || '')}</p>
                  <div style="font-size:11px;color:#94a3b8;">
                    📍 Zones : ${esc((c.target_cities || ['Cameroun']).join(', '))} · Tarif cession : <strong>${Number(c.unit_price || 0).toLocaleString('fr-FR')} FCFA</strong> (Min. ${Number(c.min_quantity || 1)} btes)
                  </div>
                </div>
                <div style="text-align:right;min-width:130px;">
                  <div style="font-size:12px;color:#34d399;font-weight:800;">👁️ ${Number(c.views_count || 12)} vues</div>
                  <div style="font-size:12px;color:#fbbf24;font-weight:800;margin-top:2px;">🛒 ${Number(c.orders_count || 3)} commandes</div>
                  <button type="button" class="btn btn--ghost btn--sm" style="margin-top:8px;color:#f87171;font-size:11px;" onclick="GrossisteCampaigns.deleteCampaign('${esc(c.id)}')">
                    🗑️ Retirer
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    const alertsContainer = document.getElementById('grossiste-rupture-alerts-list');
    if (alertsContainer) {
      alertsContainer.innerHTML = ruptureAlerts.map(a => {
        const urgColor = a.urgency === 'critical' ? '#ef4444' : a.urgency === 'urgent' ? '#f59e0b' : '#3b82f6';
        return `
          <div class="grossiste-card" style="border-left:4px solid ${urgColor};padding:14px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
              <div>
                <div style="font-size:14px;font-weight:900;color:#fff;">
                  ⚠️ Rupture : <span style="color:#fbbf24;">${esc(a.product_name)}</span>
                </div>
                <div style="font-size:12.5px;color:#34d399;font-weight:700;margin-top:2px;">
                  🏥 ${esc(a.pharmacy_name)} (${esc(a.pharmacy_city)})
                </div>
                <div style="font-size:12px;color:#cbd5e1;margin-top:4px;">${esc(a.message)}</div>
              </div>
              <button type="button" class="btn btn--primary btn--sm" style="background:linear-gradient(135deg,#10b981,#059669);font-weight:800;white-space:nowrap;" onclick="GrossisteCampaigns.proposeRestock('${esc(a.id)}')">
                ⚡ Proposer Réappro Immédiat
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  function openNewCampaignModal(currentWholesaler) {
    const pushModal = () => {
      const m = document.getElementById('grossiste-campaign-modal');
      if (m) m.classList.add('active');
    };
    if (window.PGSubscription) {
      window.PGSubscription.enforcePaywall(
        currentWholesaler,
        'wholesaler',
        'la diffusion de campagnes B2B aux Pharmacies & Délégués',
        pushModal
      );
    } else {
      pushModal();
    }
  }

  async function saveCampaignFromModal(currentWholesaler) {
    const title = (document.getElementById('gcamp-title').value || '').trim();
    const product = (document.getElementById('gcamp-product').value || '').trim();
    if (!title || !product) {
      if (window.GrossisteApp) window.GrossisteApp.toast('❌ Veuillez indiquer le titre de la campagne et le produit concerné.', 'error');
      return;
    }

    const newCamp = {
      id: 'wcamp_' + Date.now(),
      wholesaler_id: (currentWholesaler && currentWholesaler.id) || 'ws_ubipharm_dla',
      wholesaler_name: (currentWholesaler && currentWholesaler.company_name) || 'Grossiste-Répartiteur',
      title,
      product_name: product,
      lab_name: (document.getElementById('gcamp-lab').value || '').trim(),
      offer_type: document.getElementById('gcamp-type').value || 'arrivage',
      unit_price: Number(document.getElementById('gcamp-price').value) || 0,
      min_quantity: Number(document.getElementById('gcamp-minqty').value) || 5,
      target_audience: document.getElementById('gcamp-audience').value || 'both',
      offer_details: (document.getElementById('gcamp-details').value || '').trim(),
      target_cities: ['Douala', 'Yaoundé', 'Bafoussam'],
      views_count: 1,
      orders_count: 0,
      is_active: true,
      created_at: new Date().toISOString()
    };

    campaigns.unshift(newCamp);
    saveCampaigns();
    renderCampaignsAndAlerts();
    document.getElementById('grossiste-campaign-modal').classList.remove('active');

    if (window.GrossisteApp) {
      window.GrossisteApp.refreshAllKpis();
      window.GrossisteApp.toast('📢 Campagne B2B diffusée aux Pharmacies et Délégués Médicaux !', 'success');
    }
  }

  function deleteCampaign(id) {
    campaigns = campaigns.filter(c => c.id !== id);
    saveCampaigns();
    renderCampaignsAndAlerts();
  }

  function proposeRestock(alertId) {
    const alertItem = ruptureAlerts.find(a => a.id === alertId);
    if (!alertItem) return;

    if (window.GrossisteApp) {
      window.GrossisteApp.toast(`✅ Offre de réapprovisionnement immédiat pour « ${alertItem.product_name} » envoyée à ${alertItem.pharmacy_name} !`, 'success');
    }
    ruptureAlerts = ruptureAlerts.filter(a => a.id !== alertId);
    renderCampaignsAndAlerts();
  }

  window.GrossisteCampaigns = {
    loadCampaigns,
    saveCampaigns,
    syncWithSupabase,
    getCampaigns: () => campaigns.length ? campaigns : loadCampaigns(),
    renderCampaignsAndAlerts,
    openNewCampaignModal,
    saveCampaignFromModal,
    deleteCampaign,
    proposeRestock
  };
})(window);
