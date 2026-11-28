/**
 * Pharma-Garde v11.0 — Portail Privilégié Super-Administrateur Plateforme
 * ───────────────────────────────────────────────────────────────────────
 * • Accès privilégié sécurisé (empreintes SHA-256 individuelles + Supabase
 *   `platform_admins` + anti-bruteforce) dans les 4 espaces.
 * • Gestion Multi-Super-Administrateurs : inscrire de nouveaux Super-Admins
 *   (nom, email, rôle, code d'accès individuel SHA-256) et supprimer / révoquer
 *   un administrateur (protection contre la suppression du dernier Super-Admin).
 * • Workflow de Validation & Certification ONCP / DPML : file d'approbation
 *   pour Officines, Délégués Médicaux et Grossistes-Répartiteurs (Badge Vérifié ✓).
 * • Console Super-Admin (6 onglets) : Vue Globale, Validation ONCP/DPML,
 *   Modération Officines, Abonnements, Super-Admins, Sécurité & Audit CSV.
 *
 * Expose : window.PGAdmin
 */
(function (window) {
  'use strict';

  const SESSION_KEY = 'pharmagarde_super_admin_session';
  const HASH_KEY = 'pharmagarde_super_admin_hash_v10';
  const ADMINS_KEY = 'pharmagarde_super_admins_registry_v11';
  const VERIFY_KEY = 'pharmagarde_oncp_verifications_v11';
  const AUDIT_KEY = 'pharmagarde_super_admin_audit';
  const LOCK_KEY = 'pharmagarde_super_admin_lock';
  const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 heures
  const SALT = 'PG_CM_SUPERADMIN_V10::';

  // v16.0 : Zéro code maître ou empreinte par défaut dans le bundle client.
  // L'authentification Super-Admin est vérifiée côté serveur par l'Edge Function `admin-auth` + Supabase `platform_admins`.

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function currentPageSpace() {
    const p = (location.pathname || '').toLowerCase();
    if (p.includes('pharmacien')) return 'pharmacy';
    if (p.includes('medecin')) return 'doctor';
    if (p.includes('etablissement')) return 'facility';
    if (p.includes('delegue')) return 'delegate';
    if (p.includes('grossiste')) return 'wholesaler';
    return 'client';
  }

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(SALT + String(text || '').trim());
    if (window.crypto && window.crypto.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 2166136261;
    for (let i = 0; i < data.length; i++) { h ^= data[i]; h = Math.imul(h, 16777619); }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  function getExpectedMasterHash() {
    try { return localStorage.getItem(HASH_KEY) || ''; } catch (e) { return ''; }
  }

  // ── Registre Multi-Super-Administrateurs ───────────────────────
  function getAdminsRegistry() {
    try {
      const saved = JSON.parse(localStorage.getItem(ADMINS_KEY) || 'null');
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch (e) {}
    const rootAdmin = [{
      id: 'adm_founder',
      full_name: 'Administrateur Principal (Fondateur)',
      email: 'admin@pharmagarde.cm',
      role: 'super_admin',
      is_founder: true,
      is_active: true,
      access_code_hash: getExpectedMasterHash(),
      created_at: '2026-01-01T00:00:00.000Z'
    }];
    saveAdminsRegistry(rootAdmin);
    return rootAdmin;
  }

  function saveAdminsRegistry(list) {
    try { localStorage.setItem(ADMINS_KEY, JSON.stringify(list)); } catch (e) {}
  }

  // ── Registre Certifications ONCP / DPML ────────────────────────
  function getVerificationMap() {
    try { return JSON.parse(localStorage.getItem(VERIFY_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveVerificationMap(map) {
    try { localStorage.setItem(VERIFY_KEY, JSON.stringify(map)); } catch (e) {}
  }
  function getVerificationStatus(role, id) {
    const map = getVerificationMap();
    return map[`${role}:${id}`] || 'pending';
  }
  function isVerified(role, id) {
    return getVerificationStatus(role, id) === 'verified';
  }
  function verifiedBadge(role, id) {
    return isVerified(role, id)
      ? '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:999px;background:rgba(16,185,129,0.18);border:1px solid #10b981;color:#34d399;font-size:10px;font-weight:800;">✓ Vérifié ONCP/DPML</span>'
      : '';
  }

  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.expiresAt || Date.now() > obj.expiresAt) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return obj;
    } catch (e) { return null; }
  }

  function isAdmin() { return !!getSession(); }

  function logAudit(action, details) {
    try {
      const sess = getSession();
      const list = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
      list.unshift({
        ts: new Date().toISOString(),
        actor: (sess && sess.email) || 'system',
        space: currentPageSpace(),
        action: String(action || ''),
        details: String(details || '')
      });
      localStorage.setItem(AUDIT_KEY, JSON.stringify(list.slice(0, 150)));
    } catch (e) {}
  }

  function getAuditLogs() {
    try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); } catch (e) { return []; }
  }

  function notify(msg, type) {
    if (window.PG && typeof PG.toast === 'function') { PG.toast(msg, type || 'success'); return; }
    const t = document.getElementById('toast'), m = document.getElementById('toast-message');
    if (t && m) {
      t.className = 'toast toast--' + (type || 'success');
      m.textContent = (window.I18n && I18n.translateText) ? I18n.translateText(String(msg || '')) : msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 3600);
    }
  }

  function checkBruteForceLock() {
    try {
      const state = JSON.parse(sessionStorage.getItem(LOCK_KEY) || '{"fails":0,"until":0}');
      if (state.until && Date.now() < state.until) return Math.ceil((state.until - Date.now()) / 1000);
      return 0;
    } catch (e) { return 0; }
  }

  function recordAuthFailure() {
    try {
      const state = JSON.parse(sessionStorage.getItem(LOCK_KEY) || '{"fails":0,"until":0}');
      state.fails = (state.fails || 0) + 1;
      if (state.fails >= 5) { state.until = Date.now() + 60000; state.fails = 0; }
      sessionStorage.setItem(LOCK_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function clearAuthFailures() { try { sessionStorage.removeItem(LOCK_KEY); } catch (e) {} }

  async function authenticate(masterCode, adminEmail) {
    const lockedSec = checkBruteForceLock();
    if (lockedSec > 0) throw new Error(`Trop de tentatives. Réessayez dans ${lockedSec}s.`);

    const code = String(masterCode || '').trim();
    if (!code) throw new Error('Veuillez saisir le code maître Administrateur.');

    const cleanEmail = String(adminEmail || '').trim().toLowerCase();
    let matchedAdmin = null;
    let serverToken = null;

    // 1. Vérification prioritaire côté serveur via Edge Function `admin-auth` (HMAC + `platform_admins`)
    if (window.supabase && window.supabase.functions) {
      try {
        const { data, error } = await window.supabase.functions.invoke('admin-auth', {
          body: { action: 'login', email: cleanEmail, code, space: currentPageSpace() }
        });
        if (!error && data && data.success && data.admin) {
          matchedAdmin = data.admin;
          serverToken = data.token || null;
        }
      } catch (e) {}
    }

    // 2. Vérification Supabase Auth + `platform_admins` (si email + mot de passe Supabase fournis)
    if (!matchedAdmin && window.supabase && cleanEmail) {
      try {
        const { data: authData } = await window.supabase.auth.signInWithPassword({ email: cleanEmail, password: code });
        if (authData && authData.user) {
          const role = authData.user.app_metadata && authData.user.app_metadata.role;
          if (role === 'super_admin' || role === 'admin') {
            matchedAdmin = { full_name: authData.user.email, email: cleanEmail, role: 'super_admin' };
          } else {
            const { data: row } = await window.supabase
              .from('platform_admins')
              .select('*')
              .eq('email', cleanEmail)
              .eq('is_active', true)
              .maybeSingle();
            if (row) matchedAdmin = row;
          }
        }
      } catch (e) {}
    }

    // 3. Repli hors-ligne uniquement si une empreinte personnalisée a déjà été configurée par l'admin sur ce poste
    if (!matchedAdmin) {
      const computed = await sha256Hex(code);
      const localHash = getExpectedMasterHash();
      const registry = getAdminsRegistry();
      if (localHash && computed === localHash) {
        matchedAdmin = registry.find((a) => a.is_founder) || registry[0];
      } else {
        matchedAdmin = registry.find((a) =>
          a.is_active !== false &&
          a.access_code_hash &&
          a.access_code_hash === computed &&
          (!cleanEmail || (a.email || '').toLowerCase() === cleanEmail)
        );
      }
    }

    if (!matchedAdmin) {
      recordAuthFailure();
      throw new Error('Code ou identifiant Administrateur invalide.');
    }

    clearAuthFailures();
    const session = {
      id: matchedAdmin.id || 'adm_session',
      full_name: matchedAdmin.full_name || 'Super Administrateur',
      role: matchedAdmin.role || 'super_admin',
      email: cleanEmail || matchedAdmin.email || 'admin@pharmagarde.cm',
      token: serverToken,
      startedAt: Date.now(),
      expiresAt: matchedAdmin.expiresAt || (Date.now() + SESSION_TTL_MS)
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    logAudit('ADMIN_LOGIN', `Connexion privilégiée (${session.email}) sur ${currentPageSpace()}`);
    renderFloatingBar();
    applySpacePrivileges();
    return session;
  }

  function logout() {
    logAudit('ADMIN_LOGOUT', 'Verrouillage session Administrateur');
    sessionStorage.removeItem(SESSION_KEY);
    const bar = document.getElementById('pg-admin-floating-bar');
    if (bar) bar.remove();
    closeModals();
    notify('🔒 Session Administrateur verrouillée.', 'info');
  }

  // ── Privilèges automatiques dans chaque espace ──────────────────
  async function enterCurrentSpaceAsAdmin(customTarget) {
    if (!isAdmin()) { openUnlockModal(() => enterCurrentSpaceAsAdmin(customTarget)); return; }
    const space = currentPageSpace();
    logAudit('ADMIN_ENTER_SPACE', space);
    if (space === 'pharmacy' && window.PharmDash && typeof PharmDash.adminEnter === 'function') {
      await PharmDash.adminEnter(customTarget);
      notify('👑 Accès Administrateur Espace Pharmacie activé', 'success');
    } else if (space === 'doctor' && window.MedecinApp && typeof MedecinApp.adminEnter === 'function') {
      await MedecinApp.adminEnter(customTarget);
      notify('👑 Accès Administrateur Espace Médecin ONMC activé', 'success');
    } else if (space === 'facility' && window.FacilityApp && typeof FacilityApp.adminEnter === 'function') {
      await FacilityApp.adminEnter(customTarget);
      notify('👑 Accès Administrateur Espace Labo / Hôpital activé', 'success');
    } else if (space === 'delegate' && window.DelegateApp && typeof DelegateApp.adminEnter === 'function') {
      await DelegateApp.adminEnter();
      notify('👑 Accès Administrateur Espace Délégué activé (Licence Illimitée)', 'success');
    } else if (space === 'wholesaler' && window.GrossisteApp && typeof GrossisteApp.adminEnter === 'function') {
      await GrossisteApp.adminEnter(customTarget);
      notify('👑 Accès Administrateur Espace Grossiste B2B activé', 'success');
    } else if (space === 'client') {
      if (window.Payment && typeof Payment.createSession === 'function') Payment.createSession('ADMIN_PASS_' + Date.now(), '694929909');
      const ws = document.getElementById('welcome-screen');
      if (ws && !ws.classList.contains('hidden')) { const btn = document.getElementById('btn-espace-client'); if (btn) btn.click(); }
      if (window.App && typeof App.updateSessionUI === 'function') App.updateSessionUI();
      notify('👑 Pass Admin Illimité activé sur l\'Espace Patient (0 FCFA)', 'success');
    }
  }

  function applySpacePrivileges() {
    if (!isAdmin()) return;
    if (currentPageSpace() === 'client' && window.Payment && !Payment.hasActiveSession()) {
      Payment.createSession('ADMIN_PASS_' + Date.now(), '694929909');
    }
  }

  // ── Barre flottante inter-espaces ──────────────────────────────
  function renderFloatingBar() {
    let bar = document.getElementById('pg-admin-floating-bar');
    if (!isAdmin()) { if (bar) bar.remove(); return; }
    if (bar) bar.remove();
    const space = currentPageSpace();
    bar = document.createElement('div');
    bar.id = 'pg-admin-floating-bar';
    bar.className = 'pg-admin-bar';
    bar.innerHTML = `
      <span class="pg-admin-bar__badge">👑 SUPER-ADMIN</span>
      <a href="index.html" class="pg-admin-bar__btn ${space === 'client' ? 'active' : ''}">👤 Patient</a>
      <a href="pharmacien.html" class="pg-admin-bar__btn ${space === 'pharmacy' ? 'active' : ''}">🏥 Pharmacie</a>
      <a href="medecin.html" class="pg-admin-bar__btn ${space === 'doctor' ? 'active' : ''}">🩺 Médecin</a>
      <a href="etablissement.html" class="pg-admin-bar__btn ${space === 'facility' ? 'active' : ''}">🔬 Labo/Hôp.</a>
      <a href="delegue.html" class="pg-admin-bar__btn ${space === 'delegate' ? 'active' : ''}">💼 Délégué</a>
      <a href="grossiste.html" class="pg-admin-bar__btn ${space === 'wholesaler' ? 'active' : ''}">🏭 Grossiste</a>
      <span class="pg-admin-bar__sep"></span>
      <button type="button" class="pg-admin-bar__btn pg-admin-bar__btn--gold" id="pg-admin-open-console">📊 Console Super-Admin</button>
      <button type="button" class="pg-admin-bar__btn pg-admin-bar__btn--danger" id="pg-admin-lock-btn" title="Verrouiller Admin">🔒</button>
    `;
    document.body.appendChild(bar);
    document.getElementById('pg-admin-open-console').addEventListener('click', openConsoleModal);
    document.getElementById('pg-admin-lock-btn').addEventListener('click', logout);
  }

  let pendingSuccessCallback = null;
  function closeModals() {
    ['pg-admin-unlock-overlay', 'pg-admin-console-overlay'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });
  }

  function openUnlockModal(onSuccess) {
    if (isAdmin()) {
      if (typeof onSuccess === 'function') onSuccess(); else openConsoleModal();
      return;
    }
    pendingSuccessCallback = typeof onSuccess === 'function' ? onSuccess : null;
    let overlay = document.getElementById('pg-admin-unlock-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'pg-admin-unlock-overlay';
      overlay.className = 'pg-admin-modal-overlay';
      overlay.innerHTML = `
        <div class="pg-admin-modal pg-admin-modal--sm">
          <div class="pg-admin-modal__head">
            <h3 class="pg-admin-modal__title">👑 Accès Privilégié Administrateur</h3>
            <button type="button" class="btn btn--icon" id="pg-admin-unlock-close" style="color:#94a3b8;">✕</button>
          </div>
          <div class="pg-admin-modal__body">
            <p style="font-size:12.5px; color:#94a3b8; margin:0 0 14px; line-height:1.5;">
              Identifiez-vous comme Super-Administrateur Pharma-Garde pour accéder aux 6 espaces, valider les agréments ONCP/ONMC/DPML/MINSANTE et gérer l'équipe d'administrateurs.
            </p>
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label" style="color:#fbbf24;">Email Administrateur (optionnel)</label>
              <input type="email" id="pg-admin-email-input" class="form-input" placeholder="admin@pharmagarde.cm" autocomplete="username">
            </div>
            <div class="form-group" style="margin-bottom:14px;">
              <label class="form-label" style="color:#fbbf24;">Code d'Accès Super-Admin *</label>
              <input type="password" id="pg-admin-code-input" class="form-input" placeholder="••••••••••••" autocomplete="current-password">
            </div>
            <div id="pg-admin-unlock-err" style="display:none; color:#f87171; font-size:12px; font-weight:700; margin-bottom:10px;"></div>
            <button type="button" id="pg-admin-unlock-submit" class="btn btn--primary btn--block" style="background:linear-gradient(135deg,#fbbf24,#d97706)!important; color:#0f172a!important; border:none!important; font-weight:900;">
              🔓 Activer le Mode Administrateur
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModals(); });
      document.getElementById('pg-admin-unlock-close').addEventListener('click', closeModals);
      const submit = async () => {
        const errEl = document.getElementById('pg-admin-unlock-err');
        const email = (document.getElementById('pg-admin-email-input').value || '').trim();
        const code = document.getElementById('pg-admin-code-input').value || '';
        errEl.style.display = 'none';
        try {
          await authenticate(code, email);
          document.getElementById('pg-admin-code-input').value = '';
          closeModals();
          notify('👑 Mode Administrateur Plateforme activé (4h)', 'success');
          if (pendingSuccessCallback) { const cb = pendingSuccessCallback; pendingSuccessCallback = null; cb(); }
          else openConsoleModal();
        } catch (err) {
          errEl.textContent = '❌ ' + (err.message || 'Accès refusé');
          errEl.style.display = 'block';
        }
      };
      document.getElementById('pg-admin-unlock-submit').addEventListener('click', submit);
      document.getElementById('pg-admin-code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    }
    overlay.classList.add('active');
    setTimeout(() => { const inp = document.getElementById('pg-admin-code-input'); if (inp) inp.focus(); }, 80);
  }

  // ════════════════════════════════════════════════════════════════
  // CONSOLE SUPER-ADMIN GLOBALE (6 ONGLETS)
  // ════════════════════════════════════════════════════════════════
  let currentConsoleTab = 'overview';

  function openConsoleModal() {
    if (!isAdmin()) { openUnlockModal(openConsoleModal); return; }
    let overlay = document.getElementById('pg-admin-console-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'pg-admin-console-overlay';
      overlay.className = 'pg-admin-modal-overlay';
      overlay.innerHTML = `
        <div class="pg-admin-modal">
          <div class="pg-admin-modal__head">
            <div>
              <h3 class="pg-admin-modal__title">👑 Console Super-Administrateur Pharma-Garde</h3>
              <div style="font-size:11.5px; color:#94a3b8; margin-top:2px;">Pilotage global · Validation ONCP/DPML · Gestion Super-Admins · Sécurité</div>
            </div>
            <button type="button" class="btn btn--icon" id="pg-admin-console-close" style="color:#94a3b8;">✕</button>
          </div>
          <div class="pg-admin-modal__tabs">
            <button type="button" class="pg-admin-tab active" data-atab="overview">📊 Vue Globale</button>
            <button type="button" class="pg-admin-tab" data-atab="revenue">💰 Revenus &amp; KPIs</button>
            <button type="button" class="pg-admin-tab" data-atab="verification">✅ Validation ONCP/DPML</button>
            <button type="button" class="pg-admin-tab" data-atab="pharmacies">🏥 Modération Officines</button>
            <button type="button" class="pg-admin-tab" data-atab="admins">👑 Super-Admins</button>
            <button type="button" class="pg-admin-tab" data-atab="subs">💳 Abonnements</button>
            <button type="button" class="pg-admin-tab" data-atab="security">🛡️ Sécurité &amp; Audit</button>
          </div>
          <div class="pg-admin-modal__body" id="pg-admin-console-body"></div>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModals(); });
      document.getElementById('pg-admin-console-close').addEventListener('click', closeModals);
      overlay.querySelectorAll('[data-atab]').forEach((btn) => {
        btn.addEventListener('click', () => {
          currentConsoleTab = btn.getAttribute('data-atab');
          overlay.querySelectorAll('[data-atab]').forEach((b) => b.classList.toggle('active', b === btn));
          renderConsoleTab();
        });
      });
    }
    overlay.classList.add('active');
    renderConsoleTab();
  }

  async function safeCount(table, filterFn) {
    if (!window.supabase) return '—';
    try {
      let q = window.supabase.from(table).select('id', { count: 'exact', head: true });
      if (filterFn) q = filterFn(q);
      const { count, error } = await q;
      return error ? '—' : (count != null ? count : 0);
    } catch (e) { return '—'; }
  }

  async function setActorVerification(role, id, name, newStatus) {
    const map = getVerificationMap();
    map[`${role}:${id}`] = newStatus;
    saveVerificationMap(map);

    const tableMap = { pharmacy: 'pharmacies', doctor: 'doctors', facility: 'health_facilities', delegate: 'delegates', wholesaler: 'wholesalers' };
    const sess = getSession();
    if (window.supabase && tableMap[role]) {
      try {
        await window.supabase.from(tableMap[role]).update({
          verification_status: newStatus,
          verified_at: newStatus === 'verified' ? new Date().toISOString() : null,
          verified_by: (sess && sess.email) || 'super_admin'
        }).eq('id', id);
      } catch (e) {}
    }
    // Synchroniser aussi les registres locaux Médecins & Établissements
    if (role === 'doctor' && window.MedecinStore && typeof MedecinStore.saveDoctorInDirectory === 'function') {
      try { MedecinStore.saveDoctorInDirectory({ id, verification_status: newStatus }); } catch (e) {}
    }
    if (role === 'facility' && window.FacilityStore && typeof FacilityStore.saveFacilityInDir === 'function') {
      try { FacilityStore.saveFacilityInDir({ id, verification_status: newStatus }); } catch (e) {}
    }
    logAudit('ONCP_ONMC_VERIFICATION', `${role} ${name} (${id}) -> ${newStatus}`);
    const labels = { verified: '✓ Certifié ONCP/ONMC/DPML', pending: '⏳ Mis en attente', rejected: '🚫 Rejeté / Suspendu' };
    notify(`${labels[newStatus] || newStatus} : ${name}`, newStatus === 'verified' ? 'success' : 'info');
    renderConsoleTab();
  }

  async function renderConsoleTab() {
    const body = document.getElementById('pg-admin-console-body');
    if (!body) return;

    // 1. VUE GLOBALE
    if (currentConsoleTab === 'overview') {
      body.innerHTML = '<div style="text-align:center; padding:28px; color:#94a3b8;">⏳ Chargement des indicateurs plateforme...</div>';
      const t0 = performance.now();
      const [phTotal, phGuard, reqTotal, respTotal, resTotal, docTotal, facTotal, delTotal, wsTotal, ordTotal] = await Promise.all([
        safeCount('pharmacies'),
        safeCount('pharmacies', (q) => q.eq('is_on_duty', true)),
        safeCount('requests'),
        safeCount('responses'),
        safeCount('reservations'),
        safeCount('doctors'),
        safeCount('health_facilities'),
        safeCount('delegates'),
        safeCount('wholesalers'),
        safeCount('wholesaler_orders')
      ]);
      const pingMs = Math.round(performance.now() - t0);
      const adminsCount = getAdminsRegistry().filter((a) => a.is_active !== false).length;
      const localDocs = (window.MedecinStore && typeof MedecinStore.getDoctors === 'function') ? MedecinStore.getDoctors().length : docTotal;
      const localFacs = (window.FacilityStore && typeof FacilityStore.getFacilities === 'function') ? FacilityStore.getFacilities().length : facTotal;

      body.innerHTML = `
        <div class="pg-admin-kpi-grid">
          <div class="pg-admin-kpi"><div class="pg-admin-kpi__label">🏥 Officines inscrites</div><div class="pg-admin-kpi__val">${esc(phTotal)}</div></div>
          <div class="pg-admin-kpi"><div class="pg-admin-kpi__label">🌙 Officines de garde</div><div class="pg-admin-kpi__val pg-admin-kpi__val--gold">${esc(phGuard)}</div></div>
          <div class="pg-admin-kpi"><div class="pg-admin-kpi__label">🩺 Médecins ONMC</div><div class="pg-admin-kpi__val pg-admin-kpi__val--blue">${esc(docTotal === '—' ? localDocs : docTotal)}</div></div>
          <div class="pg-admin-kpi"><div class="pg-admin-kpi__label">🔬 Labos &amp; Hôpitaux</div><div class="pg-admin-kpi__val pg-admin-kpi__val--gold">${esc(facTotal === '—' ? localFacs : facTotal)}</div></div>
          <div class="pg-admin-kpi"><div class="pg-admin-kpi__label">🔍 Demandes Patients</div><div class="pg-admin-kpi__val pg-admin-kpi__val--blue">${esc(reqTotal)}</div></div>
          <div class="pg-admin-kpi"><div class="pg-admin-kpi__label">✅ Réponses / Résa</div><div class="pg-admin-kpi__val">${esc(respTotal)} / ${esc(resTotal)}</div></div>
          <div class="pg-admin-kpi"><div class="pg-admin-kpi__label">💼 Délégués Médicaux</div><div class="pg-admin-kpi__val pg-admin-kpi__val--blue">${esc(delTotal)}</div></div>
          <div class="pg-admin-kpi"><div class="pg-admin-kpi__label">🏭 Grossistes / Cmd B2B</div><div class="pg-admin-kpi__val pg-admin-kpi__val--gold">${esc(wsTotal)} / ${esc(ordTotal)}</div></div>
          <div class="pg-admin-kpi"><div class="pg-admin-kpi__label">👑 Super-Admins Actifs</div><div class="pg-admin-kpi__val pg-admin-kpi__val--gold">${adminsCount}</div></div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between; padding:14px; border-radius:14px; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.3);">
          <div>
            <div style="font-weight:800; color:#34d399; font-size:13.5px;">⚡ Accès Rapide Privilégié aux 6 Espaces</div>
            <div style="font-size:12px; color:#94a3b8; margin-top:2px;">Latence Supabase : <strong style="color:#fff;">${pingMs} ms</strong> · Session Admin active</div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="btn btn--sm btn--primary" id="pg-adm-go-cur">👑 Ouvrir cet espace en Admin</button>
            <a href="pharmacien.html?admin=1" class="btn btn--sm btn--secondary">🏥 Pharmacie</a>
            <a href="medecin.html?admin=1" class="btn btn--sm btn--secondary">🩺 Médecin</a>
            <a href="etablissement.html?admin=1" class="btn btn--sm btn--secondary">🔬 Labo/Hôp.</a>
            <a href="delegue.html?admin=1" class="btn btn--sm btn--secondary">💼 Délégué</a>
            <a href="grossiste.html?admin=1" class="btn btn--sm btn--secondary">🏭 Grossiste</a>
          </div>
        </div>
      `;
      const goCur = document.getElementById('pg-adm-go-cur');
      if (goCur) goCur.addEventListener('click', () => { closeModals(); enterCurrentSpaceAsAdmin(); });
      return;
    }

    // 1B. REVENUS NOTCHPAY & KPIs (v17.0 — Lecture Serveur Sécurisée via admin-auth)
    if (currentConsoleTab === 'revenue') {
      body.innerHTML = '<div style="text-align:center; padding:28px; color:#94a3b8;">⏳ Chargement des revenus NotchPay et KPIs opérationnels...</div>';
      const sess = getSession();
      const fmtFcfa = (n) => Number(n || 0).toLocaleString('fr-FR') + ' FCFA';

      if (!window.supabase || !window.supabase.functions || !sess || !sess.token) {
        body.innerHTML = `
          <div class="pg-admin-kpi" style="border-color:rgba(251,191,36,0.45);">
            <div style="font-weight:800; color:#fbbf24; margin-bottom:6px;">🔐 Session Serveur Requise</div>
            <p style="font-size:12.5px; color:#cbd5e1; margin:0;">
              Les revenus NotchPay sont lus exclusivement côté serveur (<code>service_role</code>). Verrouillez puis reconnectez-vous en mode Super-Admin connecté pour afficher les statistiques financières en direct.
            </p>
          </div>`;
        return;
      }

      try {
        const { data, error } = await window.supabase.functions.invoke('admin-auth', {
          body: { action: 'revenue_analytics', token: sess.token, space: currentPageSpace() }
        });
        if (error || !data || !data.success) {
          throw new Error((data && data.error) || (error && error.message) || 'Impossible de charger les analytics');
        }

        const t = data.totals || {};
        const bd = data.breakdown || {};
        const ops = data.operations_30d || {};
        const subsRole = data.active_subscriptions_by_role || {};
        const daily = Array.isArray(data.daily_14d) ? data.daily_14d : [];
        const txs = Array.isArray(data.recent_transactions) ? data.recent_transactions : [];
        const rems = Array.isArray(data.recent_reminders) ? data.recent_reminders : [];

        // Construction du graphique SVG 14 jours (zéro dépendance externe)
        const maxDay = Math.max(100, ...daily.map((d) => Number(d.total) || 0));
        const chartW = 680, chartH = 150, padB = 26, padT = 16;
        const barSlot = daily.length ? (chartW - 20) / daily.length : 44;
        const barW = Math.max(14, Math.floor(barSlot * 0.62));
        const svgBars = daily.map((d, i) => {
          const val = Number(d.total) || 0;
          const h = val > 0 ? Math.max(6, Math.round((val / maxDay) * (chartH - padB - padT))) : 2;
          const x = Math.round(10 + i * barSlot + (barSlot - barW) / 2);
          const y = chartH - padB - h;
          const fill = val > 0 ? 'url(#pgRevGrad)' : 'rgba(148,163,184,0.22)';
          return `
            <g>
              <title>${esc(d.date)} : ${esc(fmtFcfa(val))} (${d.count || 0} tx)</title>
              <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="4" fill="${fill}"></rect>
              ${val > 0 ? `<text x="${x + barW / 2}" y="${Math.max(11, y - 4)}" text-anchor="middle" fill="#fde68a" font-size="9" font-weight="700">${val >= 1000 ? Math.round(val / 1000) + 'k' : val}</text>` : ''}
              <text x="${x + barW / 2}" y="${chartH - 8}" text-anchor="middle" fill="#94a3b8" font-size="9.5">${esc(d.label)}</text>
            </g>`;
        }).join('');

        const totalConfirmed = Math.max(1, Number(t.all_time) || 0);
        const pct = (v) => Math.min(100, Math.round(((Number(v) || 0) / totalConfirmed) * 100));
        const typeLabel = (k) => k === 'subscription' ? '💎 Abonnement Pro' : (k === 'doctor_consultation' ? '🩺 Téléconsultation' : '⚡ Pass 24h Client');

        body.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
            <div>
              <div style="font-weight:900; color:#fbbf24; font-size:15px;">💰 Tableau de Bord Financier NotchPay &amp; KPIs</div>
              <div style="font-size:11.5px; color:#94a3b8;">Mis à jour : ${esc(new Date(data.generated_at || Date.now()).toLocaleString('fr-FR'))} · ${t.confirmed_count || 0} confirmés · ${t.pending_count || 0} en attente</div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button type="button" class="btn btn--sm btn--primary" id="pg-adm-run-cron">⚡ Exécuter Cron Rappels</button>
              <button type="button" class="btn btn--sm btn--secondary" id="pg-adm-export-tx">📥 Exporter CSV</button>
              <button type="button" class="btn btn--sm btn--secondary" id="pg-adm-refresh-rev">🔄</button>
            </div>
          </div>

          <div class="pg-admin-kpi-grid">
            <div class="pg-admin-kpi"><div class="pg-admin-kpi__label">💎 Volume Total Confirmé</div><div class="pg-admin-kpi__val pg-admin-kpi__val--gold" style="font-size:20px;">${esc(fmtFcfa(t.all_time))}</div></div>
            <div class="pg-admin-kpi"><div class="pg-admin-kpi__label">📅 30 Derniers Jours</div><div class="pg-admin-kpi__val" style="font-size:20px;">${esc(fmtFcfa(t.last_30d))}</div></div>
            <div class="pg-admin-kpi"><div class="pg-admin-kpi__label">📈 7 Derniers Jours</div><div class="pg-admin-kpi__val pg-admin-kpi__val--blue" style="font-size:20px;">${esc(fmtFcfa(t.last_7d))}</div></div>
            <div class="pg-admin-kpi"><div class="pg-admin-kpi__label">☀️ Aujourd'hui</div><div class="pg-admin-kpi__val" style="font-size:20px;">${esc(fmtFcfa(t.today))}</div></div>
            <div class="pg-admin-kpi"><div class="pg-admin-kpi__label">⚡ Taux Réponse Officines (30j)</div><div class="pg-admin-kpi__val pg-admin-kpi__val--gold" style="font-size:20px;">${ops.response_rate_pct || 0}%</div><div style="font-size:10.5px;color:#94a3b8;">${ops.answered_requests_count || 0}/${ops.requests_count || 0} demandes · ${ops.reservations_count || 0} résa</div></div>
            <div class="pg-admin-kpi"><div class="pg-admin-kpi__label">🛡️ Abonnements Pro Actifs</div><div class="pg-admin-kpi__val pg-admin-kpi__val--blue" style="font-size:20px;">${subsRole.total_active || 0}</div><div style="font-size:10.5px;color:#fbbf24;">${subsRole.expiring_7d || 0} expire(nt) sous 7j</div></div>
          </div>

          <div class="pg-admin-kpi" style="margin-bottom:14px;">
            <div style="font-weight:800; color:#34d399; font-size:13px; margin-bottom:8px;">📊 Encaissements Confirmés — 14 Derniers Jours (FCFA)</div>
            <div style="overflow-x:auto;">
              <svg viewBox="0 0 ${chartW} ${chartH}" style="width:100%; min-width:460px; height:auto; display:block;">
                <defs>
                  <linearGradient id="pgRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#fbbf24"></stop>
                    <stop offset="100%" stop-color="#10b981"></stop>
                  </linearGradient>
                </defs>
                <line x1="8" y1="${chartH - padB}" x2="${chartW - 8}" y2="${chartH - padB}" stroke="rgba(148,163,184,0.25)" stroke-width="1"></line>
                ${svgBars}
              </svg>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px; margin-bottom:14px;">
            <div class="pg-admin-kpi">
              <div style="font-weight:800; color:#fbbf24; font-size:13px; margin-bottom:10px;">🧭 Répartition par Source de Revenus</div>
              ${[
                { k: 'Pass 24h Patients (100F)', v: bd.client_pass_24h?.amount || 0, c: bd.client_pass_24h?.count || 0, col: '#34d399' },
                { k: 'Téléconsultations Médecins (2 600F)', v: bd.doctor_consultation?.amount || 0, c: bd.doctor_consultation?.count || 0, col: '#60a5fa', extra: bd.doctor_consultation?.platform_fee_est ? ` · Comm. PG ~${fmtFcfa(bd.doctor_consultation.platform_fee_est)}` : '' },
                { k: 'Abonnements Pro (5 espaces)', v: bd.subscription?.amount || 0, c: bd.subscription?.count || 0, col: '#fbbf24' }
              ].map((row) => `
                <div style="margin-bottom:9px;">
                  <div style="display:flex; justify-content:space-between; font-size:11.5px; margin-bottom:3px;">
                    <span style="color:#e2e8f0; font-weight:700;">${row.k}</span>
                    <strong style="color:${row.col};">${esc(fmtFcfa(row.v))} (${row.c})</strong>
                  </div>
                  <div style="height:6px; border-radius:999px; background:rgba(148,163,184,0.16); overflow:hidden;">
                    <div style="height:100%; width:${pct(row.v)}%; background:${row.col}; border-radius:999px;"></div>
                  </div>
                  ${row.extra ? `<div style="font-size:10px; color:#94a3b8; margin-top:2px;">${esc(row.extra)}</div>` : ''}
                </div>`).join('')}
            </div>

            <div class="pg-admin-kpi">
              <div style="font-weight:800; color:#60a5fa; font-size:13px; margin-bottom:10px;">👥 Abonnements Pro Actifs par Rôle</div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:12px;">
                <div>🏥 Officines : <strong style="color:#fff;">${subsRole.pharmacy || 0}</strong></div>
                <div>🩺 Médecins : <strong style="color:#fff;">${subsRole.doctor || 0}</strong></div>
                <div>🔬 Labos / Hôp. : <strong style="color:#fff;">${subsRole.facility || 0}</strong></div>
                <div>💼 Délégués : <strong style="color:#fff;">${subsRole.delegate || 0}</strong></div>
                <div>🏭 Grossistes : <strong style="color:#fff;">${subsRole.wholesaler || 0}</strong></div>
                <div>⏳ Expirent ≤ 7j : <strong style="color:#fbbf24;">${subsRole.expiring_7d || 0}</strong></div>
              </div>
              <div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(148,163,184,0.14); font-size:11px; color:#94a3b8;">
                🤖 Cron automatique actif chaque matin à <strong>08h00 (Douala)</strong> · Derniers rappels : <strong>${rems.length}</strong>
              </div>
            </div>
          </div>

          <div class="pg-admin-kpi" style="margin-bottom:14px;">
            <div style="font-weight:800; color:#34d399; font-size:13px; margin-bottom:8px;">🧾 Dernières Transactions NotchPay (${txs.length})</div>
            <div style="max-height:240px; overflow-y:auto;">
              <table class="pg-admin-table">
                <thead><tr><th>Date</th><th>Référence</th><th>Type</th><th>Montant</th><th>Tél.</th><th>Statut</th></tr></thead>
                <tbody>
                  ${txs.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">Aucune transaction enregistrée.</td></tr>' : txs.map((tx) => {
                    const ok = /^(successful|complete|completed|paid)$/i.test(String(tx.status || ''));
                    const fail = /^(failed|canceled|cancelled|expired)$/i.test(String(tx.status || ''));
                    const col = ok ? '#34d399' : (fail ? '#f87171' : '#fbbf24');
                    return `<tr>
                      <td style="font-size:11px; color:#94a3b8;">${esc(new Date(tx.created_at || Date.now()).toLocaleString('fr-FR'))}</td>
                      <td style="font-family:monospace; font-size:11px;">${esc(String(tx.reference || '').slice(0, 22))}</td>
                      <td>${typeLabel(tx.type)}</td>
                      <td><strong>${esc(fmtFcfa(tx.amount))}</strong></td>
                      <td style="font-size:11px;">${esc(tx.phone || '—')}</td>
                      <td><span style="color:${col}; font-weight:800;">${esc(tx.status)}</span></td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;

        const btnRefresh = document.getElementById('pg-adm-refresh-rev');
        if (btnRefresh) btnRefresh.addEventListener('click', () => renderConsoleTab());

        const btnExport = document.getElementById('pg-adm-export-tx');
        if (btnExport) {
          btnExport.addEventListener('click', () => {
            if (window.PG && PG.exportCSV) {
              PG.exportCSV('pharmagarde_revenus_notchpay.csv',
                ['Date', 'Reference', 'Type', 'Montant_FCFA', 'Operateur', 'Telephone', 'Statut'],
                txs.map((x) => [x.created_at, x.reference, x.type, x.amount, x.operator, x.phone, x.status]));
            }
          });
        }

        const btnCron = document.getElementById('pg-adm-run-cron');
        if (btnCron) {
          btnCron.addEventListener('click', async () => {
            btnCron.disabled = true;
            btnCron.textContent = '⏳ Exécution...';
            try {
              const res = await window.supabase.functions.invoke('admin-auth', {
                body: { action: 'run_subscription_reminders', token: sess.token, space: currentPageSpace() }
              });
              const st = res?.data?.result?.stats || {};
              logAudit('ADMIN_RUN_REMINDERS_CRON', JSON.stringify(st));
              notify(`✅ Cron exécuté : ${st.checked || 0} vérifiés · J-7:${st.j7_sent || 0} · J-3:${st.j3_sent || 0} · J-1:${st.j1_sent || 0} · Expirés:${st.expired_marked || 0}`, 'success');
              renderConsoleTab();
            } catch (err) {
              notify('❌ Erreur cron rappels : ' + (err.message || err), 'error');
              btnCron.disabled = false;
              btnCron.textContent = '⚡ Exécuter Cron Rappels';
            }
          });
        }
      } catch (err) {
        body.innerHTML = `<div class="pg-admin-kpi" style="border-color:rgba(239,68,68,0.45); color:#fca5a5;">❌ Erreur chargement Revenus &amp; KPIs : ${esc(err.message || err)}</div>`;
      }
      return;
    }

    // 2. WORKFLOW DE VALIDATION ONCP / ONMC / DPML / MINSANTE (Officines, Médecins, Labos/Hôpitaux, Délégués, Grossistes)
    if (currentConsoleTab === 'verification') {
      body.innerHTML = '<div style="text-align:center; padding:24px; color:#94a3b8;">⏳ Chargement de la file de validation ONCP / ONMC / DPML...</div>';
      const queue = [];
      if (window.supabase) {
        try {
          const [ph, doc, fac, del, ws] = await Promise.all([
            window.supabase.from('pharmacies').select('id, name, city, license_number, phone, verification_status').limit(40),
            window.supabase.from('doctors').select('id, title, full_name, specialty, onmc_number, city, phone, verification_status').limit(40),
            window.supabase.from('health_facilities').select('id, name, facility_type, authorization_number, city, phone, verification_status').limit(40),
            window.supabase.from('delegates').select('id, first_name, last_name, pro_card_number, phone, verification_status').limit(40),
            window.supabase.from('wholesalers').select('id, company_name, city, license_number, phone, verification_status').limit(40)
          ]);
          (ph.data || []).forEach((x) => queue.push({ role: 'pharmacy', roleLabel: '🏥 Officine', id: x.id, name: x.name, license: x.license_number || 'ONPC à vérifier', meta: x.city || x.phone || '', status: x.verification_status || getVerificationStatus('pharmacy', x.id) }));
          (doc.data || []).forEach((x) => queue.push({ role: 'doctor', roleLabel: '🩺 Médecin', id: x.id, name: `${x.title || 'Dr.'} ${x.full_name || ''}`.trim(), license: x.onmc_number || 'ONMC à vérifier', meta: `${x.specialty || ''} · ${x.city || ''}`, status: x.verification_status || getVerificationStatus('doctor', x.id) }));
          (fac.data || []).forEach((x) => queue.push({ role: 'facility', roleLabel: x.facility_type === 'laboratory' ? '🔬 Labo' : '🏥 Hôpital', id: x.id, name: x.name, license: x.authorization_number || 'MINSANTE', meta: x.city || '', status: x.verification_status || getVerificationStatus('facility', x.id) }));
          (del.data || []).forEach((x) => queue.push({ role: 'delegate', roleLabel: '💼 Délégué', id: x.id, name: `${x.first_name || ''} ${x.last_name || ''}`.trim() || 'Délégué', license: x.pro_card_number || 'Carte Pro', meta: x.phone || '', status: x.verification_status || getVerificationStatus('delegate', x.id) }));
          (ws.data || []).forEach((x) => queue.push({ role: 'wholesaler', roleLabel: '🏭 Grossiste', id: x.id, name: x.company_name, license: x.license_number || 'DPML', meta: x.city || '', status: x.verification_status || getVerificationStatus('wholesaler', x.id) }));
        } catch (e) {}
      }
      if (window.MedecinStore && typeof MedecinStore.getDoctors === 'function') {
        MedecinStore.getDoctors().forEach((d) => {
          if (!queue.some((q) => q.role === 'doctor' && q.id === d.id)) {
            queue.push({ role: 'doctor', roleLabel: '🩺 Médecin', id: d.id, name: `${d.title || 'Dr.'} ${d.full_name}`, license: d.onmc_number || 'ONMC', meta: `${d.specialty || ''} · ${d.city || ''}`, status: d.verification_status || getVerificationStatus('doctor', d.id) });
          }
        });
      }
      if (window.FacilityStore && typeof FacilityStore.getFacilities === 'function') {
        FacilityStore.getFacilities().forEach((f) => {
          if (!queue.some((q) => q.role === 'facility' && q.id === f.id)) {
            queue.push({ role: 'facility', roleLabel: f.facility_type === 'laboratory' ? '🔬 Labo' : '🏥 Hôpital', id: f.id, name: f.name, license: f.authorization_number || 'MINSANTE', meta: f.city || '', status: f.verification_status || getVerificationStatus('facility', f.id) });
          }
        });
      }
      if (window.GrossisteAuth && typeof GrossisteAuth.getDirectory === 'function') {
        GrossisteAuth.getDirectory().forEach((w) => {
          if (!queue.some((q) => q.role === 'wholesaler' && q.id === w.id)) {
            queue.push({ role: 'wholesaler', roleLabel: '🏭 Grossiste', id: w.id, name: w.company_name, license: w.license_number || 'DPML', meta: w.city || '', status: getVerificationStatus('wholesaler', w.id) });
          }
        });
      }

      const verifiedCount = queue.filter((q) => q.status === 'verified').length;
      const pendingCount = queue.filter((q) => q.status === 'pending').length;

      body.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          <div>
            <div style="font-weight:800; color:#fbbf24; font-size:14px;">✅ Workflow de Certification ONCP / DPML</div>
            <div style="font-size:12px; color:#94a3b8;">Vérifiez les agréments avant d'attribuer le badge public <strong>✓ Vérifié ONCP/DPML</strong>.</div>
          </div>
          <div style="display:flex; gap:8px; font-size:12px; font-weight:800;">
            <span style="color:#fbbf24;">⏳ ${pendingCount} en attente</span>
            <span style="color:#34d399;">✓ ${verifiedCount} certifié(s)</span>
          </div>
        </div>
        <div style="overflow-x:auto;">
          <table class="pg-admin-table">
            <thead><tr><th>Acteur</th><th>Nom &amp; Zone</th><th>Agrément ONCP / DPML</th><th>Statut</th><th>Décision Admin</th></tr></thead>
            <tbody>
              ${queue.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">Aucun dossier trouvé.</td></tr>' : queue.map((q) => {
                const stHtml = q.status === 'verified'
                  ? '<span style="color:#34d399; font-weight:800;">✓ Certifié</span>'
                  : (q.status === 'rejected' ? '<span style="color:#f87171; font-weight:800;">🚫 Rejeté</span>' : '<span style="color:#fbbf24; font-weight:800;">⏳ En attente</span>');
                return `<tr>
                  <td><strong>${q.roleLabel}</strong></td>
                  <td><strong>${esc(q.name)}</strong><div style="font-size:11px;color:#94a3b8;">${esc(q.meta)}</div></td>
                  <td style="font-family:monospace; color:#93c5fd;">${esc(q.license)}</td>
                  <td>${stHtml}</td>
                  <td>
                    <div style="display:flex; gap:5px; flex-wrap:wrap;">
                      <button type="button" class="btn btn--sm btn--primary" data-ver-act="verified" data-ver-role="${esc(q.role)}" data-ver-id="${esc(q.id)}" data-ver-name="${esc(q.name)}" style="padding:4px 8px; font-size:11px;">✓ Certifier</button>
                      <button type="button" class="btn btn--sm btn--secondary" data-ver-act="pending" data-ver-role="${esc(q.role)}" data-ver-id="${esc(q.id)}" data-ver-name="${esc(q.name)}" style="padding:4px 8px; font-size:11px;">⏳</button>
                      <button type="button" class="btn btn--sm" data-ver-act="rejected" data-ver-role="${esc(q.role)}" data-ver-id="${esc(q.id)}" data-ver-name="${esc(q.name)}" style="padding:4px 8px; font-size:11px; background:rgba(239,68,68,0.14); color:#f87171; border:1px solid rgba(239,68,68,0.35);">🚫</button>
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      body.querySelectorAll('[data-ver-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
          setActorVerification(btn.dataset.verRole, btn.dataset.verId, btn.dataset.verName, btn.dataset.verAct);
        });
      });
      return;
    }

    // 3. MODÉRATION OFFICINES
    if (currentConsoleTab === 'pharmacies') {
      body.innerHTML = '<div style="text-align:center; padding:24px; color:#94a3b8;">⏳ Chargement des officines Supabase...</div>';
      let rows = [];
      if (window.supabase) {
        try {
          const { data } = await window.supabase.from('pharmacies').select('id, name, city, quarter, phone, status, is_open, is_on_duty, lat, lng').order('created_at', { ascending: false }).limit(60);
          rows = data || [];
        } catch (e) {}
      }
      if (!rows.length) { body.innerHTML = '<div style="text-align:center; padding:24px; color:#94a3b8;">Aucune officine trouvée dans Supabase.</div>'; return; }
      body.innerHTML = `
        <div style="margin-bottom:12px;"><input type="text" id="pg-adm-ph-filter" class="form-input" placeholder="🔍 Filtrer une officine par nom ou ville..."></div>
        <div style="overflow-x:auto;">
          <table class="pg-admin-table">
            <thead><tr><th>Officine</th><th>Ville / Quartier</th><th>Statut</th><th>Actions Admin</th></tr></thead>
            <tbody id="pg-adm-ph-tbody">
              ${rows.map((p) => {
                const st = p.is_on_duty ? '🌙 Garde' : (p.is_open !== false ? '🟢 Ouverte' : '🔴 Fermée');
                return `<tr data-search="${esc((p.name + ' ' + (p.city || '') + ' ' + (p.quarter || '')).toLowerCase())}">
                  <td><strong>${esc(p.name)}</strong> ${verifiedBadge('pharmacy', p.id)}<div style="font-size:11px; color:#94a3b8;">${esc(p.phone || '')}</div></td>
                  <td>${esc(p.city || '—')} ${p.quarter ? '· ' + esc(p.quarter) : ''}</td>
                  <td>${st}</td>
                  <td>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                      <button type="button" class="btn btn--sm" data-adm-status="open" data-pid="${esc(p.id)}" style="padding:4px 8px; font-size:11px;">🟢</button>
                      <button type="button" class="btn btn--sm" data-adm-status="guard" data-pid="${esc(p.id)}" style="padding:4px 8px; font-size:11px;">🌙</button>
                      <button type="button" class="btn btn--sm" data-adm-status="closed" data-pid="${esc(p.id)}" style="padding:4px 8px; font-size:11px;">🔴</button>
                      ${currentPageSpace() === 'pharmacy' ? `<button type="button" class="btn btn--sm btn--primary" data-adm-impersonate="${esc(p.id)}" style="padding:4px 8px; font-size:11px;">👁️ Inspecter</button>` : ''}
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
      const filterInp = document.getElementById('pg-adm-ph-filter');
      if (filterInp) filterInp.addEventListener('input', () => {
        const q = filterInp.value.trim().toLowerCase();
        body.querySelectorAll('#pg-adm-ph-tbody tr').forEach((tr) => { tr.style.display = (!q || (tr.dataset.search || '').includes(q)) ? '' : 'none'; });
      });
      body.querySelectorAll('[data-adm-status]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const pid = btn.dataset.pid, st = btn.dataset.admStatus;
          try {
            await window.supabase.from('pharmacies').update({ status: st, is_open: st !== 'closed', is_on_duty: st === 'guard' }).eq('id', pid);
            logAudit('ADMIN_PHARMACY_STATUS', `${pid} -> ${st}`);
            if (window.PGPharmacyService) PGPharmacyService.invalidate();
            notify(`✅ Statut mis à jour : ${st}`, 'success');
            renderConsoleTab();
          } catch (e) { notify('❌ Erreur mise à jour statut : ' + e.message, 'error'); }
        });
      });
      body.querySelectorAll('[data-adm-impersonate]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const found = rows.find((x) => String(x.id) === btn.dataset.admImpersonate);
          if (found) { closeModals(); enterCurrentSpaceAsAdmin(found); }
        });
      });
      return;
    }

    // 4. GESTION DES SUPER-ADMINISTRATEURS (INSCRIRE / SUPPRIMER)
    if (currentConsoleTab === 'admins') {
      const admins = getAdminsRegistry();
      body.innerHTML = `
        <div class="pg-admin-kpi" style="margin-bottom:16px;">
          <div style="font-weight:800; color:#fbbf24; margin-bottom:10px;">➕ Inscrire un Nouveau Super-Administrateur</div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:8px; margin-bottom:10px;">
            <input type="text" id="new-adm-name" class="form-input" placeholder="Nom complet *">
            <input type="email" id="new-adm-email" class="form-input" placeholder="Email administrateur *">
            <select id="new-adm-role" class="form-input form-select">
              <option value="super_admin">👑 Super-Administrateur (Accès total)</option>
              <option value="moderator">🛡️ Modérateur ONCP / DPML</option>
            </select>
            <input type="password" id="new-adm-code" class="form-input" placeholder="Code d'accès (8 car. min.) *">
          </div>
          <button type="button" class="btn btn--primary btn--sm" id="btn-create-super-admin">👑 Inscrire cet Administrateur</button>
        </div>

        <div class="pg-admin-kpi">
          <div style="font-weight:800; color:#34d399; margin-bottom:10px;">👥 Liste des Super-Administrateurs (${admins.length})</div>
          <div style="overflow-x:auto;">
            <table class="pg-admin-table">
              <thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Créé le</th><th>Action</th></tr></thead>
              <tbody>
                ${admins.map((a) => `
                  <tr>
                    <td><strong>${esc(a.full_name)}</strong> ${a.is_founder ? '<span style="color:#fbbf24; font-size:10.5px;">(Fondateur)</span>' : ''}</td>
                    <td>${esc(a.email)}</td>
                    <td><span style="color:${a.role === 'super_admin' ? '#fbbf24' : '#60a5fa'}; font-weight:800;">${a.role === 'super_admin' ? '👑 Super-Admin' : '🛡️ Modérateur'}</span></td>
                    <td style="font-size:11px; color:#94a3b8;">${esc(new Date(a.created_at || Date.now()).toLocaleDateString('fr-FR'))}</td>
                    <td>
                      ${a.is_founder
                        ? '<span style="font-size:11px; color:#64748b;">Protégé</span>'
                        : `<button type="button" class="btn btn--sm" data-del-adm="${esc(a.id)}" style="padding:4px 9px; font-size:11px; background:rgba(239,68,68,0.14); color:#f87171; border:1px solid rgba(239,68,68,0.35);">🗑️ Supprimer</button>`}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      document.getElementById('btn-create-super-admin').addEventListener('click', async () => {
        const name = (document.getElementById('new-adm-name').value || '').trim();
        const email = (document.getElementById('new-adm-email').value || '').trim().toLowerCase();
        const role = document.getElementById('new-adm-role').value || 'super_admin';
        const code = (document.getElementById('new-adm-code').value || '').trim();
        if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || code.length < 8) {
          notify('⚠️ Nom, email valide et code d\'accès (8 caractères min.) requis.', 'error');
          return;
        }
        const list = getAdminsRegistry();
        if (list.some((x) => (x.email || '').toLowerCase() === email)) {
          notify('⚠️ Un administrateur existe déjà avec cet email.', 'error');
          return;
        }
        const hash = await sha256Hex(code);
        const sess = getSession();
        const entry = {
          id: 'adm_' + Date.now(),
          full_name: name,
          email,
          role,
          is_founder: false,
          is_active: true,
          access_code_hash: hash,
          added_by: (sess && sess.email) || 'super_admin',
          created_at: new Date().toISOString()
        };
        list.push(entry);
        saveAdminsRegistry(list);

        if (window.supabase) {
          try {
            await window.supabase.from('platform_admins').upsert([{
              email: entry.email,
              full_name: entry.full_name,
              role: entry.role,
              is_active: true,
              access_code_hash: entry.access_code_hash,
              added_by: entry.added_by
            }], { onConflict: 'email' });
          } catch (e) {}
        }

        logAudit('ADMIN_ADDED', `${name} <${email}> (${role})`);
        notify(`👑 Administrateur ${name} inscrit avec succès !`, 'success');
        renderConsoleTab();
      });

      body.querySelectorAll('[data-del-adm]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const targetId = btn.dataset.delAdm;
          const list = getAdminsRegistry();
          const target = list.find((a) => a.id === targetId);
          if (!target) return;
          const superAdminsLeft = list.filter((a) => a.role === 'super_admin' && a.is_active !== false && a.id !== targetId).length;
          if (target.role === 'super_admin' && superAdminsLeft < 1) {
            notify('⚠️ Impossible de supprimer le dernier Super-Administrateur actif.', 'error');
            return;
          }
          const ok = (window.PG && PG.confirmModal)
            ? await PG.confirmModal('Supprimer cet administrateur', `Révoquer définitivement l'accès de ${target.full_name} (${target.email}) ?`)
            : true;
          if (!ok) return;

          saveAdminsRegistry(list.filter((a) => a.id !== targetId));
          if (window.supabase) {
            try {
              const curSess = getSession();
              if (window.supabase.functions && curSess && curSess.token) {
                await window.supabase.functions.invoke('admin-auth', {
                  body: { action: 'remove_admin', token: curSess.token, email: target.email, space: currentPageSpace() }
                });
              } else {
                await window.supabase.from('platform_admins').delete().eq('email', target.email);
              }
            } catch (e) {}
          }
          logAudit('ADMIN_DELETED', `${target.full_name} <${target.email}>`);
          notify(`🗑️ Accès administrateur de ${target.full_name} supprimé.`, 'info');
          renderConsoleTab();
        });
      });
      return;
    }

    // 5. ABONNEMENTS
    if (currentConsoleTab === 'subs') {
      body.innerHTML = `
        <div class="pg-admin-kpi">
          <div style="font-weight:800; color:#fbbf24; margin-bottom:6px;">👑 Privilèges Abonnements &amp; Paywalls</div>
          <p style="font-size:12.5px; color:#cbd5e1; margin:0 0 12px;">
            Tant que la session Administrateur est active, tous les paywalls (Pass Patient 100 FCFA, Abonnement Délégué, Licence Officine et Grossiste B2B) sont automatiquement débloqués.
          </p>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="btn btn--sm btn--primary" data-grant-role="doctor" data-grant-days="365">🩺 Activer Pro Médecin (+365j)</button>
            <button type="button" class="btn btn--sm btn--primary" data-grant-role="facility" data-grant-days="365">🔬 Activer Pro Labo/Hôp. (+365j)</button>
            <button type="button" class="btn btn--sm btn--primary" data-grant-role="delegate" data-grant-days="365">💼 Activer Pro Délégué (+365j)</button>
            <button type="button" class="btn btn--sm btn--primary" data-grant-role="wholesaler" data-grant-days="365">🏭 Activer Pro Grossiste (+365j)</button>
            <button type="button" class="btn btn--sm btn--primary" data-grant-role="pharmacy" data-grant-days="365">🏥 Activer Pro Officine (+365j)</button>
          </div>
        </div>
      `;
      body.querySelectorAll('[data-grant-role]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const role = btn.dataset.grantRole, days = Number(btn.dataset.grantDays) || 365;
          const exp = Date.now() + days * 24 * 3600 * 1000;
          const keys = Object.keys(localStorage).filter((k) => k.startsWith('pharmagarde_sub_' + role + '_'));
          if (!keys.length) keys.push('pharmagarde_sub_' + role + '_admin_' + role);
          keys.forEach((k) => localStorage.setItem(k, JSON.stringify({
            subscriberId: k.replace('pharmagarde_sub_' + role + '_', ''), role, status: 'active',
            planId: 'annual', planLabel: 'Licence Admin Pro (365j)', startsAt: Date.now(), expiresAt: exp, reference: 'ADMIN_GRANT_' + Date.now()
          })));
          logAudit('ADMIN_GRANT_SUB', `${role} +${days}j`);
          notify(`✅ Licence Pro ${role} activée pour ${days} jours.`, 'success');
        });
      });
      return;
    }

    // 6. SÉCURITÉ & AUDIT
    if (currentConsoleTab === 'security') {
      const logs = getAuditLogs();
      body.innerHTML = `
        <div style="display:grid; gap:16px;">
          <div class="pg-admin-kpi">
            <div style="font-weight:800; color:#fbbf24; margin-bottom:8px;">🔑 Modifier votre Code Maître Administrateur (SHA-256)</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <input type="password" id="pg-adm-new-code" class="form-input" placeholder="Nouveau code maître (min. 8 caractères)" style="flex:1; min-width:220px;">
              <button type="button" class="btn btn--primary btn--sm" id="pg-adm-save-code">💾 Mettre à jour le Code</button>
            </div>
          </div>
          <div class="pg-admin-kpi">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
              <div style="font-weight:800; color:#34d399;">📜 Journal d'Audit Administrateur (${logs.length})</div>
              <div style="display:flex; gap:8px;">
                <button type="button" class="btn btn--secondary btn--sm" id="pg-adm-clear-cache">🧹 Vider Caches Locaux</button>
                <button type="button" class="btn btn--secondary btn--sm" id="pg-adm-export-audit">📥 Exporter Audit CSV</button>
              </div>
            </div>
            <div style="max-height:220px; overflow-y:auto;">
              <table class="pg-admin-table">
                <thead><tr><th>Date</th><th>Admin</th><th>Espace</th><th>Action</th><th>Détails</th></tr></thead>
                <tbody>
                  ${logs.slice(0, 35).map((l) => `<tr><td>${esc(new Date(l.ts).toLocaleString('fr-FR'))}</td><td>${esc(l.actor || 'admin')}</td><td>${esc(l.space)}</td><td><strong>${esc(l.action)}</strong></td><td>${esc(l.details)}</td></tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">Aucune entrée</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
      document.getElementById('pg-adm-save-code').addEventListener('click', async () => {
        const val = (document.getElementById('pg-adm-new-code').value || '').trim();
        if (val.length < 8) { notify('⚠️ Le code maître doit contenir au moins 8 caractères.', 'error'); return; }
        const h = await sha256Hex(val);
        const sess = getSession();
        if (window.supabase && window.supabase.functions && sess && sess.token) {
          try {
            await window.supabase.functions.invoke('admin-auth', {
              body: { action: 'change_master_code', token: sess.token, new_code: val, space: currentPageSpace() }
            });
          } catch (e) {}
        }
        localStorage.setItem(HASH_KEY, h);
        const list = getAdminsRegistry();
        const founder = list.find((a) => a.is_founder);
        if (founder) { founder.access_code_hash = h; saveAdminsRegistry(list); }
        document.getElementById('pg-adm-new-code').value = '';
        logAudit('ADMIN_CODE_CHANGED', 'Mise à jour de l\'empreinte SHA-256 (serveur + local)');
        notify('✅ Code Maître Administrateur mis à jour avec succès.', 'success');
      });
      document.getElementById('pg-adm-clear-cache').addEventListener('click', async () => {
        Object.keys(localStorage).forEach((k) => { if (k.startsWith('pg_osm_') || k.startsWith('pg_loc_') || k.startsWith('pg_reg_')) localStorage.removeItem(k); });
        if ('caches' in window) { const names = await caches.keys(); await Promise.all(names.map((n) => caches.delete(n))); }
        logAudit('ADMIN_CLEAR_CACHE', 'Caches GPS/OSM/SW purgés');
        notify('🧹 Caches locaux et Service Worker purgés.', 'success');
      });
      document.getElementById('pg-adm-export-audit').addEventListener('click', () => {
        if (window.PG && PG.exportCSV) {
          PG.exportCSV('pharmagarde_admin_audit.csv', ['Date', 'Admin', 'Espace', 'Action', 'Details'],
            logs.map((l) => [l.ts, l.actor || 'admin', l.space, l.action, l.details]));
        }
      });
    }
  }

  function injectTriggers() {
    const space = currentPageSpace();
    const quick = document.querySelector('.welcome-screen__quick-actions');
    if (quick && !document.getElementById('btn-welcome-admin')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'btn-welcome-admin';
      btn.className = 'welcome-quick-btn';
      btn.style.cssText = 'border-color:rgba(251,191,36,0.55)!important; color:#fbbf24!important; background:rgba(251,191,36,0.10)!important;';
      btn.innerHTML = '<span>👑</span> <span>Accès Administrateur</span>';
      btn.addEventListener('click', () => openUnlockModal(openConsoleModal));
      quick.appendChild(btn);
    }
    ['login-form', 'g-login-form', 'doc-login-form', 'fac-login-form'].forEach((id) => {
      const form = document.getElementById(id);
      if (form && !form.querySelector('.pg-admin-trigger')) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pg-admin-trigger';
        b.textContent = '👑 Accès Privilégié Administrateur';
        b.addEventListener('click', () => enterCurrentSpaceAsAdmin());
        form.appendChild(b);
      }
    });
    if (isAdmin()) {
      renderFloatingBar();
      applySpacePrivileges();
      if (location.search.includes('admin=1') && space !== 'client') setTimeout(() => enterCurrentSpaceAsAdmin(), 250);
    }
  }

  function init() {
    injectTriggers();
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        if (isAdmin()) openConsoleModal(); else openUnlockModal(openConsoleModal);
      }
    });
  }

  window.PGAdmin = {
    isAdmin,
    getSession,
    authenticate,
    logout,
    openUnlockModal,
    openConsoleModal,
    enterCurrentSpaceAsAdmin,
    logAudit,
    isVerified,
    verifiedBadge,
    getVerificationStatus
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
