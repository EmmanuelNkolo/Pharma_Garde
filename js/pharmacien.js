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
    try { bindAuthUI(); } catch (e) { console.error('Auth UI binding error:', e); }
    try { bindEvents(); } catch (e) { console.error('Event binding error:', e); }
    try { bindDashboardUI(); } catch (e) { console.error('Dashboard UI binding error:', e); }

    // Password-recovery link coming back from email
    if (/[?&]reset=true/.test(window.location.search) || /type=recovery/.test(window.location.hash)) {
      handleRecoveryReturn();
      return;
    }

    const saved = loadSession();
    if (saved) {
      currentPharmacy = saved;
      try { showDashboard(); } catch (e) { console.error('Dashboard error:', e); }
    }
  }

  // ── Session ────────────────────────────────────────────
  function saveSession(pharmacy) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        id: pharmacy.id, name: pharmacy.name, phone: pharmacy.phone,
        address: pharmacy.address, lat: pharmacy.lat, lng: pharmacy.lng,
        whatsapp: pharmacy.whatsapp, city: pharmacy.city, quarter: pharmacy.quarter,
        hours: pharmacy.hours, status: pharmacy.status, email: pharmacy.email,
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

  // ═══════════════════════════════════════════════════════
  //  AUTH UI (views, password helpers, GPS capture)
  // ═══════════════════════════════════════════════════════
  const PENDING_KEY = 'pharmagarde_pending_pharmacy';
  let gpsWatchId = null;
  let gpsTimer = null;
  let gpsBest = null;
  let gpsAutoTried = false;
  let gpsFallbackAccepted = false;

  function showAuthView(view) {
    ['login', 'register', 'reset'].forEach(v => {
      const el = document.getElementById(v + '-form');
      if (el) el.classList.toggle('hidden', v !== view);
    });
    const screen = document.getElementById('login-screen');
    if (screen) screen.scrollTop = 0;
    window.scrollTo(0, 0);

    if (view === 'register' && !gpsAutoTried) {
      gpsAutoTried = true;
      // Automatic capture as soon as the registration form opens
      setTimeout(startGpsCapture, 350);
    }
  }

  function bindAuthUI() {
    // View switches (login ⇄ register ⇄ reset)
    $$('[data-pa-view]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        showAuthView(btn.getAttribute('data-pa-view'));
      });
    });

    // Show / hide password
    $$('[data-toggle-pwd]').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.getAttribute('data-toggle-pwd'));
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.textContent = show ? '🙈' : '👁';
      });
    });

    // Enter key submits
    const onEnter = (ids, fn) => ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fn(); } });
    });
    onEnter(['login-email', 'login-password'], handleLogin);
    onEnter(['reset-email'], handlePasswordReset);

    // City "Autre"
    const regCity = $('#reg-city');
    if (regCity) {
      regCity.addEventListener('change', () => {
        const otherGroup = $('#reg-other-city-group');
        if (otherGroup) otherGroup.style.display = regCity.value === 'Autre' ? 'block' : 'none';
        clearFieldError(regCity);
      });
    }

    // Phone formatting
    ['reg-phone', 'reg-whatsapp'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        el.value = formatCmPhone(el.value);
        clearFieldError(el);
        if (id === 'reg-phone' && $('#reg-same-whatsapp') && $('#reg-same-whatsapp').checked) {
          $('#reg-whatsapp').value = el.value;
        }
      });
    });
    const same = $('#reg-same-whatsapp');
    if (same) same.addEventListener('change', () => {
      const wa = $('#reg-whatsapp');
      if (!wa) return;
      wa.value = same.checked ? ($('#reg-phone').value || '') : '';
      wa.readOnly = same.checked;
    });

    // Clear errors on input
    ['reg-name', 'reg-manager', 'reg-license', 'reg-quarter', 'reg-other-city', 'reg-email'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => clearFieldError(el));
    });

    // Password strength / match
    const pwd = $('#reg-password');
    const pwd2 = $('#reg-password-confirm');
    if (pwd) pwd.addEventListener('input', () => { updatePasswordStrength(); updatePasswordMatch(); });
    if (pwd2) pwd2.addEventListener('input', updatePasswordMatch);
  }

  // ── Validation helpers ──
  function normalizeCmPhone(v) {
    let d = String(v || '').replace(/\D/g, '');
    if (d.startsWith('00237')) d = d.slice(5);
    else if (d.startsWith('237') && d.length > 9) d = d.slice(3);
    return d;
  }
  function isValidCmPhone(v) { return /^[26]\d{8}$/.test(normalizeCmPhone(v)); }
  function formatCmPhone(v) {
    const d = normalizeCmPhone(v).slice(0, 9);
    return d.replace(/^(\d{3})(\d{0,2})(\d{0,2})(\d{0,2}).*$/, (m, a, b, c, e) => [a, b, c, e].filter(Boolean).join(' ')) || d;
  }
  function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim()); }

  function passwordChecks(p) {
    return { len: p.length >= 8, upper: /[A-Z]/.test(p), digit: /[0-9]/.test(p), lower: /[a-z]/.test(p) };
  }

  function updatePasswordStrength() {
    const p = ($('#reg-password') || {}).value || '';
    const c = passwordChecks(p);
    $$('#pwd-rules li').forEach(li => li.classList.toggle('ok', !!c[li.dataset.rule]));
    let score = Object.values(c).filter(Boolean).length + (p.length >= 12 ? 1 : 0) + (/[^A-Za-z0-9]/.test(p) ? 1 : 0);
    const bar = $('#pwd-strength-bar');
    if (!bar) return;
    const pct = Math.min(100, Math.round((score / 6) * 100));
    bar.style.width = (p ? pct : 0) + '%';
    bar.style.background = score <= 2 ? '#f87171' : score <= 4 ? '#fbbf24' : '#10b981';
  }

  function updatePasswordMatch() {
    const p = ($('#reg-password') || {}).value || '';
    const p2 = ($('#reg-password-confirm') || {}).value || '';
    const el = $('#pwd-match');
    if (!el) return;
    if (!p2) { el.textContent = ''; el.className = 'pa-match'; return; }
    const ok = p === p2;
    el.textContent = ok ? '✓ Les mots de passe correspondent' : '✗ Les mots de passe ne correspondent pas';
    el.className = 'pa-match ' + (ok ? 'ok' : 'ko');
  }

  function setFieldError(el) {
    if (!el) return;
    el.classList.add('pa-input-error');
    const field = el.closest('.pa-field');
    if (field) field.classList.add('has-error');
  }
  function clearFieldError(el) {
    if (!el) return;
    el.classList.remove('pa-input-error');
    const field = el.closest('.pa-field');
    if (field) field.classList.remove('has-error');
  }

  function setBtnLoading(btn, loading, label) {
    if (!btn) return;
    if (loading) {
      btn.dataset.label = btn.dataset.label || btn.innerHTML;
      btn.innerHTML = '<span class="pa-spinner"></span>' + (label || 'Patientez...');
      btn.disabled = true;
    } else {
      btn.innerHTML = btn.dataset.label || label || btn.innerHTML;
      btn.disabled = false;
    }
  }

  // ═══════════════════════════════════════════════════════
  //  GPS CAPTURE (automatic, best-accuracy)
  // ═══════════════════════════════════════════════════════
  function setGpsUI(state, title, detail) {
    const card = $('#gps-card');
    if (!card) return;
    card.classList.remove('is-loading', 'is-ok', 'is-warn', 'is-error');
    if (state) card.classList.add('is-' + state);
    if ($('#gps-status-text')) $('#gps-status-text').textContent = title;
    if ($('#gps-detail-text')) $('#gps-detail-text').innerHTML = detail;
  }

  function renderGpsActions(mode) {
    const box = $('#gps-card .pa-gps__actions');
    if (!box) return;
    if (mode === 'loading') {
      box.innerHTML = '<button type="button" class="btn btn--secondary btn--sm" id="btn-gps-stop">⏹ Valider cette position</button>';
      $('#btn-gps-stop').addEventListener('click', () => finishGpsCapture(true));
    } else if (mode === 'done') {
      box.innerHTML = '<button type="button" class="btn btn--secondary btn--sm" id="btn-detect-gps">🔄 Recapturer</button>';
      $('#btn-detect-gps').addEventListener('click', startGpsCapture);
    } else if (mode === 'error') {
      box.innerHTML = '<button type="button" class="btn btn--primary btn--sm" id="btn-detect-gps">📡 Réessayer</button>' +
        '<button type="button" class="btn btn--ghost btn--sm" id="btn-gps-fallback" style="color: var(--amber-400);">Continuer sans GPS</button>';
      $('#btn-detect-gps').addEventListener('click', startGpsCapture);
      $('#btn-gps-fallback').addEventListener('click', () => {
        gpsFallbackAccepted = true;
        setGpsUI('warn', 'Position approximative', 'La position sera estimée à partir de la ville et du quartier. Vous pourrez la corriger plus tard depuis les paramètres, <strong>depuis la pharmacie</strong>.');
        renderGpsActions('done');
      });
    } else {
      box.innerHTML = '<button type="button" class="btn btn--primary btn--sm" id="btn-detect-gps">📡 Capturer la position</button>';
      $('#btn-detect-gps').addEventListener('click', startGpsCapture);
    }
  }

  function startGpsCapture() {
    if (!navigator.geolocation) {
      setGpsUI('error', 'GPS non disponible', 'Votre navigateur ne permet pas la géolocalisation.');
      renderGpsActions('error');
      return;
    }
    if (!window.isSecureContext && location.hostname !== 'localhost') {
      setGpsUI('error', 'Connexion non sécurisée', 'La géolocalisation nécessite une connexion HTTPS.');
      renderGpsActions('error');
      return;
    }
    stopGpsWatch();
    gpsBest = null;
    gpsFallbackAccepted = false;
    setGpsUI('loading', 'Recherche du signal GPS…', 'Autorisez l\'accès à la position. Restez à l\'intérieur de la pharmacie, près d\'une porte ou d\'une fenêtre.');
    renderGpsActions('loading');

    gpsWatchId = navigator.geolocation.watchPosition(onGpsPosition, onGpsError, {
      enableHighAccuracy: true, maximumAge: 0, timeout: 20000,
    });
    // Stop after 20 s with the best reading we got
    gpsTimer = setTimeout(() => finishGpsCapture(false), 20000);
  }

  function onGpsPosition(p) {
    const reading = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy || 9999) };
    if (!gpsBest || reading.accuracy < gpsBest.accuracy) gpsBest = reading;
    setGpsUI('loading', `Affinage de la précision… ±${gpsBest.accuracy} m`,
      `${gpsBest.lat.toFixed(6)}, ${gpsBest.lng.toFixed(6)} — patientez quelques secondes pour une meilleure précision.`);
    if (gpsBest.accuracy <= 20) finishGpsCapture(false);
  }

  function onGpsError(err) {
    if (gpsBest) return; // keep best reading if we already have one
    stopGpsWatch();
    const msgs = {
      1: 'Accès refusé. Autorisez la localisation pour ce site dans les paramètres du navigateur, puis réessayez.',
      2: 'Signal GPS indisponible. Activez la localisation (GPS) de votre téléphone.',
      3: 'Délai dépassé. Rapprochez-vous d\'une fenêtre et réessayez.',
    };
    setGpsUI('error', 'Position non capturée', msgs[err && err.code] || 'Erreur de géolocalisation.');
    renderGpsActions('error');
  }

  function stopGpsWatch() {
    if (gpsWatchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
    if (gpsTimer) clearTimeout(gpsTimer);
    gpsTimer = null;
  }

  function finishGpsCapture(manual) {
    stopGpsWatch();
    if (!gpsBest) {
      if (manual) { setGpsUI('error', 'Aucune position reçue', 'Le signal GPS n\'a pas encore été reçu. Réessayez.'); renderGpsActions('error'); }
      else onGpsError({ code: 3 });
      return;
    }
    const { lat, lng, accuracy } = gpsBest;
    $('#reg-lat').value = lat;
    $('#reg-lng').value = lng;
    $('#reg-accuracy').value = accuracy;

    const good = accuracy <= 50;
    setGpsUI(good ? 'ok' : 'warn',
      good ? `✅ Position exacte capturée (±${accuracy} m)` : `⚠️ Position capturée — précision faible (±${accuracy} m)`,
      `${lat.toFixed(6)}, ${lng.toFixed(6)}` + (good ? '' : '<br>Pour plus de précision, activez le GPS et recapturez depuis la pharmacie.'));
    renderGpsActions('done');
    renderGpsMap(lat, lng);
    reverseGeocode(lat, lng);
  }

  function renderGpsMap(lat, lng) {
    const map = $('#gps-map');
    if (!map) return;
    const d = 0.0025;
    const bbox = [lng - d, lat - d, lng + d, lat + d].join('%2C');
    map.innerHTML = `<iframe loading="lazy" title="Position de la pharmacie" src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}"></iframe>`;
  }

  async function reverseGeocode(lat, lng) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1&accept-language=fr`);
      if (!res.ok) return;
      const data = await res.json();
      const a = data.address || {};
      const city = a.city || a.town || a.village || a.municipality || a.county || '';
      const quarter = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.hamlet || '';
      const citySel = $('#reg-city');
      if (citySel && !citySel.value && city) {
        const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const match = Array.from(citySel.options).find(o => o.value && norm(city).includes(norm(o.value)));
        if (match) citySel.value = match.value;
        else { citySel.value = 'Autre'; $('#reg-other-city-group').style.display = 'block'; $('#reg-other-city').value = city; }
        clearFieldError(citySel);
      }
      const q = $('#reg-quarter');
      if (q && !q.value && quarter) { q.value = quarter; clearFieldError(q); }
      const lm = $('#reg-landmark');
      if (lm && !lm.value && a.road) lm.placeholder = 'Ex : ' + a.road + (a.house_number ? ' ' + a.house_number : '');
    } catch (e) { /* silent: optional enhancement */ }
  }

  async function handleDetectGPS() { startGpsCapture(); }

  // ── LOGIN ──────────────────────────────────────────────
  async function handleLogin() {
    const emailEl = $('#login-email');
    const pwdEl = $('#login-password');
    const email = ((emailEl || {}).value || '').trim().toLowerCase();
    const password = (pwdEl || {}).value || '';
    if (!email || !password) { showToast('Veuillez saisir votre email et votre mot de passe', 'error'); return; }
    if (!isValidEmail(email)) { showToast('Adresse email invalide', 'error'); return; }
    if (typeof supabase === 'undefined' || !supabase.auth) { showToast('Service indisponible. Vérifiez votre connexion internet.', 'error'); return; }

    const btn = $('#btn-login');
    setBtnLoading(btn, true, 'Connexion...');

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError || !authData || !authData.user) {
        const msg = authError && /confirm/i.test(authError.message)
          ? '📧 Confirmez d\'abord votre email (lien reçu à l\'inscription).'
          : '❌ Email ou mot de passe incorrect';
        showToast(msg, 'error');
        return;
      }

      let { data: profile } = await supabase.from('pharmacies').select('*').eq('id', authData.user.id).maybeSingle();

      // Profile pending (email confirmation was required at sign-up)
      if (!profile) {
        const pending = loadPendingProfile(email);
        if (pending) {
          pending.id = authData.user.id;
          profile = await insertPharmacyProfile(pending);
          clearPendingProfile();
        }
      }

      if (!profile) {
        await supabase.auth.signOut().catch(() => {});
        showToast('⚠️ Aucun profil pharmacie lié à ce compte. Veuillez vous inscrire.', 'error');
        return;
      }

      currentPharmacy = profile;
      saveSession(profile);
      showDashboard();
      showToast(`✅ Bienvenue, ${profile.name} !`, 'success');
    } catch (err) {
      console.error('Login error:', err);
      showToast('❌ Erreur de connexion : ' + (err.message || 'réessayez'), 'error');
    } finally {
      setBtnLoading(btn, false);
    }
  }

  // ── REGISTER ───────────────────────────────────────────
  function savePendingProfile(p) { try { localStorage.setItem(PENDING_KEY, JSON.stringify(p)); } catch (e) { } }
  function loadPendingProfile(email) {
    try {
      const p = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
      return p && p.email === email ? p : null;
    } catch (e) { return null; }
  }
  function clearPendingProfile() { try { localStorage.removeItem(PENDING_KEY); } catch (e) { } }

  // Insert profile; if optional columns don't exist yet in DB, retry with base columns only
  async function insertPharmacyProfile(data) {
    const optional = ['manager_name', 'license_number', 'landmark', 'gps_accuracy'];
    let { data: row, error } = await supabase.from('pharmacies').insert([data]).select().single();
    if (error && /column|schema cache/i.test(error.message || '')) {
      const base = Object.assign({}, data);
      optional.forEach(k => delete base[k]);
      ({ data: row, error } = await supabase.from('pharmacies').insert([base]).select().single());
    }
    if (error) {
      console.error('Profile insertion error:', error);
      if (/duplicate|unique/i.test(error.message || '')) {
        throw new Error(/phone/i.test(error.message) ? 'Ce numéro de téléphone est déjà utilisé par une autre pharmacie.' : 'Cette pharmacie est déjà inscrite.');
      }
      throw new Error('Profil non créé : ' + (error.message || 'erreur inconnue'));
    }
    return row;
  }

  function validateRegisterForm() {
    const get = (id) => document.getElementById(id);
    const errors = [];
    const req = (id, ok) => { const el = get(id); if (!ok) { setFieldError(el); errors.push(el); } else clearFieldError(el); };

    const city = get('reg-city').value;
    req('reg-name', get('reg-name').value.trim().length >= 3);
    req('reg-manager', get('reg-manager').value.trim().length >= 3);
    req('reg-license', get('reg-license').value.trim().length >= 3);
    req('reg-city', !!city);
    if (city === 'Autre') req('reg-other-city', get('reg-other-city').value.trim().length >= 2);
    req('reg-quarter', get('reg-quarter').value.trim().length >= 2);
    req('reg-phone', isValidCmPhone(get('reg-phone').value));
    const wa = get('reg-whatsapp').value.trim();
    req('reg-whatsapp', !wa || isValidCmPhone(wa));
    req('reg-email', isValidEmail(get('reg-email').value));

    const p = get('reg-password').value;
    const c = passwordChecks(p);
    req('reg-password', c.len && c.upper && c.digit && c.lower);
    req('reg-password-confirm', !!p && p === get('reg-password-confirm').value);

    if (errors.length) {
      errors[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => errors[0].focus({ preventScroll: true }), 300);
      if (errors[0].id === 'reg-password') showToast('Mot de passe : 8 caractères min., 1 majuscule, 1 minuscule et 1 chiffre', 'error');
      else if (errors[0].id === 'reg-password-confirm') showToast('Les mots de passe ne correspondent pas', 'error');
      else showToast('Veuillez corriger les champs signalés en rouge', 'error');
      return false;
    }

    const hasGps = !!(get('reg-lat').value && get('reg-lng').value);
    if (!hasGps && !gpsFallbackAccepted) {
      $('#gps-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast('📍 Capturez la position GPS de la pharmacie (ou choisissez « Continuer sans GPS »)', 'error');
      if (gpsWatchId === null) { setGpsUI('error', 'Position requise', 'La position exacte permet aux patients de trouver votre officine.'); renderGpsActions('error'); }
      return false;
    }

    if (!get('reg-terms').checked) {
      get('reg-terms').closest('.pa-terms').scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast('Veuillez accepter les conditions d\'utilisation', 'error');
      return false;
    }
    return true;
  }

  async function handleRegister() {
    if (!validateRegisterForm()) return;
    if (typeof supabase === 'undefined' || !supabase.auth) { showToast('Service indisponible. Vérifiez votre connexion internet.', 'error'); return; }

    const v = (id) => ((document.getElementById(id) || {}).value || '').trim();
    const citySel = v('reg-city');
    const city = citySel === 'Autre' ? v('reg-other-city') : citySel;
    const quarter = v('reg-quarter');
    const landmark = v('reg-landmark');
    const email = v('reg-email').toLowerCase();
    const password = document.getElementById('reg-password').value;
    const phone = normalizeCmPhone(v('reg-phone'));
    const whatsapp = v('reg-whatsapp') ? normalizeCmPhone(v('reg-whatsapp')) : null;

    const btn = $('#btn-register');
    setBtnLoading(btn, true, 'Inscription en cours...');

    try {
      // Coordinates: precise GPS, otherwise geocode quarter + city
      let lat = parseFloat(v('reg-lat'));
      let lng = parseFloat(v('reg-lng'));
      const accuracy = v('reg-accuracy') ? parseFloat(v('reg-accuracy')) : null;
      if (isNaN(lat) || isNaN(lng)) {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(quarter + ', ' + city + ', Cameroun')}`);
          const geo = await res.json();
          if (geo && geo.length) { lat = parseFloat(geo[0].lat); lng = parseFloat(geo[0].lon); }
        } catch (e) { }
        if (isNaN(lat) || isNaN(lng)) { const c = getCityCoords(city); lat = c.lat; lng = c.lng; }
      }

      const services = [];
      if ($('#reg-service-garde').checked) services.push('garde_nuit');
      if ($('#reg-service-livraison').checked) services.push('livraison');
      if ($('#reg-service-assurance').checked) services.push('assurance');
      if ($('#reg-service-conseil').checked) services.push('conseil');

      const profileData = {
        name: v('reg-name'),
        address: [landmark, quarter, city].filter(Boolean).join(', '),
        city, quarter, phone, whatsapp, email, lat, lng,
        status: 'open', hours: `${v('reg-hour-open') || '08:00'} - ${v('reg-hour-close') || '21:00'}`,
        services, is_on_duty: false, is_open: true,
        manager_name: v('reg-manager'),
        license_number: v('reg-license').toUpperCase(),
        landmark: landmark || null,
        gps_accuracy: accuracy,
        created_at: new Date().toISOString(),
      };

      // 1) Auth account
      let userId = null;
      let hasSession = false;
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password, options: { data: { role: 'pharmacy', name: profileData.name } } });
      if (authError) {
        if (/already|registered|exists/i.test(authError.message || '')) {
          const { data: s, error: sErr } = await supabase.auth.signInWithPassword({ email, password });
          if (sErr) throw new Error('Cet email est déjà utilisé. Connectez-vous ou réinitialisez votre mot de passe.');
          userId = s.user.id; hasSession = true;
        } else { throw authError; }
      } else {
        if (!authData || !authData.user) throw new Error('Création du compte impossible.');
        userId = authData.user.id;
        hasSession = !!authData.session;
        // Supabase returns a user with no identities when the email already exists
        if (authData.user.identities && authData.user.identities.length === 0) {
          throw new Error('Cet email est déjà utilisé. Connectez-vous ou réinitialisez votre mot de passe.');
        }
      }

      profileData.id = userId;

      // 2) Email confirmation required → store profile, create it on first login
      if (!hasSession) {
        savePendingProfile(profileData);
        showToast('📧 Compte créé ! Confirmez votre email via le lien reçu, puis connectez-vous.', 'success');
        showAuthView('login');
        if ($('#login-email')) $('#login-email').value = email;
        return;
      }

      // 3) Profile
      const existing = await supabase.from('pharmacies').select('*').eq('id', userId).maybeSingle();
      const data = existing.data || await insertPharmacyProfile(profileData);

      clearPendingProfile();
      showToast('✅ Pharmacie inscrite avec succès !', 'success');
      currentPharmacy = data;
      saveSession(data);
      showDashboard();
    } catch (err) {
      console.error('Registration error:', err);
      showToast('❌ ' + (err.message || 'Erreur lors de l\'inscription'), 'error');
    } finally {
      setBtnLoading(btn, false);
    }
  }

  // ── PASSWORD RESET ─────────────────────────────────────
  async function handlePasswordReset() {
    const email = (($('#reset-email') || {}).value || '').trim().toLowerCase();
    if (!isValidEmail(email)) { showToast('Veuillez saisir un email valide', 'error'); return; }

    const btn = $('#btn-reset-password');
    setBtnLoading(btn, true, 'Envoi en cours...');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/pharmacien.html?reset=true' });
      if (error) throw error;
      showToast('✅ Lien de réinitialisation envoyé ! Consultez votre boîte mail.', 'success');
      setTimeout(() => showAuthView('login'), 2500);
    } catch (err) {
      showToast('❌ Erreur lors de l\'envoi : ' + (err.message || ''), 'error');
    } finally {
      setBtnLoading(btn, false);
    }
  }

  // Back from the email link: let the user choose a new password
  async function handleRecoveryReturn() {
    showAuthView('login');
    const pwd = window.prompt('Choisissez votre nouveau mot de passe (8 caractères min., 1 majuscule, 1 minuscule, 1 chiffre) :');
    if (!pwd) return;
    const c = passwordChecks(pwd);
    if (!(c.len && c.upper && c.digit && c.lower)) { showToast('Mot de passe trop faible. Recommencez depuis le lien reçu.', 'error'); return; }
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      showToast('✅ Mot de passe mis à jour. Connectez-vous.', 'success');
      history.replaceState(null, '', window.location.pathname);
    } catch (err) {
      showToast('❌ Lien expiré ou invalide. Refaites une demande.', 'error');
    }
  }

  // ── Events ─────────────────────────────────────────────
  function bindEvents() {
    const btnLogin = document.getElementById('btn-login');
    const btnRegister = document.getElementById('btn-register');
    const btnResetPw = document.getElementById('btn-reset-password');
    const btnLogout = document.getElementById('btn-logout');
    const btnConfirmOk = document.getElementById('btn-confirm-ok');
    const btnDetectGps = document.getElementById('btn-detect-gps');
    const btnDeleteAccount = document.getElementById('btn-delete-account');
    const btnDeleteCancel = document.getElementById('delete-cancel');
    const btnDeleteConfirm = document.getElementById('delete-confirm');

    if (btnLogin) btnLogin.addEventListener('click', handleLogin);
    if (btnRegister) btnRegister.addEventListener('click', handleRegister);
    if (btnResetPw) btnResetPw.addEventListener('click', handlePasswordReset);
    if (btnLogout) btnLogout.addEventListener('click', handleLogout);
    if (btnConfirmOk) btnConfirmOk.addEventListener('click', executeConfirm);
    if (btnDetectGps) btnDetectGps.addEventListener('click', handleDetectGPS);
    if (btnDeleteAccount) btnDeleteAccount.addEventListener('click', () => {
      document.getElementById('delete-modal').style.display = 'flex';
    });
    if (btnDeleteCancel) btnDeleteCancel.addEventListener('click', () => {
      document.getElementById('delete-modal').style.display = 'none';
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
    loadDelegateInteractions();
    initSettings();
    setupTabs();
    if (typeof updateStatusDisplay === 'function') updateStatusDisplay();
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
          if (payload.new.status !== 'pending') activeRequests.splice(idx, 1);
          else activeRequests[idx] = payload.new;
          renderActiveRequests();
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'promotion_targets' }, (payload) => {
        if (currentPharmacy && payload.new.pharmacy_id === currentPharmacy.id) {
           loadReceivedPromotions();
           showToast('📢 Nouvelle promotion reçue !', 'info');
           playNotificationSound();
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'visit_requests' }, (payload) => {
        if (currentPharmacy && payload.new.pharmacy_id === currentPharmacy.id) {
           loadReceivedVisits();
           showToast('📅 Nouvelle demande de visite !', 'info');
           playNotificationSound();
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
        const selectedStatus = req._myStatus ? req._myStatus[med] : null;
        const groupStyle = req._myStatus ? 'opacity: 0.6; pointer-events: none;' : '';

        if (hasInsurance) {
          buttonsHtml = `
            <button class="resp-btn ${selectedStatus === 'en_stock_assure' ? 'active' : ''}" data-status="en_stock_assure">✅ En stock assuré</button>
            <button class="resp-btn ${selectedStatus === 'en_stock_non_assure' ? 'active' : ''}" data-status="en_stock_non_assure">⚠️ En stock non assuré</button>
            <button class="resp-btn resp-btn-danger ${selectedStatus === 'rupture' ? 'active' : ''}" data-status="rupture">❌ Rupture</button>
          `;
        } else {
          buttonsHtml = `
            <button class="resp-btn ${selectedStatus === 'en_stock' ? 'active' : ''}" data-status="en_stock">✅ En stock</button>
            <button class="resp-btn resp-btn-danger ${selectedStatus === 'rupture' ? 'active' : ''}" data-status="rupture">❌ Rupture</button>
          `;
        }
        return `
          <div class="med-response-row">
            <div class="med-name">💊 ${med}</div>
            <div class="med-btn-group" data-med="${med}" style="${groupStyle}">${buttonsHtml}</div>
          </div>`;
      }).join('');

      let actionButton = '';
      if (req._myStatus) {
        actionButton = `
          <button class="btn btn-danger btn-block" disabled style="opacity: 0.8; cursor: default;">
            ✅ Réponse envoyée
          </button>`;
      } else {
        actionButton = `
          <button class="btn btn-primary btn-block" onclick="PharmDash.prepareResponse('${req.id}')">
            📤 Envoyer la réponse
          </button>`;
      }

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
          ${actionButton}
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
      
      // Removed: await supabase.from('requests').update({ status: 'responded' }).eq('id', requestId);
      // to allow multiple pharmacies to respond.

      const reqIdx = activeRequests.findIndex(r => r.id === requestId);
      if (reqIdx >= 0) {
        activeRequests[reqIdx]._myStatus = medicinesStatus;
      }
      renderActiveRequests();
      
      // Re-render the modal if it's currently showing 'requests'
      const panel = $('#stat-detail-panel');
      if (panel && panel.style.display !== 'none' && panel.getAttribute('data-current-type') === 'requests') {
        openStatDetail('requests', currentStatFilter);
      }
      
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
        const filter = btn.getAttribute('data-filter');
        
        // Handle custom date pickers visibility
        $$('.stats-custom-dates input').forEach(input => input.style.display = 'none');
        if (filter === 'today') $('#date-picker-day').style.display = 'inline-block';
        if (filter === 'week') $('#date-picker-week').style.display = 'inline-block';
        if (filter === 'month') $('#date-picker-month').style.display = 'inline-block';
        if (filter === 'year') $('#date-picker-year').style.display = 'inline-block';
        
        loadStats(filter);
      });
    });
    
    // Custom Date Picker listeners
    $$('.stats-custom-dates input').forEach(input => {
      input.addEventListener('change', () => {
        const filter = $('#tab-stats .filter-btn.active').getAttribute('data-filter');
        loadStats(filter);
      });
    });
    
    // PDF Report
    const btnPdf = $('#btn-download-pdf');
    if (btnPdf) btnPdf.addEventListener('click', generatePDFReport);
  }

  function getDateRange(filter) {
    const now = new Date();
    let start = new Date();
    let end = new Date();
    
    if (filter === 'today') {
      const val = $('#date-picker-day').value;
      if (val) start = new Date(val);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    }
    else if (filter === 'week') {
      const val = $('#date-picker-week').value; // format: "2026-W37"
      if (val) {
        const [year, week] = val.split('-W');
        start = new Date(year, 0, 1 + (week - 1) * 7);
        const dayOffset = start.getDay() <= 4 ? 1 - start.getDay() : 8 - start.getDay();
        start.setDate(start.getDate() + dayOffset - 1); // Start of week (Monday)
      } else {
        start.setDate(now.getDate() - 7);
      }
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 7);
    }
    else if (filter === 'month') {
      const val = $('#date-picker-month').value; // format: "2026-09"
      if (val) {
        const [year, month] = val.split('-');
        start = new Date(year, month - 1, 1);
      } else {
        start.setMonth(now.getMonth() - 1);
      }
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setMonth(end.getMonth() + 1);
    }
    else if (filter === 'year') {
      const val = $('#date-picker-year').value; // format: "2026"
      if (val) {
        start = new Date(val, 0, 1);
      } else {
        start = new Date(now.getFullYear(), 0, 1);
      }
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setFullYear(end.getFullYear() + 1);
    }
    
    return { start: start.toISOString(), end: end.toISOString() };
  }

  async function openStatDetail(type, filter) {
    const panel = $('#stat-detail-panel');
    const title = $('#stat-detail-title');
    const body = $('#stat-detail-body');
    const filters = panel ? panel.querySelector('.stat-detail-filters') : null;
    if (!panel || !body) return;

    if (filters) filters.style.display = 'flex';

    const titles = { requests: '📥 Demandes', responded: '✅ Répondues', pending: '⏳ En attente', reservations: '🔒 Réservations' };
    if (title) title.textContent = titles[type] || type;
    panel.setAttribute('data-current-type', type);
    panel.style.display = 'block';
    body.innerHTML = '<div style="text-align:center;padding:20px;"><div class="loading-dots" style="justify-content:center"><span></span><span></span><span></span></div></div>';

    const range = getDateRange(filter);

    try {
      if (type === 'requests') {
        const { data } = await supabase.from('requests').select('*').gte('created_at', range.start).lt('created_at', range.end).order('created_at', { ascending: false }).limit(100);
        const filtered = (data || []).filter(r => {
          if (!currentPharmacy || !r.user_lat || !r.user_lng) return false;
          return haversine(currentPharmacy.lat, currentPharmacy.lng, r.user_lat, r.user_lng) <= (r.radius || 5);
        });
        const { data: myResponses } = await supabase.from('responses').select('request_id, medicines_status').eq('pharmacy_id', currentPharmacy.id).in('request_id', filtered.map(r => r.id));
        const respondedMap = {};
        (myResponses || []).forEach(r => respondedMap[r.request_id] = r.medicines_status);

        body.innerHTML = filtered.length === 0 ? '<p style="color:var(--dark-400);text-align:center;padding:20px;">Aucune demande</p>' :
          filtered.map(req => {
            if (req.status === 'pending') {
              const myStatus = respondedMap[req.id];
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
                const selectedStatus = myStatus ? myStatus[med] : null;
                const groupStyle = myStatus ? 'opacity: 0.6; pointer-events: none;' : '';
                
                if (hasInsurance) {
                  buttonsHtml = `
                    <button class="resp-btn ${selectedStatus === 'en_stock_assure' ? 'active' : ''}" data-status="en_stock_assure">✅ En stock assuré</button>
                    <button class="resp-btn ${selectedStatus === 'en_stock_non_assure' ? 'active' : ''}" data-status="en_stock_non_assure">⚠️ En stock non assuré</button>
                    <button class="resp-btn resp-btn-danger ${selectedStatus === 'rupture' ? 'active' : ''}" data-status="rupture">❌ Rupture</button>
                  `;
                } else {
                  buttonsHtml = `
                    <button class="resp-btn ${selectedStatus === 'en_stock' ? 'active' : ''}" data-status="en_stock">✅ En stock</button>
                    <button class="resp-btn resp-btn-danger ${selectedStatus === 'rupture' ? 'active' : ''}" data-status="rupture">❌ Rupture</button>
                  `;
                }
                return `
                  <div class="med-response-row">
                    <div class="med-name">💊 ${med}</div>
                    <div class="med-btn-group" data-med="${med}" style="${groupStyle}">${buttonsHtml}</div>
                  </div>`;
              }).join('');
              
              let actionButton = '';
              if (myStatus) {
                actionButton = `
                  <button class="btn btn-danger btn-block" disabled style="opacity: 0.8; cursor: default;">
                    ✅ Réponse envoyée
                  </button>`;
              } else {
                actionButton = `
                  <button class="btn btn-primary btn-block" onclick="PharmDash.prepareResponse('${req.id}')">
                    📤 Envoyer la réponse
                  </button>`;
              }

              return `
                <div class="request-card" id="request-${req.id}">
                  <div class="request-header">
                    <div class="request-patient-info">
                      ${req.user_phone ? '📱 ' + req.user_phone : '📱 Anonyme'}
                      ${req.insurance_name ? ' • 🛡️ ' + req.insurance_name : ''}
                      ${req.radius ? ' • 📍 ' + req.radius + ' km' : ''}
                    </div>
                    <div class="request-meta">
                      <span class="request-time">🕐 ${timeExact} (${timeAgo})</span>
                      <span class="request-countdown ${remainingMin < 15 ? 'urgent' : ''}" data-expires="${expiresAt.toISOString()}">⏱️ ${remainingMin} min</span>
                    </div>
                  </div>
                  <div class="request-medicines-list">
                    ${medRows}
                  </div>
                  ${actionButton}
                </div>`;
            } else {
              const time = new Date(req.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
              const meds = Array.isArray(req.medicines) ? req.medicines.join(', ') : req.medicines;
              return `<div class="stat-detail-item"><div><strong>💊 ${meds}</strong><br><small>🕐 ${time} ${req.insurance_name ? '• 🛡️ ' + req.insurance_name : ''}</small></div><span class="badge badge-success">${req.status}</span></div>`;
            }
          }).join('');
          
        // Bind med buttons for pending requests
        body.querySelectorAll('.med-btn-group .resp-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const group = e.target.closest('.med-btn-group');
            group.querySelectorAll('.resp-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            group.setAttribute('data-selected', e.target.getAttribute('data-status'));
          });
        });

      } else if (type === 'responded') {
        const { data } = await supabase.from('responses').select('*, request:requests(created_at)').eq('pharmacy_id', currentPharmacy.id).gte('created_at', range.start).lt('created_at', range.end).order('created_at', { ascending: false }).limit(200);
        if (!data || data.length === 0) { body.innerHTML = '<p style="color:var(--dark-400);text-align:center;padding:20px;">Aucune réponse</p>'; return; }

        // Aggregate per medicine
        const medStats = {};
        data.forEach(r => {
          if (r.medicines_status) {
            Object.entries(r.medicines_status).forEach(([med, status]) => {
              if (!medStats[med]) medStats[med] = { total: 0, inStock: 0, outOfStock: 0, ignored: 0, history: [] };
              medStats[med].total++;
              if (status.startsWith('en_stock')) medStats[med].inStock++;
              else if (status === 'rupture') medStats[med].outOfStock++;
              
              // Push history entry
              medStats[med].history.push({
                requestTime: r.request?.created_at || r.created_at,
                responseTime: r.responded_at || r.created_at,
                status: status.startsWith('en_stock') ? 'ACCEPTED' : 'REFUSED',
                ignored: r.ignored || false
              });
            });
          }
        });

        body.innerHTML = '<div class="responded-stats-list" style="display:flex; flex-direction:column; gap:16px;">' +
          Object.entries(medStats).map(([med, s]) => {
            const historyHtml = s.history.map(h => {
              const reqTime = new Date(h.requestTime).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
              const respTime = new Date(h.responseTime).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
              const badge = h.ignored ? '<span class="badge badge-muted">Ignoré</span>' : 
                            h.status === 'ACCEPTED' ? '<span class="badge badge-stock">✅ ACCEPTED</span>' : '<span class="badge badge-rupture">❌ REFUSED</span>';
              return `<div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 12px; background: rgba(255,255,255,0.03); border-radius: 8px; margin-top: 6px; font-size: 13px;">
                        <div style="color: var(--dark-300);">Demande: ${reqTime} <br> Réponse: ${respTime}</div>
                        <div>${badge}</div>
                      </div>`;
            }).join('');
            
            return `
            <div class="responded-med-card" style="background: var(--dark-800); border: 1px solid var(--glass-border); border-radius: 12px; padding: 16px;">
              <div class="responded-med-name" style="font-weight: 600; margin-bottom: 8px;">💊 ${med}</div>
              <div class="responded-med-stats" style="display:flex; gap:12px; margin-bottom: 12px; font-size: 14px;">
                <span class="responded-stat">📊 ${s.total}</span>
                <span class="responded-stat text-success">✅ ${s.inStock}</span>
                <span class="responded-stat text-danger">❌ ${s.outOfStock}</span>
                <span class="responded-stat text-muted">⏭️ ${s.ignored}</span>
              </div>
              <div class="responded-med-history">
                ${historyHtml}
              </div>
            </div>`;
          }).join('') + '</div>';

      } else if (type === 'reservations') {
        const { data } = await supabase.from('reservations')
          .select('*, requests(insurance_name)')
          .eq('pharmacy_id', currentPharmacy.id)
          .gte('created_at', range.start)
          .lt('created_at', range.end)
          .order('created_at', { ascending: false });
          
        if (!data || data.length === 0) { body.innerHTML = '<p style="color:var(--dark-400);text-align:center;padding:20px;">Aucune réservation pour cette période</p>'; return; }

        body.innerHTML = data.map(r => {
          const expiresAt = new Date(r.expires_at);
          const remaining = Math.max(0, Math.floor((expiresAt - new Date()) / 60000));
          
          let medsArray = [];
          if (Array.isArray(r.medicines)) medsArray = r.medicines;
          else if (typeof r.medicines === 'string') medsArray = r.medicines.split(',').map(m => m.trim());
          
          const medRows = medsArray.map(med => {
            const statusObj = (r.medicines_status || {})[med] || { status: 'reserved' };
            const insuranceName = (r.requests && r.requests.insurance_name) ? r.requests.insurance_name : null;
            const insuranceStr = insuranceName ? `🛡️ Réservé avec assurance (${insuranceName})` : 'Réservé sans assurance';
            
            let statusHtml = '';
            let actionHtml = '';
            let timeHtml = `<span class="reservation-countdown ${remaining < 10 ? 'urgent' : ''}" data-expires="${r.expires_at}" data-resid="${r.id}" data-reqid="${r.request_id}">⏱️ ${remaining} min</span>`;
            
            if (statusObj.status === 'purchased') {
              statusHtml = '<span class="badge badge-stock" style="font-size:11px;">✅ Acheté</span>';
              actionHtml = '<span style="color:var(--dark-400);font-size:12px;">Terminé</span>';
              timeHtml = '—';
            } else if (statusObj.status === 'cancelled') {
              statusHtml = '<span class="badge badge-rupture" style="font-size:11px;">❌ Annulé (Rupture)</span>';
              actionHtml = '<span style="color:var(--dark-400);font-size:12px;">Terminé</span>';
              timeHtml = '—';
            } else {
              statusHtml = `<span style="font-size:11px; color: var(--dark-300);">${insuranceStr}</span>`;
              actionHtml = `
                <div style="display:flex; flex-direction:column; gap:4px; max-width: 140px; margin-left:auto;">
                  <button class="btn btn-sm btn-outline" style="padding:4px 8px; font-size:11px;" onclick="PharmDash.confirmMedicinePurchase('${r.id}', '${med}')">✅ Confirmer l'achat</button>
                  <button class="btn btn-sm resp-btn-danger" style="padding:4px 8px; font-size:11px;" onclick="PharmDash.cancelMedicineReservation('${r.id}', '${r.request_id}', '${med}')">❌ Annuler</button>
                </div>
              `;
            }

            return `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 10px 4px; font-weight: 500;">💊 ${med}</td>
                <td style="padding: 10px 4px;">${statusHtml}</td>
                <td style="padding: 10px 4px; font-size:12px;">${timeHtml}</td>
                <td style="padding: 10px 4px; text-align: right;">${actionHtml}</td>
              </tr>
            `;
          }).join('');

          return `
          <div class="stat-detail-item reservation-item" id="res-${r.id}" style="flex-direction: column; align-items: stretch; gap: 8px; padding: 12px 16px;">
            <div style="font-size:12px; color:var(--dark-300); margin-bottom:4px;">Client: 📱 ${r.patient_phone || 'Anonyme'}</div>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); text-align: left; color: var(--dark-300); font-size: 12px; text-transform: uppercase;">
                  <th style="padding: 8px 4px;">Médicaments réservés</th>
                  <th style="padding: 8px 4px;">Statut Réservation</th>
                  <th style="padding: 8px 4px;">Temps restant</th>
                  <th style="padding: 8px 4px; text-align: right;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${medRows}
              </tbody>
            </table>
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
    const range = getDateRange(filter || 'today');

    try {
      const { data, error } = await supabase.from('responses').select('*, requests(insurance_name)').eq('pharmacy_id', currentPharmacy.id).gte('created_at', range.start).lt('created_at', range.end).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">Aucun historique pour cette période.</div></div>';
        return;
      }
      
      const requestIds = data.map(r => r.request_id);
      const { data: resData } = await supabase.from('reservations').select('*').in('request_id', requestIds).eq('pharmacy_id', currentPharmacy.id);
      const reservationsMap = {};
      (resData || []).forEach(r => reservationsMap[r.request_id] = r);

      container.innerHTML = data.map(item => {
        const reqTime = new Date(item.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const respTime = item.responded_at ? new Date(item.responded_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
        
        let rowsHtml = '';
        if (item.medicines_status) {
          const reservation = reservationsMap[item.request_id];
          const insuranceName = (item.requests && item.requests.insurance_name) ? item.requests.insurance_name : null;
          
          rowsHtml = Object.entries(item.medicines_status).map(([med, s]) => {
            const statusLabel = s.startsWith('en_stock') ? (window.I18N ? window.I18N.t('status.in_stock') || 'En stock' : 'En stock') : (window.I18N ? window.I18N.t('status.out_of_stock') || 'Rupture' : 'Rupture');
            const badgeClass = s.startsWith('en_stock') ? 'badge-stock' : 'badge-rupture';
            const icon = s.startsWith('en_stock') ? '✅' : '❌';
            
            let resStatusHtml = '<span style="color:var(--dark-400);">Non réservé</span>';
            if (reservation) {
              const medResStatus = (reservation.medicines_status || {})[med]?.status || 'reserved';
              let isReserved = false;
              if (Array.isArray(reservation.medicines) && reservation.medicines.includes(med)) isReserved = true;
              else if (typeof reservation.medicines === 'string' && reservation.medicines.includes(med)) isReserved = true;
              
              if (isReserved) {
                if (medResStatus === 'purchased') {
                  resStatusHtml = '<span style="color:var(--green-400);">✅ Acheté</span>';
                } else if (medResStatus === 'cancelled') {
                  resStatusHtml = '<span style="color:var(--red-400);">❌ Annulé</span>';
                } else if (insuranceName) {
                  resStatusHtml = `<span style="color:var(--gold-400);">🛡️ Réservé (Assuré: ${insuranceName})</span>`;
                } else {
                  resStatusHtml = '<span style="color:var(--gold-400);">Réservé (Non assuré)</span>';
                }
              }
            }

            return `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 10px 4px; font-weight: 500;">${med}</td>
                <td style="padding: 10px 4px; color: var(--dark-300);">${reqTime}</td>
                <td style="padding: 10px 4px; color: var(--dark-300);">${respTime}</td>
                <td style="padding: 10px 4px;"><span class="badge ${badgeClass}" style="font-size:11px;">${icon} ${statusLabel}</span></td>
                <td style="padding: 10px 4px; font-size:12px;">${resStatusHtml}</td>
              </tr>
            `;
          }).join('');
        }
        
        const thLabelMeds = window.I18N ? window.I18N.t('history.req_meds') || 'Médicaments demandés' : 'Médicaments demandés';
        const thLabelReqDate = window.I18N ? window.I18N.t('history.req_date') || 'Date demande' : 'Date demande';
        const thLabelRespDate = window.I18N ? window.I18N.t('history.resp_date') || 'Date réponse' : 'Date réponse';
        const thLabelStatus = window.I18N ? window.I18N.t('history.status') || 'Statut' : 'Statut';
        const thLabelReservation = window.I18N ? window.I18N.t('history.reservation') || 'Réservation' : 'Réservation';

        return `
          <div class="history-item" style="flex-direction: column; align-items: stretch; gap: 8px; padding: 12px 16px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); text-align: left; color: var(--dark-300); font-size: 12px; text-transform: uppercase;">
                  <th style="padding: 8px 4px;">${thLabelMeds}</th>
                  <th style="padding: 8px 4px;">${thLabelReqDate}</th>
                  <th style="padding: 8px 4px;">${thLabelRespDate}</th>
                  <th style="padding: 8px 4px;">${thLabelStatus}</th>
                  <th style="padding: 8px 4px;">${thLabelReservation}</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error('Load history error:', err);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  STATISTICS
  // ═══════════════════════════════════════════════════════
  let statsChartInstance = null;

  async function loadStats(filter) {
    if (!currentPharmacy) return;
    const range = getDateRange(filter || 'today');

    try {
      // 1. Fetch responses by this pharmacy in the given range
      const { data: responsesData } = await supabase.from('responses')
        .select('*')
        .eq('pharmacy_id', currentPharmacy.id)
        .gte('created_at', range.start)
        .lt('created_at', range.end);
        
      const responses = responsesData || [];
      const totalResp = responses.filter(r => !r.ignored).length;
      const ignoredCount = responses.filter(r => r.ignored).length;
      
      let positiveCount = 0;
      let negativeCount = 0;
      responses.filter(r => !r.ignored).forEach(r => {
        let hasStock = false;
        if (r.medicines_status) {
          Object.values(r.medicines_status).forEach(status => {
            if (status.startsWith('en_stock')) hasStock = true;
          });
        }
        if (hasStock) positiveCount++;
        else negativeCount++;
      });

      // 2. Fetch pending requests (active, not responded, in the given range)
      const { data: requestsData } = await supabase.from('requests')
        .select('*')
        .eq('status', 'pending')
        .gte('created_at', range.start)
        .lt('created_at', range.end);
        
      const pendingRequests = (requestsData || []).filter(r => {
        if (!r.user_lat || !r.user_lng) return false;
        return haversine(currentPharmacy.lat, currentPharmacy.lng, r.user_lat, r.user_lng) <= (r.radius || 5);
      });
      const pendingCount = pendingRequests.length;

      // 3. True Total Demandes = Responses (incl ignored) + Pending
      const totalReq = responses.length + pendingCount;

      const el1 = $('#stats-total-requests'); if (el1) el1.textContent = totalReq;
      const el2 = $('#stats-total-responses'); if (el2) el2.textContent = totalResp;
      const el3 = $('#stats-response-rate'); if (el3) el3.textContent = totalReq > 0 ? Math.round(((totalResp + ignoredCount) / totalReq) * 100) + '%' : '0%';
      const el4 = $('#stats-ignored'); if (el4) el4.textContent = ignoredCount;

      // 4. Calculate reservation stats
      const { data: resData } = await supabase.from('reservations')
        .select('*')
        .eq('pharmacy_id', currentPharmacy.id)
        .gte('created_at', range.start)
        .lt('created_at', range.end);
        
      const resStats = { purchased: 0, expired: 0, rejected: 0, rupture: 0 };
      
      (resData || []).forEach(r => {
        let medsArray = [];
        if (Array.isArray(r.medicines)) medsArray = r.medicines;
        else if (typeof r.medicines === 'string') medsArray = r.medicines.split(',').map(m => m.trim());
        
        medsArray.forEach(med => {
          const status = (r.medicines_status || {})[med]?.status || 'reserved';
          if (status === 'purchased') resStats.purchased++;
          else if (status === 'cancelled') resStats.rejected++;
          else {
            const expiresAt = new Date(r.expires_at).getTime();
            if (Date.now() > expiresAt) resStats.expired++;
          }
        });
      });
      
      responses.filter(r => !r.ignored && r.medicines_status).forEach(r => {
        Object.values(r.medicines_status).forEach(status => {
          if (status === 'rupture' || status === 'out_of_stock') resStats.rupture++;
        });
      });

      const elResPurchased = $('#stats-res-purchased'); if (elResPurchased) elResPurchased.textContent = resStats.purchased;
      const elResExpired = $('#stats-res-expired'); if (elResExpired) elResExpired.textContent = resStats.expired;
      const elResRejected = $('#stats-res-rejected'); if (elResRejected) elResRejected.textContent = resStats.rejected;
      const elResRupture = $('#stats-res-rupture'); if (elResRupture) elResRupture.textContent = resStats.rupture;

      // 5. Update Chart.js Doughnut
      const ctx = $('#stats-chart');
      if (ctx && window.Chart) {
        if (statsChartInstance) statsChartInstance.destroy();
        
        const hasData = positiveCount > 0 || negativeCount > 0 || ignoredCount > 0;
        const dataVals = hasData ? [positiveCount, negativeCount, ignoredCount] : [1];
        const bgColors = hasData ? ['#10b981', '#f59e0b', '#ef4444'] : ['rgba(255,255,255,0.1)'];
        const labels = hasData ? ['Positives', 'Négatives', 'Ignorées'] : ['Aucune donnée'];
        
        statsChartInstance = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: labels,
            datasets: [{
              data: dataVals,
              backgroundColor: bgColors,
              borderWidth: 0,
              hoverOffset: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
              legend: {
                position: 'bottom',
                labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 }, padding: 15 }
              },
              tooltip: { enabled: hasData }
            }
          }
        });
      }

      // 5. Top medicines
      const medCounts = {};
      responses.forEach(r => {
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

  function generatePDFReport() {
    if (!window.html2pdf) {
      showToast('Erreur: PDF library non chargée', 'error');
      return;
    }
    
    // Create a temporary container for the report
    const reportContainer = document.createElement('div');
    reportContainer.style.padding = '20px';
    reportContainer.style.background = '#1a1f2b'; // match dark theme
    reportContainer.style.color = '#e2e8f0';
    
    const filter = $('#tab-stats .filter-btn.active')?.textContent || 'Période';
    const dateStr = new Date().toLocaleString('fr-FR');
    const pharmacyName = currentPharmacy?.name || 'Pharmacie';
    
    // Copy the stats grid and top meds
    const statsGrid = document.querySelector('.stats-grid')?.outerHTML || '';
    const topMeds = document.querySelector('.top-meds')?.outerHTML || '';
    
    reportContainer.innerHTML = `
      <h1 style="color:#10b981; margin-bottom: 5px;">${pharmacyName}</h1>
      <h3 style="color:#94a3b8; margin-bottom: 20px;">Rapport Statistique - ${filter} (Généré le ${dateStr})</h3>
      
      <div style="margin-bottom: 30px;">
        ${statsGrid}
      </div>
      
      <h3 style="color:#10b981; margin-bottom: 15px;">📊 Répartition des réponses</h3>
      <div style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; margin-bottom: 30px; text-align: center;">
        <img src="" id="pdf-chart-img" style="max-height: 250px; display: inline-block;">
      </div>
      
      <h3 style="color:#10b981; margin-bottom: 15px;">🏆 Top Médicaments demandés</h3>
      <div style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px;">
        ${topMeds}
      </div>
    `;
    
    // Convert canvas to image
    const canvas = document.getElementById('stats-chart');
    if (canvas) {
      const imgData = canvas.toDataURL('image/png');
      const imgEl = reportContainer.querySelector('#pdf-chart-img');
      if (imgEl) imgEl.src = imgData;
    }
    
    const opt = {
      margin:       10,
      filename:     `Rapport_Stats_${pharmacyName.replace(/\s+/g, '_')}_${filter}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    showToast('Génération du PDF en cours...', 'success');
    html2pdf().set(opt).from(reportContainer).save().then(() => {
      showToast('PDF téléchargé avec succès !', 'success');
    });
  }

  // ═══════════════════════════════════════════════════════
  //  UPDATE STAT COUNTERS
  // ═══════════════════════════════════════════════════════
  async function updateStatCounters() {
    const statToday = $('#stat-today');
    if (statToday) statToday.textContent = activeRequests.length;

    if (!currentPharmacy) return;
    try {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { count: respondedCount } = await supabase.from('responses').select('*', { count: 'exact', head: true }).eq('pharmacy_id', currentPharmacy.id).gte('created_at', today.toISOString());
      const statResponded = $('#stat-responded');
      if (statResponded) statResponded.textContent = respondedCount || 0;

      const { count: reservedCount } = await supabase.from('reservations').select('*', { count: 'exact', head: true }).eq('pharmacy_id', currentPharmacy.id).gte('created_at', today.toISOString());
      const statReserved = $('#stat-reserved');
      if (statReserved) statReserved.textContent = reservedCount || 0;
    } catch (e) { console.error('Counter error:', e); }
  }

  // ═══════════════════════════════════════════════════════
  //  EXPIRATION & CANCELLATION
  // ═══════════════════════════════════════════════════════
  async function cancelReservation(reservationId, requestId, isAutoExpire = false) {
    if (!currentPharmacy) return;
    try {
      const status = isAutoExpire ? 'expired' : 'cancelled';
      // 1. Update Reservation status
      await supabase.from('reservations').update({ status }).eq('id', reservationId);
      
      // 2. Fetch the corresponding response to update medicines_status
      const { data: responseData } = await supabase.from('responses')
        .select('*')
        .eq('request_id', requestId)
        .eq('pharmacy_id', currentPharmacy.id)
        .single();
        
      if (responseData && responseData.medicines_status) {
        // Change all 'en_stock*' statuses to 'rupture'
        const newStatus = { ...responseData.medicines_status };
        let updated = false;
        Object.keys(newStatus).forEach(med => {
          if (newStatus[med].startsWith('en_stock')) {
            newStatus[med] = 'rupture';
            updated = true;
          }
        });
        
        if (updated) {
          await supabase.from('responses').update({ medicines_status: newStatus }).eq('id', responseData.id);
        }
      }
      
      // Remove from UI
      const resEl = document.getElementById(`res-${reservationId}`);
      if (resEl) resEl.remove();
      
      updateStatCounters();
      if (!isAutoExpire) showToast('✅ Réservation annulée', 'info');
      
    } catch (e) {
      console.error('Cancel error:', e);
      if (!isAutoExpire) showToast('❌ Erreur lors de l\'annulation', 'error');
    }
  }

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

      // Update countdown displays & auto-expire reservations
      document.querySelectorAll('.reservation-countdown[data-expires]').forEach(el => {
        const exp = new Date(el.getAttribute('data-expires'));
        const rem = Math.floor((exp - now) / 60000);
        
        if (rem <= 0) {
          // Expired !
          const resId = el.getAttribute('data-resid');
          const reqId = el.getAttribute('data-reqid');
          if (resId && reqId) {
            cancelReservation(resId, reqId, true);
          }
        } else {
          el.textContent = `⏱️ ${rem} min`;
          if (rem < 15) el.classList.add('urgent');
        }
      });
      
      // Also update request countdowns
      document.querySelectorAll('.request-countdown[data-expires]').forEach(el => {
        const exp = new Date(el.getAttribute('data-expires'));
        const rem = Math.max(0, Math.floor((exp - now) / 60000));
        el.textContent = `⏱️ ${rem} min`;
        if (rem < 15) el.classList.add('urgent');
      });
    }, 15000);
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

  function playNotificationSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Resume context if suspended (mobile browsers require user interaction)
      if (ctx.state === 'suspended') ctx.resume();

      function beep(freq, startTime, duration) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g);
        g.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        g.gain.setValueAtTime(0.8, startTime);
        g.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      }

      const t = ctx.currentTime;
      beep(880, t, 0.15);        // Bip 1
      beep(1100, t + 0.2, 0.15); // Bip 2 (plus aigu)
      beep(1320, t + 0.4, 0.2);  // Bip 3 (encore plus aigu, plus long)
    } catch (e) { console.log('Audio notification unavailable'); }
  }

  // ═══════════════════════════════════════════════════════
  //  GRANULAR RESERVATION ACTIONS
  // ═══════════════════════════════════════════════════════
  async function cancelMedicineReservation(resId, reqId, medicine) {
    if (!confirm(`Voulez-vous annuler la réservation pour le médicament "${medicine}" ? Cela le marquera "Rupture" chez le patient.`)) return;

    try {
      const { data: resData, error: errRes } = await supabase.from('reservations').select('medicines_status').eq('id', resId).single();
      if (errRes) throw errRes;

      const currentStatus = resData.medicines_status || {};
      currentStatus[medicine] = { status: 'cancelled', updated_at: new Date().toISOString() };

      const { error: errUpdate } = await supabase.from('reservations').update({ medicines_status: currentStatus }).eq('id', resId);
      if (errUpdate) throw errUpdate;

      // Update response to match rupture so patient sees it
      const { data: respData } = await supabase.from('responses').select('medicines_status').eq('request_id', reqId).eq('pharmacy_id', currentPharmacy.id).single();
      if (respData) {
        const respStatus = respData.medicines_status || {};
        respStatus[medicine] = 'rupture';
        await supabase.from('responses').update({ medicines_status: respStatus }).eq('request_id', reqId).eq('pharmacy_id', currentPharmacy.id);
      }

      openStatDetail('reservations', currentStatFilter || 'today');
    } catch (err) {
      console.error('Cancel medicine error:', err);
      alert('Erreur lors de l\'annulation.');
    }
  }

  async function confirmMedicinePurchase(resId, medicine) {
    if (!confirm(`Confirmer l'achat pour "${medicine}" ?`)) return;

    try {
      const { data: resData, error: errRes } = await supabase.from('reservations').select('medicines_status').eq('id', resId).single();
      if (errRes) throw errRes;

      const currentStatus = resData.medicines_status || {};
      currentStatus[medicine] = { status: 'purchased', updated_at: new Date().toISOString() };

      const { error: errUpdate } = await supabase.from('reservations').update({ medicines_status: currentStatus }).eq('id', resId);
      if (errUpdate) throw errUpdate;

      openStatDetail('reservations', currentStatFilter || 'today');
    } catch (err) {
      console.error('Confirm purchase error:', err);
      alert('Erreur lors de la confirmation.');
    }
  }


  // ═══════════════════════════════════════════════════════
  //  DELEGATE INTERACTIONS (Phase 3)
  // ═══════════════════════════════════════════════════════
  async function loadDelegateInteractions() {
    if (!currentPharmacy) return;
    await loadReceivedPromotions();
    await loadReceivedVisits();
  }

  async function loadReceivedPromotions() {
    const container = $('#delegate-promos-list');
    if (!container) return;
    try {
      const { data: targets, error } = await supabase
        .from('promotion_targets')
        .select('*, delegate_promotions(*)')
        .eq('pharmacy_id', currentPharmacy.id)
        .order('sent_at', { ascending: false })
        .limit(50);
      if (error) throw error;

      if (!targets || targets.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">Aucune promotion reçue pour le moment.</div></div>';
        return;
      }

      container.innerHTML = targets.map(t => {
        const promo = t.delegate_promotions || {};
        const typeLabels = { medicament: '💊 Médicament', complement: '🧪 Complément', materiel: '🩺 Matériel', cosmetique: '💄 Cosmétique' };
        const statusLabels = { sent: '📨 Non lue', read: '👁️ Lue', interested: '✅ Intéressé', already_stocked: '📦 Déjà en stock', ignored: '❌ Ignorée' };
        const statusColors = { sent: '#ff3b30', read: '#8b5cf6', interested: '#10b981', already_stocked: '#f59e0b', ignored: '#6b7280' };
        const timeAgo = getTimeAgo(t.sent_at);
        const isNew = t.status === 'sent';
        
        let actionBtns = '';
        if (t.status === 'sent' || t.status === 'read') {
          actionBtns = `
            <div class="promo-response-btns" style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
              <button class="btn btn-sm btn-primary" onclick="PharmDash.respondPromo('${t.id}','interested')" style="font-size:12px;">✅ Intéressé</button>
              <button class="btn btn-sm btn-outline" onclick="PharmDash.respondPromo('${t.id}','already_stocked')" style="font-size:12px;">📦 Déjà en stock</button>
              <button class="btn btn-sm btn-outline" onclick="PharmDash.respondPromo('${t.id}','ignored')" style="font-size:12px;color:var(--dark-400);">Ignorer</button>
            </div>
          `;
        }

        return `
          <div class="delegate-promo-card" style="background:var(--dark-800);border:1px solid var(--glass-border);border-radius:12px;padding:14px;margin-bottom:10px;${isNew ? 'border-left:3px solid #ff3b30;' : ''}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <strong style="color:var(--dark-100);font-size:15px;">${escapeHtml(promo.product_name || 'Produit')}</strong>
              <span style="font-size:11px;color:${statusColors[t.status] || '#888'};background:${statusColors[t.status] || '#888'}22;padding:2px 8px;border-radius:12px;">${statusLabels[t.status] || t.status}</span>
            </div>
            <div style="font-size:13px;color:var(--dark-300);margin-bottom:4px;">🏭 ${escapeHtml(promo.lab_name || '—')}</div>
            <div style="font-size:12px;color:var(--dark-400);margin-bottom:4px;">${typeLabels[promo.product_type] || ''}</div>
            ${promo.description ? `<div style="font-size:13px;color:var(--dark-400);line-height:1.5;margin-bottom:6px;">${escapeHtml(promo.description)}</div>` : ''}
            ${promo.document_url ? `<a href="${promo.document_url}" target="_blank" style="font-size:12px;color:var(--green-400);">📎 Voir le document</a>` : ''}
            <div style="font-size:11px;color:var(--dark-500);margin-top:6px;">Reçue ${timeAgo}</div>
            ${actionBtns}
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error('Load promos error:', err);
    }
  }

  async function respondToPromotion(targetId, status) {
    try {
      const { error } = await supabase.from('promotion_targets').update({
        status: status,
        responded_at: new Date().toISOString(),
        read_at: new Date().toISOString(),
      }).eq('id', targetId);
      if (error) throw error;
      showToast('✅ Réponse envoyée !', 'success');
      await loadReceivedPromotions();
    } catch (err) {
      showToast('❌ Erreur lors de la réponse.', 'error');
    }
  }

  async function loadReceivedVisits() {
    const container = $('#delegate-visits-list');
    if (!container) return;
    try {
      const { data: visits, error } = await supabase
        .from('visit_requests')
        .select('*')
        .eq('pharmacy_id', currentPharmacy.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;

      if (!visits || visits.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📅</div><div class="empty-state-text">Aucune demande de visite.</div></div>';
        return;
      }

      // For each visit, fetch the delegate name
      const delegateIds = [...new Set(visits.map(v => v.delegate_id))];
      let delegateMap = {};
      if (delegateIds.length > 0) {
        const { data: delegates } = await supabase.from('delegates').select('id, first_name, last_name').in('id', delegateIds);
        (delegates || []).forEach(d => { delegateMap[d.id] = `${d.first_name} ${d.last_name}`; });
      }

      container.innerHTML = visits.map(v => {
        const statusLabels = { pending: '⏳ En attente', confirmed: '✅ Confirmée', rescheduled: '🔄 Reportée', cancelled: '❌ Annulée', completed: '✔️ Réalisée' };
        const statusColors = { pending: '#f59e0b', confirmed: '#10b981', rescheduled: '#3b82f6', cancelled: '#ef4444', completed: '#6b7280' };
        const delegateName = delegateMap[v.delegate_id] || 'Délégué inconnu';
        const dateStr = new Date(v.proposed_date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const isPending = v.status === 'pending';

        let actionBtns = '';
        if (isPending) {
          actionBtns = `
            <div style="display:flex;gap:6px;margin-top:10px;">
              <button class="btn btn-sm btn-primary" onclick="PharmDash.respondVisit('${v.id}','confirmed')" style="font-size:12px;">✅ Confirmer</button>
              <button class="btn btn-sm btn-outline" onclick="PharmDash.respondVisit('${v.id}','cancelled')" style="font-size:12px;color:var(--red-400);">❌ Refuser</button>
            </div>
          `;
        }

        return `
          <div style="background:var(--dark-800);border:1px solid var(--glass-border);border-radius:12px;padding:14px;margin-bottom:10px;${isPending ? 'border-left:3px solid #f59e0b;' : ''}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <strong style="color:var(--dark-100);font-size:14px;">👤 ${escapeHtml(delegateName)}</strong>
              <span style="font-size:11px;color:${statusColors[v.status] || '#888'};background:${statusColors[v.status] || '#888'}22;padding:2px 8px;border-radius:12px;">${statusLabels[v.status] || v.status}</span>
            </div>
            <div style="font-size:13px;color:var(--dark-300);margin-bottom:4px;">📅 ${dateStr}</div>
            ${v.purpose ? `<div style="font-size:13px;color:var(--dark-400);margin-bottom:4px;">📝 ${escapeHtml(v.purpose)}</div>` : ''}
            ${actionBtns}
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error('Load visits error:', err);
    }
  }

  async function respondToVisit(visitId, status) {
    try {
      const { error } = await supabase.from('visit_requests').update({
        status: status,
      }).eq('id', visitId);
      if (error) throw error;
      showToast(`✅ Visite ${status === 'confirmed' ? 'confirmée' : 'refusée'} !`, 'success');
      await loadReceivedVisits();
    } catch (err) {
      showToast('❌ Erreur.', 'error');
    }
  }

  // ═══════════════════════════════════════════════════════
  //  SETTINGS (Phase 5 — Automation)
  // ═══════════════════════════════════════════════════════
  function initSettings() {
    // Response mode toggle
    const modeManual = $('#mode-manual');
    const modeAuto = $('#mode-auto');
    const apiConfig = $('#api-config');

    if (modeManual) {
      modeManual.addEventListener('change', () => { if (apiConfig) apiConfig.style.display = 'none'; });
    }
    if (modeAuto) {
      modeAuto.addEventListener('change', () => { if (apiConfig) apiConfig.style.display = 'block'; });
    }

    // Load saved settings
    if (currentPharmacy) {
      const mode = currentPharmacy.response_mode || 'manual';
      if (mode === 'automatic' && modeAuto) {
        modeAuto.checked = true;
        if (apiConfig) apiConfig.style.display = 'block';
      }
      if ($('#api-endpoint') && currentPharmacy.api_endpoint) {
        $('#api-endpoint').value = currentPharmacy.api_endpoint;
      }
      if ($('#api-key-input') && currentPharmacy.api_key) {
        $('#api-key-input').value = currentPharmacy.api_key;
      }
    }

    // Save settings
    const btnSave = $('#btn-save-settings');
    if (btnSave) {
      btnSave.addEventListener('click', handleSaveSettings);
    }

    // Test API
    const btnTest = $('#btn-test-api');
    if (btnTest) {
      btnTest.addEventListener('click', handleTestAPI);
    }
  }

  async function handleSaveSettings() {
    if (!currentPharmacy) return;
    const mode = document.querySelector('input[name="response-mode"]:checked')?.value || 'manual';
    const apiEndpoint = ($('#api-endpoint') || {}).value?.trim() || null;
    const apiKey = ($('#api-key-input') || {}).value?.trim() || null;

    const btn = $('#btn-save-settings');
    if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement...'; }

    try {
      const { error } = await supabase.from('pharmacies').update({
        response_mode: mode,
        api_endpoint: mode === 'automatic' ? apiEndpoint : null,
        api_key: mode === 'automatic' ? apiKey : null,
      }).eq('id', currentPharmacy.id);
      if (error) throw error;

      currentPharmacy.response_mode = mode;
      currentPharmacy.api_endpoint = apiEndpoint;
      currentPharmacy.api_key = apiKey;
      saveSession(currentPharmacy);

      showToast('✅ Paramètres enregistrés !', 'success');
    } catch (err) {
      showToast('❌ Erreur lors de l\'enregistrement.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '💾 Enregistrer les paramètres'; }
    }
  }

  async function handleTestAPI() {
    const endpoint = ($('#api-endpoint') || {}).value?.trim();
    const apiKey = ($('#api-key-input') || {}).value?.trim();
    const result = $('#api-test-result');

    if (!endpoint) { showToast('Veuillez saisir l\'URL de votre API.', 'error'); return; }

    if (result) {
      result.style.display = 'block';
      result.innerHTML = '<span style="color:var(--dark-300);">🔄 Test en cours...</span>';
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ action: 'ping', product: 'test' }),
      });

      if (response.ok) {
        if (result) result.innerHTML = '<span style="color:var(--green-400);">✅ Connexion réussie ! Votre API répond correctement.</span>';
      } else {
        if (result) result.innerHTML = `<span style="color:var(--red-400);">❌ Erreur ${response.status}: ${response.statusText}</span>`;
      }
    } catch (err) {
      if (result) result.innerHTML = `<span style="color:var(--red-400);">❌ Impossible de joindre l'API : ${err.message}</span>`;
    }
  }

  // ═══════════════════════════════════════════════════════
  //  DASHBOARD UI BRIDGE (tabs, status, settings, modals)
  // ═══════════════════════════════════════════════════════
  const DASH_TABS = { 'tab-requests': 'panel-requests', 'tab-history': 'panel-history', 'tab-delegates': 'panel-delegates', 'tab-stats': 'panel-stats-pharm' };
  let dashTabsBound = false;

  function setupTabs() {
    if (dashTabsBound) return;
    dashTabsBound = true;
    Object.keys(DASH_TABS).forEach(tabId => {
      const tab = document.getElementById(tabId);
      if (!tab) return;
      tab.addEventListener('click', () => {
        Object.entries(DASH_TABS).forEach(([t, p]) => {
          const tEl = document.getElementById(t);
          const pEl = document.getElementById(p);
          if (tEl) tEl.classList.toggle('active', t === tabId);
          if (pEl) pEl.style.display = t === tabId ? 'block' : 'none';
        });
        if (tabId === 'tab-stats') { try { updateStatCounters(); } catch (e) { } }
      });
    });
  }

  function updateStatusDisplay() {
    const status = (currentPharmacy && currentPharmacy.status) || 'open';
    const labels = { open: 'Ouverte', guard: 'De garde', closed: 'Fermée' };
    const badges = { open: 'badge--emerald', guard: 'badge--amber', closed: 'badge--red' };
    ['open', 'guard', 'closed'].forEach(s => {
      const b = document.getElementById('status-' + s);
      if (b) { b.classList.toggle('active', s === status); b.style.opacity = s === status ? '1' : '0.55'; }
    });
    const badge = document.getElementById('pharmacy-status-badge');
    if (badge) { badge.textContent = labels[status]; badge.className = 'badge ' + badges[status]; }
  }

  async function togglePharmacyStatus(status) {
    if (!currentPharmacy) return;
    const previous = currentPharmacy.status;
    currentPharmacy.status = status;
    updateStatusDisplay();
    try {
      const { error } = await supabase.from('pharmacies')
        .update({ status, is_open: status !== 'closed', is_on_duty: status === 'guard' })
        .eq('id', currentPharmacy.id);
      if (error) throw error;
      saveSession(currentPharmacy);
      showToast('✅ Statut mis à jour', 'success');
    } catch (err) {
      currentPharmacy.status = previous;
      updateStatusDisplay();
      showToast('❌ Erreur de mise à jour du statut', 'error');
    }
  }

  async function sendStockAlert() {
    if (!currentPharmacy) return;
    const product = (($('#stock-alert-product') || {}).value || '').trim();
    if (!product) { showToast('Indiquez le produit en rupture', 'error'); return; }
    const btn = $('#btn-send-stock-alert');
    setBtnLoading(btn, true, 'Envoi...');
    try {
      const { error } = await supabase.from('stock_alerts').insert([{
        pharmacy_id: currentPharmacy.id, product_name: product,
        urgency: ($('#stock-alert-urgency') || {}).value || 'normal',
        radius: parseInt(($('#stock-alert-radius') || {}).value || '5', 10),
        message: (($('#stock-alert-message') || {}).value || '').trim() || null,
        pharmacy_lat: currentPharmacy.lat, pharmacy_lng: currentPharmacy.lng,
      }]);
      if (error) throw error;
      showToast('✅ Alerte envoyée aux délégués de votre zone', 'success');
      $('#stock-alert-product').value = ''; $('#stock-alert-message').value = '';
      $('#stock-alert-modal').classList.remove('active');
    } catch (err) {
      console.error('Stock alert error:', err);
      showToast('❌ Envoi impossible : ' + (err.message || ''), 'error');
    } finally { setBtnLoading(btn, false); }
  }

  async function verifyReservationCode(code) {
    if (!currentPharmacy) return;
    code = String(code || '').trim().toUpperCase();
    if (!/^PG-[A-Z0-9]{4}$/.test(code)) { showToast('Format attendu : PG-XXXX', 'error'); return; }
    try {
      const { data, error } = await supabase.from('responses').select('*')
        .eq('pharmacy_id', currentPharmacy.id).eq('reservation_code', code).maybeSingle();
      if (error) throw error;
      if (!data) { showToast('❌ Code introuvable pour votre pharmacie', 'error'); return; }
      if (data.collected_at) { showToast('⚠️ Ce code a déjà été utilisé', 'warning'); return; }
      await supabase.from('responses').update({ collected_at: new Date().toISOString() }).eq('id', data.id);
      showToast('✅ Code valide — réservation retirée', 'success');
      $('#verify-code-input').value = '';
      $('#code-verify-modal').classList.remove('active');
    } catch (err) {
      console.error('Verify code error:', err);
      showToast('❌ Vérification impossible', 'error');
    }
  }

  function bindDashboardUI() {
    const panel = $('#settings-panel');
    const open = $('#settings-open');
    const close = $('#settings-close');
    if (open && panel) open.addEventListener('click', () => {
      if (currentPharmacy) {
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
        set('settings-name', currentPharmacy.name); set('settings-address', currentPharmacy.address);
        set('settings-phone', currentPharmacy.phone); set('settings-whatsapp', currentPharmacy.whatsapp);
        set('settings-hours', currentPharmacy.hours);
      }
      panel.style.display = 'block';
    });
    if (close && panel) close.addEventListener('click', () => { panel.style.display = 'none'; });

    const save = $('#settings-save');
    if (save) save.addEventListener('click', async () => {
      if (!currentPharmacy) return;
      const v = (id) => ((document.getElementById(id) || {}).value || '').trim();
      const updates = {
        name: v('settings-name'), address: v('settings-address'),
        phone: normalizeCmPhone(v('settings-phone')),
        whatsapp: v('settings-whatsapp') ? normalizeCmPhone(v('settings-whatsapp')) : null,
        hours: v('settings-hours') || '08:00 - 21:00',
      };
      if (!updates.name || !updates.address || !isValidCmPhone(updates.phone)) { showToast('Nom, adresse et téléphone valides requis', 'error'); return; }
      setBtnLoading(save, true, 'Enregistrement...');
      try {
        const { error } = await supabase.from('pharmacies').update(updates).eq('id', currentPharmacy.id);
        if (error) throw error;
        Object.assign(currentPharmacy, updates);
        saveSession(currentPharmacy);
        $('#dash-pharmacy-name').textContent = currentPharmacy.name;
        showToast('✅ Profil mis à jour', 'success');
        panel.style.display = 'none';
      } catch (err) { showToast('❌ Erreur : ' + (err.message || ''), 'error'); }
      finally { setBtnLoading(save, false); }
    });

    // Close modals by tapping the backdrop
    $$('.modal-overlay').forEach(m => m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('active'); }));
  }

  // ═══════════════════════════════════════════════════════
  //  PUBLIC API & INIT
  // ═══════════════════════════════════════════════════════
  window.PharmDash = {
    sendStockAlert,
    verifyCode: verifyReservationCode,
    toggleStatus: togglePharmacyStatus,
    loadHistory,
    prepareResponse,
    confirmAction,
    cancelReservation,
    cancelMedicineReservation,
    confirmMedicinePurchase,
    respondPromo: respondToPromotion,
    respondVisit: respondToVisit,
    showView: showAuthView,
  };

  // I18n auto-initializes itself (js/i18n.js)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
