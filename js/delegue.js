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
    const tabs = { login: 'form-login', register: 'form-register', reset: 'form-reset' };
    $qa('.login-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $qa('.login-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        Object.values(tabs).forEach(fid => {
          const el = $(fid);
          if (el) el.style.display = 'none';
        });
        const formId = tabs[tab.dataset.form];
        const el = $(formId);
        if (el) el.style.display = 'block';
      });
    });

    const linkForgot = $('link-forgot');
    if (linkForgot) {
      linkForgot.addEventListener('click', (e) => {
        e.preventDefault();
        $qa('.login-tab').forEach(t => t.classList.remove('active'));
        $('tab-reset').classList.add('active');
        $('form-login').style.display = 'none';
        $('form-register').style.display = 'none';
        $('form-reset').style.display = 'block';
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
      $('new-promo-modal').classList.add('active');
    });
    bindClick('btn-cancel-promo', () => $('new-promo-modal').classList.remove('active'));
    bindClick('btn-save-promo', handleSavePromotion);

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
    const nom = ($('reg-nom') || {}).value?.trim();
    const prenom = ($('reg-prenom') || {}).value?.trim();
    const proCard = ($('reg-pro-card') || {}).value?.trim();
    const cni = ($('reg-cni') || {}).value?.trim();
    const phone = ($('reg-phone') || {}).value?.trim();
    const email = ($('reg-email') || {}).value?.trim();
    const password = ($('reg-password') || {}).value;
    const confirmPassword = ($('reg-confirm-password') || {}).value;

    if (!nom || !prenom || !proCard || !cni || !phone || !email || !password || !confirmPassword) {
      return showToast('Veuillez remplir tous les champs obligatoires.', 'error');
    }
    if (password.length < 6) return showToast('Le mot de passe doit contenir au moins 6 caractères.', 'error');
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
      ['reg-nom', 'reg-prenom', 'reg-pro-card', 'reg-cni', 'reg-phone', 'reg-email', 'reg-password', 'reg-confirm-password']
        .forEach(id => { const el = $(id); if (el) el.value = ''; });

      // Switch to login tab
      $('tab-login').click();
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
      const pos = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('GPS non supporté'));
        navigator.geolocation.getCurrentPosition(
          p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          e => reject(e),
          { enableHighAccuracy: true, timeout: 15000 }
        );
      });

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
    L.control.zoom({ position: 'bottomright' }).addTo(delegateMap);

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
  }

  // ═══════════════════════════════════════════════════════
  //  PHARMACIES
  // ═══════════════════════════════════════════════════════
  async function loadPharmacies() {
    try {
      const { data, error } = await supabase.from('pharmacies').select('id, name, address, city, quarter, phone, whatsapp, lat, lng, status, hours, services, is_open, is_on_duty');
      if (error) throw error;
      allPharmacies = data || [];
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
      return `
        <div class="pharmacy-card-delegate" data-id="${p.id}">
          <div class="pharmacy-card-header">
            <div>
              <div class="pharmacy-card-name">🏥 ${escapeHtml(p.name)}</div>
              <div class="pharmacy-card-address">📍 ${escapeHtml(p.address || p.quarter + ', ' + p.city)} — ${dist} km</div>
              <div class="pharmacy-card-status">${statusLabel} &nbsp; ⏰ ${escapeHtml(p.hours || '—')}</div>
            </div>
          </div>
                    <div class="pharmacy-card-actions" style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn-sm btn-primary" style="flex: 1; min-width: 120px;" onclick="DelegateApp.openSendPromo('${p.id}', '${escapeHtml(p.name)}')">📤 Envoyer Promo</button>
            <button class="btn btn-sm btn-outline" style="flex: 1; min-width: 80px;" onclick="DelegateApp.openVisitRequest('${p.id}', '${escapeHtml(p.name)}')">📅 Visite</button>
            <div style="display: flex; gap: 8px; width: 100%;">
              ${p.phone ? `<a href="tel:${p.phone}" class="btn btn-sm btn-outline" style="flex: 1; display:flex; justify-content:center; align-items:center; gap:4px;">📞 Appeler</a>` : ''}
              ${p.whatsapp || p.phone ? `<a href="https://wa.me/${p.whatsapp || p.phone}" target="_blank" class="btn btn-sm btn-outline" style="flex: 1; display:flex; justify-content:center; align-items:center; gap:4px; color:#25D366; border-color: rgba(37, 211, 102, 0.3); background: rgba(37, 211, 102, 0.05);">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                WhatsApp
              </a>` : ''}
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
      const { data, error } = await supabase
        .from('delegate_promotions').select('*')
        .eq('delegate_id', currentDelegate.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      myPromotions = data || [];
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

    container.innerHTML = myPromotions.map(p => {
      const typeLabels = { medicament: '💊 Médicament', complement: '🧪 Complément', materiel: '🩺 Matériel', cosmetique: '💄 Cosmétique' };
      const date = new Date(p.created_at).toLocaleDateString('fr-FR');
      return `
        <div class="promo-card">
          <div class="promo-card-header">
            <strong>${escapeHtml(p.product_name)}</strong>
            <span class="promo-type-badge">${typeLabels[p.product_type] || p.product_type}</span>
          </div>
          <div class="promo-card-lab">🏭 ${escapeHtml(p.lab_name)}</div>
          ${p.description ? `<div class="promo-card-desc">${escapeHtml(p.description)}</div>` : ''}
          ${p.document_url ? `<a href="${p.document_url}" target="_blank" class="promo-doc-link">📎 Document joint</a>` : ''}
          <div class="promo-card-footer">
            <span>📅 ${date}</span>
            <span style="color: ${p.is_active ? 'var(--green-400)' : 'var(--dark-400)'};">${p.is_active ? '● Active' : '○ Inactive'}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  async function handleSavePromotion() {
    const lab = ($('promo-lab') || {}).value;
    const name = ($('promo-name') || {}).value?.trim();
    const type = ($('promo-type') || {}).value;
    const desc = ($('promo-desc') || {}).value?.trim();
    const doc = ($('promo-doc') || {}).value?.trim();

    if (!name) return showToast('Veuillez saisir le nom du produit.', 'error');
    if (!lab) return showToast('Veuillez sélectionner un laboratoire.', 'error');

    const btn = $('btn-save-promo');
    btn.disabled = true; btn.textContent = 'Enregistrement...';

    try {
      const { error } = await supabase.from('delegate_promotions').insert([{
        delegate_id: currentDelegate.id,
        lab_name: lab,
        product_name: name,
        product_type: type,
        description: desc || null,
        document_url: doc || null,
      }]);
      if (error) throw error;

      showToast('✅ Promotion enregistrée !', 'success');
      $('new-promo-modal').classList.remove('active');
      // Clear form
      ['promo-name', 'promo-desc', 'promo-doc'].forEach(id => { const el = $(id); if (el) el.value = ''; });
      await loadPromotions();
    } catch (err) {
      showToast('❌ Erreur: ' + (err.message || ''), 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Enregistrer';
    }
  }

  // ── Send Promotion to a Pharmacy ───────────────────────
  function openSendPromo(pharmacyId, pharmacyName) {
    $('send-promo-pharmacy-id').value = pharmacyId;
    $('send-promo-pharmacy-name').value = pharmacyName;

    // Populate promotion select
    const select = $('send-promo-select');
    select.innerHTML = '<option value="">— Choisir —</option>';
    myPromotions.filter(p => p.is_active).forEach(p => {
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
        if (!medStats[p.med_name]) medStats[p.med_name] = { sent: 0, interested: 0 };
        medStats[p.med_name].sent += myTargets.length;
        medStats[p.med_name].interested += interested;

        // Lab
        if (!labStats[p.laboratory]) labStats[p.laboratory] = { sent: 0, interested: 0 };
        labStats[p.laboratory].sent += myTargets.length;
        labStats[p.laboratory].interested += interested;
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
    } catch (err) {
      console.error('Load stats error:', err);
    }
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
  //  PANEL SWITCHING
  // ═══════════════════════════════════════════════════════
  function switchPanel(panel) {
    activePanel = panel;
    ['pharmacies', 'promotions', 'stats'].forEach(p => {
      const el = $('panel-' + p);
      if (el) el.style.display = (p === panel) ? 'block' : 'none';
    });

    // Highlight active button
    const btnMap = { pharmacies: 'btn-pharmacies', promotions: 'btn-promotions', stats: 'btn-stats' };
    Object.entries(btnMap).forEach(([key, id]) => {
      const el = $(id);
      if (el) el.classList.toggle('action-btn-active', key === panel);
    });

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

  function showToast(message, type = 'success') {
    const toast = $('toast');
    const msg = $('toast-message');
    if (!toast || !msg) return;
    msg.textContent = message;
    toast.className = `toast toast-${type} show`;
    setTimeout(() => toast.classList.remove('show'), 4000);
  }

  function populateLabSelect(selectId) {
    const select = $(selectId);
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">— Sélectionner —</option>';
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
  };

  // ── Boot ───────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

})();
