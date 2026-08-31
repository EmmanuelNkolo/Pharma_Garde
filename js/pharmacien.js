/**
 * Pharma-Garde — Pharmacist Dashboard Controller (Espace Pharmacie)
 * Manages the pharmacist-facing interface
 */

(function () {
  // ── Mock Data for Dashboard ────────────────────────────
  let ACTIVE_REQUESTS = [];
  let currentPharmacyId = null;

  const HISTORY_DATA = [
    { medicine: 'Quinine comprimés', status: 'responded', date: 'Auj. 18:30', patient: '4.1 km' },
    { medicine: 'Oméprazole 20mg', status: 'responded', date: 'Auj. 16:15', patient: '2.3 km' },
    { medicine: 'Insuline Mixte', status: 'rupture', date: 'Auj. 14:42', patient: '7.8 km' },
    { medicine: 'Fer + Acide Folique', status: 'responded', date: 'Auj. 12:10', patient: '3.5 km' },
    { medicine: 'Salbutamol Inhalateur', status: 'ignored', date: 'Auj. 10:05', patient: '9.2 km' },
    { medicine: 'Azithromycine 500mg', status: 'responded', date: 'Hier 22:30', patient: '1.8 km' },
    { medicine: 'Diclofénac Injectable', status: 'responded', date: 'Hier 20:15', patient: '5.6 km' },
    { medicine: 'Sérum physiologique', status: 'rupture', date: 'Hier 17:40', patient: '2.1 km' },
    { medicine: 'Metformine 500mg', status: 'responded', date: 'Hier 15:00', patient: '4.4 km' },
    { medicine: 'Prednisolone 5mg', status: 'responded', date: 'Hier 11:20', patient: '6.3 km' },
  ];

  const RESERVATIONS = [
    {
      medicine: 'Artésunate Injectable',
      patient: 'Patient à 3.2 km',
      time: '47:23',
      amount: '100 FCFA',
      phone: '6XX XXX XXX',
    },
  ];

  const TOP_MEDICATIONS = [
    { name: 'Paracétamol 500mg', count: 45 },
    { name: 'Amoxicilline 500mg', count: 32 },
    { name: 'Artésunate Injectable', count: 28 },
    { name: 'Oméprazole 20mg', count: 19 },
    { name: 'Diclofénac 50mg', count: 15 },
  ];

  // ── DOM References ─────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const loginScreen = $('#login-screen');
  const dashboard = $('#dashboard');
  const btnLogin = $('#btn-login');
  const pharmacyNameInput = $('#pharmacy-name-input');
  const dashPharmacyName = $('#dash-pharmacy-name');

  const activeRequests = $('#active-requests');
  const historyList = $('#history-list');
  const reservationsList = $('#reservations-list');
  const topMedications = $('#top-medications');

  const toast = $('#toast');
  const toastMessage = $('#toast-message');

  const confirmModal = $('#confirm-modal');
  const confirmText = $('#confirm-text');
  const btnConfirmOk = $('#btn-confirm-ok');

  // ── Init ───────────────────────────────────────────────
  function init() {
    // Login / Register tab switching
    bindLoginTabs();

    if (btnLogin) btnLogin.addEventListener('click', handleLogin);
    const btnRegister = $('#btn-register');
    if (btnRegister) btnRegister.addEventListener('click', handleRegister);

    if (btnConfirmOk) btnConfirmOk.addEventListener('click', executeConfirm);
    bindTabs();
    bindGuardSwitch();
    
    const btnLogout = $('#btn-logout');
    if (btnLogout) btnLogout.addEventListener('click', handleLogout);
    
    const btnDeregister = $('#btn-deregister');
    if (btnDeregister) btnDeregister.addEventListener('click', handleDeregister);
    
    // If supabase is available, fetch pending requests
    if (typeof supabase !== 'undefined') {
      fetchPendingRequests();
      subscribeToRequests();
    }
  }

  // ── Login/Register Tabs ────────────────────────────────
  function bindLoginTabs() {
    const tabLogin = $('#tab-login');
    const tabRegister = $('#tab-register');
    const formLogin = $('#form-login');
    const formRegister = $('#form-register');

    if (tabLogin && tabRegister) {
      tabLogin.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        if (formLogin) formLogin.style.display = 'block';
        if (formRegister) formRegister.style.display = 'none';
      });

      tabRegister.addEventListener('click', () => {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        if (formLogin) formLogin.style.display = 'none';
        if (formRegister) formRegister.style.display = 'block';
      });
    }
  }

  async function fetchPendingRequests() {
    try {
      const { data, error } = await supabase
        .from('requests')
        .select('*')
        .eq('status', 'pending');
        
      if (data) {
        ACTIVE_REQUESTS = data.map(req => ({
          id: req.id,
          medicines: req.medicines,
          patientDistance: 'À proximité',
          time: new Date(req.created_at).toLocaleTimeString(),
          urgent: true,
          phone: req.user_phone,
          insurance_name: req.insurance_name
        }));
        renderActiveRequests();
      }
    } catch(err) { console.error('Fetch requests error:', err); }
  }

  function subscribeToRequests() {
    try {
      supabase
        .channel('public_requests')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'requests' }, payload => {
          const req = payload.new;
          if (req.status === 'pending') {
            ACTIVE_REQUESTS.unshift({
              id: req.id,
              medicines: req.medicines,
              patientDistance: 'Nouvelle demande',
              time: new Date(req.created_at).toLocaleTimeString(),
              urgent: true,
              phone: req.user_phone,
              insurance_name: req.insurance_name
            });
            renderActiveRequests();
            showToast('🔔 Nouvelle demande de patient !', 'info');
          }
        })
        .subscribe();
    } catch(err) { console.error('Subscribe error:', err); }
  }

  // ── Login & Register ─────────────────────────────────────
  async function handleRegister() {
    const nameInput = document.querySelector('#form-register input[placeholder="Nom de la pharmacie"]');
    const addressInput = document.querySelector('#form-register input[placeholder="Ville et Quartier"]');
    const phoneInput = $('#reg-phone-input');
    const whatsappInput = $('#reg-whatsapp-input');
    const emailInput = $('#reg-email-input');
    const hourOpen = $('#reg-hour-open');
    const hourClose = $('#reg-hour-close');
    
    const name = nameInput ? nameInput.value.trim() : '';
    const address = addressInput ? addressInput.value.trim() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';

    if (!name || !address) {
      showToast('Veuillez remplir le nom et l\'adresse', 'error');
      return;
    }

    const btn = $('#btn-register');
    const originalText = btn.textContent;
    btn.textContent = 'Création en cours...';
    btn.disabled = true;

    try {
      // Generate approximate position
      const lat = 3.8480 + (Math.random() - 0.5) * 0.05;
      const lng = 11.5021 + (Math.random() - 0.5) * 0.05;

      const hours = (hourOpen ? hourOpen.value : '08:00') + ' - ' + (hourClose ? hourClose.value : '21:00');

      const insertData = {
        name: name,
        address: address,
        phone: phone,
        lat: lat,
        lng: lng,
        status: 'open',
        hours: hours,
      };

      // Add optional fields
      if (whatsappInput && whatsappInput.value.trim()) {
        insertData.whatsapp = whatsappInput.value.trim();
      }
      if (emailInput && emailInput.value.trim()) {
        insertData.email = emailInput.value.trim();
      }

      if (typeof supabase !== 'undefined') {
        const { data, error } = await supabase
          .from('pharmacies')
          .insert([insertData])
          .select();

        if (error) throw error;

        showToast('✅ Pharmacie inscrite avec succès !', 'success');
        
        // Auto-login
        if (data && data[0]) {
          currentPharmacyId = data[0].id;
        }
        if (pharmacyNameInput) pharmacyNameInput.value = name;
        handleLogin();
      } else {
        // Offline mode - just login
        showToast('✅ Inscription simulée (mode hors-ligne)', 'success');
        if (pharmacyNameInput) pharmacyNameInput.value = name;
        handleLogin();
      }
      
    } catch(err) {
      console.error(err);
      showToast('Erreur lors de l\'inscription: ' + (err.message || ''), 'error');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  function handleLogin() {
    const name = pharmacyNameInput ? pharmacyNameInput.value.trim() : '';
    if (!name) {
      showToast('Veuillez entrer le nom de votre pharmacie', 'error');
      return;
    }

    if (loginScreen) loginScreen.classList.add('hidden');
    if (dashboard) dashboard.classList.remove('hidden');
    if (dashPharmacyName) dashPharmacyName.textContent = name;

    // Render dashboard data
    renderActiveRequests();
    renderHistory();
    renderReservations();
    renderTopMedications();

    showToast('✅ Connexion réussie — Bienvenue !', 'success');
  }

  function handleLogout() {
    if (dashboard) dashboard.classList.add('hidden');
    if (loginScreen) loginScreen.classList.remove('hidden');
    if (pharmacyNameInput) pharmacyNameInput.value = '';
    currentPharmacyId = null;
    showToast('Déconnexion réussie', 'info');
  }

  async function handleDeregister() {
    if (!confirm("Êtes-vous sûr de vouloir désinscrire votre pharmacie ? Cela supprimera votre compte et vous ne recevrez plus de demandes.")) {
      return;
    }
    
    if (currentPharmacyId && typeof supabase !== 'undefined') {
      try {
        await supabase
          .from('pharmacies')
          .delete()
          .eq('id', currentPharmacyId);
        showToast('Pharmacie désinscrite avec succès', 'success');
      } catch (err) {
        console.error(err);
        showToast("Erreur lors de la désinscription", 'error');
      }
    }
    
    handleLogout();
  }

  // ── Tabs ───────────────────────────────────────────────
  function bindTabs() {
    $$('.dash-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        switchToTab(tab.dataset.tab);
      });
    });

    // Make stats cards clickable
    const statCards = $$('.stat-card');
    if (statCards.length >= 4) {
      statCards[0].style.cursor = 'pointer';
      statCards[0].addEventListener('click', () => {
        switchToTab('history');
        const filterSelect = $('#history-filter-status');
        if (filterSelect) {
          filterSelect.value = 'all';
          renderHistory('all');
        }
      });

      statCards[1].style.cursor = 'pointer';
      statCards[1].addEventListener('click', () => {
        switchToTab('history');
        const filterSelect = $('#history-filter-status');
        if (filterSelect) {
          filterSelect.value = 'responded';
          renderHistory('responded');
        }
      });

      statCards[2].style.cursor = 'pointer';
      statCards[2].addEventListener('click', () => {
        switchToTab('active');
      });

      statCards[3].style.cursor = 'pointer';
      statCards[3].addEventListener('click', () => {
        switchToTab('reservations');
      });
    }
  }

  function switchToTab(tabId) {
    $$('.dash-tab').forEach((t) => t.classList.remove('active'));
    $$('.dash-tab-content').forEach((c) => c.classList.remove('active'));

    const tabBtn = $(`.dash-tab[data-tab="${tabId}"]`);
    if (tabBtn) tabBtn.classList.add('active');
    
    const tabContent = $(`#tab-${tabId}`);
    if (tabContent) tabContent.classList.add('active');
  }

  // ── Guard Status Switch ────────────────────────────────
  function bindGuardSwitch() {
    $$('.guard-option').forEach((option) => {
      option.addEventListener('click', () => {
        $$('.guard-option').forEach((o) => o.classList.remove('active'));
        option.classList.add('active');

        const status = option.dataset.status;
        const labels = {
          open: 'Statut : Ouvert',
          guard: 'Statut : De garde 🌙',
          closed: 'Statut : Fermé',
        };
        const labelEl = $('#guard-label');
        if (labelEl) labelEl.textContent = labels[status];

        const messages = {
          open: '✅ Votre pharmacie est maintenant marquée comme OUVERTE',
          guard: '🌙 Votre pharmacie est maintenant en mode GARDE',
          closed: '❌ Votre pharmacie est maintenant marquée comme FERMÉE',
        };
        showToast(messages[status], 'success');

        // Update in Supabase if available
        if (currentPharmacyId && typeof supabase !== 'undefined') {
          supabase.from('pharmacies').update({ status }).eq('id', currentPharmacyId).then(() => {});
        }
      });
    });
  }

  function renderActiveRequests() {
    if (!activeRequests) return;
    
    if (ACTIVE_REQUESTS.length === 0) {
      activeRequests.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-text">Aucune demande en cours. Les demandes de patients apparaîtront ici en temps réel.</div>
        </div>
      `;
      return;
    }

    activeRequests.innerHTML = ACTIVE_REQUESTS
      .map(
        (req) => `
        <div class="request-card ${req.urgent ? 'urgent' : ''}" id="request-${req.id}">
          <div class="request-header">
            <div class="request-time">${req.time}</div>
            <div class="request-patient-info">
              <span>📍 Patient à ${req.patientDistance}</span>
              ${req.insurance_name ? `<br><span style="color:var(--green-400); font-weight:bold; font-size:12px;">🛡️ Assurance : ${req.insurance_name}</span>` : ''}
            </div>
          </div>
          <div class="request-products-list">
            ${req.medicines.map((med, idx) => `
              <div class="request-product-item" id="product-${req.id}-${idx}" style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; margin-bottom: 8px; display: flex; flex-direction: column; gap: 8px;">
                <div class="request-medicine" style="font-weight: bold;">💊 ${med}</div>
                <div class="request-actions" style="display: flex; gap: 8px; flex-wrap: wrap;">
                  ${req.insurance_name ? `
                    <button class="btn btn-in-stock" style="padding: 6px 10px; font-size: 11px;" onclick="PharmDash.confirmProductResponse('${req.id}', ${idx}, '${med.replace(/'/g, "\\'")}', 'in_stock_insured')">✅ Disponible & Assuré</button>
                    <button class="btn btn-outline" style="padding: 6px 10px; font-size: 11px; background:var(--dark-700); border-color:var(--gold-500); color:var(--gold-400);" onclick="PharmDash.confirmProductResponse('${req.id}', ${idx}, '${med.replace(/'/g, "\\'")}', 'in_stock_uninsured')">⚠️ Dispo (Non assuré)</button>
                    <button class="btn btn-out-stock" style="padding: 6px 10px; font-size: 11px;" onclick="PharmDash.confirmProductResponse('${req.id}', ${idx}, '${med.replace(/'/g, "\\'")}', 'out_of_stock')">❌ Non disponible</button>
                  ` : `
                    <button class="btn btn-in-stock" style="padding: 6px 12px; font-size: 12px;" onclick="PharmDash.confirmProductResponse('${req.id}', ${idx}, '${med.replace(/'/g, "\\'")}', 'in_stock')">✅ OUI (Disponible)</button>
                    <button class="btn btn-out-stock" style="padding: 6px 12px; font-size: 12px;" onclick="PharmDash.confirmProductResponse('${req.id}', ${idx}, '${med.replace(/'/g, "\\'")}', 'out_of_stock')">❌ NON (Rupture)</button>
                  `}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `
      )
      .join('');
  }

  // ── Render History ─────────────────────────────────────
  function renderHistory(filter = 'all') {
    if (!historyList) return;
    
    const filtered = filter === 'all' 
      ? HISTORY_DATA 
      : HISTORY_DATA.filter((item) => item.status === filter);

    if (filtered.length === 0) {
      historyList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <div class="empty-state-text">Aucun historique pour ce filtre.</div>
        </div>
      `;
      return;
    }

    historyList.innerHTML = filtered
      .map((item) => {
        let statusBadge;
        if (item.status === 'responded') {
          statusBadge = '<span class="badge badge-stock">✅ En stock</span>';
        } else if (item.status === 'rupture') {
          statusBadge = '<span class="badge badge-rupture">❌ Rupture</span>';
        } else {
          statusBadge = '<span class="badge badge-closed">⏭️ Ignorée</span>';
        }

        return `
          <div class="history-item">
            <div class="history-item-info">
              <div class="history-item-medicine">💊 ${item.medicine}</div>
              <div class="history-item-meta">
                <span>📅 ${item.date}</span>
                <span>📍 ${item.patient}</span>
              </div>
            </div>
            <div class="history-item-status">${statusBadge}</div>
          </div>
        `;
      })
      .join('');

    // Bind filter change
    const filterSelect = $('#history-filter-status');
    if (filterSelect && !filterSelect.dataset.bound) {
      filterSelect.dataset.bound = 'true';
      filterSelect.addEventListener('change', (e) => {
        renderHistory(e.target.value);
      });
    }
  }

  // ── Render Reservations ────────────────────────────────
  function renderReservations() {
    if (!reservationsList) return;
    
    if (RESERVATIONS.length === 0) {
      reservationsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔒</div>
          <div class="empty-state-text">Aucune réservation en cours.</div>
        </div>
      `;
      return;
    }

    reservationsList.innerHTML = RESERVATIONS
      .map(
        (res, i) => `
        <div class="reservation-item">
          <div class="reservation-header">
            <div class="reservation-medicine">
              <span>🔒</span>
              <span>${res.medicine}</span>
            </div>
            <div class="reservation-timer">⏰ ${res.time}</div>
          </div>
          <div class="reservation-details">
            <div>📍 ${res.patient} • 💳 ${res.amount} payé</div>
          </div>
          <div class="reservation-actions">
            <button class="btn btn-primary btn-sm" onclick="PharmDash.confirmPickup(${i})">
              ✅ Récupéré par le patient
            </button>
            <button class="btn btn-outline btn-sm" onclick="PharmDash.cancelReservation(${i})">
              ❌ Annuler
            </button>
          </div>
        </div>
      `
      )
      .join('');
  }

  // ── Render Top Medications ─────────────────────────────
  function renderTopMedications() {
    if (!topMedications) return;
    
    const maxCount = Math.max(...TOP_MEDICATIONS.map((m) => m.count));

    topMedications.innerHTML = TOP_MEDICATIONS
      .map(
        (med) => `
        <div class="med-bar">
          <div class="med-bar-label">${med.name}</div>
          <div class="med-bar-track">
            <div class="med-bar-fill" style="width: ${(med.count / maxCount) * 100}%">
              ${med.count}
            </div>
          </div>
        </div>
      `
      )
      .join('');
  }

  // ── Handle Product Responses ───────────────────────────
  let pendingAction = null;

  function confirmProductResponse(reqId, pIdx, medName, statusType) {
    pendingAction = () => respondToProduct(reqId, pIdx, medName, statusType);
    let actionText = "";
    if (statusType === 'in_stock_insured') actionText = "Disponible & Assuré";
    else if (statusType === 'in_stock_uninsured') actionText = "Disponible mais non couvert";
    else if (statusType === 'in_stock') actionText = "OUI (En stock)";
    else actionText = "NON (Rupture)";
    
    if (confirmText) confirmText.textContent = `Confirmez-vous le statut pour "${medName}" : ${actionText} ?`;
    if (confirmModal) confirmModal.style.display = 'flex';
  }

  function executeConfirm() {
    if (pendingAction) pendingAction();
    if (confirmModal) confirmModal.style.display = 'none';
    pendingAction = null;
  }

  async function respondToProduct(reqId, pIdx, medName, statusType) {
    const productEl = $(`#product-${reqId}-${pIdx}`);
    if (!productEl) return;

    if (statusType === 'in_stock' || statusType === 'in_stock_insured' || statusType === 'in_stock_uninsured') {
      let msg = 'En stock';
      if (statusType === 'in_stock_insured') msg = 'En stock (Couvert)';
      if (statusType === 'in_stock_uninsured') msg = 'En stock (Non couvert par l\'assurance)';
      
      let color = (statusType === 'in_stock_uninsured') ? 'var(--gold-400)' : 'var(--green-400)';
      
      productEl.innerHTML = `<div style="color: ${color}; font-weight:bold;">✅ ${medName} (${msg})</div>`;
      showToast(`✅ Réponse "${msg}" envoyée`, 'success');
      
      const respondedEl = $('#stat-responded');
      if (respondedEl) {
        const responded = parseInt(respondedEl.textContent);
        respondedEl.textContent = responded + 1;
      }

      // Update Supabase
      if (typeof supabase !== 'undefined' && reqId && !reqId.toString().startsWith('req-')) {
        try {
          await supabase
            .from('requests')
            .update({ status: 'accepted', pharmacy_id: currentPharmacyId })
            .eq('id', reqId);
        } catch(e) { console.error(e); }
      }

    } else {
      productEl.innerHTML = `<div style="color: var(--red-400); font-weight:bold; opacity: 0.7;">❌ ${medName} (Rupture)</div>`;
      showToast('❌ Réponse "Rupture" enregistrée', 'info');
    }
    
    // Check if all products in request are answered
    const reqCard = $(`#request-${reqId}`);
    if (reqCard) {
      const remainingBtns = reqCard.querySelectorAll('.btn-in-stock').length;
      if (remainingBtns === 0) {
        setTimeout(() => {
          reqCard.style.transition = 'all 0.3s ease';
          reqCard.style.opacity = '0';
          setTimeout(() => reqCard.remove(), 300);
        }, 1500);
        
        const pendingEl = $('#stat-pending');
        const activeBadge = $('#active-badge');
        if (pendingEl) {
          const pending = parseInt(pendingEl.textContent);
          pendingEl.textContent = Math.max(0, pending - 1);
        }
        if (activeBadge) {
          const pending = parseInt(activeBadge.textContent);
          activeBadge.textContent = Math.max(0, pending - 1);
        }
      }
    }
  }

  function confirmPickup(index) {
    showToast('✅ Médicament récupéré par le patient. Réservation terminée.', 'success');
    RESERVATIONS.splice(index, 1);
    renderReservations();
    const reservedEl = $('#stat-reserved');
    const reserveBadge = $('#reserve-badge');
    if (reservedEl) {
      const reserved = parseInt(reservedEl.textContent);
      reservedEl.textContent = Math.max(0, reserved - 1);
    }
    if (reserveBadge) {
      const reserved = parseInt(reserveBadge.textContent);
      reserveBadge.textContent = Math.max(0, reserved - 1);
    }
  }

  function cancelReservation(index) {
    showToast('❌ Réservation annulée.', 'info');
    RESERVATIONS.splice(index, 1);
    renderReservations();
    const reservedEl = $('#stat-reserved');
    const reserveBadge = $('#reserve-badge');
    if (reservedEl) {
      const reserved = parseInt(reservedEl.textContent);
      reservedEl.textContent = Math.max(0, reserved - 1);
    }
    if (reserveBadge) {
      const reserved = parseInt(reserveBadge.textContent);
      reserveBadge.textContent = Math.max(0, reserved - 1);
    }
  }

  // ── Toast ──────────────────────────────────────────────
  function showToast(message, type = 'success') {
    if (toast && toastMessage) {
      toast.className = `toast toast-${type} show`;
      toastMessage.textContent = message;
      setTimeout(() => toast.classList.remove('show'), 3500);
    }
  }

  // ── Public API ─────────────────────────────────────────
  window.PharmDash = {
    confirmProductResponse,
    confirmPickup,
    cancelReservation,
  };

  // ── Start ──────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);
})();
