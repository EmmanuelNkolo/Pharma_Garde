/**
 * Pharma-Garde v2.0 — Pharmacist Dashboard Controller
 * Real-time Supabase. Timers, radius filtering, confirmation modals.
 */

(function () {
  // ── State ──────────────────────────────────────────────
  let currentPharmacy = null;
  let activeRequests = [];
  let realtimeChannel = null;
  let reservationChannel = null;
  let pendingTimers = {};
  let currentStatFilter = 'today';
  let currentStatType = null;
  let pendingConfirmData = null;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const SESSION_KEY = 'pharmagarde_pharmacy_session';

  // ── Init ───────────────────────────────────────────────
  function init() {
    if (typeof I18N !== 'undefined') I18N.init();
    bindLoginTabs();
    bindEvents();

    const saved = loadSession();
    if (saved) {
      currentPharmacy = saved;
      showDashboard();
    }
  }

  // ── Session ────────────────────────────────────────────
  function saveSession(pharmacy) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        id: pharmacy.id, name: pharmacy.name, phone: pharmacy.phone,
        address: pharmacy.address, lat: pharmacy.lat, lng: pharmacy.lng,
        whatsapp: pharmacy.whatsapp, city: pharmacy.city, quarter: pharmacy.quarter,
      }));
    } catch (e) { }
  }

  function loadSession() {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (e) { return null; }
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { }
  }

  // ── Login Tabs ─────────────────────────────────────────
  function bindLoginTabs() {
    const tabs = { login: 'form-login', register: 'form-register', reset: 'form-reset' };
    $$('.login-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.login-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        Object.values(tabs).forEach(fid => {
          const el = $(`#${fid}`);
          if (el) el.style.display = 'none';
        });
        const formId = tabs[tab.dataset.form];
        const el = $(`#${formId}`);
        if (el) el.style.display = 'block';
      });
    });

    const linkForgot = $('#link-forgot');
    if (linkForgot) {
      linkForgot.addEventListener('click', (e) => {
        e.preventDefault();
        $$('.login-tab').forEach(t => t.classList.remove('active'));
        $('#tab-reset').classList.add('active');
        $('#form-login').style.display = 'none';
        $('#form-register').style.display = 'none';
        $('#form-reset').style.display = 'block';
      });
    }

    // City "Autre" toggle
    const regCity = $('#reg-city');
    if (regCity) {
      regCity.addEventListener('change', () => {
        const otherGroup = $('#reg-other-city-group');
        if (otherGroup) otherGroup.style.display = regCity.value === 'Autre' ? 'block' : 'none';
      });
    }
  }

  // ── Events ─────────────────────────────────────────────
  function bindEvents() {
    const btnLogin = $('#btn-login');
    const btnRegister = $('#btn-register');
    const btnResetPw = $('#btn-reset-password');
    const btnLogout = $('#btn-logout');
    const btnConfirmOk = $('#btn-confirm-ok');
    const btnDetectGps = $('#btn-detect-gps');
    const btnDeleteAccount = $('#btn-delete-account');
    const btnDeleteCancel = $('#delete-cancel');
    const btnDeleteConfirm = $('#delete-confirm');

    if (btnLogin) btnLogin.addEventListener('click', handleLogin);
    if (btnRegister) btnRegister.addEventListener('click', handleRegister);
    if (btnResetPw) btnResetPw.addEventListener('click', handlePasswordReset);
    if (btnLogout) btnLogout.addEventListener('click', handleLogout);
    if (btnConfirmOk) btnConfirmOk.addEventListener('click', executeConfirm);
    if (btnDetectGps) btnDetectGps.addEventListener('click', handleDetectGPS);
    if (btnDeleteAccount) btnDeleteAccount.addEventListener('click', () => {
      $('#delete-modal').style.display = 'flex';
    });
    if (btnDeleteCancel) btnDeleteCancel.addEventListener('click', () => {
      $('#delete-modal').style.display = 'none';
    });
    if (btnDeleteConfirm) btnDeleteConfirm.addEventListener('click', handleDeleteAccount);

    // Confirm response modal
    const confirmCancel = $('#confirm-response-cancel');
    const confirmOk = $('#confirm-response-ok');
    const confirmBackdrop = $('#confirm-response-backdrop');
    if (confirmCancel) confirmCancel.addEventListener('click', () => { $('#confirm-response-modal').style.display = 'none'; });
    if (confirmBackdrop) confirmBackdrop.addEventListener('click', () => { $('#confirm-response-modal').style.display = 'none'; });
    if (confirmOk) confirmOk.addEventListener('click', executeSendResponse);

    // Stat detail panel close
    const statDetailClose = $('#stat-detail-close');
    if (statDetailClose) statDetailClose.addEventListener('click', () => {
      $('#stat-detail-panel').style.display = 'none';
      currentStatType = null;
    });

    bindTabs();
    bindGuardSwitch();
    bindStatCards();
    bindFilterButtons();
  }

  // ── GPS Detection for Registration ─────────────────────
  async function handleDetectGPS() {
    const btn = $('#btn-detect-gps');
    if (btn) { btn.textContent = '📍 Détection en cours...'; btn.disabled = true; }

    try {
      const pos = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('GPS non supporté'));
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          (e) => reject(e),
          { enableHighAccuracy: true, timeout: 15000 }
        );
      });

      $('#reg-lat').value = pos.lat;
      $('#reg-lng').value = pos.lng;
      $('#gps-coords').textContent = `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;
      $('#gps-status').style.display = 'block';
      showToast('✅ Position GPS détectée !', 'success');
    } catch (e) {
      showToast('❌ Impossible de détecter la position GPS', 'error');
    } finally {
      if (btn) { btn.innerHTML = '📍 Détecter la position'; btn.disabled = false; }
    }
  }

  // ── LOGIN ──────────────────────────────────────────────
  async function handleLogin() {
    const email = ($('#login-email') || {}).value || '';
    const password = ($('#login-password') || {}).value || '';
    if (!email.trim() || !password) { showToast('Veuillez remplir tous les champs', 'error'); return; }

    const btn = $('#btn-login');
    btn.textContent = 'Connexion...'; btn.disabled = true;

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError || !authData.user) { showToast('❌ Email ou mot de passe incorrect', 'error'); return; }

      const { data: profile, error: profileError } = await supabase.from('pharmacies').select('*').eq('id', authData.user.id).single();
      if (profileError || !profile) { showToast('⚠️ Profil non trouvé. Veuillez vous réinscrire.', 'error'); return; }

      currentPharmacy = profile;
      saveSession(profile);
      showDashboard();
      showToast(`✅ Bienvenue, ${profile.name} !`, 'success');
    } catch (err) {
      console.error('Login error:', err);
      showToast('❌ Erreur de connexion.', 'error');
    } finally {
      btn.textContent = 'Se connecter'; btn.disabled = false;
    }
  }

  // ── REGISTER ───────────────────────────────────────────
  async function handleRegister() {
    const name = ($('#reg-name') || {}).value || '';
    const citySelect = ($('#reg-city') || {}).value || '';
    const otherCity = ($('#reg-other-city') || {}).value || '';
    const city = citySelect === 'Autre' ? otherCity.trim() : citySelect;
    const quarter = ($('#reg-quarter') || {}).value || '';
    const phone = (($('#reg-phone') || {}).value || '').trim().replace(/\s+/g, '');
    const password = ($('#reg-password') || {}).value || '';
    const passwordConfirm = ($('#reg-password-confirm') || {}).value || '';
    const whatsapp = ($('#reg-whatsapp') || {}).value || '';
    const email = (($('#reg-email') || {}).value || '').trim();
    const hourOpen = ($('#reg-hour-open') || {}).value || '08:00';
    const hourClose = ($('#reg-hour-close') || {}).value || '21:00';
    const latVal = ($('#reg-lat') || {}).value;
    const lngVal = ($('#reg-lng') || {}).value;

    if (!name.trim() || !city || !quarter.trim() || !phone || !email) { showToast('Veuillez remplir tous les champs obligatoires (*)', 'error'); return; }
    if (!password || password.length < 6) { showToast('Le mot de passe doit contenir au moins 6 caractères', 'error'); return; }
    if (password !== passwordConfirm) { showToast('Les mots de passe ne correspondent pas', 'error'); return; }

    const btn = $('#btn-register');
    btn.textContent = 'Inscription en cours...'; btn.disabled = true;

    try {
      let authUserId = null;
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });

      if (authError) {
        if (authError.message.includes('already registered') || authError.message.includes('User already registered')) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
          if (signInError) { showToast('❌ Cet email est déjà utilisé', 'error'); throw signInError; }
          authUserId = signInData.user.id;
        } else { throw authError; }
      } else {
        if (!authData.user) throw new Error("Inscription Auth échouée");
        authUserId = authData.user.id;
      }

      // Use real GPS if available, otherwise fetch from Nominatim API
      let lat, lng;
      if (latVal && lngVal) {
        lat = parseFloat(latVal);
        lng = parseFloat(lngVal);
      } else {
        try {
          // Attempt to geocode using Quarter + City + Cameroon
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(quarter + ', ' + city + ', Cameroon')}`);
          const geoData = await res.json();
          if (geoData && geoData.length > 0) {
            lat = parseFloat(geoData[0].lat);
            lng = parseFloat(geoData[0].lon);
          } else {
            // Fallback to Douala if totally unknown
            lat = 4.0511 + (Math.random() - 0.5) * 0.05;
            lng = 9.7679 + (Math.random() - 0.5) * 0.05;
          }
        } catch(e) {
          console.error("Geocoding failed", e);
          lat = 4.0511;
          lng = 9.7679;
        }
      }

      const services = [];
      if ($('#reg-service-garde') && $('#reg-service-garde').checked) services.push('garde_nuit');
      if ($('#reg-service-livraison') && $('#reg-service-livraison').checked) services.push('livraison');
      if ($('#reg-service-assurance') && $('#reg-service-assurance').checked) services.push('assurance');
      if ($('#reg-service-conseil') && $('#reg-service-conseil').checked) services.push('conseil');

      const insertData = {
        id: authUserId, name: name.trim(), address: `${quarter.trim()}, ${city}`,
        city, quarter: quarter.trim(), phone, whatsapp: whatsapp || null, email,
        lat, lng, status: 'open', hours: `${hourOpen} - ${hourClose}`,
        services, is_on_duty: false, is_open: true, rating: 4.5,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase.from('pharmacies').insert([insertData]).select().single();
      if (error) { console.error('Profile insertion error:', error); throw new Error('Profil non créé. Numéro déjà existant ?'); }

      showToast('✅ Pharmacie inscrite avec succès !', 'success');
      currentPharmacy = data;
      saveSession(data);
      showDashboard();
    } catch (err) {
      console.error('Registration error:', err);
      showToast('❌ Erreur: ' + (err.message || ''), 'error');
    } finally {
      btn.textContent = 'Inscrire ma pharmacie'; btn.disabled = false;
    }
  }

  // ── PASSWORD RESET ─────────────────────────────────────
  async function handlePasswordReset() {
    const email = (($('#reset-email') || {}).value || '').trim();
    if (!email) { showToast('Veuillez remplir votre email', 'error'); return; }

    const btn = $('#btn-reset-password');
    btn.textContent = 'Envoi en cours...'; btn.disabled = true;

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/pharmacien.html?reset=true' });
      if (error) throw error;
      showToast('✅ Email de réinitialisation envoyé !', 'success');
      setTimeout(() => { if ($('#tab-login')) $('#tab-login').click(); }, 3000);
    } catch (err) {
      showToast('❌ Erreur lors de la réinitialisation.', 'error');
    } finally {
      btn.textContent = 'Réinitialiser le mot de passe'; btn.disabled = false;
    }
  }

  // ── DELETE ACCOUNT ─────────────────────────────────────
  async function handleDeleteAccount() {
    if (!currentPharmacy) return;
    try {
      await supabase.from('pharmacies').delete().eq('id', currentPharmacy.id);
      showToast('✅ Compte supprimé définitivement', 'success');
      $('#delete-modal').style.display = 'none';
      handleLogout();
    } catch (err) {
      console.error('Delete error:', err);
      showToast('❌ Erreur lors de la suppression', 'error');
    }
  }

  // ── City Coordinates ───────────────────────────────────
  function getCityCoords(city) {
    const coords = {
      'Douala': { lat: 4.0511, lng: 9.7679 }, 'Yaoundé': { lat: 3.8480, lng: 11.5021 },
      'Bafoussam': { lat: 5.4764, lng: 10.4175 }, 'Bamenda': { lat: 5.9631, lng: 10.1591 },
      'Garoua': { lat: 9.3014, lng: 13.3977 }, 'Maroua': { lat: 10.5956, lng: 14.3157 },
      'Kribi': { lat: 2.9405, lng: 9.9076 }, 'Limbé': { lat: 4.0247, lng: 9.2032 },
      'Buéa': { lat: 4.1560, lng: 9.2632 }, 'Bertoua': { lat: 4.5763, lng: 13.6846 },
      'Ngaoundéré': { lat: 7.3219, lng: 13.5847 }, 'Ebolowa': { lat: 2.9000, lng: 11.1500 },
      'Kumba': { lat: 4.6363, lng: 9.4469 }, 'Nkongsamba': { lat: 4.9547, lng: 9.9404 },
      'Edéa': { lat: 3.7981, lng: 10.1348 }, 'Dschang': { lat: 5.4438, lng: 10.0531 },
      'Foumban': { lat: 5.7264, lng: 10.9022 }, 'Sangmélima': { lat: 2.9333, lng: 11.9833 },
    };
    return coords[city] || { lat: 4.0511, lng: 9.7679 };
  }

  // ═══════════════════════════════════════════════════════
  //  DASHBOARD
  // ═══════════════════════════════════════════════════════
  function showDashboard() {
    $('#login-screen').classList.add('hidden');
    $('#dashboard').classList.remove('hidden');
    $('#dash-pharmacy-name').textContent = currentPharmacy.name;

    loadActiveRequests();
    loadHistory('today');
    loadStats('today');
    subscribeToRealTimeRequests();
    subscribeToReservations();
    startExpirationChecker();
  }

  function handleLogout() {
    if (realtimeChannel) { supabase.removeChannel(realtimeChannel); realtimeChannel = null; }
    if (reservationChannel) { supabase.removeChannel(reservationChannel); reservationChannel = null; }
    Object.values(pendingTimers).forEach(t => clearTimeout(t));
    pendingTimers = {};
    currentPharmacy = null;
    clearSession();
    activeRequests = [];
    $('#dashboard').classList.add('hidden');
    $('#login-screen').classList.remove('hidden');
    showToast('Déconnexion réussie', 'info');
  }

  // ═══════════════════════════════════════════════════════
  //  LOAD ACTIVE REQUESTS (filtered by radius)
  // ═══════════════════════════════════════════════════════
  async function loadActiveRequests() {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Filter: only requests within the client's chosen radius from this pharmacy
      activeRequests = (data || []).filter(req => {
        if (!currentPharmacy || !req.user_lat || !req.user_lng) return false;
        const dist = haversine(currentPharmacy.lat, currentPharmacy.lng, req.user_lat, req.user_lng);
        return dist <= (req.radius || 5);
      }).filter(req => {
        // Filter expired requests (2h)
        const created = new Date(req.created_at);
        const expiresAt = req.expires_at ? new Date(req.expires_at) : new Date(created.getTime() + 2 * 3600000);
        return new Date() < expiresAt;
      });

      // Check if we already responded to any of these
      if (activeRequests.length > 0) {
        const ids = activeRequests.map(r => r.id);
        const { data: myResponses } = await supabase
          .from('responses')
          .select('request_id')
          .eq('pharmacy_id', currentPharmacy.id)
          .in('request_id', ids);

        const respondedIds = new Set((myResponses || []).map(r => r.request_id));
        activeRequests = activeRequests.filter(r => !respondedIds.has(r.id));
      }

      renderActiveRequests();
      updateStatCounters();
    } catch (err) {
      console.error('Load requests error:', err);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  REAL-TIME SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════
  function subscribeToRealTimeRequests() {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);

    realtimeChannel = supabase
      .channel('pharmacy_requests_v2')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'requests' }, (payload) => {
        const req = payload.new;
        if (req.status !== 'pending' || !currentPharmacy) return;
        // Check radius
        if (req.user_lat && req.user_lng) {
          const dist = haversine(currentPharmacy.lat, currentPharmacy.lng, req.user_lat, req.user_lng);
          if (dist > (req.radius || 5)) return;
        }
        activeRequests.unshift(req);
        renderActiveRequests();
        updateStatCounters();
        showToast('🔔 Nouvelle demande de patient !', 'info');
        playNotificationSound();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'requests' }, (payload) => {
        const idx = activeRequests.findIndex(r => r.id === payload.new.id);
        if (idx >= 0) {
          if (payload.new.status !== 'pending') {
            activeRequests.splice(idx, 1);
          } else {
            activeRequests[idx] = payload.new;
          }
          renderActiveRequests();
          updateStatCounters();
        }
      })
      .subscribe();
  }

  function subscribeToReservations() {
    if (reservationChannel) supabase.removeChannel(reservationChannel);
    reservationChannel = supabase
      .channel('pharmacy_reservations_v2')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reservations', filter: `pharmacy_id=eq.${currentPharmacy.id}` }, (payload) => {
        showToast('🔔 Nouvelle réservation reçue !', 'info');
        playNotificationSound();
        updateStatCounters();
      })
      .subscribe();
  }

  // ═══════════════════════════════════════════════════════
  //  RENDER ACTIVE REQUESTS
  // ═══════════════════════════════════════════════════════
  function renderActiveRequests() {
    const container = $('#active-requests');
    if (!container) return;

    const pending = activeRequests.filter(r => r.status === 'pending');
    if (pending.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">Aucune demande en cours.</div></div>';
      return;
    }

    container.innerHTML = pending.map(req => {
      const meds = Array.isArray(req.medicines) ? req.medicines : [req.medicines];
      const timeAgo = getTimeAgo(req.created_at);
      const timeExact = new Date(req.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const hasInsurance = !!req.insurance_name;
      const created = new Date(req.created_at);
      const expiresAt = req.expires_at ? new Date(req.expires_at) : new Date(created.getTime() + 2 * 3600000);
      const remainingMs = expiresAt - new Date();
      const remainingMin = Math.max(0, Math.floor(remainingMs / 60000));

      const medRows = meds.map(med => {
        let buttonsHtml = '';
        if (hasInsurance) {
          buttonsHtml = `
            <button class="resp-btn" data-status="en_stock_assure">✅ En stock assuré</button>
            <button class="resp-btn" data-status="en_stock_non_assure">⚠️ En stock non assuré</button>
            <button class="resp-btn resp-btn-danger" data-status="rupture">❌ Rupture</button>
          `;
        } else {
          buttonsHtml = `
            <button class="resp-btn" data-status="en_stock">✅ En stock</button>
            <button class="resp-btn resp-btn-danger" data-status="rupture">❌ Rupture</button>
          `;
        }
        return `
          <div class="med-response-row">
            <div class="med-name">💊 ${med}</div>
            <div class="med-btn-group" data-med="${med}">${buttonsHtml}</div>
          </div>`;
      }).join('');

      return `
        <div class="request-card" id="request-${req.id}">
          <div class="request-header">
            <div class="request-patient-info">
              ${req.user_phone ? `📱 ${req.user_phone}` : '📱 Anonyme'}
              ${req.insurance_name ? ` • 🛡️ ${req.insurance_name}` : ''}
              ${req.radius ? ` • 📍 ${req.radius} km` : ''}
            </div>
            <div class="request-meta">
              <span class="request-time">🕐 ${timeExact} (${timeAgo})</span>
              <span class="request-countdown ${remainingMin < 15 ? 'urgent' : ''}" data-expires="${expiresAt.toISOString()}">⏱️ ${remainingMin} min</span>
            </div>
          </div>
          <div class="request-medicines-list">${medRows}</div>
          <button class="btn btn-primary btn-block" onclick="PharmDash.prepareResponse('${req.id}')">
            📤 Envoyer la réponse
          </button>
        </div>`;
    }).join('');

    // Bind med buttons
    container.querySelectorAll('.med-btn-group .resp-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const group = e.target.closest('.med-btn-group');
        group.querySelectorAll('.resp-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        group.setAttribute('data-selected', e.target.getAttribute('data-status'));
      });
    });
  }

  // ═══════════════════════════════════════════════════════
  //  PREPARE & CONFIRM RESPONSE
  // ═══════════════════════════════════════════════════════
  function prepareResponse(requestId) {
    if (!currentPharmacy) return;
    const requestEl = document.getElementById(`request-${requestId}`);
    if (!requestEl) return;

    const groups = requestEl.querySelectorAll('.med-btn-group');
    const medicinesStatus = {};
    let allSelected = true;

    groups.forEach(g => {
      const med = g.getAttribute('data-med');
      const selected = g.getAttribute('data-selected');
      if (!selected) allSelected = false;
      else medicinesStatus[med] = selected;
    });

    if (!allSelected) {
      showToast('⚠️ Veuillez indiquer le statut pour tous les médicaments', 'error');
      return;
    }

    // Show confirmation modal
    pendingConfirmData = { requestId, medicinesStatus };
    const body = $('#confirm-response-body');
    if (body) {
      body.innerHTML = Object.entries(medicinesStatus).map(([med, status]) => {
        let badge = '';
        if (status === 'en_stock_assure') badge = '<span class="confirm-badge confirm-badge-success">✅ En stock assuré</span>';
        else if (status === 'en_stock_non_assure') badge = '<span class="confirm-badge confirm-badge-warning">⚠️ En stock non assuré</span>';
        else if (status === 'en_stock') badge = '<span class="confirm-badge confirm-badge-success">✅ En stock</span>';
        else badge = '<span class="confirm-badge confirm-badge-danger">❌ Rupture</span>';
        return `<div class="confirm-med-row"><span class="confirm-med-name">💊 ${med}</span>${badge}</div>`;
      }).join('');
    }
    $('#confirm-response-modal').style.display = 'flex';
  }

  async function executeSendResponse() {
    if (!pendingConfirmData || !currentPharmacy) return;
    const { requestId, medicinesStatus } = pendingConfirmData;
    $('#confirm-response-modal').style.display = 'none';

    const hasAnyStock = Object.values(medicinesStatus).some(s => s.startsWith('en_stock'));
    const responseStatus = hasAnyStock ? 'accepted' : 'out_of_stock';

    try {
      const { error } = await supabase.from('responses').insert([{
        request_id: requestId,
        pharmacy_id: currentPharmacy.id,
        pharmacy_name: currentPharmacy.name,
        pharmacy_phone: currentPharmacy.phone,
        pharmacy_address: currentPharmacy.address,
        status: responseStatus,
        medicines_status: medicinesStatus,
        responded_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }]);

      if (error) throw error;

      activeRequests = activeRequests.filter(r => r.id !== requestId);
      renderActiveRequests();
      updateStatCounters();
      showToast('✅ Réponse envoyée au patient', 'success');
      loadHistory(currentStatFilter);
    } catch (err) {
      console.error('Response error:', err);
      showToast('❌ Erreur lors de l\'envoi', 'error');
    }
    pendingConfirmData = null;
  }

  // ═══════════════════════════════════════════════════════
  //  STAT CARDS — Clickable with sub-filters
  // ═══════════════════════════════════════════════════════
  function bindStatCards() {
    $$('.stat-card').forEach(card => {
      card.addEventListener('click', () => {
        const type = card.getAttribute('data-stat');
        currentStatType = type;
        currentStatFilter = 'today';
        openStatDetail(type, 'today');
      });
    });
  }

  function bindFilterButtons() {
    // Stat detail filters
    $$('#stat-detail-panel .filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('#stat-detail-panel .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentStatFilter = btn.getAttribute('data-filter');
        if (currentStatType) openStatDetail(currentStatType, currentStatFilter);
      });
    });

    // History filters
    $$('#tab-history .filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('#tab-history .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadHistory(btn.getAttribute('data-filter'));
      });
    });

    // Stats tab filters
    $$('#tab-stats .filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('#tab-stats .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadStats(btn.getAttribute('data-filter'));
      });
    });
  }

  function getDateRange(filter) {
    const now = new Date();
    let start = new Date();
    if (filter === 'today') { start.setHours(0, 0, 0, 0); }
    else if (filter === 'week') { start.setDate(now.getDate() - 7); start.setHours(0, 0, 0, 0); }
    else if (filter === 'month') { start.setMonth(now.getMonth() - 1); start.setHours(0, 0, 0, 0); }
    return start.toISOString();
  }

  async function openStatDetail(type, filter) {
    const panel = $('#stat-detail-panel');
    const title = $('#stat-detail-title');
    const body = $('#stat-detail-body');
    if (!panel || !body) return;

    const titles = { requests: '📥 Demandes', responded: '✅ Répondues', pending: '⏳ En attente', reservations: '🔒 Réservations' };
    if (title) title.textContent = titles[type] || type;
    panel.style.display = 'block';
    body.innerHTML = '<div style="text-align:center;padding:20px;"><div class="loading-dots" style="justify-content:center"><span></span><span></span><span></span></div></div>';

    const startDate = getDateRange(filter);

    try {
      if (type === 'requests') {
        const { data } = await supabase.from('requests').select('*').gte('created_at', startDate).order('created_at', { ascending: false }).limit(100);
        const filtered = (data || []).filter(r => {
          if (!currentPharmacy || !r.user_lat || !r.user_lng) return false;
          return haversine(currentPharmacy.lat, currentPharmacy.lng, r.user_lat, r.user_lng) <= (r.radius || 5);
        });
        body.innerHTML = filtered.length === 0 ? '<p style="color:var(--dark-400);text-align:center;padding:20px;">Aucune demande</p>' :
          filtered.map(r => {
            const time = new Date(r.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            const meds = Array.isArray(r.medicines) ? r.medicines.join(', ') : r.medicines;
            return `<div class="stat-detail-item"><div><strong>💊 ${meds}</strong><br><small>🕐 ${time} ${r.insurance_name ? '• 🛡️ ' + r.insurance_name : ''}</small></div><span class="badge badge-${r.status === 'pending' ? 'warning' : 'success'}">${r.status}</span></div>`;
          }).join('');

      } else if (type === 'responded') {
        const { data } = await supabase.from('responses').select('*').eq('pharmacy_id', currentPharmacy.id).gte('created_at', startDate).order('created_at', { ascending: false }).limit(100);
        if (!data || data.length === 0) { body.innerHTML = '<p style="color:var(--dark-400);text-align:center;padding:20px;">Aucune réponse</p>'; return; }

        // Aggregate per medicine
        const medStats = {};
        data.forEach(r => {
          if (r.medicines_status) {
            Object.entries(r.medicines_status).forEach(([med, status]) => {
              if (!medStats[med]) medStats[med] = { total: 0, inStock: 0, outOfStock: 0, ignored: 0 };
              medStats[med].total++;
              if (status.startsWith('en_stock')) medStats[med].inStock++;
              else if (status === 'rupture') medStats[med].outOfStock++;
            });
          }
          if (r.ignored) {
            const meds = r.medicines_status ? Object.keys(r.medicines_status) : [];
            meds.forEach(med => { if (medStats[med]) medStats[med].ignored++; });
          }
        });

        body.innerHTML = '<div class="responded-stats-grid">' +
          Object.entries(medStats).map(([med, s]) =>
            `<div class="responded-med-card">
              <div class="responded-med-name">💊 ${med}</div>
              <div class="responded-med-stats">
                <span class="responded-stat">📊 ${s.total}</span>
                <span class="responded-stat text-success">✅ ${s.inStock}</span>
                <span class="responded-stat text-danger">❌ ${s.outOfStock}</span>
                <span class="responded-stat text-muted">⏭️ ${s.ignored}</span>
              </div>
            </div>`
          ).join('') + '</div>' +
          '<div style="margin-top:12px;">' + data.slice(0, 20).map(r => {
            const time = new Date(r.responded_at || r.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            return `<div class="stat-detail-item"><div><small>🕐 ${time}</small></div><span class="badge badge-${r.status === 'accepted' ? 'stock' : 'rupture'}">${r.status === 'accepted' ? '✅' : '❌'} ${r.status}</span></div>`;
          }).join('') + '</div>';

      } else if (type === 'pending') {
        // Pending = active requests not yet responded to (within 1h window)
        const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
        body.innerHTML = activeRequests.length === 0 ? '<p style="color:var(--dark-400);text-align:center;padding:20px;">Aucune demande en attente</p>' :
          activeRequests.map(r => {
            const created = new Date(r.created_at);
            const pendingExpires = new Date(created.getTime() + 3600000);
            const remaining = Math.max(0, Math.floor((pendingExpires - new Date()) / 60000));
            const meds = Array.isArray(r.medicines) ? r.medicines.join(', ') : r.medicines;
            return `<div class="stat-detail-item"><div><strong>💊 ${meds}</strong><br><small>⏱️ ${remaining} min restantes</small></div><span class="badge badge-warning">En attente</span></div>`;
          }).join('');

      } else if (type === 'reservations') {
        const { data } = await supabase.from('reservations').select('*').eq('pharmacy_id', currentPharmacy.id).eq('status', 'active').order('created_at', { ascending: false });
        if (!data || data.length === 0) { body.innerHTML = '<p style="color:var(--dark-400);text-align:center;padding:20px;">Aucune réservation active</p>'; return; }

        body.innerHTML = data.map(r => {
          const expiresAt = new Date(r.expires_at);
          const remaining = Math.max(0, Math.floor((expiresAt - new Date()) / 60000));
          const meds = Array.isArray(r.medicines) ? r.medicines.join(', ') : (r.medicines || '');
          return `<div class="stat-detail-item reservation-item">
            <div><strong>💊 ${meds}</strong><br><small>📱 ${r.patient_phone || 'Anonyme'}</small></div>
            <div class="reservation-countdown ${remaining < 10 ? 'urgent' : ''}">⏱️ ${remaining} min</div>
          </div>`;
        }).join('');
      }
    } catch (err) {
      console.error('Stat detail error:', err);
      body.innerHTML = '<p style="color:var(--red-400);text-align:center;">Erreur de chargement</p>';
    }
  }

  // ═══════════════════════════════════════════════════════
  //  HISTORY
  // ═══════════════════════════════════════════════════════
  async function loadHistory(filter) {
    if (!currentPharmacy) return;
    const container = $('#history-list');
    if (!container) return;
    const startDate = getDateRange(filter || 'today');

    try {
      const { data, error } = await supabase.from('responses').select('*').eq('pharmacy_id', currentPharmacy.id).gte('created_at', startDate).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">Aucun historique pour cette période.</div></div>';
        return;
      }

      container.innerHTML = data.map(item => {
        const statusBadge = item.ignored ? '<span class="badge badge-muted">⏭️ Ignorée</span>' :
          item.status === 'accepted' ? '<span class="badge badge-stock">✅ En stock</span>' : '<span class="badge badge-rupture">❌ Rupture</span>';
        const time = new Date(item.responded_at || item.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        let medsHtml = '';
        if (item.medicines_status) {
          medsHtml = Object.entries(item.medicines_status).map(([med, s]) => {
            let icon = s.startsWith('en_stock') ? '✅' : '❌';
            return `<span style="font-size:12px;margin-right:8px;">${icon} ${med}</span>`;
          }).join('');
        }
        return `<div class="history-item"><div class="history-item-info"><div class="history-item-medicine">${medsHtml || '💊 Demande'}</div><div class="history-item-meta"><span>📅 ${time}</span></div></div><div class="history-item-status">${statusBadge}</div></div>`;
      }).join('');
    } catch (err) {
      console.error('Load history error:', err);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  STATISTICS
  // ═══════════════════════════════════════════════════════
  async function loadStats(filter) {
    if (!currentPharmacy) return;
    const startDate = getDateRange(filter || 'today');

    try {
      const { count: totalResp } = await supabase.from('responses').select('*', { count: 'exact', head: true }).eq('pharmacy_id', currentPharmacy.id).gte('created_at', startDate);
      const { count: ignoredCount } = await supabase.from('responses').select('*', { count: 'exact', head: true }).eq('pharmacy_id', currentPharmacy.id).eq('ignored', true).gte('created_at', startDate);
      const { count: totalReq } = await supabase.from('requests').select('*', { count: 'exact', head: true }).gte('created_at', startDate);

      const el1 = $('#stats-total-requests'); if (el1) el1.textContent = totalReq || 0;
      const el2 = $('#stats-total-responses'); if (el2) el2.textContent = totalResp || 0;
      const el3 = $('#stats-response-rate'); if (el3) el3.textContent = totalReq > 0 ? Math.round(((totalResp || 0) / totalReq) * 100) + '%' : '0%';
      const el4 = $('#stats-ignored'); if (el4) el4.textContent = ignoredCount || 0;

      // Top medicines
      const { data: responses } = await supabase.from('responses').select('medicines_status').eq('pharmacy_id', currentPharmacy.id).gte('created_at', startDate).limit(200);
      const medCounts = {};
      (responses || []).forEach(r => {
        if (r.medicines_status) {
          Object.keys(r.medicines_status).forEach(med => { medCounts[med] = (medCounts[med] || 0) + 1; });
        }
      });
      const topMeds = Object.entries(medCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
      renderTopMedications(topMeds);
    } catch (err) {
      console.error('Stats error:', err);
    }
  }

  function renderTopMedications(topMeds) {
    const container = $('#top-medications');
    if (!container) return;
    if (topMeds.length === 0) { container.innerHTML = '<p style="color:var(--dark-400);font-size:14px;">Pas encore de données.</p>'; return; }
    const maxCount = topMeds[0][1];
    container.innerHTML = topMeds.map(([name, count]) => `
      <div class="med-bar"><div class="med-bar-label">${name}</div><div class="med-bar-track"><div class="med-bar-fill" style="width:${(count / maxCount) * 100}%">${count}</div></div></div>
    `).join('');
  }

  // ═══════════════════════════════════════════════════════
  //  UPDATE STAT COUNTERS
  // ═══════════════════════════════════════════════════════
  async function updateStatCounters() {
    const pending = activeRequests.filter(r => r.status === 'pending').length;
    const statPending = $('#stat-pending');
    const statToday = $('#stat-today');
    const activeBadge = $('#active-badge');
    if (statPending) statPending.textContent = pending;
    if (statToday) statToday.textContent = activeRequests.length;
    if (activeBadge) activeBadge.textContent = pending;

    if (!currentPharmacy) return;
    try {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { count: respondedCount } = await supabase.from('responses').select('*', { count: 'exact', head: true }).eq('pharmacy_id', currentPharmacy.id).gte('created_at', today.toISOString());
      const statResponded = $('#stat-responded');
      if (statResponded) statResponded.textContent = respondedCount || 0;

      const { count: reservedCount } = await supabase.from('reservations').select('*', { count: 'exact', head: true }).eq('pharmacy_id', currentPharmacy.id).eq('status', 'active');
      const statReserved = $('#stat-reserved');
      if (statReserved) statReserved.textContent = reservedCount || 0;
    } catch (e) { console.error('Counter error:', e); }
  }

  // ═══════════════════════════════════════════════════════
  //  EXPIRATION CHECKER (runs every 30s)
  // ═══════════════════════════════════════════════════════
  function startExpirationChecker() {
    setInterval(() => {
      const now = new Date();
      // Remove expired requests from active list
      const before = activeRequests.length;
      activeRequests = activeRequests.filter(r => {
        const created = new Date(r.created_at);
        const expiresAt = r.expires_at ? new Date(r.expires_at) : new Date(created.getTime() + 2 * 3600000);
        return now < expiresAt;
      });
      if (activeRequests.length !== before) {
        renderActiveRequests();
        updateStatCounters();
      }

      // Update countdown displays
      document.querySelectorAll('.request-countdown[data-expires]').forEach(el => {
        const exp = new Date(el.getAttribute('data-expires'));
        const rem = Math.max(0, Math.floor((exp - now) / 60000));
        el.textContent = `⏱️ ${rem} min`;
        if (rem < 15) el.classList.add('urgent');
      });
    }, 30000);
  }

  // ═══════════════════════════════════════════════════════
  //  TABS & GUARD SWITCH
  // ═══════════════════════════════════════════════════════
  function bindTabs() {
    $$('.dash-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.dash-tab').forEach(t => t.classList.remove('active'));
        $$('.dash-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const content = $(`#tab-${tab.dataset.tab}`);
        if (content) content.classList.add('active');
        // Close stat detail panel when switching tabs
        const panel = $('#stat-detail-panel');
        if (panel) panel.style.display = 'none';
      });
    });
  }

  function bindGuardSwitch() {
    $$('.guard-option').forEach(option => {
      option.addEventListener('click', async () => {
        $$('.guard-option').forEach(o => o.classList.remove('active'));
        option.classList.add('active');
        const status = option.dataset.status;
        const labels = { open: 'Statut : Ouvert', guard: 'Statut : De garde 🌙', closed: 'Statut : Fermé' };
        const labelEl = $('#guard-label');
        if (labelEl) labelEl.textContent = labels[status];
        if (currentPharmacy) {
          try {
            await supabase.from('pharmacies').update({ status, is_open: status !== 'closed', is_on_duty: status === 'guard' }).eq('id', currentPharmacy.id);
            showToast(`✅ Statut mis à jour: ${labels[status]}`, 'success');
          } catch (err) { showToast('❌ Erreur de mise à jour', 'error'); }
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════
  //  UTILITIES
  // ═══════════════════════════════════════════════════════
  let pendingAction = null;

  function confirmAction(reqId, status) {
    pendingAction = () => {}; // Legacy
    const confirmText = $('#confirm-text');
    if (confirmText) confirmText.textContent = `Confirmer cette action ?`;
    const confirmModal = $('#confirm-modal');
    if (confirmModal) confirmModal.style.display = 'flex';
  }

  function executeConfirm() {
    if (pendingAction) pendingAction();
    const confirmModal = $('#confirm-modal');
    if (confirmModal) confirmModal.style.display = 'none';
    pendingAction = null;
  }

  function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function getTimeAgo(dateStr) {
    const diffMs = new Date() - new Date(dateStr);
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "À l'instant";
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `Il y a ${diffH}h`;
    return new Date(dateStr).toLocaleDateString('fr-FR');
  }

  function showToast(message, type) {
    const toast = $('#toast');
    const toastMessage = $('#toast-message');
    if (toast && toastMessage) {
      toast.className = `toast toast-${type || 'success'} show`;
      toastMessage.textContent = message;
      setTimeout(() => toast.classList.remove('show'), 3500);
    }
  }

  function playNotificationSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        osc2.connect(gain);
        osc2.frequency.value = 1100;
        osc2.type = 'sine';
        osc2.start();
        osc2.stop(ctx.currentTime + 0.2);
      }, 250);
    } catch (e) { }
  }

  // ── Public API ─────────────────────────────────────────
  window.PharmDash = {
    prepareResponse,
    confirmAction,
  };

  document.addEventListener('DOMContentLoaded', init);
})();
