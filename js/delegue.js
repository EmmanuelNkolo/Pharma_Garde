/**
 * Pharma-Garde v4.0 — Delegate Dashboard Controller
 * Clean rewrite. IIFE pattern matching pharmacien.js.
 * Handles: Auth, Map, Pharmacies, Promotions, Visits, Stats, Reports.
 */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  let currentDelegate = null;
  let sessionLabs = [];
  let delegateMap = null;
  let userMarker = null;
  let userLat = null, userLng = null;
  let currentRadius = 5;
  let pharmaciesInRadius = [];
  let allPharmacies = [];
  let myPromotions = [];
  let activePanel = 'pharmacies';
  let statsChart = null;

  const $ = (id) => document.getElementById(id);
  const $q = (sel) => document.querySelector(sel);
  const $qa = (sel) => document.querySelectorAll(sel);
  const SESSION_KEY = 'pharmagarde_delegate_session';

  // ═══════════════════════════════════════════════════════
  //  INITIALIZATION
  // ═══════════════════════════════════════════════════════
  function init() {
    if (typeof I18N !== 'undefined') I18N.init();
    bindLoginTabs();
    bindEvents();

    const saved = loadSession();
    if (saved) {
      currentDelegate = saved.delegate;
      sessionLabs = saved.labs || [];
      showDashboard();
    }
  }

  // ── Session ────────────────────────────────────────────
  function saveSession(delegate, labs) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        delegate: {
          id: delegate.id, last_name: delegate.last_name, first_name: delegate.first_name,
          email: delegate.email, phone: delegate.phone, pro_card_number: delegate.pro_card_number,
        },
        labs: labs || [],
      }));
    } catch (e) { /* silent */ }
  }

  function loadSession() {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (e) { return null; }
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* silent */ }
  }

  // ═══════════════════════════════════════════════════════
  //  LOGIN TABS
  // ═══════════════════════════════════════════════════════
  function bindLoginTabs() {
    const btnShowRegister = document.getElementById('btn-show-register');
    const btnShowLogin = document.getElementById('btn-show-login');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    if (btnShowRegister && loginForm && registerForm) {
      btnShowRegister.addEventListener('click', () => {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
      });
    }

    if (btnShowLogin && loginForm && registerForm) {
      btnShowLogin.addEventListener('click', () => {
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  //  EVENT BINDINGS
  // ═══════════════════════════════════════════════════════
  function bindEvents() {
    // Auth
    bindClick('btn-login', handleLogin);
    bindClick('btn-register', handleRegister);
    bindClick('btn-reset-password', handlePasswordReset);
    bindClick('btn-logout', handleLogout);

    // Add lab button
    bindClick('btn-add-lab', () => {
      const container = $('login-labs-container');
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px;';
      row.className = 'login-lab-row';
      const input = document.createElement('input');
      input.type = 'text'; input.className = 'input-field login-lab-input';
      input.placeholder = 'Nom du laboratoire';
      const btnRemove = document.createElement('button');
      btnRemove.type = 'button'; btnRemove.className = 'btn btn-outline btn-sm';
      btnRemove.style.cssText = 'padding: 4px 10px; color: var(--red-400); border-color: var(--red-400);';
      btnRemove.textContent = '✕';
      btnRemove.addEventListener('click', () => row.remove());
      row.appendChild(input);
      row.appendChild(btnRemove);
      container.appendChild(row);
    });

    // GPS
    bindClick('btn-gps', handleGPS);

    // Radius pills
    $qa('.radius-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        $qa('.radius-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        currentRadius = parseInt(pill.dataset.radius);
        filterPharmaciesByRadius();
      });
    });

    // Bottom sheet action buttons
    bindClick('btn-promotions', () => switchPanel('promotions'));
    bindClick('btn-pharmacies', () => switchPanel('pharmacies'));
    bindClick('btn-stats', () => switchPanel('stats'));
    bindClick('btn-alerts', () => switchPanel('alerts'));

    // Recenter
    bindClick('btn-recenter', () => {
      if (delegateMap && userLat) delegateMap.setView([userLat, userLng], 14);
    });

    // Fullscreen
    bindClick('btn-fullscreen', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else document.exitFullscreen();
    });

    // Promotions
    bindClick('btn-new-promo', () => {
      populateLabSelect('promo-lab');
      const sc = $('promo-specific-container');
      const bc = $('promo-buttons-container');
      if (sc) sc.style.display = 'none';
      if (bc) bc.style.display = 'flex';
      $('new-promo-modal').classList.add('active');
    });
    bindClick('btn-cancel-promo', () => {
      $('new-promo-modal').classList.remove('active');
      const sc = $('promo-specific-container');
      const bc = $('promo-buttons-container');
      if (sc) sc.style.display = 'none';
      if (bc) bc.style.display = 'flex';
    });
    bindClick('btn-save-promo-all', () => handleSavePromotion('all'));
    bindClick('btn-save-promo-specific', () => {
      if (!pharmaciesInRadius || pharmaciesInRadius.length === 0) {
        return showToast('Aucune pharmacie dans le rayon. Detectez votre position d\'abord.', 'error');
      }
      const bc = $('promo-buttons-container');
      const sc = $('promo-specific-container');
      if (bc) bc.style.display = 'none';
      if (sc) sc.style.display = 'flex';
      const sel = $('promo-specific-pharmacy');
      if (sel) {
        sel.innerHTML = '<option value="">-- Choisir une pharmacie --</option>' +
          pharmaciesInRadius.map(p => '<option value="' + p.id + '">' + escapeHtml(p.name) + ' (' + haversine(userLat, userLng, p.lat, p.lng).toFixed(1) + ' km)</option>').join('');
      }
    });
    bindClick('btn-cancel-specific', () => {
      const sc = $('promo-specific-container');
      const bc = $('promo-buttons-container');
      if (sc) sc.style.display = 'none';
      if (bc) bc.style.display = 'flex';
    });
    bindClick('btn-save-promo-specific-confirm', () => handleSavePromotion('specific'));

    // Visit modal
    bindClick('btn-cancel-visit', () => $('visit-modal').classList.remove('active'));
    bindClick('btn-send-visit', handleSendVisit);

    // Send promo modal
    bindClick('btn-cancel-send-promo', () => $('send-promo-modal').classList.remove('active'));
    bindClick('btn-confirm-send-promo', handleConfirmSendPromo);

    // Delete account
    bindClick('btn-delete-account', () => { $('delete-modal').style.display = 'flex'; });
    bindClick('delete-cancel', () => { $('delete-modal').style.display = 'none'; });
    bindClick('delete-confirm', handleDeleteAccount);

    // Settings
    bindClick('settings-open', () => $('settings-panel').classList.add('open'));
    bindClick('settings-close', () => $('settings-panel').classList.remove('open'));
    bindClick('settings-save', handleSaveSettings);

    // Download report
    bindClick('btn-download-report', handleDownloadReport);
    bindClick('btn-generate-report', handleGenerateReport);

    // Nav buttons
    bindClick('nav-home', () => { window.location.href = 'index.html'; });
    bindClick('nav-back', () => { window.history.back(); });
    bindClick('nav-forward', () => { window.history.forward(); });

    // Bottom sheet drag
    initBottomSheetDrag();
  }

  function bindClick(id, handler) {
    const el = $(id);
    if (el) el.addEventListener('click', handler);
  }

  // ═══════════════════════════════════════════════════════
  //  AUTHENTICATION
  // ═══════════════════════════════════════════════════════
  async function handleLogin() {
    const email = ($('login-email') || {}).value?.trim();
    const password = ($('login-password') || {}).value;

    // Collect labs
    const labInputs = document.querySelectorAll('.login-lab-input');
    const labs = Array.from(labInputs).map(i => i.value.trim()).filter(v => v);

    if (!email || !password) return showToast('Veuillez remplir email et mot de passe.', 'error');
    if (labs.length === 0) return showToast('Veuillez renseigner au moins un laboratoire d\'attache.', 'error');

    const btn = $('btn-login');
    btn.disabled = true; btn.textContent = 'Connexion...';

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const { data: profile, error: profileError } = await supabase
        .from('delegates').select('*').eq('id', data.user.id).single();
      if (profileError || !profile) throw new Error('Profil délégué non trouvé. Veuillez vous inscrire.');

      // Save session labs (not persisted to DB — per-session only)
      currentDelegate = profile;
      sessionLabs = labs;
      saveSession(profile, labs);

      showDashboard();
      showToast(`✅ Bienvenue, ${profile.first_name} ${profile.last_name} !`, 'success');
    } catch (err) {
      console.error('Login error:', err);
      showToast('❌ ' + (err.message || 'Erreur de connexion'), 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Se connecter';
    }
  }

  async function handleRegister() {
    const nom = ($('reg-lastname') || {}).value?.trim();
    const prenom = ($('reg-firstname') || {}).value?.trim();
    const proCard = ($('reg-procard') || {}).value?.trim();
    const cni = ($('reg-cni') || {}).value?.trim();
    const phone = ($('reg-phone') || {}).value?.trim();
    const email = ($('reg-email') || {}).value?.trim();
    const password = ($('reg-password') || {}).value;
    const confirmPassword = ($('reg-password-confirm') || {}).value;

    if (!nom || !prenom || !proCard || !cni || !phone || !email || !password || !confirmPassword) {
      return showToast('Veuillez remplir tous les champs obligatoires.', 'error');
    }
    // Validation mot de passe: 8 char min, 1 majuscule, 1 chiffre
    const pwdRegex = /^(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/;
    if (!pwdRegex.test(password)) {
      return showToast('Le mot de passe doit contenir au moins 8 caractères, dont 1 majuscule et 1 chiffre.', 'error');
    }
    if (password !== confirmPassword) return showToast('Les mots de passe ne correspondent pas.', 'error');

    const btn = $('btn-register');
    btn.disabled = true; btn.textContent = 'Inscription en cours...';

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
      if (authError) throw authError;
      if (!authData.user) throw new Error('Inscription échouée.');

      const { error: insertError } = await supabase.from('delegates').insert([{
        id: authData.user.id,
        last_name: nom,
        first_name: prenom,
        pro_card_number: proCard,
        cni_number: cni,
        phone: phone,
        email: email,
      }]);
      if (insertError) throw insertError;

      showToast('✅ Inscription réussie ! Connectez-vous maintenant.', 'success');

      // Clear form
      ['reg-lastname', 'reg-firstname', 'reg-procard', 'reg-cni', 'reg-phone', 'reg-email', 'reg-password', 'reg-password-confirm']
        .forEach(id => { const el = $(id); if (el) el.value = ''; });

      // Switch to login tab
      const btnShowLogin = $('btn-show-login');
      if (btnShowLogin) btnShowLogin.click();
    } catch (err) {
      console.error('Registration error:', err);
      showToast('❌ ' + (err.message || 'Erreur lors de l\'inscription'), 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Demander une inscription';
    }
  }

  async function handlePasswordReset() {
    const email = ($('reset-email') || {}).value?.trim();
    if (!email) return showToast('Veuillez remplir votre email.', 'error');

    const btn = $('btn-reset-password');
    btn.disabled = true; btn.textContent = 'Envoi en cours...';

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/delegue.html?reset=true',
      });
      if (error) throw error;
      showToast('✅ Email de réinitialisation envoyé !', 'success');
      setTimeout(() => { $('tab-login').click(); }, 3000);
    } catch (err) {
      showToast('❌ Erreur lors de la réinitialisation.', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Réinitialiser le mot de passe';
    }
  }

  function handleLogout() {
    currentDelegate = null;
    sessionLabs = [];
    clearSession();
    if (delegateMap) { delegateMap.remove(); delegateMap = null; }
    $('dashboard').classList.add('hidden');
    $('login-screen').classList.remove('hidden');
    $('login-screen').style.display = '';
    showToast('Déconnexion réussie.', 'info');
  }

  async function handleDeleteAccount() {
    if (!currentDelegate) return;
    try {
      await supabase.from('delegates').delete().eq('id', currentDelegate.id);
      showToast('✅ Compte supprimé définitivement.', 'success');
      $('delete-modal').style.display = 'none';
      handleLogout();
    } catch (err) {
      showToast('❌ Erreur lors de la suppression.', 'error');
    }
  }

  // ═══════════════════════════════════════════════════════
  //  DASHBOARD
  // ═══════════════════════════════════════════════════════
  function showDashboard() {
    $('login-screen').style.display = 'none';
    $('login-screen').classList.add('hidden');
    $('dashboard').classList.remove('hidden');

    // Populate settings
    if (currentDelegate) {
      const s = (id, val) => { const el = $(id); if (el) el.value = val || ''; };
      s('settings-lastname', currentDelegate.last_name);
      s('settings-firstname', currentDelegate.first_name);
      s('settings-email', currentDelegate.email);
      s('settings-phone', currentDelegate.phone);
      const labsDiv = $('settings-labs');
      if (labsDiv) labsDiv.textContent = sessionLabs.join(', ') || 'Aucun';
    }

    subscribeToDelegateUpdates();

    // If map not initialized, show location modal
    if (!delegateMap) {
      $('location-modal').classList.add('active');
    } else {
      $('location-modal').classList.remove('active');
      loadPharmacies();
      loadPromotions();
      loadStats();
    }
  }

  // ═══════════════════════════════════════════════════════
  //  GPS & MAP
  // ═══════════════════════════════════════════════════════
  async function handleGPS() {
    const btn = $('btn-gps');
    btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;margin-right:8px;"></span> Détection...';
    btn.disabled = true;

    try {
      const pos = await PG.locate({ desired: 30, maxWait: 25000 });

      userLat = pos.lat;
      userLng = pos.lng;

      // Reverse geocode city
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLat}&lon=${userLng}&zoom=10`);
        const geo = await res.json();
        const city = geo.address?.city || geo.address?.town || geo.address?.village || 'Cameroun';
        const cityDisplay = $('city-name-display');
        if (cityDisplay) cityDisplay.textContent = city;
      } catch (e) { /* silent */ }

      // Hide location modal
      $('location-modal').classList.remove('active');

      // Initialize map
      initMap(userLat, userLng);
      showToast('✅ Position détectée !', 'success');
    } catch (err) {
      console.error('GPS error:', err);
      showToast('❌ Impossible de détecter votre position.', 'error');
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> <span>Détecter ma position</span>';
      btn.disabled = false;
    }
  }

  function initMap(lat, lng) {
    if (delegateMap) delegateMap.remove();

    delegateMap = L.map('map', { zoomControl: false }).setView([lat, lng], 14);
    L.control.zoom({ position: 'topright' }).addTo(delegateMap);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(delegateMap);

    // User marker (blue pulse)
    const userIcon = L.divIcon({
      className: 'user-marker-icon',
      html: '<div class="user-marker-pulse"></div><div class="user-marker-dot"></div>',
      iconSize: [20, 20], iconAnchor: [10, 10],
    });
    userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(delegateMap);

    loadPharmacies();
    loadPromotions();
    loadStats();
    loadStockAlerts();
  }

  // ═══════════════════════════════════════════════════════
  //  PHARMACIES
  // ═══════════════════════════════════════════════════════
  async function loadPharmacies() {
    try {
      const { data, error } = await supabase.from('pharmacies').select('id, name, address, city, quarter, phone, whatsapp, lat, lng, status, hours, services, is_open, is_on_duty');
      if (error) throw error;
      let fetched = data || [];
      const local = typeof LOCAL_PHARMACIES !== 'undefined' ? LOCAL_PHARMACIES : [];
      
      local.forEach(lp => {
        if (!fetched.find(fp => fp.name.toLowerCase() === lp.name.toLowerCase())) {
          fetched.push(lp);
        }
      });
      allPharmacies = fetched;
      filterPharmaciesByRadius();
    } catch (err) {
      console.error('Load pharmacies error:', err);
    }
  }

  function filterPharmaciesByRadius() {
    if (!userLat || !userLng) return;

    pharmaciesInRadius = allPharmacies.filter(p => {
      const dist = haversine(userLat, userLng, p.lat, p.lng);
      return dist <= currentRadius;
    });

    renderPharmacyMarkers();
    renderPharmacyList();
  }

  function renderPharmacyMarkers() {
    if (!delegateMap) return;

    // Clear existing pharmacy markers
    delegateMap.eachLayer(layer => {
      if (layer._isPharmacyMarker) delegateMap.removeLayer(layer);
    });

    pharmaciesInRadius.forEach(p => {
      let markerClass = 'marker-closed';
      let emoji = '💊';
      if (p.status === 'open') { markerClass = 'marker-open'; emoji = '💊'; }
      else if (p.status === 'guard') { markerClass = 'marker-guard'; emoji = '🌙'; }

      const icon = L.divIcon({
        html: `<div class="pharmacy-marker ${markerClass}">
                 <div class="pharmacy-marker-dot">${emoji}</div>
               </div>`,
        className: 'pharmacy-marker-wrapper',
        iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -20],
      });
      const marker = L.marker([p.lat, p.lng], { icon }).addTo(delegateMap);
      marker._isPharmacyMarker = true;
      marker.bindPopup(`<strong>${escapeHtml(p.name)}</strong><br>${escapeHtml(p.address)}<br><em>${p.status === 'open' ? 'Ouverte' : p.status === 'guard' ? 'Garde' : 'Fermée'}</em>`);
    });

    // Draw radius circle
    delegateMap.eachLayer(layer => { if (layer._isRadiusCircle) delegateMap.removeLayer(layer); });
    const circle = L.circle([userLat, userLng], {
      radius: currentRadius * 1000, color: '#059669', fillColor: '#059669',
      fillOpacity: 0.15, weight: 3, dashArray: '8, 8',
    }).addTo(delegateMap);
    circle._isRadiusCircle = true;
  }

  function renderPharmacyList() {
    const container = $('pharmacy-list');
    if (!container) return;

    if (pharmaciesInRadius.length === 0) {
      if ($('open-count')) $('open-count').textContent = '0 pharmacie(s) ouverte(s)';
      if ($('guard-count')) $('guard-count').textContent = '0 de garde';
      
      container.innerHTML = '<div style="text-align:center;padding:40px 16px;color:var(--dark-400);">Aucune pharmacie dans ce rayon.<br>Essayez un rayon plus large.</div>';
      return;
    }

    const openCount = pharmaciesInRadius.filter(p => p.status === 'open' || p.status === 'guard').length;
    const guardCount = pharmaciesInRadius.filter(p => p.status === 'guard').length;
    
    if ($('open-count')) $('open-count').textContent = `${openCount} pharmacie(s) ouverte(s)`;
    if ($('guard-count')) $('guard-count').textContent = `${guardCount} de garde`;


    container.innerHTML = pharmaciesInRadius.map(p => {
      const dist = haversine(userLat, userLng, p.lat, p.lng).toFixed(1);
      const statusLabel = p.status === 'open' ? '✅ Ouverte' : p.status === 'guard' ? '🌙 Garde' : '❌ Fermée';
      const statusBadge = p.status === 'open' ? 
        '<div style="background:rgba(16,185,129,0.15); border:1px solid #10b981; border-radius:12px; padding:4px 10px; font-size:11px; font-weight:700; color:#10b981; display:flex; align-items:center; gap:4px;">OUVERT</div>' : 
        (p.status === 'guard' ? 
          '<div style="background:rgba(217,119,6,0.15); border:1px solid #d97706; border-radius:12px; padding:4px 10px; font-size:11px; font-weight:700; color:#fbbf24; display:flex; align-items:center; gap:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> DE GARDE</div>' : 
          '<div style="background:rgba(148,163,184,0.15); border:1px solid #94a3b8; border-radius:12px; padding:4px 10px; font-size:11px; font-weight:700; color:#94a3b8; display:flex; align-items:center; gap:4px;">FERMÉ</div>'
        );

      return `
        <div class="pharma-card ${p.status === 'guard' ? 'pharma-card--guard' : ''}" data-id="${p.id}" onclick="DelegateApp.openDetail('${p.id}')">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <div>
              <div style="font-weight:700; font-size:16px; color:#fff; margin-bottom:4px;">${escapeHtml(p.name)}</div>
              <div style="font-size:13px; color:#94a3b8; display:flex; align-items:center; gap:4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                ${escapeHtml(p.address || p.quarter + ', ' + p.city)}
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-weight:700; font-size:16px; color:#10b981;">${dist}</div>
              <div style="font-size:12px; color:#64748b;">km</div>
            </div>
          </div>
          
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
            ${statusBadge}
            <div style="font-size:12px; color:#94a3b8; display:flex; align-items:center; gap:4px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${escapeHtml(p.hours || '08h00 - 20h00')}
            </div>
          </div>

          <div style="display:flex; flex-direction: column; gap: 8px;">
            <div style="display:flex; gap:8px;">
              <button class="pharma-btn" style="flex: 1; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); color: #60a5fa;" onclick="event.stopPropagation(); DelegateApp.openSendPromo('${p.id}', '${escapeHtml(p.name)}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Promo
              </button>
              <button class="pharma-btn" style="flex: 1; background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.3); color: #c084fc;" onclick="event.stopPropagation(); DelegateApp.openVisitRequest('${p.id}', '${escapeHtml(p.name)}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Visite
              </button>
            </div>
            
            <div style="display:flex; gap:8px;">
              ${p.phone ? `<button class="pharma-btn btn-call" onclick="event.stopPropagation(); window.location.href='tel:${p.phone}'">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> Appeler
              </button>` : ''}
              
              ${p.whatsapp || p.phone ? `<button class="pharma-btn btn-whatsapp" onclick="event.stopPropagation(); window.open('https://wa.me/237${p.whatsapp || p.phone}', '_blank')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#10b981"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.5.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                WhatsApp
              </button>` : ''}
              
              <button class="pharma-btn btn-route" onclick="event.stopPropagation(); DelegateApp.getRoute(${p.lat}, ${p.lng})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg> Y aller
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ═══════════════════════════════════════════════════════
  //  PROMOTIONS
  // ═══════════════════════════════════════════════════════
  async function loadPromotions() {
    if (!currentDelegate) return;
    try {
      const { data: promos, error } = await supabase
        .from('delegate_promotions')
        .select(`
          *,
          promotion_targets (
            pharmacy:pharmacies ( name )
          )
        `)
        .eq('delegate_id', currentDelegate.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      myPromotions = promos || [];
      renderPromotionsList();
    } catch (err) {
      console.error('Load promotions error:', err);
    }
  }

  function renderPromotionsList() {
    const container = $('promotions-list');
    if (!container) return;

    if (myPromotions.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px 16px;color:var(--dark-400);">Aucune promotion.<br>Créez votre première campagne !</div>';
      return;
    }

    let html = `
      <div style="overflow-x: auto;">
      <table style="width:100%; border-collapse: collapse; text-align: left; font-size: 13px;">
        <thead>
          <tr style="background: var(--dark-800); border-bottom: 2px solid var(--glass-border);">
            <th style="padding: 12px; color: var(--dark-200);">Identité Promo</th>
            <th style="padding: 12px; color: var(--dark-200);">Date</th>
            <th style="padding: 12px; color: var(--dark-200);">Nom Produit</th>
            <th style="padding: 12px; color: var(--dark-200);">Laboratoire</th>
            <th style="padding: 12px; color: var(--dark-200);">Description</th>
            <th style="padding: 12px; color: var(--dark-200);">Pharmacies (Diffusion)</th>
          </tr>
        </thead>
        <tbody>
    `;

    myPromotions.forEach(p => {
      const date = new Date(p.created_at).toLocaleDateString('fr-FR');
      const pharmaciesList = (p.promotion_targets || [])
        .map(t => t.pharmacy?.name)
        .filter(n => n)
        .join(', ');
      
      html += `
        <tr style="border-bottom: 1px solid var(--glass-border);">
          <td style="padding: 12px;">#${p.id.split('-')[0].toUpperCase()}</td>
          <td style="padding: 12px;">${date}</td>
          <td style="padding: 12px; font-weight: 600; color: var(--green-400);">${escapeHtml(p.product_name)}</td>
          <td style="padding: 12px;">${escapeHtml(p.lab_name)}</td>
          <td style="padding: 12px; color: var(--dark-300);">${escapeHtml(p.description || '-')}</td>
          <td style="padding: 12px; font-size:12px;">${escapeHtml(pharmaciesList) || '-'}</td>
        </tr>
      `;
    });
    
    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  async function handleSavePromotion(targetType) {
    if (!pharmaciesInRadius || pharmaciesInRadius.length === 0) {
       return showToast('❌ Aucune pharmacie dans le rayon. Veuillez d\'abord détecter votre position.', 'error');
    }

    const lab = ($('promo-lab') || {}).value;
    const name = ($('promo-name') || {}).value?.trim();
    const type = ($('promo-type') || {}).value;
    const desc = ($('promo-desc') || {}).value?.trim();
    const doc = ($('promo-doc') || {}).value?.trim();

    if (!name) return showToast('Veuillez saisir le nom du produit.', 'error');
    if (!lab) return showToast('Veuillez sélectionner un laboratoire.', 'error');

    let specificPharmacyId = null;
    if (targetType === 'specific') {
       specificPharmacyId = $('promo-specific-pharmacy').value;
       if (!specificPharmacyId) return showToast('Veuillez sélectionner une pharmacie.', 'error');
    }

    const btn = targetType === 'all' ? $('btn-save-promo-all') : $('btn-save-promo-specific-confirm');
    const oldText = btn.textContent;
    btn.disabled = true; btn.textContent = 'Traitement...';

    try {
      const { data: newPromo, error } = await supabase.from('delegate_promotions').insert([{
        delegate_id: currentDelegate.id,
        lab_name: lab,
        product_name: name,
        product_type: type,
        description: desc || null,
        document_url: doc || null,
      }]).select().single();
      if (error) throw error;

      if (targetType === 'all') {
        const targetsToInsert = pharmaciesInRadius.map(p => ({
          promotion_id: newPromo.id,
          pharmacy_id: p.id,
        }));
        const { error: targetErr } = await supabase.from('promotion_targets').insert(targetsToInsert);
        if (targetErr) throw targetErr;
        showToast('✅ Diffusée à toutes les pharmacies dans le rayon !', 'success');
      } 
      else if (targetType === 'specific') {
        const { error: targetErr } = await supabase.from('promotion_targets').insert([{
          promotion_id: newPromo.id,
          pharmacy_id: specificPharmacyId,
        }]);
        if (targetErr) throw targetErr;
        showToast('✅ Envoyée à la pharmacie sélectionnée !', 'success');
      }

      // Clear form & close modal
      $('new-promo-modal').classList.remove('active');
      ['promo-name', 'promo-desc', 'promo-doc', 'promo-specific-pharmacy'].forEach(id => { const el = $(id); if (el) el.value = ''; });
      $('promo-specific-container').style.display = 'none';
      $('promo-buttons-container').style.display = 'flex';
      
      await loadPromotions();
      await loadStats();
    } catch (err) {
      showToast('❌ Erreur: ' + (err.message || ''), 'error');
    } finally {
      if(btn) { btn.disabled = false; btn.textContent = oldText; }
    }
  }

  // ── Send Promotion to a Pharmacy ───────────────────────
  function openSendPromo(pharmacyId, pharmacyName) {
    $('send-promo-pharmacy-id').value = pharmacyId;
    $('send-promo-pharmacy-name').value = pharmacyName;

    // Populate promotion select
    const select = $('send-promo-select');
    select.innerHTML = '<option value="">— Choisir —</option>';
    myPromotions.forEach(p => {
      select.innerHTML += `<option value="${p.id}">${escapeHtml(p.product_name)} (${escapeHtml(p.lab_name)})</option>`;
    });

    $('send-promo-modal').classList.add('active');
  }

  async function handleConfirmSendPromo() {
    const pharmacyId = $('send-promo-pharmacy-id').value;
    const promoId = $('send-promo-select').value;

    if (!promoId) return showToast('Veuillez sélectionner une promotion.', 'error');

    const btn = $('btn-confirm-send-promo');
    btn.disabled = true; btn.textContent = 'Envoi...';

    try {
      const { error } = await supabase.from('promotion_targets').insert([{
        promotion_id: promoId,
        pharmacy_id: pharmacyId,
      }]);
      if (error) {
        if (error.code === '23505') { showToast('⚠️ Cette promotion a déjà été envoyée à cette pharmacie.', 'error'); return; }
        throw error;
      }
      showToast('✅ Promotion envoyée !', 'success');
      $('send-promo-modal').classList.remove('active');
    } catch (err) {
      showToast('❌ Erreur: ' + (err.message || ''), 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Envoyer';
    }
  }

  // ═══════════════════════════════════════════════════════
  //  VISIT REQUESTS
  // ═══════════════════════════════════════════════════════
  function openVisitRequest(pharmacyId, pharmacyName) {
    $('visit-pharmacy-id').value = pharmacyId;
    $('visit-pharmacy-name').value = pharmacyName;
    $('visit-date').value = '';
    $('visit-purpose').value = '';
    $('visit-modal').classList.add('active');
  }

  async function handleSendVisit() {
    const pharmacyId = $('visit-pharmacy-id').value;
    const date = $('visit-date').value;
    const purpose = ($('visit-purpose') || {}).value?.trim();

    if (!date) return showToast('Veuillez choisir une date et heure.', 'error');

    const btn = $('btn-send-visit');
    btn.disabled = true; btn.textContent = 'Envoi...';

    try {
      const { error } = await supabase.from('visit_requests').insert([{
        delegate_id: currentDelegate.id,
        pharmacy_id: pharmacyId,
        proposed_date: new Date(date).toISOString(),
        purpose: purpose || null,
      }]);
      if (error) throw error;

      showToast('✅ Demande de visite envoyée !', 'success');
      $('visit-modal').classList.remove('active');
    } catch (err) {
      showToast('❌ Erreur: ' + (err.message || ''), 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Envoyer la demande';
    }
  }

  // ═══════════════════════════════════════════════════════
  //  STATISTICS
  // ═══════════════════════════════════════════════════════
  async function loadStats() {
    if (!currentDelegate) return;

    try {
      // 1. Fetch Promos
      const { data: promos } = await supabase
        .from('delegate_promotions').select('*').eq('delegate_id', currentDelegate.id);
      const promoIds = (promos || []).map(p => p.id);

      let targets = [];
      if (promoIds.length > 0) {
        const { data } = await supabase.from('promotion_targets').select('*, pharmacy:pharmacy_id(name)').in('promotion_id', promoIds);
        targets = data || [];
      }

      // 2. Fetch Visits
      const { data: visits } = await supabase
        .from('visit_requests').select('*').eq('delegate_id', currentDelegate.id);

      // --- STATS SUMMARY ---
      const setVal = (id, val) => { const el = $(id); if (el) el.textContent = val; };
      setVal('stat-promos-sent', targets.length);
      setVal('stat-visits', (visits || []).length);
      setVal('stat-pharmacies-covered', new Set(targets.map(t => t.pharmacy_id)).size);
      setVal('stat-labs-active', sessionLabs.length);

      const readCount = targets.filter(t => t.status !== 'sent').length;
      const interestedCount = targets.filter(t => t.status === 'interested').length;
      const ignoredCount = targets.filter(t => t.status === 'ignored').length;

      setVal('stat-promos-read', readCount);
      setVal('stat-promos-interested', interestedCount);
      const ignEl = $('stat-promos-ignored');
      if (ignEl) ignEl.textContent = ignoredCount;

      // --- CHART ---
      renderStatsChart(targets);

      // --- PAR MEDICAMENT & PAR LABORATOIRE ---
      const medStats = {};
      const labStats = {};
      
      promos.forEach(p => {
        const myTargets = targets.filter(t => t.promotion_id === p.id);
        const interested = myTargets.filter(t => t.status === 'interested').length;
        
        // Med
        if (!medStats[p.product_name]) medStats[p.product_name] = { sent: 0, interested: 0 };
        medStats[p.product_name].sent += myTargets.length;
        medStats[p.product_name].interested += interested;

        // Lab
        if (!labStats[p.lab_name]) labStats[p.lab_name] = { sent: 0, interested: 0 };
        labStats[p.lab_name].sent += myTargets.length;
        labStats[p.lab_name].interested += interested;
      });

      // Render Med List
      const medListEl = $('med-stats-list');
      if (medListEl) {
        const medHtml = Object.entries(medStats).sort((a,b) => b[1].interested - a[1].interested).map(([med, s]) => `
          <div style="display:flex; justify-content:space-between; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid var(--glass-border);">
            <strong style="color:var(--dark-200);">${escapeHtml(med)}</strong>
            <span style="color:var(--green-400); font-weight:600;">${s.interested} intéressées / ${s.sent}</span>
          </div>
        `).join('');
        medListEl.innerHTML = medHtml || '<div style="text-align:center; padding:20px;">Aucune donnée.</div>';
      }

      // Render Lab List
      const labListEl = $('lab-stats-list');
      if (labListEl) {
        const labHtml = Object.entries(labStats).sort((a,b) => b[1].interested - a[1].interested).map(([lab, s]) => `
          <div style="display:flex; justify-content:space-between; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid var(--glass-border);">
            <strong style="color:var(--dark-200);">${escapeHtml(lab)}</strong>
            <span style="color:var(--blue-400); font-weight:600;">${s.sent} cibles | ${s.interested} retours positifs</span>
          </div>
        `).join('');
        labListEl.innerHTML = labHtml || '<div style="text-align:center; padding:20px;">Aucune donnée.</div>';
      }

      // Populate lab report dropdown
      populateLabSelect('report-lab');

      // --- VISIT HISTORY TABLE ---
      renderVisitHistory();

      // --- PROMO RESPONSE TRACKING ---
      renderPromoTracking(promos, targets);

    } catch (err) {
      console.error('Load stats error:', err);
    }
  }

  async function renderVisitHistory() {
    const container = $('visit-history-list');
    if (!container) return;
    try {
      const { data: visits } = await supabase
        .from('visit_requests')
        .select('*, pharmacy:pharmacy_id(name)')
        .eq('delegate_id', currentDelegate.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!visits || visits.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--dark-400);font-size:14px;">Aucune visite planifiee.</div>';
        return;
      }

      const statusLabels = { pending: 'En attente', confirmed: 'Confirmee', rescheduled: 'Reportee', cancelled: 'Refusee', completed: 'Realisee' };
      const statusColors = { pending: '#f59e0b', confirmed: '#10b981', rescheduled: '#3b82f6', cancelled: '#ef4444', completed: '#6b7280' };

      let html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;text-align:left;font-size:13px;">';
      html += '<thead><tr style="background:var(--dark-800);border-bottom:2px solid var(--glass-border);">';
      html += '<th style="padding:12px;color:var(--dark-200);">Pharmacie</th>';
      html += '<th style="padding:12px;color:var(--dark-200);">Date prevue</th>';
      html += '<th style="padding:12px;color:var(--dark-200);">Objet</th>';
      html += '<th style="padding:12px;color:var(--dark-200);">Statut</th>';
      html += '</tr></thead><tbody>';

      visits.forEach(v => {
        const name = v.pharmacy?.name || 'Pharmacie';
        const date = new Date(v.proposed_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const status = statusLabels[v.status] || v.status;
        const color = statusColors[v.status] || '#888';
        html += '<tr style="border-bottom:1px solid var(--glass-border);">';
        html += '<td style="padding:12px;font-weight:600;">' + escapeHtml(name) + '</td>';
        html += '<td style="padding:12px;">' + date + '</td>';
        html += '<td style="padding:12px;color:var(--dark-300);">' + escapeHtml(v.purpose || '-') + '</td>';
        html += '<td style="padding:12px;"><span style="background:' + color + '22;color:' + color + ';padding:4px 10px;border-radius:12px;font-size:12px;font-weight:600;">' + status + '</span></td>';
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      container.innerHTML = html;
    } catch (e) { console.error('Visit history error:', e); }
  }

  function renderPromoTracking(promos, targets) {
    const container = $('promo-tracking-list');
    if (!container || !promos) return;

    if (promos.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--dark-400);font-size:14px;">Aucune promotion envoyee.</div>';
      return;
    }

    let html = '';
    promos.forEach(p => {
      const myTargets = targets.filter(t => t.promotion_id === p.id);
      const sent = myTargets.length;
      const read = myTargets.filter(t => t.status !== 'sent').length;
      const interested = myTargets.filter(t => t.status === 'interested').length;
      const ignored = myTargets.filter(t => t.status === 'ignored').length;
      const stocked = myTargets.filter(t => t.status === 'already_stocked').length;
      const pct = sent > 0 ? Math.round(interested / sent * 100) : 0;
      const barWidth = sent > 0 ? Math.round(read / sent * 100) : 0;

      html += '<div style="background:var(--dark-800);border:1px solid var(--glass-border);border-radius:14px;padding:16px;margin-bottom:12px;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
      html += '<strong style="color:var(--green-400);font-size:15px;">' + escapeHtml(p.product_name) + '</strong>';
      html += '<span style="color:var(--dark-400);font-size:12px;">' + escapeHtml(p.lab_name) + '</span>';
      html += '</div>';
      
      // Progress bar
      html += '<div style="background:var(--dark-700);border-radius:8px;height:8px;margin-bottom:10px;overflow:hidden;">';
      html += '<div style="background:linear-gradient(90deg,#059669,#10b981);height:100%;width:' + barWidth + '%;border-radius:8px;transition:width 0.5s ease;"></div>';
      html += '</div>';

      // KPIs
      html += '<div style="display:flex;gap:12px;flex-wrap:wrap;font-size:12px;">';
      html += '<span style="color:var(--dark-300);">Envoyees: <strong style="color:var(--blue-400);">' + sent + '</strong></span>';
      html += '<span style="color:var(--dark-300);">Lues: <strong style="color:#8b5cf6;">' + read + '</strong></span>';
      html += '<span style="color:var(--dark-300);">Interessees: <strong style="color:#10b981;">' + interested + '</strong></span>';
      html += '<span style="color:var(--dark-300);">En stock: <strong style="color:#f59e0b;">' + stocked + '</strong></span>';
      html += '<span style="color:var(--dark-300);">Taux: <strong style="color:var(--green-400);">' + pct + '%</strong></span>';
      html += '</div></div>';
    });
    container.innerHTML = html;
  }

  function renderStatsChart(targets) {
    const ctx = $('delegate-chart');
    if (!ctx) return;

    const counts = { sent: 0, read: 0, interested: 0, already_stocked: 0, ignored: 0 };
    if(targets) {
        targets.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; });
    }

    if (statsChart) statsChart.destroy();
    statsChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Envoyées', 'Lues', 'Intéressées', 'Déjà en stock', 'Ignorées'],
        datasets: [{
          data: [counts.sent, counts.read, counts.interested, counts.already_stocked, counts.ignored],
          backgroundColor: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#6b7280'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 12 } } },
        },
      },
    });
  }

  // ═══════════════════════════════════════════════════════
  //  REPORTS
  // ═══════════════════════════════════════════════════════
  async function handleGenerateReport() {
    const lab = ($('report-lab') || {}).value;
    const from = ($('report-from') || {}).value;
    const to = ($('report-to') || {}).value;

    if (!lab) return showToast('Veuillez sélectionner un laboratoire.', 'error');

    showToast('📊 Génération du rapport en cours...', 'info');

    try {
      const { data: promos } = await supabase
        .from('delegate_promotions').select('id, product_name, created_at')
        .eq('delegate_id', currentDelegate.id).eq('lab_name', lab);
      const promoIds = (promos || []).map(p => p.id);

      let targets = [];
      if (promoIds.length > 0) {
        const { data } = await supabase.from('promotion_targets').select('*').in('promotion_id', promoIds);
        targets = data || [];
      }

      const { data: visits } = await supabase
        .from('visit_requests').select('*').eq('delegate_id', currentDelegate.id);

      // Generate report HTML
      const reportHtml = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto;">
          <h1 style="color: #059669; border-bottom: 2px solid #059669; padding-bottom: 8px;">Rapport d'Activité — Pharma-Garde</h1>
          <p><strong>Délégué :</strong> ${currentDelegate.first_name} ${currentDelegate.last_name}</p>
          <p><strong>Laboratoire :</strong> ${lab}</p>
          <p><strong>Période :</strong> ${from || 'Début'} au ${to || 'Aujourd\'hui'}</p>
          <hr>
          <h2>📈 Résumé</h2>
          <ul>
            <li><strong>${(promos || []).length}</strong> promotions créées</li>
            <li><strong>${targets.length}</strong> envois aux pharmacies</li>
            <li><strong>${targets.filter(t => t.status === 'interested').length}</strong> réponses positives (${targets.length > 0 ? Math.round(targets.filter(t => t.status === 'interested').length / targets.length * 100) : 0}%)</li>
            <li><strong>${(visits || []).filter(v => v.status === 'completed').length}</strong> visites réalisées</li>
            <li><strong>${new Set(targets.map(t => t.pharmacy_id)).size}</strong> pharmacies couvertes</li>
          </ul>
          <h2>🏆 Produits promus</h2>
          <ol>${(promos || []).map(p => `<li>${p.product_name} — ${new Date(p.created_at).toLocaleDateString('fr-FR')}</li>`).join('')}</ol>
          <p style="color: #888; font-size: 12px; margin-top: 40px;">Généré par Pharma-Garde le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}</p>
        </div>
      `;

      // Use html2pdf to generate
      const element = document.createElement('div');
      element.innerHTML = reportHtml;
      document.body.appendChild(element);

      await html2pdf().set({
        margin: 10, filename: `rapport_${lab.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`,
        html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).from(element).save();

      document.body.removeChild(element);
      showToast('✅ Rapport PDF téléchargé !', 'success');
    } catch (err) {
      console.error('Report error:', err);
      showToast('❌ Erreur lors de la génération du rapport.', 'error');
    }
  }

  function handleDownloadReport() {
    // Scroll to report section
    const section = $('lab-report-section');
    if (section) section.scrollIntoView({ behavior: 'smooth' });
  }


  // ═══════════════════════════════════════════════════════
  //  STOCK ALERTS FROM PHARMACIES
  // ═══════════════════════════════════════════════════════
  async function loadStockAlerts() {
    const container = $('stock-alerts-list');
    if (!container || !userLat || !userLng) return;
    
    try {
      const { data: alerts, error } = await supabase
        .from('stock_alerts')
        .select('*, pharmacy:pharmacy_id(name, phone, address)')
        .eq('is_resolved', false)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;

      // Filter by distance
      const nearbyAlerts = (alerts || []).filter(a => {
        if (!a.pharmacy_lat || !a.pharmacy_lng) return true;
        const dist = haversine(userLat, userLng, a.pharmacy_lat, a.pharmacy_lng);
        return dist <= (a.radius || 5);
      });

      // Update badge
      const badge = $('alerts-badge');
      if (badge) {
        badge.textContent = nearbyAlerts.length;
        badge.style.display = nearbyAlerts.length > 0 ? 'flex' : 'none';
      }

      if (nearbyAlerts.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--dark-400);font-size:14px;">Aucune alerte de rupture dans votre zone.</div>';
        return;
      }

      const urgencyColors = { normal: '#3b82f6', urgent: '#f59e0b', critical: '#ef4444' };
      const urgencyLabels = { normal: 'Normale', urgent: 'Urgente', critical: 'Critique' };

      container.innerHTML = nearbyAlerts.map(a => {
        const pharma = a.pharmacy || {};
        const color = urgencyColors[a.urgency] || '#888';
        const label = urgencyLabels[a.urgency] || a.urgency;
        const timeAgo = getTimeAgo(a.created_at);
        const dist = a.pharmacy_lat ? haversine(userLat, userLng, a.pharmacy_lat, a.pharmacy_lng).toFixed(1) : '?';

        return '<div style="background:var(--dark-800);border:1px solid ' + color + '33;border-radius:14px;padding:16px;margin-bottom:10px;border-left:4px solid ' + color + ';">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<strong style="color:var(--dark-100);font-size:15px;">' + escapeHtml(a.product_name) + '</strong>' +
            '<span style="background:' + color + '22;color:' + color + ';padding:3px 10px;border-radius:10px;font-size:11px;font-weight:700;">' + label + '</span>' +
          '</div>' +
          '<div style="font-size:13px;color:var(--dark-300);margin-bottom:6px;">' + escapeHtml(pharma.name || 'Pharmacie') + ' — ' + dist + ' km</div>' +
          (a.message ? '<div style="font-size:13px;color:var(--dark-400);margin-bottom:8px;font-style:italic;">' + escapeHtml(a.message) + '</div>' : '') +
          '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<span style="font-size:11px;color:var(--dark-500);">' + timeAgo + '</span>' +
            (pharma.phone ? '<a href="tel:' + pharma.phone + '" class="btn btn-sm btn-outline" style="font-size:11px;padding:4px 12px;">Appeler</a>' : '') +
          '</div>' +
        '</div>';
      }).join('');
    } catch (err) {
      console.error('Stock alerts error:', err);
    }
  }

  function getTimeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return 'Il y a ' + mins + ' min';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return 'Il y a ' + hrs + 'h';
    return 'Il y a ' + Math.floor(hrs / 24) + ' jour(s)';
  }

  // ═══════════════════════════════════════════════════════
  //  PANEL SWITCHING
  // ═══════════════════════════════════════════════════════
  function switchPanel(panel) {
    activePanel = panel;
    ['pharmacies', 'promotions', 'stats', 'alerts'].forEach(p => {
      const el = $('panel-' + p);
      if (el) el.style.display = (p === panel) ? 'block' : 'none';
    });

    // Highlight active button
    const btnMap = { pharmacies: 'btn-pharmacies', promotions: 'btn-promotions', stats: 'btn-stats' };
    Object.entries(btnMap).forEach(([key, id]) => {
      const el = $(id);
      if (el) el.classList.toggle('action-btn-active', key === panel);
    });

    // Load alerts when switching
    if (panel === 'alerts') loadStockAlerts();

    // Fullscreen for Stats
    const sheet = $('bottom-sheet');
    if (sheet) {
      if (panel === 'stats') {
        sheet.classList.add('stats-fullscreen');
      } else {
        sheet.classList.remove('stats-fullscreen');
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  //  BOTTOM SHEET DRAG
  // ═══════════════════════════════════════════════════════
  function initBottomSheetDrag() {
    const sheet = $('bottom-sheet');
    const handle = $('sheet-handle');
    if (!sheet || !handle) return;

    let startY, startHeight;
    const minHeight = 200;
    const maxHeight = window.innerHeight * 0.85;

    handle.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
      startHeight = sheet.offsetHeight;
      sheet.style.transition = 'none';
    });

    handle.addEventListener('touchmove', (e) => {
      const diff = startY - e.touches[0].clientY;
      const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + diff));
      sheet.style.height = newHeight + 'px';
    });

    handle.addEventListener('touchend', () => {
      sheet.style.transition = 'height 0.3s ease';
      const height = sheet.offsetHeight;
      if (height > maxHeight * 0.6) sheet.style.height = maxHeight + 'px';
      else if (height < minHeight * 1.5) sheet.style.height = minHeight + 'px';
    });
  }



  async function handleSaveSettings() {
    if (!currentDelegate) return;
    const firstName = ($('settings-firstname') || {}).value?.trim();
    const lastName = ($('settings-lastname') || {}).value?.trim();
    const phone = ($('settings-phone') || {}).value?.trim();

    if (!firstName || !lastName) return showToast('Nom et prénom obligatoires.', 'error');

    try {
      const { error } = await supabase.from('delegates').update({
        first_name: firstName,
        last_name: lastName,
        phone: phone || null,
      }).eq('id', currentDelegate.id);
      if (error) throw error;

      currentDelegate.first_name = firstName;
      currentDelegate.last_name = lastName;
      currentDelegate.phone = phone;
      saveSession(currentDelegate, sessionLabs);

      showToast('✅ Profil mis à jour !', 'success');
      $('settings-panel').classList.remove('open');
    } catch (err) {
      showToast('❌ Erreur: ' + (err.message || ''), 'error');
    }
  }

  function getRoute(lat, lng) {
    if (!userLat || !userLng) {
      return showToast('Veuillez d\'abord détecter votre position.', 'error');
    }
    // Use native navigation intent on mobile
    const url = 'https://www.google.com/maps/dir/?api=1&origin=' + userLat + ',' + userLng + '&destination=' + lat + ',' + lng + '&travelmode=driving';
    try { window.location.href = 'geo:' + lat + ',' + lng + '?q=' + lat + ',' + lng; } catch(e) { window.open(url, '_blank'); }
  }


  // ═══════════════════════════════════════════════════════
  //  UTILITIES
  // ═══════════════════════════════════════════════════════
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function showToast(message, type) {
    type = type || 'success';
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-message');
    if (!toast || !msgEl) return;
    toast.className = 'toast toast--' + type;
    msgEl.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3500);
  
  }

  function populateLabSelect(selectId) {
    const select = $(selectId);
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">— Sélectionner un laboratoire —</option>';
    sessionLabs.forEach(lab => {
      select.innerHTML += `<option value="${escapeHtml(lab)}">${escapeHtml(lab)}</option>`;
    });
    if (currentVal) select.value = currentVal;
  }

  // ═══════════════════════════════════════════════════════
  //  PUBLIC API (for inline onclick handlers)
  // ═══════════════════════════════════════════════════════
  window.DelegateApp = {
    openSendPromo,
    openVisitRequest,
    getRoute,
  };

  // ── Real-time subscription for delegate ─────────────
  function subscribeToDelegateUpdates() {
    if (!currentDelegate) return;
    const channel = supabase
      .channel('delegate_updates_' + currentDelegate.id)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'promotion_targets'
      }, (payload) => {
        loadPromotions();
        loadStats();
        const status = payload.new.status;
        if (status === 'interested') showToast('Une pharmacie est interessee par votre promotion !', 'success');
        else if (status === 'read') showToast('Une pharmacie a consulte votre promotion.', 'info');
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'visit_requests',
        filter: 'delegate_id=eq.' + currentDelegate.id
      }, (payload) => {
        const status = payload.new.status;
        if (status === 'confirmed') showToast('Votre demande de visite a ete confirmee !', 'success');
        else if (status === 'cancelled') showToast('Votre demande de visite a ete refusee.', 'error');
      })
      .subscribe();
  }

  // ── Boot ───────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => { if (typeof I18n !== 'undefined') I18n.init(); });
  document.addEventListener('DOMContentLoaded', init);

})();
