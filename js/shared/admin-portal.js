/**
 * Pharma-Garde v10.0 — Portail Privilégié Super-Administrateur Plateforme
 * ───────────────────────────────────────────────────────────────────────
 * • Accès privilégié sécurisé (empreinte SHA-256 + vérification optionnelle
 *   Supabase `platform_admins` + protection anti-bruteforce) dans les 4 espaces :
 *     1. Espace Patient (Pass 24h Admin illimité sans paiement)
 *     2. Espace Pharmacie (Connexion directe & inspection de toute officine)
 *     3. Espace Délégué Médical (Connexion directe & licence Pro Admin active)
 *     4. Espace Grossiste B2B (Connexion directe, bascule entre hubs & licence Admin)
 * • Barre flottante inter-espaces + Console Super-Admin temps réel (KPIs,
 *   modération des officines, gestion des abonnements, santé système & audit CSV).
 *
 * Expose : window.PGAdmin
 */
(function (window) {
  'use strict';

  const SESSION_KEY = 'pharmagarde_super_admin_session';
  const HASH_KEY = 'pharmagarde_super_admin_hash_v10';
  const AUDIT_KEY = 'pharmagarde_super_admin_audit';
  const LOCK_KEY = 'pharmagarde_super_admin_lock';
  const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 heures
  const SALT = 'PG_CM_SUPERADMIN_V10::';

  // Empreinte SHA-256 salée du code maître initial (aucun secret en clair dans le bundle)
  const DEFAULT_MASTER_HASH = '7ffec7cb477954650c215b3ef13ae2d04b15e7d70d25003096fe290a628f0c22';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function currentPageSpace() {
    const p = (location.pathname || '').toLowerCase();
    if (p.includes('pharmacien')) return 'pharmacy';
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
    // Fallback JS si contexte non sécurisé (local file://)
    let h = 2166136261;
    for (let i = 0; i < data.length; i++) {
      h ^= data[i];
      h = Math.imul(h, 16777619);
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  function getExpectedHash() {
    try {
      return localStorage.getItem(HASH_KEY) || DEFAULT_MASTER_HASH;
    } catch (e) {
      return DEFAULT_MASTER_HASH;
    }
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
    } catch (e) {
      return null;
    }
  }

  function isAdmin() {
    return !!getSession();
  }

  function logAudit(action, details) {
    try {
      const list = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
      list.unshift({
        ts: new Date().toISOString(),
        space: currentPageSpace(),
        action: String(action || ''),
        details: String(details || '')
      });
      localStorage.setItem(AUDIT_KEY, JSON.stringify(list.slice(0, 120)));
    } catch (e) {}
  }

  function getAuditLogs() {
    try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); } catch (e) { return []; }
  }

  function notify(msg, type) {
    if (window.PG && typeof PG.toast === 'function') {
      PG.toast(msg, type || 'success');
      return;
    }
    const t = document.getElementById('toast');
    const m = document.getElementById('toast-message');
    if (t && m) {
      t.className = 'toast toast--' + (type || 'success');
      m.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 3600);
    }
  }

  function checkBruteForceLock() {
    try {
      const state = JSON.parse(sessionStorage.getItem(LOCK_KEY) || '{"fails":0,"until":0}');
      if (state.until && Date.now() < state.until) {
        return Math.ceil((state.until - Date.now()) / 1000);
      }
      return 0;
    } catch (e) { return 0; }
  }

  function recordAuthFailure() {
    try {
      const state = JSON.parse(sessionStorage.getItem(LOCK_KEY) || '{"fails":0,"until":0}');
      state.fails = (state.fails || 0) + 1;
      if (state.fails >= 5) {
        state.until = Date.now() + 60000;
        state.fails = 0;
      }
      sessionStorage.setItem(LOCK_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function clearAuthFailures() {
    try { sessionStorage.removeItem(LOCK_KEY); } catch (e) {}
  }

  async function authenticate(masterCode, adminEmail) {
    const lockedSec = checkBruteForceLock();
    if (lockedSec > 0) {
      throw new Error(`Trop de tentatives. Réessayez dans ${lockedSec}s.`);
    }

    const code = String(masterCode || '').trim();
    if (!code) throw new Error('Veuillez saisir le code maître Administrateur.');

    const computed = await sha256Hex(code);
    let verified = (computed === getExpectedHash());

    // Vérification optionnelle côté Supabase (table `platform_admins` ou `app_metadata.role`)
    if (!verified && window.supabase && adminEmail) {
      try {
        const { data: authData } = await window.supabase.auth.signInWithPassword({
          email: adminEmail.trim().toLowerCase(),
          password: code
        });
        if (authData && authData.user) {
          const role = authData.user.app_metadata && authData.user.app_metadata.role;
          if (role === 'super_admin' || role === 'admin') {
            verified = true;
          } else {
            const { data: row } = await window.supabase
              .from('platform_admins')
              .select('id, is_active')
              .eq('email', adminEmail.trim().toLowerCase())
              .eq('is_active', true)
              .maybeSingle();
            if (row) verified = true;
          }
        }
      } catch (e) {}
    }

    if (!verified) {
      recordAuthFailure();
      throw new Error('Code Administrateur invalide.');
    }

    clearAuthFailures();
    const session = {
      role: 'super_admin',
      email: (adminEmail || 'admin@pharmagarde.cm').trim().toLowerCase(),
      startedAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    logAudit('ADMIN_LOGIN', `Connexion privilégiée (${currentPageSpace()})`);
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

  // ════════════════════════════════════════════════════════════════
  // PRIVILÈGES AUTOMATIQUES DANS CHAQUE ESPACE
  // ════════════════════════════════════════════════════════════════
  async function enterCurrentSpaceAsAdmin(customTarget) {
    if (!isAdmin()) {
      openUnlockModal(() => enterCurrentSpaceAsAdmin(customTarget));
      return;
    }
    const space = currentPageSpace();
    logAudit('ADMIN_ENTER_SPACE', space);

    if (space === 'pharmacy') {
      if (window.PharmDash && typeof window.PharmDash.adminEnter === 'function') {
        await window.PharmDash.adminEnter(customTarget);
        notify('👑 Accès Administrateur Espace Pharmacie activé', 'success');
      }
    } else if (space === 'delegate') {
      if (window.DelegateApp && typeof window.DelegateApp.adminEnter === 'function') {
        await window.DelegateApp.adminEnter();
        notify('👑 Accès Administrateur Espace Délégué activé (Licence Illimitée)', 'success');
      }
    } else if (space === 'wholesaler') {
      if (window.GrossisteApp && typeof window.GrossisteApp.adminEnter === 'function') {
        await window.GrossisteApp.adminEnter(customTarget);
        notify('👑 Accès Administrateur Espace Grossiste B2B activé', 'success');
      }
    } else if (space === 'client') {
      if (window.Payment && typeof window.Payment.createSession === 'function') {
        window.Payment.createSession('ADMIN_PASS_' + Date.now(), '694929909');
      }
      const ws = document.getElementById('welcome-screen');
      if (ws && !ws.classList.contains('hidden')) {
        const btn = document.getElementById('btn-espace-client');
        if (btn) btn.click();
      }
      if (window.App && typeof window.App.updateSessionUI === 'function') {
        window.App.updateSessionUI();
      }
      notify('👑 Pass Admin Illimité activé sur l\'Espace Patient (0 FCFA)', 'success');
    }
  }

  function applySpacePrivileges() {
    if (!isAdmin()) return;
    // Sur l'Espace Patient, activer automatiquement le Pass 24h Admin
    if (currentPageSpace() === 'client' && window.Payment && !window.Payment.hasActiveSession()) {
      window.Payment.createSession('ADMIN_PASS_' + Date.now(), '694929909');
    }
  }

  // ════════════════════════════════════════════════════════════════
  // BARRE FLOTTANTE SUPER-ADMIN (INTER-ESPACES)
  // ════════════════════════════════════════════════════════════════
  function renderFloatingBar() {
    let bar = document.getElementById('pg-admin-floating-bar');
    if (!isAdmin()) {
      if (bar) bar.remove();
      return;
    }
    if (bar) bar.remove();

    const space = currentPageSpace();
    bar = document.createElement('div');
    bar.id = 'pg-admin-floating-bar';
    bar.className = 'pg-admin-bar';
    bar.innerHTML = `
      <span class="pg-admin-bar__badge">👑 ADMIN</span>
      <a href="index.html" class="pg-admin-bar__btn ${space === 'client' ? 'active' : ''}">👤 Patient</a>
      <a href="pharmacien.html" class="pg-admin-bar__btn ${space === 'pharmacy' ? 'active' : ''}">🏥 Pharmacie</a>
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

  // ════════════════════════════════════════════════════════════════
  // MODALE DE DÉVERROUILLAGE ADMIN
  // ════════════════════════════════════════════════════════════════
  let pendingSuccessCallback = null;

  function closeModals() {
    ['pg-admin-unlock-overlay', 'pg-admin-console-overlay'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });
  }

  function openUnlockModal(onSuccess) {
    if (isAdmin()) {
      if (typeof onSuccess === 'function') onSuccess();
      else openConsoleModal();
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
              Identifiez-vous comme Administrateur de la plateforme Pharma-Garde pour accéder en mode privilégié aux 4 espaces et à la console globale.
            </p>
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label" style="color:#fbbf24;">Email Administrateur (optionnel)</label>
              <input type="email" id="pg-admin-email-input" class="form-input" placeholder="admin@pharmagarde.cm" autocomplete="username">
            </div>
            <div class="form-group" style="margin-bottom:14px;">
              <label class="form-label" style="color:#fbbf24;">Code Maître Administrateur *</label>
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
          if (pendingSuccessCallback) {
            const cb = pendingSuccessCallback;
            pendingSuccessCallback = null;
            cb();
          } else {
            openConsoleModal();
          }
        } catch (err) {
          errEl.textContent = '❌ ' + (err.message || 'Accès refusé');
          errEl.style.display = 'block';
        }
      };

      document.getElementById('pg-admin-unlock-submit').addEventListener('click', submit);
      document.getElementById('pg-admin-code-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
      });
    }

    overlay.classList.add('active');
    setTimeout(() => {
      const inp = document.getElementById('pg-admin-code-input');
      if (inp) inp.focus();
    }, 80);
  }

  // ════════════════════════════════════════════════════════════════
  // CONSOLE SUPER-ADMIN GLOBALE (4 ONGLETS)
  // ════════════════════════════════════════════════════════════════
  let currentConsoleTab = 'overview';

  function openConsoleModal() {
    if (!isAdmin()) {
      openUnlockModal(openConsoleModal);
      return;
    }
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
              <div style="font-size:11.5px; color:#94a3b8; margin-top:2px;">Pilotage global temps réel · Modération · Licences · Sécurité</div>
            </div>
            <button type="button" class="btn btn--icon" id="pg-admin-console-close" style="color:#94a3b8;">✕</button>
          </div>
          <div class="pg-admin-modal__tabs">
            <button type="button" class="pg-admin-tab active" data-atab="overview">📊 Vue Globale</button>
            <button type="button" class="pg-admin-tab" data-atab="pharmacies">🏥 Modération Officines</button>
            <button type="button" class="pg-admin-tab" data-atab="subs">💳 Abonnements &amp; Accès</button>
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
      if (error) return '—';
      return count != null ? count : 0;
    } catch (e) { return '—'; }
  }

  async function renderConsoleTab() {
    const body = document.getElementById('pg-admin-console-body');
    if (!body) return;

    if (currentConsoleTab === 'overview') {
      body.innerHTML = '<div style="text-align:center; padding:28px; color:#94a3b8;">⏳ Chargement des indicateurs plateforme...</div>';
      const t0 = performance.now();
      const [phTotal, phGuard, reqTotal, respTotal, resTotal, delTotal, wsTotal, ordTotal] = await Promise.all([
        safeCount('pharmacies'),
        safeCount('pharmacies', (q) => q.eq('is_on_duty', true)),
        safeCount('requests'),
        safeCount('responses'),
        safeCount('reservations'),
        safeCount('delegates'),
        safeCount('wholesalers'),
        safeCount('wholesaler_orders')
      ]);
      const pingMs = Math.round(performance.now() - t0);

      body.innerHTML = `
        <div class="pg-admin-kpi-grid">
          <div class="pg-admin-kpi"><div class="pg-admin-kpi__label">🏥 Officines inscrites</div><div class="pg-admin-kpi__val">${esc(phTotal)}</div></div>
          <div class="pg-admin-kpi"><div class="pg-admin-kpi__label">🌙 Officines de garde</div><div class="pg-admin-kpi__val pg-admin-kpi__val--gold">${esc(phGuard)}</div></div>
          <div class="pg-admin-kpi"><div class="pg-admin-kpi__label">🔍 Demandes Patients</div><div class="pg-admin-kpi__val pg-admin-kpi__val--blue">${esc(reqTotal)}</div></div>
          <div class="pg-admin-kpi"><div class="pg-admin-kpi__label">✅ Réponses &amp; Réservations</div><div class="pg-admin-kpi__val">${esc(respTotal)} / ${esc(resTotal)}</div></div>
          <div class="pg-admin-kpi"><div class="pg-admin-kpi__label">💼 Délégués Médicaux</div><div class="pg-admin-kpi__val pg-admin-kpi__val--blue">${esc(delTotal)}</div></div>
          <div class="pg-admin-kpi"><div class="pg-admin-kpi__label">🏭 Grossistes / Cmd B2B</div><div class="pg-admin-kpi__val pg-admin-kpi__val--gold">${esc(wsTotal)} / ${esc(ordTotal)}</div></div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between; padding:14px; border-radius:14px; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.3);">
          <div>
            <div style="font-weight:800; color:#34d399; font-size:13.5px;">⚡ Accès Rapide Privilégié aux 4 Espaces</div>
            <div style="font-size:12px; color:#94a3b8; margin-top:2px;">Latence Supabase mesurée : <strong style="color:#fff;">${pingMs} ms</strong> · Session Admin active</div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="btn btn--sm btn--primary" id="pg-adm-go-cur">👑 Ouvrir cet espace en Admin</button>
            <a href="pharmacien.html?admin=1" class="btn btn--sm btn--secondary">🏥 Pharmacie</a>
            <a href="delegue.html?admin=1" class="btn btn--sm btn--secondary">💼 Délégué</a>
            <a href="grossiste.html?admin=1" class="btn btn--sm btn--secondary">🏭 Grossiste</a>
          </div>
        </div>
      `;
      const goCur = document.getElementById('pg-adm-go-cur');
      if (goCur) goCur.addEventListener('click', () => { closeModals(); enterCurrentSpaceAsAdmin(); });
      return;
    }

    if (currentConsoleTab === 'pharmacies') {
      body.innerHTML = '<div style="text-align:center; padding:24px; color:#94a3b8;">⏳ Chargement des officines Supabase...</div>';
      let rows = [];
      if (window.supabase) {
        try {
          const { data } = await window.supabase.from('pharmacies').select('id, name, city, quarter, phone, status, is_open, is_on_duty, lat, lng').order('created_at', { ascending: false }).limit(60);
          rows = data || [];
        } catch (e) {}
      }
      if (!rows.length) {
        body.innerHTML = '<div style="text-align:center; padding:24px; color:#94a3b8;">Aucune officine trouvée dans Supabase (ou table inaccessible).</div>';
        return;
      }
      body.innerHTML = `
        <div style="margin-bottom:12px; display:flex; gap:8px;">
          <input type="text" id="pg-adm-ph-filter" class="form-input" placeholder="🔍 Filtrer une officine par nom ou ville...">
        </div>
        <div style="overflow-x:auto;">
          <table class="pg-admin-table">
            <thead>
              <tr><th>Officine</th><th>Ville / Quartier</th><th>Statut</th><th>Actions Admin</th></tr>
            </thead>
            <tbody id="pg-adm-ph-tbody">
              ${rows.map((p) => {
                const st = p.is_on_duty ? '🌙 Garde' : (p.is_open !== false ? '🟢 Ouverte' : '🔴 Fermée');
                return `
                  <tr data-search="${esc((p.name + ' ' + (p.city || '') + ' ' + (p.quarter || '')).toLowerCase())}">
                    <td><strong>${esc(p.name)}</strong><div style="font-size:11px; color:#94a3b8;">${esc(p.phone || '')}</div></td>
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
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      const filterInp = document.getElementById('pg-adm-ph-filter');
      if (filterInp) {
        filterInp.addEventListener('input', () => {
          const q = filterInp.value.trim().toLowerCase();
          body.querySelectorAll('#pg-adm-ph-tbody tr').forEach((tr) => {
            tr.style.display = (!q || (tr.dataset.search || '').includes(q)) ? '' : 'none';
          });
        });
      }

      body.querySelectorAll('[data-adm-status]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const pid = btn.dataset.pid;
          const st = btn.dataset.admStatus;
          try {
            await window.supabase.from('pharmacies').update({
              status: st,
              is_open: st !== 'closed',
              is_on_duty: st === 'guard'
            }).eq('id', pid);
            logAudit('ADMIN_PHARMACY_STATUS', `${pid} -> ${st}`);
            if (window.PGPharmacyService) window.PGPharmacyService.invalidate();
            notify(`✅ Statut mis à jour : ${st}`, 'success');
            renderConsoleTab();
          } catch (e) {
            notify('❌ Erreur mise à jour statut : ' + e.message, 'error');
          }
        });
      });

      body.querySelectorAll('[data-adm-impersonate]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const found = rows.find((x) => String(x.id) === btn.dataset.admImpersonate);
          if (found) {
            closeModals();
            enterCurrentSpaceAsAdmin(found);
          }
        });
      });
      return;
    }

    if (currentConsoleTab === 'subs') {
      body.innerHTML = `
        <div style="display:grid; gap:14px;">
          <div class="pg-admin-kpi">
            <div style="font-weight:800; color:#fbbf24; margin-bottom:6px;">👑 Privilèges Abonnements &amp; Paywalls</div>
            <p style="font-size:12.5px; color:#cbd5e1; margin:0 0 12px;">
              Tant que la session Administrateur est active, tous les paywalls (Pass Patient 100 FCFA, Abonnement Délégué, Licence Officine et Licence Grossiste B2B) sont automatiquement débloqués pour vos tests et supervisions.
            </p>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button type="button" class="btn btn--sm btn--primary" data-grant-role="delegate" data-grant-days="365">💼 Activer Pro Délégué (+365j)</button>
              <button type="button" class="btn btn--sm btn--primary" data-grant-role="wholesaler" data-grant-days="365">🏭 Activer Pro Grossiste (+365j)</button>
              <button type="button" class="btn btn--sm btn--primary" data-grant-role="pharmacy" data-grant-days="365">🏥 Activer Pro Officine (+365j)</button>
            </div>
          </div>
        </div>
      `;
      body.querySelectorAll('[data-grant-role]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const role = btn.dataset.grantRole;
          const days = Number(btn.dataset.grantDays) || 365;
          const exp = Date.now() + days * 24 * 3600 * 1000;
          const keys = Object.keys(localStorage).filter((k) => k.startsWith('pharmagarde_sub_' + role + '_'));
          if (!keys.length) keys.push('pharmagarde_sub_' + role + '_admin_' + role);
          keys.forEach((k) => {
            localStorage.setItem(k, JSON.stringify({
              subscriberId: k.replace('pharmagarde_sub_' + role + '_', ''),
              role,
              status: 'active',
              planId: 'annual',
              planLabel: 'Licence Admin Pro (365j)',
              startsAt: Date.now(),
              expiresAt: exp,
              reference: 'ADMIN_GRANT_' + Date.now()
            }));
          });
          logAudit('ADMIN_GRANT_SUB', `${role} +${days}j`);
          notify(`✅ Licence Pro ${role} activée pour ${days} jours.`, 'success');
        });
      });
      return;
    }

    if (currentConsoleTab === 'security') {
      const logs = getAuditLogs();
      body.innerHTML = `
        <div style="display:grid; gap:16px;">
          <div class="pg-admin-kpi">
            <div style="font-weight:800; color:#fbbf24; margin-bottom:8px;">🔑 Modifier le Code Maître Administrateur (SHA-256)</div>
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
                <thead><tr><th>Date</th><th>Espace</th><th>Action</th><th>Détails</th></tr></thead>
                <tbody>
                  ${logs.slice(0, 30).map((l) => `<tr><td>${esc(new Date(l.ts).toLocaleString('fr-FR'))}</td><td>${esc(l.space)}</td><td><strong>${esc(l.action)}</strong></td><td>${esc(l.details)}</td></tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:#94a3b8;">Aucune entrée</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      document.getElementById('pg-adm-save-code').addEventListener('click', async () => {
        const val = (document.getElementById('pg-adm-new-code').value || '').trim();
        if (val.length < 8) {
          notify('⚠️ Le code maître doit contenir au moins 8 caractères.', 'error');
          return;
        }
        const h = await sha256Hex(val);
        localStorage.setItem(HASH_KEY, h);
        document.getElementById('pg-adm-new-code').value = '';
        logAudit('ADMIN_CODE_CHANGED', 'Mise à jour de l\'empreinte SHA-256');
        notify('✅ Code Maître Administrateur mis à jour avec succès.', 'success');
      });

      document.getElementById('pg-adm-clear-cache').addEventListener('click', async () => {
        Object.keys(localStorage).forEach((k) => {
          if (k.startsWith('pg_osm_') || k.startsWith('pg_loc_') || k.startsWith('pg_reg_')) {
            localStorage.removeItem(k);
          }
        });
        if ('caches' in window) {
          const names = await caches.keys();
          await Promise.all(names.map((n) => caches.delete(n)));
        }
        logAudit('ADMIN_CLEAR_CACHE', 'Caches GPS/OSM/SW purgés');
        notify('🧹 Caches locaux et Service Worker purgés.', 'success');
      });

      document.getElementById('pg-adm-export-audit').addEventListener('click', () => {
        if (window.PG && typeof PG.exportCSV === 'function') {
          PG.exportCSV('pharmagarde_admin_audit.csv', ['Date', 'Espace', 'Action', 'Details'],
            logs.map((l) => [l.ts, l.space, l.action, l.details]));
        }
      });
    }
  }

  // ════════════════════════════════════════════════════════════════
  // INJECTION DES BOUTONS D'ACCÈS ADMIN + RACCOURCI CTRL+SHIFT+A
  // ════════════════════════════════════════════════════════════════
  function injectTriggers() {
    const space = currentPageSpace();

    // 1. Page d'accueil (index.html) : bouton discret dans quick-actions
    const quick = document.querySelector('.welcome-screen__quick-actions');
    if (quick && !document.getElementById('btn-welcome-admin')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'btn-welcome-admin';
      btn.className = 'welcome-quick-btn';
      btn.style.cssText = 'border-color:rgba(251,191,36,0.55)!important; color:#fbbf24!important; background:rgba(251,191,36,0.10)!important;';
      btn.innerHTML = '<span>👑</span> <span>Accès Administrateur</span>';
      btn.addEventListener('click', () => openUnlockModal(openConsoleModal));
      quick.parentElement.insertBefore(btn, quick.nextSibling);
      btn.style.maxWidth = '320px';
      btn.style.margin = '6px auto 4px';
      btn.style.display = 'flex';
    }

    // 2. Formulaires de connexion des 3 espaces pro (Pharmacie, Délégué, Grossiste)
    const loginTargets = [
      { id: 'login-form', label: '👑 Accès Privilégié Administrateur' },
      { id: 'g-login-form', label: '👑 Accès Privilégié Administrateur' }
    ];
    loginTargets.forEach((t) => {
      const form = document.getElementById(t.id);
      if (form && !form.querySelector('.pg-admin-trigger')) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pg-admin-trigger';
        b.textContent = t.label;
        b.addEventListener('click', () => enterCurrentSpaceAsAdmin());
        form.appendChild(b);
      }
    });

    // 3. Auto-ouverture si ?admin=1 et session Admin déjà active
    if (isAdmin()) {
      renderFloatingBar();
      applySpacePrivileges();
      if (location.search.includes('admin=1') && space !== 'client') {
        setTimeout(() => enterCurrentSpaceAsAdmin(), 250);
      }
    }
  }

  function init() {
    injectTriggers();
    // Raccourci clavier universel Ctrl + Shift + A
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
    logAudit
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
