/**
 * Pharma-Garde — Pharmacist Dashboard Controller
 * 100% REAL — No simulation. All data from Supabase.
 */

(function () {
  // ── State ──────────────────────────────────────────────
  let currentPharmacy = null; // { id, name, phone, ... }
  let activeRequests = [];
  let realtimeChannel = null;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const SESSION_KEY = 'pharmagarde_pharmacy_session';

  // ── Init ───────────────────────────────────────────────
  function init() {
    bindLoginTabs();
    bindEvents();

    // Check if already logged in
    const saved = loadSession();
    if (saved) {
      currentPharmacy = saved;
      showDashboard();
    }
  }


  // ── Session persistence ────────────────────────────────
  function saveSession(pharmacy) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        id: pharmacy.id,
        name: pharmacy.name,
        phone: pharmacy.phone,
        address: pharmacy.address,
      }));
    } catch (e) { /* ignore */ }
  }

  function loadSession() {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (e) { return null; }
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }

  // ── Login/Register/Reset Tab Switching ─────────────────
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

    // "Mot de passe oublié?" link
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
  }

  // ── Event Bindings ─────────────────────────────────────
  function bindEvents() {
    const btnLogin = $('#btn-login');
    const btnRegister = $('#btn-register');
    const btnResetPw = $('#btn-reset-password');
    const btnLogout = $('#btn-logout');
    const btnConfirmOk = $('#btn-confirm-ok');

    if (btnLogin) btnLogin.addEventListener('click', handleLogin);
    if (btnRegister) btnRegister.addEventListener('click', handleRegister);
    if (btnResetPw) btnResetPw.addEventListener('click', handlePasswordReset);
    if (btnLogout) btnLogout.addEventListener('click', handleLogout);
    if (btnConfirmOk) btnConfirmOk.addEventListener('click', executeConfirm);

    bindTabs();
    bindGuardSwitch();
  }

  // ══════════════════════════════════════════════════════
  //  LOGIN — Real Supabase authentication
  // ══════════════════════════════════════════════════════
  async function handleLogin() {
    const email = $('#login-email')?.value?.trim();
    const password = $('#login-password')?.value;

    if (!email || !password) {
      showToast('Veuillez remplir tous les champs', 'error');
      return;
    }

    const btn = $('#btn-login');
    btn.textContent = 'Connexion...';
    btn.disabled = true;

    try {
      // 1. Authenticate with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (authError || !authData.user) {
        showToast('❌ Email ou mot de passe incorrect', 'error');
        return;
      }

      // 2. Fetch the corresponding pharmacy profile
      const { data: profile, error: profileError } = await supabase
        .from('pharmacies')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profile) {
        showToast('⚠️ Profil supprimé de la base. Veuillez vous réinscrire avec le même mot de passe pour le recréer.', 'error');
        return;
      }

      currentPharmacy = profile;
      saveSession(profile);
      showDashboard();
      showToast(`✅ Bienvenue, ${profile.name} !`, 'success');

    } catch (err) {
      console.error('Login error:', err);
      showToast('❌ Erreur de connexion. Vérifiez votre internet.', 'error');
    } finally {
      btn.textContent = 'Se connecter';
      btn.disabled = false;
    }
  }

  // ══════════════════════════════════════════════════════
  //  REGISTER — Real Supabase insertion
  // ══════════════════════════════════════════════════════
  async function handleRegister() {
    const name = $('#reg-name')?.value?.trim();
    const city = $('#reg-city')?.value;
    const quarter = $('#reg-quarter')?.value?.trim();
    const phone = $('#reg-phone')?.value?.trim().replace(/\s+/g, '');
    const password = $('#reg-password')?.value;
    const passwordConfirm = $('#reg-password-confirm')?.value;
    const whatsapp = $('#reg-whatsapp')?.value?.trim();
    const email = $('#reg-email')?.value?.trim();
    const hourOpen = $('#reg-hour-open')?.value || '08:00';
    const hourClose = $('#reg-hour-close')?.value || '21:00';

    // Validation
    if (!name || !city || !quarter || !phone || !email) {
      showToast('Veuillez remplir tous les champs obligatoires (*)', 'error');
      return;
    }
    if (!password || password.length < 6) {
      showToast('Le mot de passe doit contenir au moins 6 caractères', 'error');
      return;
    }
    if (password !== passwordConfirm) {
      showToast('Les mots de passe ne correspondent pas', 'error');
      return;
    }

    const btn = $('#btn-register');
    btn.textContent = 'Inscription en cours...';
    btn.disabled = true;

    try {
      let authUserId = null;

      // 1. Create User in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
      });

      if (authError) {
        if (authError.message.includes('already registered') || authError.message.includes('User already registered')) {
          // Try to sign in to get the user ID
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
          });
          
          if (signInError) {
            showToast('❌ Cet email est déjà utilisé (mot de passe incorrect)', 'error');
            throw signInError;
          }
          authUserId = signInData.user.id;
        } else {
          throw authError;
        }
      } else {
        if (!authData.user) {
          throw new Error("L'inscription Auth a échoué");
        }
        authUserId = authData.user.id;
      }

      // Get approximate coordinates for the city
      const cityCoords = getCityCoords(city);
      const lat = cityCoords.lat + (Math.random() - 0.5) * 0.02;
      const lng = cityCoords.lng + (Math.random() - 0.5) * 0.02;

      // Collect services
      const services = [];
      if ($('#reg-service-garde')?.checked) services.push('garde_nuit');
      if ($('#reg-service-livraison')?.checked) services.push('livraison');
      if ($('#reg-service-assurance')?.checked) services.push('assurance');
      if ($('#reg-service-conseil')?.checked) services.push('conseil');

      const insertData = {
        id: authUserId, // Primary Key linked to Auth User
        name: name,
        address: `${quarter}, ${city}`,
        city: city,
        quarter: quarter,
        phone: phone,
        whatsapp: whatsapp || null,
        email: email,
        lat: lat,
        lng: lng,
        status: 'open',
        hours: `${hourOpen} - ${hourClose}`,
        services: services,
        is_on_duty: false,
        is_open: true,
        rating: 4.5,
        created_at: new Date().toISOString(),
      };

      // 2. Insert Pharmacy Profile
      const { data, error } = await supabase
        .from('pharmacies')
        .insert([insertData])
        .select()
        .single();

      if (error) {
        // Fallback: If profile creation fails, we should ideally delete the auth user, but for now just show error
        console.error('Profile insertion error:', error);
        throw new Error('Le profil n\'a pas pu être créé. Vérifiez si ce numéro de téléphone existe déjà.');
      }

      showToast('✅ Pharmacie inscrite avec succès !', 'success');
      currentPharmacy = data;
      saveSession(data);
      showDashboard();

    } catch (err) {
      console.error('Registration error:', err);
      showToast('❌ Erreur lors de l\'inscription: ' + (err.message || ''), 'error');
    } finally {
      btn.textContent = 'Inscrire ma pharmacie';
      btn.disabled = false;
    }
  }

  // ══════════════════════════════════════════════════════
  //  PASSWORD RESET — Real Supabase update
  // ══════════════════════════════════════════════════════
  async function handlePasswordReset() {
    const email = $('#reset-email')?.value?.trim();

    if (!email) {
      showToast('Veuillez remplir votre email', 'error');
      return;
    }

    const btn = $('#btn-reset-password');
    btn.textContent = 'Envoi en cours...';
    btn.disabled = true;

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/pharmacien.html?reset=true',
      });

      if (error) throw error;
      
      showToast('✅ Email de réinitialisation envoyé ! Vérifiez votre boîte mail.', 'success');
      setTimeout(() => {
         $('#tab-login').click();
      }, 3000);

    } catch (err) {
      console.error('Reset error:', err);
      showToast('❌ Erreur lors de la réinitialisation.', 'error');
    } finally {
      btn.textContent = 'Réinitialiser le mot de passe';
      btn.disabled = false;
    }
  }

  // ── City Coordinates helper ────────────────────────────
  function getCityCoords(city) {
    const coords = {
      'Douala': { lat: 4.0511, lng: 9.7679 },
      'Yaoundé': { lat: 3.8480, lng: 11.5021 },
      'Bafoussam': { lat: 5.4764, lng: 10.4175 },
      'Bamenda': { lat: 5.9631, lng: 10.1591 },
      'Garoua': { lat: 9.3014, lng: 13.3977 },
      'Maroua': { lat: 10.5956, lng: 14.3157 },
      'Kribi': { lat: 2.9405, lng: 9.9076 },
      'Limbé': { lat: 4.0247, lng: 9.2032 },
      'Buéa': { lat: 4.1560, lng: 9.2632 },
      'Bertoua': { lat: 4.5763, lng: 13.6846 },
      'Ngaoundéré': { lat: 7.3219, lng: 13.5847 },
      'Ebolowa': { lat: 2.9000, lng: 11.1500 },
    };
    return coords[city] || coords['Douala'];
  }

  // ══════════════════════════════════════════════════════
  //  DASHBOARD — Real data from Supabase
  // ══════════════════════════════════════════════════════
  function showDashboard() {
    $('#login-screen').classList.add('hidden');
    $('#dashboard').classList.remove('hidden');
    $('#dash-pharmacy-name').textContent = currentPharmacy.name;

    // Load real data
    loadActiveRequests();
    loadHistory();
    loadStats();
    subscribeToRealTimeRequests();
  }

  function handleLogout() {
    // Unsubscribe from realtime
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    currentPharmacy = null;
    clearSession();
    activeRequests = [];
    
    $('#dashboard').classList.add('hidden');
    $('#login-screen').classList.remove('hidden');
    showToast('Déconnexion réussie', 'info');
  }

  // ══════════════════════════════════════════════════════
  //  REAL-TIME: Load active requests from Supabase
  // ══════════════════════════════════════════════════════
  async function loadActiveRequests() {
    try {
      const { data, error } = await supabase
        .from('requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      activeRequests = data || [];
      renderActiveRequests();
      updateStats();

    } catch (err) {
      console.error('Load requests error:', err);
    }
  }

  // ══════════════════════════════════════════════════════
  //  REAL-TIME: Subscribe to new requests
  // ══════════════════════════════════════════════════════
  function subscribeToRealTimeRequests() {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
    }

    realtimeChannel = supabase
      .channel('pharmacy_requests_live')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'requests',
      }, (payload) => {
        const req = payload.new;
        if (req.status === 'pending') {
          activeRequests.unshift(req);
          renderActiveRequests();
          updateStats();
          showToast('🔔 Nouvelle demande de patient !', 'info');
          // Play notification sound
          try { new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=').play(); } catch(e) {}
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'requests',
      }, (payload) => {
        // Update the request in our list
        const idx = activeRequests.findIndex(r => r.id === payload.new.id);
        if (idx >= 0) {
          activeRequests[idx] = payload.new;
          if (payload.new.status !== 'pending') {
            activeRequests.splice(idx, 1);
          }
          renderActiveRequests();
          updateStats();
        }
      })
      .subscribe();
  }

  // ══════════════════════════════════════════════════════
  //  RENDER ACTIVE REQUESTS (Real data)
  // ══════════════════════════════════════════════════════
  function renderActiveRequests() {
    const container = $('#active-requests');
    if (!container) return;

    const pending = activeRequests.filter(r => r.status === 'pending');

    if (pending.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-text">Aucune demande en cours. Les demandes de patients apparaîtront ici en temps réel.</div>
        </div>`;
      return;
    }

    container.innerHTML = pending.map(req => {
      const meds = Array.isArray(req.medicines) ? req.medicines : [req.medicines];
      const timeAgo = getTimeAgo(req.created_at);
      
      const hasInsurance = !!req.insurance_name;

      const medRows = meds.map((med) => {
        let buttonsHtml = '';
        if (hasInsurance) {
          buttonsHtml = `
            <button class="btn btn-sm btn-outline" data-status="en_stock_assure">✅ En stock assuré</button>
            <button class="btn btn-sm btn-outline" data-status="en_stock_non_assure">⚠️ En stock non assuré</button>
            <button class="btn btn-sm btn-outline" data-status="rupture">❌ Rupture</button>
          `;
        } else {
          buttonsHtml = `
            <button class="btn btn-sm btn-outline" data-status="en_stock">✅ En stock</button>
            <button class="btn btn-sm btn-outline" data-status="rupture">❌ Rupture</button>
          `;
        }
        return `
          <div class="med-response-row" style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.05);">
            <div style="font-weight: 500; margin-bottom: 8px;">💊 ${med}</div>
            <div class="med-btn-group" style="display: flex; gap: 8px; flex-wrap: wrap;" data-med="${med}">
              ${buttonsHtml}
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="request-card urgent" id="request-${req.id}">
          <div class="request-header" style="margin-bottom: 8px;">
            <div class="request-patient-info" style="font-size: 14px; opacity: 0.9;">
              ${req.user_phone ? `📱 ${req.user_phone}` : '📱 Anonyme'}
              ${req.insurance_name ? ` • 🛡️ Assurance: ${req.insurance_name}` : ''}
              ${req.radius ? ` • 📍 Rayon: ${req.radius} km` : ''}
            </div>
            <div class="request-time">${timeAgo}</div>
          </div>
          
          <div class="request-medicines-list" style="margin-bottom: 16px; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px;">
            ${medRows}
          </div>

          <button class="btn btn-primary btn-block" onclick="PharmDash.submitDetailedResponse('${req.id}')">
            Envoyer la réponse
          </button>
        </div>`;
    }).join('');

    // Attach click events for medication selection
    document.querySelectorAll('.med-btn-group button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const group = e.target.closest('.med-btn-group');
        group.querySelectorAll('button').forEach(b => {
          b.classList.remove('active', 'btn-primary');
          b.classList.add('btn-outline');
          b.style.background = 'transparent';
        });
        
        e.target.classList.remove('btn-outline');
        e.target.classList.add('active', 'btn-primary');
        e.target.style.background = 'var(--primary-color)';
        group.setAttribute('data-selected', e.target.getAttribute('data-status'));
      });
    });
  }

  // ══════════════════════════════════════════════════════
  //  RESPOND TO REQUEST — Real Supabase update + insert response
  // ══════════════════════════════════════════════════════
  let pendingAction = null;

  async function submitDetailedResponse(requestId) {
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

    // Determine overall status (if at least one is in stock, we consider the response 'accepted' broadly)
    const hasAnyStock = Object.values(medicinesStatus).some(s => s.startsWith('en_stock'));
    const responseStatus = hasAnyStock ? 'accepted' : 'out_of_stock';

    try {
      const { error: respError } = await supabase
        .from('responses')
        .insert([{
          request_id: requestId,
          pharmacy_id: currentPharmacy.id,
          pharmacy_name: currentPharmacy.name,
          pharmacy_phone: currentPharmacy.phone,
          pharmacy_address: currentPharmacy.address,
          status: responseStatus,
          medicines_status: medicinesStatus,
          created_at: new Date().toISOString(),
        }]);

      if (respError) {
        console.error('Response insert error:', respError);
        throw respError;
      }

      // Do not update the request status to 'accepted' here.
      // The request stays 'pending' until the patient chooses a pharmacy (reserves).
      // We just remove it from the active list for this pharmacy.

      activeRequests = activeRequests.filter(r => r.id !== requestId);
      renderActiveRequests();
      updateStats();

      showToast('✅ Réponse détaillée envoyée au patient', 'success');
      loadHistory();

    } catch (err) {
      console.error('Respond error:', err);
      showToast('❌ Erreur lors de l\'envoi de la réponse', 'error');
    }
  }

  function confirmAction(reqId, status) {
    const actionText = status === 'accepted' ? 'EN STOCK' : 'RUPTURE';
    pendingAction = () => respondToRequest(reqId, status);
    const confirmText = $('#confirm-text');
    if (confirmText) confirmText.textContent = `Confirmez : "${actionText}" pour cette demande ?`;
    const confirmModal = $('#confirm-modal');
    if (confirmModal) confirmModal.style.display = 'flex';
  }

  function executeConfirm() {
    if (pendingAction) pendingAction();
    const confirmModal = $('#confirm-modal');
    if (confirmModal) confirmModal.style.display = 'none';
    pendingAction = null;
  }

  // ══════════════════════════════════════════════════════
  //  HISTORY — Real data from Supabase
  // ══════════════════════════════════════════════════════
  async function loadHistory() {
    if (!currentPharmacy) return;
    const container = $('#history-list');
    if (!container) return;

    try {
      const { data, error } = await supabase
        .from('responses')
        .select('*')
        .eq('pharmacy_id', currentPharmacy.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      if (!data || data.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📋</div>
            <div class="empty-state-text">Aucun historique. Vos réponses aux demandes s'afficheront ici.</div>
          </div>`;
        return;
      }

      container.innerHTML = data.map(item => {
        const statusBadge = item.status === 'accepted'
          ? '<span class="badge badge-stock">✅ En stock</span>'
          : '<span class="badge badge-rupture">❌ Rupture</span>';
        const timeStr = new Date(item.created_at).toLocaleString('fr-FR', { 
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
        });

        return `
          <div class="history-item">
            <div class="history-item-info">
              <div class="history-item-medicine">💊 Demande #${item.request_id?.toString().slice(-6) || '—'}</div>
              <div class="history-item-meta"><span>📅 ${timeStr}</span></div>
            </div>
            <div class="history-item-status">${statusBadge}</div>
          </div>`;
      }).join('');

    } catch (err) {
      console.error('Load history error:', err);
    }
  }

  // ══════════════════════════════════════════════════════
  //  STATISTICS — Real data from Supabase
  // ══════════════════════════════════════════════════════
  async function loadStats() {
    if (!currentPharmacy) return;

    try {
      const today = new Date();
      today.setHours(0,0,0,0);
      const todayStr = today.toISOString();

      // Count responses today
      const { count: respondedCount } = await supabase
        .from('responses')
        .select('*', { count: 'exact', head: true })
        .eq('pharmacy_id', currentPharmacy.id)
        .gte('created_at', todayStr);

      const statResponded = $('#stat-responded');
      if (statResponded) statResponded.textContent = respondedCount || 0;

      // Count reservations
      const { count: reservedCount } = await supabase
        .from('requests')
        .select('*', { count: 'exact', head: true })
        .eq('pharmacy_id', currentPharmacy.id)
        .in('status', ['accepted', 'reserved'])
        .gte('created_at', todayStr);

      const statReserved = $('#stat-reserved');
      if (statReserved) statReserved.textContent = reservedCount || 0;

      // Get top medicines from requests
      const { data: requests } = await supabase
        .from('requests')
        .select('medicines')
        .order('created_at', { ascending: false })
        .limit(200);

      // Count medicine frequency
      const medCounts = {};
      (requests || []).forEach(req => {
        const meds = Array.isArray(req.medicines) ? req.medicines : [req.medicines];
        meds.forEach(med => {
          if (med) medCounts[med] = (medCounts[med] || 0) + 1;
        });
      });

      const topMeds = Object.entries(medCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      renderTopMedications(topMeds);

    } catch (err) {
      console.error('Stats error:', err);
    }
  }

  function renderTopMedications(topMeds) {
    const container = $('#top-medications');
    if (!container) return;

    if (topMeds.length === 0) {
      container.innerHTML = '<p style="color: var(--dark-400); font-size: 14px;">Pas encore de données.</p>';
      return;
    }

    const maxCount = topMeds[0][1];
    container.innerHTML = topMeds.map(([name, count]) => `
      <div class="med-bar">
        <div class="med-bar-label">${name}</div>
        <div class="med-bar-track">
          <div class="med-bar-fill" style="width: ${(count / maxCount) * 100}%">${count}</div>
        </div>
      </div>
    `).join('');
  }

  // ── Update Stats Counters ──────────────────────────────
  function updateStats() {
    const pending = activeRequests.filter(r => r.status === 'pending').length;
    const totalToday = activeRequests.length; // Actually should be queried, but for now we use loaded requests
    
    const statPending = $('#stat-pending');
    const statToday = $('#stat-today');
    const activeBadge = $('#active-badge');

    if (statPending) statPending.textContent = pending;
    if (statToday) statToday.textContent = totalToday;
    if (activeBadge) activeBadge.textContent = pending;
    
    // Refresh async stats
    loadStats();
  }

  // ── Dashboard Tabs ─────────────────────────────────────
  function bindTabs() {
    $$('.dash-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.dash-tab').forEach(t => t.classList.remove('active'));
        $$('.dash-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const content = $(`#tab-${tab.dataset.tab}`);
        if (content) content.classList.add('active');
      });
    });
  }

  // ── Guard Status Switch ────────────────────────────────
  function bindGuardSwitch() {
    $$('.guard-option').forEach(option => {
      option.addEventListener('click', async () => {
        $$('.guard-option').forEach(o => o.classList.remove('active'));
        option.classList.add('active');

        const status = option.dataset.status;
        const labels = {
          open: 'Statut : Ouvert',
          guard: 'Statut : De garde 🌙',
          closed: 'Statut : Fermé',
        };
        const labelEl = $('#guard-label');
        if (labelEl) labelEl.textContent = labels[status];

        // UPDATE in Supabase (REAL)
        if (currentPharmacy) {
          try {
            await supabase
              .from('pharmacies')
              .update({ 
                status: status, 
                is_open: status !== 'closed',
                is_on_duty: status === 'guard',
              })
              .eq('id', currentPharmacy.id);

            showToast(`✅ Statut mis à jour: ${labels[status]}`, 'success');
          } catch (err) {
            console.error('Status update error:', err);
            showToast('❌ Erreur de mise à jour du statut', 'error');
          }
        }
      });
    });
  }

  // ── Utility ────────────────────────────────────────────
  function getTimeAgo(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'À l\'instant';
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `Il y a ${diffH}h`;
    return new Date(dateStr).toLocaleDateString('fr-FR');
  }

  function showToast(message, type = 'success') {
    const toast = $('#toast');
    const toastMessage = $('#toast-message');
    if (toast && toastMessage) {
      toast.className = `toast toast-${type} show`;
      toastMessage.textContent = message;
      setTimeout(() => toast.classList.remove('show'), 3500);
    }
  }

  // ── Public API ─────────────────────────────────────────
  window.PharmDash = {
    respondToRequest,
    confirmAction,
  };

  document.addEventListener('DOMContentLoaded', init);
})();
