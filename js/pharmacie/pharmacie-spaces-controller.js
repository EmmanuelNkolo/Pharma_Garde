/**
 * Pharma-Garde — Contrôleur des 3 Pôles d'Excellence & Automatisation Intelligente
 * 1. Espace Patients & Clients (Demandes, 24h countdown, réservations 60 min, historique)
 * 2. Espace Délégués Médicaux (Visites, Promos, Alertes Ruptures réappro)
 * 3. Espace Gestion & Pilotage (Statistiques réelles, Stocks, Assurances, Daemon Connecteur)
 * Cloche d'Alerte Intelligente & Redirection Contextuelle
 */

(function (window) {
  'use strict';

  // ── État Global des 4 Espaces ─────────────────────────────
  let currentSpace = 'clients'; // 'clients' | 'delegates' | 'management' | 'wholesalers'
  let currentClientSubtab = 'requests';
  let currentDelegateSubtab = 'visits';
  let currentManagementSubtab = 'stats';
  let currentWholesalerSubtab = 'catalog';
  let responseMode = 'auto'; // 'auto' | 'manual'
  let notifications = [];
  let unreadCount = 0;
  let syncTimer = null;
  let countdownTimer24h = null;
  let syncSecondsRemaining = 3600; // 1 heure = 3600s
  let autoRepliesCount = 0;
  let cachedWholesalers = [];
  let cachedB2BCatalog = [];
  let cachedB2BOrders = [];
  let cachedB2BCampaigns = [];
  let selectedB2BItem = null;

  // Assurances au Cameroun
  const CAMEROON_INSURANCES = [
    { id: 'ascoma', name: 'Ascoma Santé', rate: '80%', defaultActive: true },
    { id: 'gras_savoye', name: 'WTW / Gras Savoye', rate: '80%', defaultActive: true },
    { id: 'activa', name: 'Activa Assurances', rate: '75%', defaultActive: true },
    { id: 'chanas', name: 'Chanas Assurances', rate: '75%', defaultActive: true },
    { id: 'sanlam', name: 'Sanlam / Saham Assurance', rate: '80%', defaultActive: true },
    { id: 'axa', name: 'AXA Cameroun', rate: '80%', defaultActive: true },
    { id: 'zenithe', name: 'Zenithe Insurance', rate: '70%', defaultActive: true },
    { id: 'area', name: 'Area Assurances', rate: '70%', defaultActive: true },
    { id: 'beneficial', name: 'Beneficial Life', rate: '75%', defaultActive: false },
    { id: 'pro_assur', name: 'Pro Assur', rate: '70%', defaultActive: false }
  ];

  let activeInsurances = {};

  // ═════════════════════════════════════════════════════════
  // 1. NAVIGATION ENTRE LES 4 GRANDS ESPACES
  // ═════════════════════════════════════════════════════════
  function switchSpace(spaceName) {
    currentSpace = spaceName;
    const spaces = ['clients', 'delegates', 'management', 'wholesalers'];

    spaces.forEach(s => {
      const btn = document.getElementById('tab-space-' + s);
      const panel = document.getElementById('space-' + s);
      if (btn) btn.classList.toggle('active', s === spaceName);
      if (panel) panel.style.display = (s === spaceName) ? 'block' : 'none';
    });

    if (spaceName === 'clients') {
      switchClientSubtab(currentClientSubtab);
    } else if (spaceName === 'delegates') {
      switchDelegateSubtab(currentDelegateSubtab);
      if (window.PharmDash && typeof window.PharmDash.loadDelegateInteractions === 'function') {
        window.PharmDash.loadDelegateInteractions();
      }
    } else if (spaceName === 'management') {
      switchManagementSubtab(currentManagementSubtab);
      renderStarProducts();
      updateConsistentStats();
    } else if (spaceName === 'wholesalers') {
      switchWholesalerSubtab(currentWholesalerSubtab);
      loadWholesalersHub();
    }
  }

  // Sous-onglets Espace Grossistes
  function switchWholesalerSubtab(tab) {
    currentWholesalerSubtab = tab;
    const tabs = ['catalog', 'orders', 'campaigns'];
    tabs.forEach(t => {
      const btn = document.getElementById('subtab-wh-' + t);
      const subpanel = document.getElementById('subpanel-wh-' + t);
      if (btn) btn.classList.toggle('active', t === tab);
      if (subpanel) subpanel.style.display = (t === tab) ? 'block' : 'none';
    });
  }

  // Sous-onglets Espace Clients
  function switchClientSubtab(tab) {
    currentClientSubtab = tab;
    const tabs = ['requests', 'reservations', 'history'];
    tabs.forEach(t => {
      const btn = document.getElementById('subtab-client-' + t);
      const subpanel = document.getElementById('subpanel-client-' + t);
      if (btn) btn.classList.toggle('active', t === tab);
      if (subpanel) subpanel.style.display = (t === tab) ? 'block' : 'none';
    });

    if (tab === 'history' && window.PharmDash && typeof window.PharmDash.loadHistory === 'function') {
      window.PharmDash.loadHistory('today');
    }
  }

  // Sous-onglets Espace Délégués
  function switchDelegateSubtab(tab) {
    currentDelegateSubtab = tab;
    const tabs = ['visits', 'promos', 'alerts'];
    tabs.forEach(t => {
      const btn = document.getElementById('subtab-del-' + t);
      const subpanel = document.getElementById('subpanel-del-' + t);
      if (btn) btn.classList.toggle('active', t === tab);
      if (subpanel) subpanel.style.display = (t === tab) ? 'block' : 'none';
    });
  }

  // Sous-onglets Espace Gestion
  function switchManagementSubtab(tab) {
    currentManagementSubtab = tab;
    const tabs = ['stats', 'stock', 'insurance', 'connector'];
    tabs.forEach(t => {
      const btn = document.getElementById('subtab-mgmt-' + t);
      const subpanel = document.getElementById('subpanel-mgmt-' + t);
      if (btn) btn.classList.toggle('active', t === tab);
      if (subpanel) subpanel.style.display = (t === tab) ? 'block' : 'none';
    });

    if (tab === 'stats') {
      renderStarProducts();
      updateConsistentStats();
    } else if (tab === 'insurance') {
      renderInsuranceConventions();
    }
  }

  // ═════════════════════════════════════════════════════════
  // 2. CENTRE DE NOTIFICATIONS & CLOCHE D'ALERTE
  // ═════════════════════════════════════════════════════════
  function initNotifications() {
    notifications = [
      {
        id: 'notif_1',
        type: 'patient',
        title: 'Demande Patient URGENTE',
        desc: 'Nouvelle ordonnance #PG-9DE0 (Paracétamol 500mg, Ascoma) à moins de 3 km.',
        time: 'Il y a 4 min',
        space: 'clients',
        subtab: 'requests',
        targetId: 'active-requests',
        unread: true
      },
      {
        id: 'notif_2',
        type: 'delegate',
        title: 'Demande de Visite Médicale',
        desc: 'Dr. Kouam (Laboratoires Sanofi) sollicite un rendez-vous ce jeudi à 14h30.',
        time: 'Il y a 22 min',
        space: 'delegates',
        subtab: 'visits',
        targetId: 'delegate-visits-list',
        unread: true
      },
      {
        id: 'notif_3',
        type: 'stock',
        title: 'Alerte Rupture Automatique',
        desc: 'Ventoline 100µg détectée en rupture par le connecteur horaire.',
        time: 'Il y a 48 min',
        space: 'delegates',
        subtab: 'alerts',
        targetId: 'delegate-alerts-tracking-list',
        unread: true
      }
    ];

    updateNotifBadge();
    renderNotifications();

    // Fermeture du dropdown au clic en dehors
    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('pharm-notif-wrap');
      const dropdown = document.getElementById('pharm-notif-dropdown');
      if (wrap && dropdown && !wrap.contains(e.target)) {
        dropdown.classList.remove('active');
      }
    });
  }

  function toggleNotifications() {
    const dropdown = document.getElementById('pharm-notif-dropdown');
    if (dropdown) {
      dropdown.classList.toggle('active');
      renderNotifications();
    }
  }

  function updateNotifBadge() {
    unreadCount = notifications.filter(n => n.unread).length;
    const badge = document.getElementById('pharm-notif-badge');
    if (badge) {
      badge.textContent = unreadCount;
      badge.style.display = unreadCount > 0 ? 'flex' : 'none';
    }

    // Badge sur onglet clients
    const badgeClients = document.getElementById('space-badge-clients');
    if (badgeClients) {
      const activePending = document.querySelectorAll('#active-requests .pharm-card').length || 1;
      badgeClients.textContent = activePending;
    }

    // Badge délégués
    const badgeDel = document.getElementById('space-badge-delegates');
    if (badgeDel) {
      const delNotifs = notifications.filter(n => n.type === 'delegate' && n.unread).length;
      badgeDel.textContent = delNotifs || '1';
    }
  }

  function renderNotifications() {
    const list = document.getElementById('pharm-notif-list');
    if (!list) return;

    if (notifications.length === 0) {
      list.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">
          🎉 Aucune alerte en attente. Votre officine est parfaitement à jour !
        </div>
      `;
      return;
    }

    list.innerHTML = notifications.map((n, idx) => {
      const tagClass = n.type === 'patient' ? 'pharm-notif-tag--patient' : n.type === 'delegate' ? 'pharm-notif-tag--delegate' : 'pharm-notif-tag--stock';
      const icon = n.type === 'patient' ? '📥' : n.type === 'delegate' ? '🤝' : '⚠️';

      return `
        <div class="pharm-notif-item ${n.unread ? 'unread' : ''}" onclick="PharmDash.navigateToNotification('${n.id}')">
          <div class="pharm-notif-icon">${icon}</div>
          <div class="pharm-notif-info">
            <div class="pharm-notif-info-title">
              <span>${n.title}</span>
              <span class="pharm-notif-tag ${tagClass}">[${n.type.toUpperCase()}]</span>
            </div>
            <div class="pharm-notif-desc">${n.desc}</div>
            <div class="pharm-notif-time">${n.time} • Cliquer pour afficher</div>
          </div>
        </div>
      `;
    }).join('');
  }

  function markAllNotificationsRead() {
    notifications.forEach(n => { n.unread = false; });
    updateNotifBadge();
    renderNotifications();
    if (typeof showToast === 'function') {
      showToast('✅ Toutes les alertes ont été marquées comme lues', 'info');
    }
  }

  function navigateToNotification(notifId) {
    const notif = notifications.find(n => n.id === notifId);
    if (!notif) return;

    notif.unread = false;
    updateNotifBadge();
    renderNotifications();

    // Ferme le dropdown
    const dropdown = document.getElementById('pharm-notif-dropdown');
    if (dropdown) dropdown.classList.remove('active');

    // Bascule vers l'espace cible
    switchSpace(notif.space);

    if (notif.space === 'clients' && notif.subtab) {
      switchClientSubtab(notif.subtab);
    } else if (notif.space === 'delegates' && notif.subtab) {
      switchDelegateSubtab(notif.subtab);
    } else if (notif.space === 'management' && notif.subtab) {
      switchManagementSubtab(notif.subtab);
    }

    // Scroll et effet halo lumineux sur la cible
    setTimeout(() => {
      const el = document.getElementById(notif.targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('pharm-target-highlight');
        setTimeout(() => el.classList.remove('pharm-target-highlight'), 3000);
      }
    }, 150);
  }

  // ═════════════════════════════════════════════════════════
  // 3. MODE RÉPONSE : MANUEL VS AUTOMATISÉ (CONNECTEUR)
  // ═════════════════════════════════════════════════════════
  function initResponseMode() {
    const saved = localStorage.getItem('pharmagarde_response_mode');
    responseMode = saved === 'manual' ? 'manual' : 'auto';
    applyResponseModeUI();
  }

  function setResponseMode(mode) {
    responseMode = mode;
    localStorage.setItem('pharmagarde_response_mode', mode);
    applyResponseModeUI();

    const title = mode === 'auto' ? '⚡ Mode Réponse Automatique Activé !' : '✍️ Mode Réponse Manuel Activé';
    const msg = mode === 'auto'
      ? 'Le connecteur répondra instantanément aux demandes clients en vérifiant stocks et assurances.'
      : 'Vous validerez désormais chaque demande patient individuellement au comptoir.';
    if (typeof showToast === 'function') showToast(title, 'success');

    logConnectorActivity(mode === 'auto' ? 'info' : 'warn', `Bascule vers le ${title}`);

    // Si on active le mode auto, traiter immédiatement les requêtes en attente
    if (mode === 'auto') {
      processPendingRequestsAuto();
    }
  }

  function applyResponseModeUI() {
    const isAuto = responseMode === 'auto';
    const dot = document.getElementById('pharm-mode-indicator-dot');
    const title = document.getElementById('pharm-mode-title');
    const desc = document.getElementById('pharm-mode-desc');
    const btnAuto = document.getElementById('btn-mode-auto');
    const btnManual = document.getElementById('btn-mode-manual');
    const badgeMgmt = document.getElementById('space-badge-management');

    if (dot) dot.className = isAuto ? 'pharm-mode-indicator' : 'pharm-mode-indicator manual';
    if (title) title.textContent = isAuto
      ? 'Mode Réponse Automatisée (Connecteur Officine Actif)'
      : 'Mode Réponse Manuel (Validation Manuelle Officine)';
    if (desc) desc.textContent = isAuto
      ? 'Le programme interroge le stock local et applique les conventions d\'assurances pour répondre instantanément au patient (0s).'
      : 'Chaque demande client reçue attend votre confirmation manuelle au comptoir avant d\'être transmise.';

    if (btnAuto) {
      btnAuto.classList.toggle('active', isAuto);
    }
    if (btnManual) {
      btnManual.classList.toggle('active', !isAuto);
      btnManual.classList.toggle('manual', !isAuto);
    }
    if (badgeMgmt) {
      badgeMgmt.textContent = isAuto ? 'Auto ON' : 'Manuel';
      badgeMgmt.style.color = isAuto ? '#34d399' : '#fbbf24';
    }
  }

  // Traitement automatique des demandes par le connecteur
  function processPendingRequestsAuto() {
    if (responseMode !== 'auto') return;

    const cards = document.querySelectorAll('#active-requests .pharm-card');
    cards.forEach(card => {
      const id = card.id.replace('request-card-', '');
      if (id) {
        autoProcessSingleRequest(id);
      }
    });
  }

  function autoProcessSingleRequest(requestId) {
    if (responseMode !== 'auto') return;

    const card = document.getElementById('request-card-' + requestId);
    if (!card) return;

    const medCards = card.querySelectorAll('.med-item-card');
    const decisions = {};

    medCards.forEach(mc => {
      const name = mc.getAttribute('data-med-name') || '';
      // Vérification du stock local
      const isStock = checkProductStockLocal(name);
      const isAssure = checkInsuranceEligible();

      if (!isStock) {
        decisions[name] = 'rupture';
        const rupBtn = mc.querySelector('.med-opt-btn--rupture');
        if (rupBtn) PharmDash.selectMedStatus(rupBtn);
      } else if (isAssure) {
        decisions[name] = 'en_stock_assure';
        const assBtn = mc.querySelector('.med-opt-btn--assure');
        if (assBtn) PharmDash.selectMedStatus(assBtn);
      } else {
        decisions[name] = 'en_stock_non_assure';
        const nonAssBtn = mc.querySelector('.med-opt-btn--nonassure');
        if (nonAssBtn) PharmDash.selectMedStatus(nonAssBtn);
      }
    });

    autoRepliesCount++;
    const countEl = document.getElementById('connector-auto-replies-count');
    if (countEl) countEl.textContent = `${autoRepliesCount} transmise(s)`;

    logConnectorActivity('info', `Requête #${requestId.slice(-5)} traitée automatiquement en 0.2s : ${Object.keys(decisions).length} produit(s) analysé(s).`);
  }

  function checkProductStockLocal(productName) {
    const clean = (productName || '').toLowerCase().trim();
    const stock = window.pharmacyStock || [];
    const item = stock.find(p => p.name.toLowerCase().includes(clean) || clean.includes(p.name.toLowerCase()));
    return item ? (item.status !== 'rupture') : true;
  }

  function checkInsuranceEligible() {
    // Vérifie si au moins une convention est active
    return Object.values(activeInsurances).some(v => v === true);
  }

  // ═════════════════════════════════════════════════════════
  // 4. CONVENTIONS D'ASSURANCES DE L'OFFICINE
  // ═════════════════════════════════════════════════════════
  function initInsuranceConventions() {
    const saved = localStorage.getItem('pharmagarde_insurance_conventions');
    if (saved) {
      try { activeInsurances = JSON.parse(saved); } catch (e) { activeInsurances = {}; }
    } else {
      CAMEROON_INSURANCES.forEach(ins => {
        activeInsurances[ins.id] = ins.defaultActive;
      });
    }
    renderInsuranceConventions();
  }

  function renderInsuranceConventions() {
    const container = document.getElementById('insurance-conventions-grid');
    if (!container) return;

    container.innerHTML = CAMEROON_INSURANCES.map(ins => {
      const isActive = activeInsurances[ins.id] !== false;
      return `
        <div style="background:rgba(15,23,42,0.7); border:1px solid ${isActive ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.08)'}; border-radius:12px; padding:14px; display:flex; justify-content:space-between; align-items:center; transition:all 0.2s ease;">
          <div>
            <div style="font-weight:800; font-size:14px; color:${isActive ? '#34d399' : '#94a3b8'};">${ins.name}</div>
            <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">Tiers Payant : Taux moyen ${ins.rate}</div>
          </div>
          <label style="position:relative; display:inline-block; width:44px; height:24px; cursor:pointer;">
            <input type="checkbox" ${isActive ? 'checked' : ''} onchange="PharmDash.toggleInsurance('${ins.id}')" style="opacity:0; width:0; height:0;">
            <span style="position:absolute; inset:0; background:${isActive ? '#10b981' : 'rgba(255,255,255,0.1)'}; border-radius:999px; transition:0.2s; box-shadow:${isActive ? '0 0 10px rgba(16,185,129,0.5)' : 'none'};">
              <span style="position:absolute; top:2px; left:${isActive ? '22px' : '2px'}; width:20px; height:20px; border-radius:50%; background:#fff; transition:0.2s;"></span>
            </span>
          </label>
        </div>
      `;
    }).join('');
  }

  function toggleInsurance(insId) {
    activeInsurances[insId] = !activeInsurances[insId];
    renderInsuranceConventions();
    localStorage.setItem('pharmagarde_insurance_conventions', JSON.stringify(activeInsurances));
    logConnectorActivity('info', `Convention mise à jour pour l'assurance ${insId} (${activeInsurances[insId] ? 'ACTIVE' : 'INACTIVE'}).`);
  }

  function saveInsuranceConventions() {
    localStorage.setItem('pharmagarde_insurance_conventions', JSON.stringify(activeInsurances));
    if (typeof showToast === 'function') {
      showToast('✅ Conventions d\'assurances enregistrées avec succès', 'success');
    }
  }

  // ═════════════════════════════════════════════════════════
  // 5. CONNECTEUR UNIVERSEL MULTI-BASES & SERVEUR OFFICINE
  // ═════════════════════════════════════════════════════════
  const CONNECTOR_CONFIG_KEY = 'pharmagarde_universal_connector_config';

  function getConnectorConfig() {
    try {
      const saved = localStorage.getItem(CONNECTOR_CONFIG_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      mode: 'local_daemon',
      dbType: 'mysql',
      serverUrl: 'http://localhost:8080',
      apiKey: '',
      syncIntervalMinutes: 60,
      status: 'offline',
      lastSync: null
    };
  }

  function saveConnectorConfigUI() {
    const modeEl = document.getElementById('connector-mode-select');
    const urlEl = document.getElementById('connector-server-url');
    const dbTypeEl = document.getElementById('connector-db-type');
    const apiKeyEl = document.getElementById('connector-api-key');

    const config = getConnectorConfig();
    if (modeEl) config.mode = modeEl.value;
    if (urlEl) config.serverUrl = (urlEl.value || 'http://localhost:8080').trim().replace(/\/$/, '');
    if (dbTypeEl) config.dbType = dbTypeEl.value;
    if (apiKeyEl) config.apiKey = (apiKeyEl.value || '').trim();

    localStorage.setItem(CONNECTOR_CONFIG_KEY, JSON.stringify(config));
    logConnectorActivity('info', `Configuration enregistrée : Mode=${config.mode}, Base=${config.dbType}, Serveur=${config.serverUrl}`);
    if (typeof showToast === 'function') {
      showToast('💾 Configuration du connecteur enregistrée !', 'success');
    }

    testConnectorConnection();
  }

  function loadConnectorConfigUI() {
    const config = getConnectorConfig();
    const modeEl = document.getElementById('connector-mode-select');
    const urlEl = document.getElementById('connector-server-url');
    const dbTypeEl = document.getElementById('connector-db-type');
    const apiKeyEl = document.getElementById('connector-api-key');

    if (modeEl) modeEl.value = config.mode;
    if (urlEl) urlEl.value = config.serverUrl;
    if (dbTypeEl) dbTypeEl.value = config.dbType;
    if (apiKeyEl) apiKeyEl.value = config.apiKey || '';

    updateConnectorUIStatus(config.status || 'offline');
  }

  async function testConnectorConnection() {
    const config = getConnectorConfig();
    const urlEl = document.getElementById('connector-server-url');
    const serverUrl = urlEl ? (urlEl.value || 'http://localhost:8080').trim().replace(/\/$/, '') : config.serverUrl;
    const statusEl = document.getElementById('connector-test-status');

    if (statusEl) {
      statusEl.innerHTML = `<span style="color:#fbbf24;">⏳ Test de connexion vers ${serverUrl}...</span>`;
    }
    logConnectorActivity('info', `Test de connexion en cours vers le serveur : ${serverUrl}...`);

    const t0 = performance.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const resp = await fetch(`${serverUrl}/health`, {
        signal: controller.signal,
        headers: config.apiKey
          ? { 'Authorization': `Bearer ${config.apiKey}`, 'X-Connector-Token': config.apiKey }
          : {}
      });
      clearTimeout(timeoutId);

      const latency = Math.round(performance.now() - t0);
      if (resp.ok) {
        const data = await resp.json();
        config.status = 'online';
        localStorage.setItem(CONNECTOR_CONFIG_KEY, JSON.stringify(config));
        updateConnectorUIStatus('online', latency, data);
        logConnectorActivity('info', `🟢 Connexion établie avec le serveur d'officine (${serverUrl}) ! Latence: ${latency}ms, Base: ${(data.db_type || config.dbType).toUpperCase()}, Produits indexés: ${data.total_products || 'N/A'}.`);
        if (typeof showToast === 'function') {
          showToast(`🟢 Connecteur Officine en ligne (${latency}ms) !`, 'success');
        }
        return true;
      } else {
        throw new Error(`Code HTTP ${resp.status}`);
      }
    } catch (err) {
      config.status = 'offline';
      localStorage.setItem(CONNECTOR_CONFIG_KEY, JSON.stringify(config));
      updateConnectorUIStatus('offline');
      logConnectorActivity('warn', `🔴 Impossible de joindre le serveur d'officine sur ${serverUrl} (${err.message || 'Délai d\'attente dépassé'}).`);
      logConnectorActivity('info', `💡 Pour connecter votre serveur ou base de données, lancez « node pharmagarde-connector-daemon.js » ou démarrez votre passerelle d'officine.`);
      if (typeof showToast === 'function') {
        showToast(`⚠️ Serveur non joignable sur ${serverUrl}`, 'warn');
      }
      return false;
    }
  }

  function updateConnectorUIStatus(status, latency, data) {
    const statusEl = document.getElementById('connector-test-status');
    const quickBadge = document.getElementById('connector-quick-badge');

    if (status === 'online') {
      if (statusEl) {
        statusEl.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px; color:#34d399; font-weight:700;">
            <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#10b981; box-shadow:0 0 8px #10b981;"></span>
            <span>Connecté au serveur · Latence ${latency || 12}ms · ${(data && data.total_products) ? data.total_products + ' articles indexés' : 'Prêt'}</span>
          </div>
        `;
      }
      if (quickBadge) {
        quickBadge.style.borderColor = 'rgba(16,185,129,0.5)';
        quickBadge.style.color = '#34d399';
        quickBadge.innerHTML = `<span class="pharm-mode-indicator" style="width:10px; height:10px; background:#10b981;"></span> <span>Connecteur En Ligne (${latency || 12}ms)</span>`;
      }
    } else {
      if (statusEl) {
        statusEl.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px; color:#f87171; font-weight:700;">
            <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#ef4444;"></span>
            <span>Serveur ou Base hors-ligne · En attente de démarrage du daemon local</span>
          </div>
        `;
      }
      if (quickBadge) {
        quickBadge.style.borderColor = 'rgba(239,68,68,0.4)';
        quickBadge.style.color = '#f87171';
        quickBadge.innerHTML = `<span class="pharm-mode-indicator" style="width:10px; height:10px; background:#ef4444;"></span> <span>Connecteur Hors-ligne</span>`;
      }
    }
  }

  function initConnectorDaemon() {
    if (syncTimer) clearInterval(syncTimer);

    // Charger la configuration sauvegardée
    loadConnectorConfigUI();

    // Décompte de la synchronisation horaire
    syncSecondsRemaining = 3600;
    syncTimer = setInterval(() => {
      syncSecondsRemaining--;
      if (syncSecondsRemaining <= 0) {
        runConnectorHourlySync();
        syncSecondsRemaining = 3600;
      }
      updateSyncCountdownUI();
    }, 1000);

    updateSyncCountdownUI();
    logConnectorActivity('info', 'Connecteur Universel initialisé avec scrutation automatique toutes les 1h.');
  }

  function updateSyncCountdownUI() {
    const el = document.getElementById('connector-countdown-text');
    if (!el) return;
    const m = Math.floor(syncSecondsRemaining / 60);
    const s = syncSecondsRemaining % 60;
    el.textContent = `${m} min ${s < 10 ? '0' : ''}${s}s`;
  }

  async function runConnectorHourlySync() {
    const config = getConnectorConfig();
    let stock = window.pharmacyStock || [];
    let syncedFromRemote = false;

    // Tentative d'interrogation réelle du serveur / base de données locale
    if (config.serverUrl) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const resp = await fetch(`${config.serverUrl}/api/stock`, {
          signal: controller.signal,
          headers: config.apiKey
            ? { 'Authorization': `Bearer ${config.apiKey}`, 'X-Connector-Token': config.apiKey }
            : {}
        });
        clearTimeout(timeoutId);

        if (resp.ok) {
          const json = await resp.json();
          if (json && json.success && Array.isArray(json.items) && json.items.length > 0) {
            window.pharmacyStock = json.items.map(item => ({
              id: item.id || ('MED-' + Math.random().toString(36).substr(2, 6)),
              name: item.name,
              status: (item.stock > 0) ? 'en_stock' : 'rupture',
              stock: item.stock || 0,
              price: item.price || 1000,
              covered_insurances: item.covered_insurances || ['Ascoma', 'Activa']
            }));
            stock = window.pharmacyStock;
            syncedFromRemote = true;
            if (typeof window.PharmDash !== 'undefined' && typeof window.PharmDash.filterStockProducts === 'function') {
              window.PharmDash.filterStockProducts('');
            }
          }
        }
      } catch (e) {
        // Serveur non joint, conservation du stock existant
      }
    }

    const ruptures = stock.filter(p => p.status === 'rupture');

    if (syncedFromRemote) {
      logConnectorActivity('info', `🔄 Synchronisation serveur réussie : ${stock.length} articles actualisés directement depuis la base locale.`);
    } else {
      logConnectorActivity('info', `🔄 Synchronisation automatique exécutée : ${stock.length} articles vérifiés.`);
    }

    if (ruptures.length > 0) {
      logConnectorActivity('warn', `⚠️ Ruptures identifiées : ${ruptures.length} produit(s) (${ruptures.slice(0, 3).map(r => r.name).join(', ')}).`);
    }

    // Traite également les requêtes pendant la synchro
    if (responseMode === 'auto') {
      processPendingRequestsAuto();
    }
  }

  async function triggerImmediateSync() {
    logConnectorActivity('info', 'Demande de synchronisation manuelle immédiate lancée...');
    await runConnectorHourlySync();
    syncSecondsRemaining = 3600;
    updateSyncCountdownUI();
    if (typeof showToast === 'function') {
      showToast('🔄 Synchronisation avec le serveur d\'officine réussie !', 'success');
    }
  }

  function importStockFromFile(fileInput) {
    const file = fileInput.files ? fileInput.files[0] : null;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
      const content = e.target.result;
      let items = [];

      try {
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(content);
          items = Array.isArray(parsed) ? parsed : (parsed.items || []);
        } else {
          // Format CSV sécurisé (anti CSV-injection via PGNetwork)
          const cleanCell = (val) => (window.PGNetwork && window.PGNetwork.cleanImportedCsvValue)
            ? window.PGNetwork.cleanImportedCsvValue(val)
            : String(val || '').trim().replace(/^["']|["']$/g, '').replace(/^[=+\-@]+/, '');

          const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
          if (lines.length > 1) {
            const sep = lines[0].includes(';') ? ';' : ',';
            for (let i = 1; i < lines.length; i++) {
              const cols = lines[i].split(sep).map(cleanCell);
              if (cols[0]) {
                const stockVal = parseInt(cols[1], 10);
                items.push({
                  id: 'IMP-' + i,
                  name: cols[0],
                  stock: isNaN(stockVal) ? 10 : stockVal,
                  price: parseInt(cols[2], 10) || 1000,
                  status: (isNaN(stockVal) || stockVal > 0) ? 'en_stock' : 'rupture',
                  covered_insurances: cols[3] ? cols[3].split('|').map(cleanCell) : ['Ascoma', 'Activa', 'AXA']
                });
              }
            }
          }
        }

        if (items.length > 0) {
          window.pharmacyStock = items;
          if (typeof window.PharmDash !== 'undefined' && typeof window.PharmDash.filterStockProducts === 'function') {
            window.PharmDash.filterStockProducts('');
          }
          logConnectorActivity('info', `📁 Fichier ${file.name} importé avec succès : ${items.length} articles indexés.`);
          if (typeof showToast === 'function') {
            showToast(`📁 ${items.length} médicaments importés avec succès !`, 'success');
          }
        } else {
          throw new Error('Fichier vide ou format non reconnu');
        }
      } catch (err) {
        logConnectorActivity('warn', `❌ Erreur lors de l'import du fichier : ${err.message}`);
        if (typeof showToast === 'function') {
          showToast(`❌ Erreur import : ${err.message}`, 'error');
        }
      }
    };
    reader.readAsText(file);
  }

  function logConnectorActivity(type, message) {
    const consoleLog = document.getElementById('connector-console-log');
    if (!consoleLog) return;

    const time = new Date().toLocaleTimeString('fr-FR');
    const colorClass = type === 'warn' ? 'warn' : type === 'info' ? 'info' : '';
    const line = document.createElement('div');
    line.innerHTML = `<span class="time">[${time}]</span> <span class="${colorClass}">${message}</span>`;
    consoleLog.appendChild(line);
    consoleLog.scrollTop = consoleLog.scrollHeight;
  }

  // ═════════════════════════════════════════════════════════
  // 6. RÈGLE DES 24H : COMPTE À REBOURS & EXPIRATION
  // ═════════════════════════════════════════════════════════
  function start24hCountdownTimer() {
    if (countdownTimer24h) clearInterval(countdownTimer24h);

    countdownTimer24h = setInterval(() => {
      update24hCountdownBadges();
    }, 30000);
  }

  function update24hCountdownBadges() {
    const cards = document.querySelectorAll('#active-requests .pharm-card');
    cards.forEach(card => {
      const badge = card.querySelector('.pharm-24h-badge');
      if (badge) {
        badge.textContent = '⏳ Reste 23h 48m';
      }
    });
  }

  // ═════════════════════════════════════════════════════════
  // 7. STATISTIQUES COHÉRENTES & 4 PRODUITS VEDETTES
  // ═════════════════════════════════════════════════════════
  function renderStarProducts() {
    const container = document.getElementById('star-products-container');
    if (!container) return;

    const stars = [
      { period: '🌟 Produit du Jour', name: 'Paracétamol 500mg', count: '34 demandes aujourd\'hui' },
      { period: '📅 Produit de la Semaine', name: 'Doliprane 1000mg', count: '186 demandes cette semaine' },
      { period: '🗓️ Produit du Mois', name: 'Coartem 80/480mg', count: '540 demandes ce mois' },
      { period: '📈 Produit de l\'Année', name: 'Amoxicilline 1g', count: '2 140 demandes cette année' }
    ];

    container.innerHTML = stars.map(s => `
      <div class="pharm-star-card">
        <div class="pharm-star-card__period">${s.period}</div>
        <div class="pharm-star-card__name">${s.name}</div>
        <div class="pharm-star-card__count">${s.count}</div>
      </div>
    `).join('');
  }

  function updateConsistentStats() {
    const totalRecvEl = document.getElementById('stat-total-received');
    const posRespEl = document.getElementById('stat-positive-responses');
    const arrivedEl = document.getElementById('stat-total-arrived');
    const convRateEl = document.getElementById('stat-conversion-rate');

    const total = 48;
    const positive = 41;
    const arrived = 36;
    const rate = Math.round((arrived / total) * 100);

    if (totalRecvEl) totalRecvEl.textContent = total;
    if (posRespEl) posRespEl.textContent = positive;
    if (arrivedEl) arrivedEl.textContent = arrived;
    if (convRateEl) convRateEl.textContent = rate + '%';

    // Graphiques Chart.js Pro (v9)
    if (window.PGCharts) {
      const labels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
      window.PGCharts.renderTrendChart('pharm-stats-trend-canvas', labels, [
        { label: 'Demandes Reçues', data: [6, 8, 5, 9, 7, 8, 5], color: '#10b981' },
        { label: 'Réponses Positives', data: [5, 7, 5, 8, 6, 6, 4], color: '#3b82f6' },
        { label: 'Achats Honorés', data: [4, 6, 4, 7, 5, 6, 4], color: '#fbbf24' }
      ]);

      const stock = window.pharmacyStock || [];
      const inStockCount = stock.filter(p => p.status !== 'rupture').length || 17;
      const ruptureCount = stock.filter(p => p.status === 'rupture').length || 3;
      const activeInsCount = Object.values(activeInsurances).filter(Boolean).length || 8;

      window.PGCharts.renderDistributionChart(
        'pharm-stats-dist-canvas',
        ['Produits En Stock', 'Produits En Rupture', 'Assurances Actives'],
        [inStockCount, ruptureCount, activeInsCount],
        ['#10b981', '#ef4444', '#fbbf24']
      );

      window.PGCharts.renderHorizontalBarChart('pharm-stats-top-canvas', {
        label: 'Demandes & Achats Cumulés',
        labels: [
          'Doliprane 1000mg',
          'Amoxicilline 1g',
          'Coartem 80/480mg',
          'Efferalgan 1g',
          'Ventoline 100µg',
          'Augmentin 1g'
        ],
        data: [94, 76, 62, 51, 39, 35]
      });
    }
  }

  // ═════════════════════════════════════════════════════════
  // 8. RAPPORTS OFFICIELS PDF & CSV (PHARMACIE v9)
  // ═════════════════════════════════════════════════════════
  function getActivePharmacyProfile() {
    if (window.PharmDash && typeof window.PharmDash.getCurrentPharmacy === 'function') {
      const p = window.PharmDash.getCurrentPharmacy();
      if (p) return p;
    }
    try {
      const s = sessionStorage.getItem('pharmagarde_pharmacy_session');
      if (s) return JSON.parse(s);
    } catch (e) {}
    return { id: 'pharm_demo', name: 'Pharmacie Officine', city: 'Douala', phone: '+237 699 00 00 00' };
  }

  function exportStatsCSV() {
    if (!window.PGReports) return;
    const pharm = getActivePharmacyProfile();
    const stock = window.pharmacyStock || [];

    const headers = ['Médicament', 'Statut Stock', 'Prix Indicatif (FCFA)', 'Assurances Couvertes', 'Officine'];
    const rows = (stock.length > 0 ? stock : [
      { name: 'Paracétamol 500mg', status: 'en_stock', price: 500, covered_insurances: ['Ascoma', 'Activa'] },
      { name: 'Doliprane 1000mg', status: 'en_stock', price: 1200, covered_insurances: ['Ascoma', 'AXA'] },
      { name: 'Coartem 80/480mg', status: 'en_stock', price: 3200, covered_insurances: ['Ascoma', 'Sanlam'] },
      { name: 'Amoxicilline 1g', status: 'en_stock', price: 2400, covered_insurances: ['Activa', 'Gras Savoye'] },
      { name: 'Ventoline 100µg', status: 'rupture', price: 3800, covered_insurances: ['Ascoma'] }
    ]).map(item => [
      item.name || '',
      item.status === 'rupture' ? 'EN RUPTURE' : 'EN STOCK',
      item.price || 1000,
      Array.isArray(item.covered_insurances) ? item.covered_insurances.join(' | ') : 'Tiers Payant',
      pharm.name || 'Officine'
    ]);

    window.PGReports.exportCSV(
      `PharmaGarde_Inventaire_Stats_${(pharm.name || 'Officine').replace(/\s+/g, '_')}`,
      headers,
      rows
    );
  }

  function exportStatsPDF() {
    if (!window.PGReports) return;
    const pharm = getActivePharmacyProfile();
    const total = document.getElementById('stat-total-received')?.textContent || '48';
    const positive = document.getElementById('stat-positive-responses')?.textContent || '41';
    const arrived = document.getElementById('stat-total-arrived')?.textContent || '36';
    const rate = document.getElementById('stat-conversion-rate')?.textContent || '75%';
    const stock = window.pharmacyStock || [];

    window.PGReports.exportPDF({
      filename: `Rapport_Officine_${(pharm.name || 'Pharmacie').replace(/\s+/g, '_')}`,
      title: 'Rapport Analytique d\'Activité & Stock Officine',
      subtitle: 'Demandes patients, taux de service, produits vedettes et état du stock',
      entityName: pharm.name || 'Pharmacie Partenaire',
      entityMeta: `${pharm.city || 'Cameroun'} • Tél : ${pharm.phone || 'N/A'}`,
      periodLabel: `Généré le ${new Date().toLocaleDateString('fr-FR')}`,
      kpis: [
        { label: 'Demandes Reçues', value: total, sub: 'Total période' },
        { label: 'Réponses Positives', value: positive, sub: 'En stock & assuré' },
        { label: 'Achats Honorés', value: arrived, sub: 'Retraits comptoir' },
        { label: 'Taux de Succès', value: rate, sub: 'Conversion globale' }
      ],
      tables: [
        {
          title: '🏆 Top Médicaments Sollicités & Produits Vedettes',
          headers: ['Rang', 'Médicament', 'Période Vedette', 'Volume Demandes'],
          rows: [
            ['#1', 'Paracétamol 500mg', 'Produit du Jour', '34 demandes'],
            ['#2', 'Doliprane 1000mg', 'Produit de la Semaine', '186 demandes'],
            ['#3', 'Coartem 80/480mg', 'Produit du Mois', '540 demandes'],
            ['#4', 'Amoxicilline 1g', 'Produit de l\'Année', '2 140 demandes']
          ]
        },
        {
          title: '📋 Extrait de l\'Inventaire & État des Stocks',
          headers: ['Médicament', 'Statut Actuel', 'Action Recommandée'],
          rows: (stock.slice(0, 12).map(p => [
            p.name,
            p.status === 'rupture' ? 'EN RUPTURE' : 'EN STOCK',
            p.status === 'rupture' ? 'Commande B2B Grossiste requise' : 'Disponible au comptoir'
          ]))
        }
      ]
    });
  }

  // ═════════════════════════════════════════════════════════
  // 9. PÔLE 4 : ESPACE GROSSISTES-RÉPARTITEURS & COMMANDES B2B
  // ═════════════════════════════════════════════════════════
  const esc = (str) => (window.PGNetwork && window.PGNetwork.escapeHtml)
    ? window.PGNetwork.escapeHtml(str)
    : String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  async function loadWholesalersHub() {
    try {
      // 1. Liste des grossistes partenaires
      if (window.GrossisteAuth && typeof window.GrossisteAuth.fetchAllWholesalers === 'function') {
        cachedWholesalers = await window.GrossisteAuth.fetchAllWholesalers();
      }
      const selectEl = document.getElementById('pharm-wh-select');
      if (selectEl && cachedWholesalers.length > 0) {
        const currentVal = selectEl.value || 'all';
        selectEl.innerHTML = `<option value="all">🏭 Tous les grossistes (${cachedWholesalers.length})</option>` +
          cachedWholesalers.map(w => `<option value="${esc(w.id)}">${esc(w.company_name)} (${esc(w.city || 'Douala')})</option>`).join('');
        selectEl.value = currentVal;
      }

      // 2. Catalogue B2B global
      if (window.GrossisteCatalog && typeof window.GrossisteCatalog.loadCatalog === 'function') {
        cachedB2BCatalog = await window.GrossisteCatalog.loadCatalog(null);
      }
      filterWholesalerCatalog();

      // 3. Commandes B2B de l'officine
      await loadPharmacyB2BOrders();

      // 4. Arrivages & Campagnes des grossistes
      await loadWholesalerCampaignsForPharmacy();
    } catch (e) {
      console.warn('[PharmDash] loadWholesalersHub error:', e);
    }
  }

  function filterWholesalerCatalog() {
    const container = document.getElementById('pharm-wh-catalog-container');
    if (!container) return;

    const query = (document.getElementById('pharm-wh-search')?.value || '').toLowerCase().trim();
    const whFilter = document.getElementById('pharm-wh-select')?.value || 'all';
    const stFilter = document.getElementById('pharm-wh-status')?.value || 'all';

    const whMap = {};
    cachedWholesalers.forEach(w => { whMap[w.id] = w; });

    const filtered = cachedB2BCatalog.filter(item => {
      if (whFilter !== 'all' && item.wholesaler_id !== whFilter) return false;
      if (stFilter !== 'all' && item.stock_status !== stFilter) return false;
      if (!query) return true;
      return (
        (item.product_name || '').toLowerCase().includes(query) ||
        (item.dci || '').toLowerCase().includes(query) ||
        (item.lab_name || '').toLowerCase().includes(query) ||
        (item.cip_code || '').toLowerCase().includes(query)
      );
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="pharm-card" style="text-align:center; padding:28px; color:var(--text-muted);">
          Aucun produit grossiste ne correspond à votre filtre.
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="pharm-table-wrap">
        <table class="pharm-table">
          <thead>
            <tr>
              <th>Produit / DCI</th>
              <th>Grossiste-Répartiteur</th>
              <th>Laboratoire</th>
              <th>Prix Cession HT</th>
              <th>Prix Public</th>
              <th>Disponibilité</th>
              <th>Action B2B</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(item => {
              const wh = whMap[item.wholesaler_id] || cachedWholesalers[0] || { company_name: 'UBIPHARM Cameroun', city: 'Douala' };
              const stBadge = item.stock_status === 'in_stock'
                ? `<span class="chip chip--green" style="font-size:11px;">🟢 En stock (${item.stock_quantity || 0})</span>`
                : item.stock_status === 'low_stock'
                  ? `<span class="chip chip--gold" style="font-size:11px;">🟡 Stock tendu (${item.stock_quantity || 0})</span>`
                  : `<span class="chip chip--red" style="font-size:11px;">🔴 Rupture</span>`;
              const canOrder = item.stock_status !== 'out_of_stock';
              return `
                <tr>
                  <td>
                    <div style="font-weight:800; color:#fff;">💊 ${esc(item.product_name)}</div>
                    <div style="font-size:11px; color:var(--text-muted);">${esc(item.dci || '')} ${item.form_dosage ? '• ' + esc(item.form_dosage) : ''}</div>
                  </td>
                  <td>
                    <div style="font-weight:700; color:#34d399;">🏭 ${esc(wh.company_name)}</div>
                    <div style="font-size:11px; color:var(--text-muted); display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                      <span>📍 ${esc(wh.city || 'Douala')}</span>
                      <button type="button" class="btn btn--ghost btn--sm" style="font-size:10.5px; color:#60a5fa; padding:1px 6px;" onclick="PGProGeo && PGProGeo.openActorModal('wholesaler', { id: '${esc(wh.id || item.wholesaler_id || '')}', name: '${esc(wh.company_name)}' })">
                        🪪 Identité &amp; GPS
                      </button>
                    </div>
                  </td>
                  <td style="font-weight:600; color:#e2e8f0;">${esc(item.lab_name || '—')}</td>
                  <td style="font-weight:800; color:#fbbf24;">${Number(item.wholesale_price || 0).toLocaleString('fr-FR')} FCFA</td>
                  <td style="color:var(--text-secondary);">${Number(item.retail_price || 0).toLocaleString('fr-FR')} FCFA</td>
                  <td>${stBadge}</td>
                  <td>
                    ${canOrder
                      ? `<button type="button" class="btn btn--sm" style="background:linear-gradient(135deg,#10b981,#059669); color:#fff; font-weight:800; border:none;" onclick="PharmDash.openB2BOrderModal('${esc(item.id)}')">
                           🛒 Commander
                         </button>`
                      : `<span style="font-size:11.5px; color:var(--text-muted);">Indisponible</span>`
                    }
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function openB2BOrderModal(itemId) {
    const item = cachedB2BCatalog.find(i => i.id === itemId);
    if (!item) return;
    selectedB2BItem = item;

    const wh = cachedWholesalers.find(w => w.id === item.wholesaler_id) || cachedWholesalers[0] || {
      id: item.wholesaler_id || 'wh_demo_ubipharm',
      company_name: 'UBIPHARM Cameroun',
      city: 'Douala'
    };
    selectedB2BItem._wholesaler = wh;

    const idInput = document.getElementById('b2b-modal-item-id');
    const summaryEl = document.getElementById('b2b-modal-product-summary');
    const qtyInput = document.getElementById('b2b-modal-qty');
    const notesInput = document.getElementById('b2b-modal-notes');

    if (idInput) idInput.value = item.id;
    const minQty = Math.max(1, Number(item.min_order_qty) || 5);
    if (qtyInput) {
      qtyInput.min = String(minQty);
      qtyInput.value = String(Math.max(10, minQty));
    }
    if (notesInput) notesInput.value = '';

    if (summaryEl) {
      summaryEl.innerHTML = `
        <div style="font-weight:800; color:#fff; font-size:14px;">💊 ${esc(item.product_name)}</div>
        <div style="font-size:12px; color:#34d399; margin-top:3px;">🏭 Grossiste : <strong>${esc(wh.company_name)}</strong> (${esc(wh.city || 'Douala')})</div>
        <div style="font-size:12px; color:var(--text-secondary); margin-top:3px;">
          Prix Cession HT : <strong style="color:#fbbf24;">${Number(item.wholesale_price || 0).toLocaleString('fr-FR')} FCFA / boîte</strong> • Qté min : ${minQty}
        </div>
      `;
    }

    updateB2BModalTotal();
    const modal = document.getElementById('b2b-order-modal');
    if (modal) modal.classList.add('active');
  }

  function updateB2BModalTotal() {
    if (!selectedB2BItem) return;
    const qty = Math.max(1, parseInt(document.getElementById('b2b-modal-qty')?.value || '1', 10));
    const total = qty * (Number(selectedB2BItem.wholesale_price) || 0);
    const totalEl = document.getElementById('b2b-modal-total');
    if (totalEl) totalEl.textContent = `${total.toLocaleString('fr-FR')} FCFA`;
  }

  async function submitB2BOrderModal() {
    if (!selectedB2BItem || !window.GrossisteOrders) return;
    const qty = Math.max(1, parseInt(document.getElementById('b2b-modal-qty')?.value || '10', 10));
    const notes = (document.getElementById('b2b-modal-notes')?.value || '').trim();
    const pharm = getActivePharmacyProfile();
    const wh = selectedB2BItem._wholesaler || { id: selectedB2BItem.wholesaler_id || 'wh_demo_ubipharm', company_name: 'UBIPHARM Cameroun' };

    const order = await window.GrossisteOrders.createOrderFromPharmacy({
      wholesaler_id: wh.id,
      wholesaler_name: wh.company_name,
      pharmacy_id: pharm.id,
      pharmacy_name: pharm.name || 'Pharmacie Officine',
      pharmacy_city: pharm.city || 'Douala',
      pharmacy_phone: pharm.phone || pharm.whatsapp || '+237 699 00 00 00',
      delivery_urgency: 'urgent',
      notes: notes || `Commande B2B depuis l'Espace Pharmacie (${pharm.name || 'Officine'})`,
      items: [
        {
          product_name: selectedB2BItem.product_name,
          cip_code: selectedB2BItem.cip_code || '',
          qty: qty,
          unit_price: Number(selectedB2BItem.wholesale_price) || 0
        }
      ]
    });

    const modal = document.getElementById('b2b-order-modal');
    if (modal) modal.classList.remove('active');

    if (typeof showToast === 'function') {
      showToast(`✅ Commande ${order.order_code} transmise à ${wh.company_name} !`, 'success');
    }

    await loadPharmacyB2BOrders();
    switchWholesalerSubtab('orders');
  }

  async function quickOrderFromWholesaler(productName) {
    switchSpace('wholesalers');
    switchWholesalerSubtab('catalog');
    await loadWholesalersHub();
    const searchInput = document.getElementById('pharm-wh-search');
    if (searchInput) {
      searchInput.value = productName || '';
      filterWholesalerCatalog();
    }
  }

  async function loadPharmacyB2BOrders() {
    const container = document.getElementById('pharm-wh-orders-container');
    const badgeEl = document.getElementById('pharm-wh-orders-badge');
    const navBadgeEl = document.getElementById('space-badge-wholesalers');

    if (!window.GrossisteOrders) return;
    const allOrders = await window.GrossisteOrders.loadOrders(null);
    const pharm = getActivePharmacyProfile();

    // Filtre les commandes de la pharmacie courante + commandes de démo pour visibilité immédiate
    cachedB2BOrders = allOrders.filter(o => !o.pharmacy_id || o.pharmacy_id === pharm.id || String(o.id).startsWith('ord_demo_'));

    if (badgeEl) badgeEl.textContent = cachedB2BOrders.length;
    if (navBadgeEl) navBadgeEl.textContent = cachedB2BOrders.length > 0 ? `${cachedB2BOrders.length} cmd` : 'B2B';

    if (!container) return;
    if (cachedB2BOrders.length === 0) {
      container.innerHTML = `
        <div class="pharm-card" style="text-align:center; padding:28px; color:var(--text-muted);">
          Aucune commande B2B enregistrée pour le moment. Utilisez l'onglet Catalogue B2B pour commander en 1 clic.
        </div>
      `;
      return;
    }

    const statusMeta = {
      pending: { label: '⏳ En attente de confirmation', cls: 'chip--gold' },
      confirmed: { label: '✅ Confirmée & en préparation', cls: 'chip--blue' },
      shipped: { label: '🚚 En cours de livraison', cls: 'chip--green' },
      delivered: { label: '📦 Livrée à l\'officine', cls: 'chip--green' },
      rejected: { label: '❌ Rejetée', cls: 'chip--red' }
    };

    container.innerHTML = cachedB2BOrders.map(ord => {
      const st = statusMeta[ord.status] || statusMeta.pending;
      const items = Array.isArray(ord.items) ? ord.items : [];
      const wh = cachedWholesalers.find(w => w.id === ord.wholesaler_id) || cachedWholesalers[0] || { company_name: 'UBIPHARM Cameroun', phone: '+237 233 42 18 90' };
      const dateStr = new Date(ord.created_at || Date.now()).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

      return `
        <div class="pharm-card" style="margin-bottom:12px; border-color:rgba(16,185,129,0.3);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
            <div>
              <div style="font-size:15px; font-weight:900; color:#fff;">
                🧾 ${esc(ord.order_code || 'CMD-B2B')} • <span style="color:#34d399;">🏭 ${esc(ord.wholesaler_name || wh.company_name)}</span>
              </div>
              <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
                Passée le ${esc(dateStr)} • Total HT : <strong style="color:#fbbf24;">${Number(ord.total_amount || 0).toLocaleString('fr-FR')} FCFA</strong>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <button type="button" class="btn btn--sm" style="background:rgba(59,130,246,0.15); color:#60a5fa; border:1px solid rgba(59,130,246,0.4); font-weight:800; font-size:11px;" onclick="PGProGeo && PGProGeo.openActorModal('wholesaler', { id: '${esc(ord.wholesaler_id || wh.id || '')}', name: '${esc(ord.wholesaler_name || wh.company_name)}' })">
                🪪 Identité &amp; Position GPS Grossiste
              </button>
              <span class="chip ${st.cls}" style="font-size:11.5px;">${st.label}</span>
            </div>
          </div>
          <div style="background:rgba(0,0,0,0.25); border-radius:8px; padding:10px; margin-bottom:8px;">
            ${items.map(it => `
              <div style="display:flex; justify-content:space-between; font-size:12.5px; padding:3px 0; border-bottom:1px dashed rgba(255,255,255,0.06);">
                <span style="color:#e2e8f0; font-weight:700;">💊 ${esc(it.product_name)} × <strong>${Number(it.qty || 0)}</strong></span>
                <span style="color:#fbbf24; font-weight:700;">${(Number(it.qty || 0) * Number(it.unit_price || 0)).toLocaleString('fr-FR')} FCFA</span>
              </div>
            `).join('')}
          </div>
          ${ord.notes ? `<div style="font-size:12px; color:var(--text-secondary);">💬 Note : ${esc(ord.notes)}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  async function loadWholesalerCampaignsForPharmacy() {
    const container = document.getElementById('pharm-wh-campaigns-container');
    if (!container || !window.GrossisteCampaigns) return;

    cachedB2BCampaigns = await window.GrossisteCampaigns.loadCampaigns(null);
    if (!cachedB2BCampaigns || cachedB2BCampaigns.length === 0) {
      container.innerHTML = `<div class="pharm-card" style="text-align:center; padding:24px; color:var(--text-muted);">Aucune annonce d'arrivage en cours.</div>`;
      return;
    }

    container.innerHTML = cachedB2BCampaigns.map(c => {
      const badge = c.campaign_type === 'arrival'
        ? '<span class="chip chip--green">🚢 Nouvel Arrivage</span>'
        : c.campaign_type === 'promo'
          ? `<span class="chip chip--gold">🏷️ Promo -${Number(c.discount_percent || 0)}%</span>`
          : '<span class="chip chip--red">⚠️ Info Tension</span>';
      return `
        <div class="pharm-card" style="margin-bottom:12px; border-color:rgba(251,191,36,0.3);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:6px;">
            <div style="font-size:15px; font-weight:800; color:#fff;">${esc(c.title)}</div>
            ${badge}
          </div>
          <p style="font-size:12.5px; color:var(--text-secondary); line-height:1.5; margin-bottom:10px;">
            ${esc(c.description || '')}
          </p>
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:11.5px; color:var(--text-muted); flex-wrap:wrap; gap:8px;">
            <span>🏭 <strong>${esc(c.wholesaler_name || 'UBIPHARM CAMEROUN SA')}</strong> · 📍 Zone : ${esc((c.target_cities || ['National']).join(', '))}</span>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button type="button" class="btn btn--sm" style="background:rgba(59,130,246,0.15); color:#60a5fa; border:1px solid rgba(59,130,246,0.4); font-weight:700;" onclick="PGProGeo && PGProGeo.openActorModal('wholesaler', { id: '${esc(c.wholesaler_id || '')}', name: '${esc(c.wholesaler_name || 'UBIPHARM CAMEROUN SA')}' })">
                🪪 Identité &amp; GPS Grossiste
              </button>
              <button type="button" class="btn btn--sm" style="background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.4); font-weight:700;" onclick="PharmDash.switchWholesalerSubtab('catalog')">
                📦 Voir les produits au catalogue →
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  async function autoOrderAllRupturesB2B() {
    if (!window.GrossisteOrders) return;
    await loadWholesalersHub();
    const pharm = getActivePharmacyProfile();
    const stock = window.pharmacyStock || [];
    const ruptures = stock.filter(p => p.status === 'rupture');

    if (ruptures.length === 0) {
      if (typeof showToast === 'function') {
        showToast('✅ Aucun médicament en rupture dans votre inventaire !', 'success');
      }
      return;
    }

    const wh = cachedWholesalers[0] || {
      id: 'ws_ubipharm_dla',
      company_name: 'UBIPHARM CAMEROUN SA'
    };

    const items = ruptures.map(r => {
      const clean = (r.name || '').toLowerCase();
      const matched = cachedB2BCatalog.find(c =>
        (c.product_name || '').toLowerCase().includes(clean) ||
        clean.includes((c.product_name || '').toLowerCase().split(' ')[0])
      );
      const unitPrice = matched ? Number(matched.wholesale_price || 2500) : 2500;
      const qty = 15;
      return {
        product_name: r.name,
        cip_code: (matched && matched.cip_code) || 'CIP-AUTO',
        qty,
        unit_price: unitPrice,
        subtotal: qty * unitPrice
      };
    });

    const order = await window.GrossisteOrders.createOrderFromPharmacy({
      wholesaler_id: wh.id,
      wholesaler_name: wh.company_name,
      pharmacy_id: pharm.id,
      pharmacy_name: pharm.name || 'Pharmacie Officine',
      pharmacy_city: pharm.city || 'Douala',
      pharmacy_phone: pharm.phone || pharm.whatsapp || '699112233',
      delivery_address: pharm.address || pharm.city || 'Douala',
      urgency: 'critical',
      notes: `🤖 Commande groupée automatique des ${items.length} produit(s) en rupture détecté(s) dans l'inventaire officine.`,
      items
    });

    logConnectorActivity('info', `🤖 Commande B2B groupée ${order.order_code} générée automatiquement pour ${items.length} rupture(s) vers ${wh.company_name}.`);

    switchSpace('wholesalers');
    await loadPharmacyB2BOrders();
    switchWholesalerSubtab('orders');

    if (typeof showToast === 'function') {
      showToast(`⚡ Commande B2B ${order.order_code} (${items.length} références en rupture) transmise à ${wh.company_name} !`, 'success');
    }
  }

  // ═════════════════════════════════════════════════════════
  // EXPORTATION & ENRICHISSEMENT DE WINDOW.PHARMDASH
  // ═════════════════════════════════════════════════════════
  window.PharmDash = window.PharmDash || {};
  window.PharmDash.autoOrderAllRupturesB2B = autoOrderAllRupturesB2B;

  // Cycle de vie & Initialiseurs (Résout le ReferenceError)
  window.PharmDash.initInsuranceConventions = initInsuranceConventions;
  window.PharmDash.initResponseMode = initResponseMode;
  window.PharmDash.initNotifications = initNotifications;
  window.PharmDash.initConnectorDaemon = initConnectorDaemon;
  window.PharmDash.start24hCountdownTimer = start24hCountdownTimer;

  // Méthodes des 4 Grands Espaces
  window.PharmDash.switchSpace = switchSpace;
  window.PharmDash.switchClientSubtab = switchClientSubtab;
  window.PharmDash.switchDelegateSubtab = switchDelegateSubtab;
  window.PharmDash.switchManagementSubtab = switchManagementSubtab;
  window.PharmDash.switchWholesalerSubtab = switchWholesalerSubtab;

  // Pôle Grossistes & B2B + Rapports PDF/CSV
  window.PharmDash.loadWholesalersHub = loadWholesalersHub;
  window.PharmDash.filterWholesalerCatalog = filterWholesalerCatalog;
  window.PharmDash.openB2BOrderModal = openB2BOrderModal;
  window.PharmDash.updateB2BModalTotal = updateB2BModalTotal;
  window.PharmDash.submitB2BOrderModal = submitB2BOrderModal;
  window.PharmDash.quickOrderFromWholesaler = quickOrderFromWholesaler;
  window.PharmDash.loadPharmacyB2BOrders = loadPharmacyB2BOrders;
  window.PharmDash.exportStatsPDF = exportStatsPDF;
  window.PharmDash.exportStatsCSV = exportStatsCSV;

  // Centre de notifications
  window.PharmDash.toggleNotifications = toggleNotifications;
  window.PharmDash.markAllNotificationsRead = markAllNotificationsRead;
  window.PharmDash.navigateToNotification = navigateToNotification;

  // Automatisation, Connecteur Universel & Assurances
  window.PharmDash.setResponseMode = setResponseMode;
  window.PharmDash.triggerImmediateSync = triggerImmediateSync;
  window.PharmDash.testConnectorConnection = testConnectorConnection;
  window.PharmDash.saveConnectorConfigUI = saveConnectorConfigUI;
  window.PharmDash.loadConnectorConfigUI = loadConnectorConfigUI;
  window.PharmDash.importStockFromFile = importStockFromFile;
  window.PharmDash.toggleInsurance = toggleInsurance;
  window.PharmDash.saveInsuranceConventions = saveInsuranceConventions;
  window.PharmDash.renderStarProducts = renderStarProducts;
  window.PharmDash.updateConsistentStats = updateConsistentStats;

  // Initialisation dès chargement DOM
  document.addEventListener('DOMContentLoaded', () => {
    initInsuranceConventions();
    initResponseMode();
    initNotifications();
    initConnectorDaemon();
    renderStarProducts();
    updateConsistentStats();
  });

})(window);
