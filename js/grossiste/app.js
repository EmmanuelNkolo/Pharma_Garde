/**
 * Pharma-Garde v9.0 — Contrôleur Principal de l'Espace Grossiste-Répartiteur
 * Orchestre : Auth, Catalogue, Commandes B2B, Campagnes, Statistiques, Abonnements & Temps Réel
 * Expose : window.GrossisteApp
 */
(function (window) {
  'use strict';

  let currentWholesaler = null;
  let activeTab = 'catalog';

  function toast(msg, type) {
    const t = document.getElementById('toast');
    const m = document.getElementById('toast-message');
    if (!t || !m) return;
    t.className = 'toast toast--' + (type || 'success');
    m.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 3600);
  }

  function init() {
    if (typeof I18n !== 'undefined') I18n.init();
    bindAuthEvents();
    bindDashboardEvents();

    const saved = window.GrossisteAuth ? window.GrossisteAuth.loadSession() : null;
    if (saved) {
      currentWholesaler = saved;
      showDashboard();
    } else {
      showAuthView('login');
    }
  }

  function showAuthView(view) {
    ['login', 'register', 'reset'].forEach(v => {
      const el = document.getElementById('g-' + v + '-form');
      if (el) el.classList.toggle('hidden', v !== view);
    });
  }

  function bindAuthEvents() {
    document.querySelectorAll('[data-g-view]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        showAuthView(btn.getAttribute('data-g-view'));
      });
    });

    // Connexion rapide démo en 1 clic
    document.querySelectorAll('[data-demo-ws]').forEach(btn => {
      btn.addEventListener('click', () => {
        const wsId = btn.getAttribute('data-demo-ws');
        const list = window.GrossisteAuth.getDirectory();
        const found = list.find(w => w.id === wsId) || list[0];
        if (found) {
          window.GrossisteAuth.saveSession(found);
          currentWholesaler = found;
          showDashboard();
          toast(`✅ Connecté à ${found.company_name}`, 'success');
        }
      });
    });

    const btnLogin = document.getElementById('btn-g-login');
    if (btnLogin) {
      btnLogin.addEventListener('click', async () => {
        const email = document.getElementById('g-login-email').value;
        const pwd = document.getElementById('g-login-password').value;
        try {
          currentWholesaler = await window.GrossisteAuth.login(email, pwd);
          showDashboard();
          toast(`✅ Bienvenue, ${currentWholesaler.company_name}`, 'success');
        } catch (err) {
          toast('❌ ' + err.message, 'error');
        }
      });
    }

    const btnRegister = document.getElementById('btn-g-register');
    if (btnRegister) {
      btnRegister.addEventListener('click', async () => {
        const zones = [];
        document.querySelectorAll('.g-reg-zone:checked').forEach(cb => zones.push(cb.value));

        try {
          currentWholesaler = await window.GrossisteAuth.register({
            company_name: document.getElementById('g-reg-company').value,
            manager_name: document.getElementById('g-reg-manager').value,
            license_number: document.getElementById('g-reg-license').value,
            rccm_number: document.getElementById('g-reg-rccm').value,
            city: document.getElementById('g-reg-city').value,
            quarter: document.getElementById('g-reg-quarter').value,
            phone: document.getElementById('g-reg-phone').value,
            whatsapp: document.getElementById('g-reg-whatsapp').value,
            email: document.getElementById('g-reg-email').value,
            password: document.getElementById('g-reg-password').value,
            min_order_amount: document.getElementById('g-reg-min-order').value,
            delivery_delay_hours: document.getElementById('g-reg-delay').value,
            delivery_zones: zones
          });
          showDashboard();
          toast('🎉 Compte Grossiste-Répartiteur créé avec 14 jours d\'essai Pro gratuit !', 'success');
        } catch (err) {
          toast('❌ ' + err.message, 'error');
        }
      });
    }
  }

  function bindDashboardEvents() {
    // Fermeture modales
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    });

    // Plein écran
    const fsBtn = document.getElementById('btn-g-fullscreen');
    if (fsBtn) {
      fsBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }

    // Paramètres
    const openSet = document.getElementById('g-settings-open');
    const closeSet = document.getElementById('g-settings-close');
    const panelSet = document.getElementById('g-settings-panel');
    if (openSet && panelSet) {
      openSet.addEventListener('click', () => {
        if (currentWholesaler) {
          document.getElementById('g-set-company').value = currentWholesaler.company_name || '';
          document.getElementById('g-set-manager').value = currentWholesaler.manager_name || '';
          document.getElementById('g-set-phone').value = currentWholesaler.phone || '';
          document.getElementById('g-set-minorder').value = currentWholesaler.min_order_amount || 50000;
        }
        panelSet.style.display = 'block';
      });
    }
    if (closeSet && panelSet) {
      closeSet.addEventListener('click', () => { panelSet.style.display = 'none'; });
    }

    const saveSet = document.getElementById('g-settings-save');
    if (saveSet && panelSet) {
      saveSet.addEventListener('click', () => {
        if (!currentWholesaler) return;
        currentWholesaler.company_name = document.getElementById('g-set-company').value.trim() || currentWholesaler.company_name;
        currentWholesaler.manager_name = document.getElementById('g-set-manager').value.trim() || currentWholesaler.manager_name;
        currentWholesaler.phone = document.getElementById('g-set-phone').value.trim() || currentWholesaler.phone;
        currentWholesaler.min_order_amount = Number(document.getElementById('g-set-minorder').value) || 50000;
        window.GrossisteAuth.saveSession(currentWholesaler);
        updateHeaderIdentity();
        panelSet.style.display = 'none';
        toast('✅ Paramètres du grossiste sauvegardés.', 'success');
      });
    }

    const logoutBtn = document.getElementById('btn-g-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        window.GrossisteAuth.clearSession();
        window.location.reload();
      });
    }
  }

  function updateHeaderIdentity() {
    if (!currentWholesaler) return;
    const nameEl = document.getElementById('grossiste-header-name');
    if (nameEl) nameEl.textContent = currentWholesaler.company_name || 'GROSSISTE';
    const codeEl = document.getElementById('grossiste-header-code');
    if (codeEl) codeEl.textContent = currentWholesaler.wholesaler_code || 'GR-PRO';

    if (window.PGSubscription) {
      window.PGSubscription.renderHeaderBadge('grossiste-sub-badge-slot', currentWholesaler, 'wholesaler');
      window.PGSubscription.checkAndShowReminders(currentWholesaler, 'wholesaler', 'grossiste-reminder-banner');
    }
  }

  async function showDashboard() {
    const loginScreen = document.getElementById('g-login-screen');
    const dash = document.getElementById('g-dashboard');
    if (loginScreen) loginScreen.classList.add('hidden');
    if (dash) dash.classList.remove('hidden');

    updateHeaderIdentity();

    if (window.GrossisteCatalog) {
      await window.GrossisteCatalog.syncWithSupabase(currentWholesaler && currentWholesaler.id);
      window.GrossisteCatalog.renderTable();
    }
    if (window.GrossisteOrders) {
      await window.GrossisteOrders.syncWithSupabase(currentWholesaler && currentWholesaler.id);
      window.GrossisteOrders.renderOrdersList();
    }
    if (window.GrossisteCampaigns) {
      await window.GrossisteCampaigns.syncWithSupabase();
      window.GrossisteCampaigns.renderCampaignsAndAlerts();
    }

    refreshAllKpis();
    switchTab('catalog');
  }

  function switchTab(tabName) {
    activeTab = tabName;
    const tabs = ['catalog', 'orders', 'campaigns', 'network', 'stats'];
    tabs.forEach(t => {
      const btn = document.getElementById('gtab-' + t);
      const panel = document.getElementById('gpanel-' + t);
      if (btn) btn.classList.toggle('active', t === tabName);
      if (panel) panel.style.display = (t === tabName) ? 'block' : 'none';
    });

    if (tabName === 'stats' && window.GrossisteStats) {
      window.GrossisteStats.renderAnalytics();
    } else if (tabName === 'network' && window.GrossisteStats) {
      window.GrossisteStats.renderNetworkAndMap(currentWholesaler);
    }
  }

  function refreshAllKpis() {
    const catalog = window.GrossisteCatalog ? window.GrossisteCatalog.getCatalog() : [];
    const orders = window.GrossisteOrders ? window.GrossisteOrders.getOrders() : [];
    const campaigns = window.GrossisteCampaigns ? window.GrossisteCampaigns.getCampaigns() : [];

    const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setEl('tab-badge-catalog', String(catalog.length));
    setEl('tab-badge-orders', String(orders.filter(o => o.status === 'pending').length));
    setEl('tab-badge-campaigns', String(campaigns.length));
  }

  function toggleStatus(newStatus) {
    if (!currentWholesaler) return;
    currentWholesaler.status = newStatus;
    window.GrossisteAuth.saveSession(currentWholesaler);
    ['open', 'urgent_service', 'closed'].forEach(st => {
      const b = document.getElementById('g-status-' + st);
      if (b) b.classList.toggle('active', st === newStatus);
    });
    const labels = {
      open: '🟢 Grossiste Ouvert — Livraisons Actives',
      urgent_service: '🟠 Service Garde & Urgences Officines',
      closed: '🔴 Grossiste Fermé'
    };
    toast(labels[newStatus] || 'Statut mis à jour', 'info');
  }

  document.addEventListener('DOMContentLoaded', init);

  window.GrossisteApp = {
    init,
    switchTab,
    refreshAllKpis,
    toggleStatus,
    toast,
    getCurrentWholesaler: () => currentWholesaler
  };
})(window);
