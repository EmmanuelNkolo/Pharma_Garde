/**
 * Pharma-Garde v12.0 — Contrôleur Principal Espace Médecins & Téléconsultation
 * Orchestre : Authentification & Vérification ONMC, Signature Manuscrite,
 * Horaires de Consultation, Téléconsultations 48h, Ordonnances Signées PDF,
 * Rendez-vous, Revenus OM/MoMo & Accès Super-Admin.
 * Expose : window.MedecinApp
 */
(function (window) {
  'use strict';

  let currentDoctor = null;
  let activeTab = 'consults';
  let selectedConsultId = null;
  let regSigPad = null;
  let profSigPad = null;
  let autoAvailTimer = null;

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function toast(msg, type) {
    const t = document.getElementById('toast');
    const m = document.getElementById('toast-message');
    if (!t || !m) return;
    t.className = 'toast toast--' + (type || 'success');
    m.textContent = (window.I18n && I18n.translateText) ? I18n.translateText(String(msg || '')) : msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 3800);
  }

  // ── Pad de Signature Manuscrite Tactile & Souris ───────────────
  function createSignaturePad(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let hasInk = false;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(300, Math.round(rect.width || 420));
      const h = 150;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    };
    resize();

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const pt = e.touches && e.touches[0] ? e.touches[0] : e;
      return {
        x: ((pt.clientX - rect.left) / rect.width) * canvas.width,
        y: ((pt.clientY - rect.top) / rect.height) * canvas.height
      };
    };

    const start = (e) => {
      e.preventDefault();
      resize();
      drawing = true;
      hasInk = true;
      const p = getPos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const move = (e) => {
      if (!drawing) return;
      e.preventDefault();
      const p = getPos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };
    const end = () => { drawing = false; };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);

    return {
      clear() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        hasInk = false;
      },
      hasSignature() { return hasInk; },
      toDataURL() { return hasInk ? canvas.toDataURL('image/png') : ''; },
      loadImage(dataUrl) {
        if (!dataUrl) return;
        const img = new Image();
        img.onload = () => {
          resize();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          hasInk = true;
        };
        img.src = dataUrl;
      }
    };
  }

  function init() {
    bindAuthEvents();
    bindDashboardEvents();
    const saved = window.MedecinStore ? MedecinStore.loadSession() : null;
    if (saved) {
      currentDoctor = saved;
      showDashboard();
    } else {
      showAuthView('login');
    }
  }

  function showAuthView(view) {
    ['login', 'register'].forEach((v) => {
      const el = document.getElementById('doc-' + v + '-form');
      if (el) el.classList.toggle('hidden', v !== view);
    });
    if (view === 'register' && !regSigPad) {
      setTimeout(() => { regSigPad = createSignaturePad('doc-reg-sig-canvas'); }, 60);
    }
  }

  function bindAuthEvents() {
    document.querySelectorAll('[data-doc-view]').forEach((b) => {
      b.addEventListener('click', (e) => { e.preventDefault(); showAuthView(b.getAttribute('data-doc-view')); });
    });

    // Connexion rapide médecins certifiés démo
    document.querySelectorAll('[data-demo-doc]').forEach((b) => {
      b.addEventListener('click', () => {
        const list = MedecinStore.getDoctors();
        const found = list.find((d) => d.id === b.getAttribute('data-demo-doc')) || list[0];
        if (found) {
          MedecinStore.saveSession(found);
          currentDoctor = found;
          showDashboard();
          toast(`✅ Connecté en tant que ${found.title} ${found.full_name}`, 'success');
        }
      });
    });

    const btnLogin = document.getElementById('btn-doc-login');
    if (btnLogin) {
      btnLogin.addEventListener('click', async () => {
        try {
          currentDoctor = await MedecinStore.loginDoctor(
            document.getElementById('doc-login-email').value,
            document.getElementById('doc-login-password').value
          );
          showDashboard();
          toast(`✅ Bienvenue, ${currentDoctor.title} ${currentDoctor.full_name}`, 'success');
        } catch (err) {
          toast('❌ ' + err.message, 'error');
        }
      });
    }

    const btnClearSig = document.getElementById('btn-doc-sig-clear');
    if (btnClearSig) btnClearSig.addEventListener('click', () => { if (regSigPad) regSigPad.clear(); });

    const btnUploadSig = document.getElementById('doc-sig-file');
    if (btnUploadSig) {
      btnUploadSig.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const r = new FileReader();
        r.onload = () => { if (regSigPad) regSigPad.loadImage(r.result); };
        r.readAsDataURL(file);
      });
    }

    const btnRegister = document.getElementById('btn-doc-register');
    if (btnRegister) {
      btnRegister.addEventListener('click', async () => {
        try {
          const sigUrl = regSigPad ? regSigPad.toDataURL() : '';
          const docFile = document.getElementById('doc-reg-license-file');
          currentDoctor = await MedecinStore.registerDoctor({
            title: document.getElementById('doc-reg-title').value,
            full_name: document.getElementById('doc-reg-name').value,
            specialty: document.getElementById('doc-reg-specialty').value,
            onmc_number: document.getElementById('doc-reg-onmc').value,
            cni_number: document.getElementById('doc-reg-cni').value,
            diploma_title: document.getElementById('doc-reg-diploma').value,
            university: document.getElementById('doc-reg-univ').value,
            graduation_year: document.getElementById('doc-reg-year').value,
            clinic_name: document.getElementById('doc-reg-clinic').value,
            city: document.getElementById('doc-reg-city').value,
            quarter: document.getElementById('doc-reg-quarter').value,
            phone: document.getElementById('doc-reg-phone').value,
            payout_phone: document.getElementById('doc-reg-payout-phone').value,
            payout_operator: document.getElementById('doc-reg-payout-op').value,
            email: document.getElementById('doc-reg-email').value,
            password: document.getElementById('doc-reg-password').value,
            signature_data_url: sigUrl,
            license_doc_name: (docFile && docFile.files && docFile.files[0]) ? docFile.files[0].name : 'justificatif_onmc'
          });
          showDashboard();
          toast('🎉 Compte Médecin enregistré (14 jours d\'essai gratuit · Vérification ONMC en cours)', 'success');
        } catch (err) {
          toast('❌ ' + err.message, 'error');
        }
      });
    }
  }

  function bindDashboardEvents() {
    const logoutBtn = document.getElementById('btn-doc-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        MedecinStore.clearSession();
        window.location.reload();
      });
    }
    const fsBtn = document.getElementById('btn-doc-fullscreen');
    if (fsBtn) {
      fsBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
        else document.exitFullscreen().catch(() => {});
      });
    }
  }

  function updateHeader() {
    if (!currentDoctor) return;
    const nm = document.getElementById('doc-header-name');
    if (nm) nm.textContent = `${currentDoctor.title || 'Dr'} ${currentDoctor.full_name}`;
    const meta = document.getElementById('doc-header-meta');
    if (meta) meta.textContent = `${currentDoctor.specialty} · ${currentDoctor.onmc_number}`;
    const verBadge = document.getElementById('doc-verif-pill');
    const isVer = currentDoctor.verification_status === 'verified' || (window.PGAdmin && PGAdmin.isVerified('doctor', currentDoctor.id));
    if (verBadge) {
      verBadge.innerHTML = isVer
        ? '<span style="background:rgba(16,185,129,0.2);border:1px solid #10b981;color:#34d399;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:800;">✓ Vérifié ONMC</span>'
        : '<span style="background:rgba(245,158,11,0.18);border:1px solid #f59e0b;color:#fbbf24;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:800;">⏳ Vérification ONMC en attente</span>';
    }
    ['available', 'busy', 'offline'].forEach((st) => {
      const b = document.getElementById('doc-st-' + st);
      if (b) b.classList.toggle('active', currentDoctor.availability_status === st);
    });
    if (window.PGSubscription) {
      PGSubscription.renderHeaderBadge('doc-sub-badge-slot', currentDoctor, 'doctor');
      PGSubscription.checkAndShowReminders(currentDoctor, 'doctor', 'doc-reminder-banner');
    }
  }

  function toggleStatus(st) {
    if (!currentDoctor) return;
    currentDoctor.availability_status = st;
    MedecinStore.saveSession(currentDoctor);
    updateHeader();
    const map = { available: '🟢 Disponible pour téléconsultations', busy: '🟡 En consultation', offline: '🔴 Hors ligne' };
    toast(map[st] || 'Statut mis à jour', 'info');
  }

  function showDashboard() {
    document.getElementById('doc-login-screen')?.classList.add('hidden');
    document.getElementById('doc-dashboard')?.classList.remove('hidden');
    updateHeader();
    switchTab('consults');
    if (!autoAvailTimer) {
      autoAvailTimer = setInterval(() => { if (activeTab === 'consults') renderConsultsPanel(); }, 30000);
    }
  }

  function switchTab(tab) {
    activeTab = tab;
    ['consults', 'prescriptions', 'schedule', 'finance', 'profile'].forEach((t) => {
      document.getElementById('dtab-' + t)?.classList.toggle('active', t === tab);
      const p = document.getElementById('dpanel-' + t);
      if (p) p.style.display = (t === tab) ? 'block' : 'none';
    });
    if (tab === 'consults') renderConsultsPanel();
    else if (tab === 'prescriptions') renderPrescriptionsPanel();
    else if (tab === 'schedule') renderSchedulePanel();
    else if (tab === 'finance') renderFinancePanel();
    else if (tab === 'profile') renderProfilePanel();
  }

  // ── PÔLE 1 : REQUÊTES & TÉLÉCONSULTATIONS 48H ──────────────────
  function renderConsultsPanel() {
    const host = document.getElementById('dpanel-consults');
    if (!host || !currentDoctor) return;
    const all = MedecinStore.getConsultations();
    const incoming = all.filter((c) => c.status === 'searching');
    const mine = all.filter((c) => c.doctor_id === currentDoctor.id || (window.PGAdmin && PGAdmin.isAdmin()));

    const badge = document.getElementById('doc-badge-consults');
    if (badge) badge.textContent = String(incoming.length + mine.filter((c) => c.status === 'active_48h').length);

    const activeConsult = mine.find((c) => c.id === selectedConsultId) || mine[0] || null;
    if (activeConsult) selectedConsultId = activeConsult.id;
    const msgs = activeConsult ? MedecinStore.getMessages(activeConsult.id) : [];

    host.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1.25fr; gap:16px;" class="pg-two-col">
        <!-- Liste des requêtes & sessions 48h -->
        <div class="pharm-card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h3 style="margin:0; font-size:15px; font-weight:800; color:#38bdf8;">🩺 Requêtes &amp; Sessions 48h (${mine.length + incoming.length})</h3>
            <button type="button" class="btn btn--secondary btn--sm" onclick="MedecinApp.switchTab('consults')">🔄 Actualiser</button>
          </div>
          ${incoming.length > 0 ? `<div style="font-size:11.5px; font-weight:800; color:#fbbf24; margin-bottom:8px;">🔔 NOUVELLES REQUÊTES PAYÉES (2 500 FCFA DIRECT OM/MoMo)</div>` : ''}
          ${incoming.map((c) => `
            <div style="padding:12px; border-radius:12px; background:rgba(245,158,11,0.1); border:1px solid rgba(251,191,36,0.45); margin-bottom:10px;">
              <div style="display:flex; justify-content:space-between; font-size:12px;">
                <strong>👤 ${esc(c.patient_alias)}</strong>
                <span style="color:#fbbf24; font-weight:800;">+2 500 FCFA</span>
              </div>
              <div style="font-size:12px; color:#cbd5e1; margin:4px 0 8px;">${esc(c.symptoms)}</div>
              <button type="button" class="btn btn--primary btn--sm btn--block" onclick="MedecinApp.acceptRequest('${esc(c.id)}')">✅ Accepter &amp; Recevoir 2 500 F OM/MoMo</button>
            </div>
          `).join('')}

          ${mine.length === 0 ? '<div style="text-align:center; padding:26px; color:#94a3b8; font-size:13px;">Aucune téléconsultation active. Restez 🟢 Disponible pour recevoir les demandes patients.</div>' : mine.map((c) => `
            <div onclick="MedecinApp.selectConsult('${esc(c.id)}')" style="cursor:pointer; padding:12px; border-radius:12px; margin-bottom:8px; background:${c.id === selectedConsultId ? 'rgba(20,184,166,0.16)' : 'rgba(15,23,42,0.65)'}; border:1px solid ${c.id === selectedConsultId ? '#2dd4bf' : 'rgba(148,163,184,0.18)'};">
              <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                <strong style="color:#fff; font-size:13.5px;">👤 ${esc(c.patient_alias)} ${c.patient_age ? `(${c.patient_age} ans)` : ''}</strong>
                <span style="font-size:10.5px; font-weight:800; color:#34d399;">⏱️ ${esc(MedecinStore.remaining48hLabel(c.session_expires_at))}</span>
              </div>
              <div style="font-size:12px; color:#cbd5e1; margin-top:4px;">${esc(c.symptoms)}</div>
              <div style="font-size:11px; color:#fbbf24; margin-top:4px;">💰 2 500 FCFA versés (${esc(c.doctor_payout_ref || 'Direct OM/MoMo')})</div>
            </div>
          `).join('')}
        </div>

        <!-- Canal Téléconsultation 48h actif -->
        <div class="pharm-card">
          ${!activeConsult ? '<div style="text-align:center; padding:48px 16px; color:#94a3b8;">Sélectionnez une consultation à gauche pour dialoguer avec le patient et rédiger une ordonnance signée.</div>' : `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; padding-bottom:10px; border-bottom:1px solid rgba(148,163,184,0.15); margin-bottom:12px;">
              <div>
                <div style="font-weight:800; font-size:15px; color:#2dd4bf;">💬 Téléconsultation 48h — ${esc(activeConsult.patient_alias)}</div>
                <div style="font-size:11.5px; color:#94a3b8;">⏱️ ${esc(MedecinStore.remaining48hLabel(activeConsult.session_expires_at))} · Confidentiel</div>
              </div>
              <button type="button" class="btn btn--primary btn--sm" onclick="MedecinApp.openRxForConsult('${esc(activeConsult.id)}')" style="background:linear-gradient(135deg,#fbbf24,#d97706)!important; color:#0f172a!important; border:none!important; font-weight:900;">
                📝 Prescrire Ordonnance Signée
              </button>
            </div>
            <div class="pg-consult-chat" id="doc-chat-box">
              ${msgs.map((m) => `
                <div class="pg-chat-msg ${m.sender_role === 'doctor' ? 'pg-chat-msg--doctor' : 'pg-chat-msg--patient'}">
                  <div style="font-size:10px; opacity:0.75; margin-bottom:2px; font-weight:700;">${esc(m.sender_name)} · ${esc(new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))}</div>
                  <div>${esc(m.body)}</div>
                </div>
              `).join('')}
            </div>
            <div style="display:flex; gap:8px; margin-top:10px;">
              <input type="text" id="doc-chat-input" class="form-input" placeholder="Répondre au patient, poser une question clinique..." style="flex:1;">
              <button type="button" class="btn btn--primary btn--sm" onclick="MedecinApp.sendChatMessage()">Envoyer</button>
            </div>
          `}
        </div>
      </div>
    `;
    const box = document.getElementById('doc-chat-box');
    if (box) box.scrollTop = box.scrollHeight;
  }

  async function acceptRequest(consultId) {
    if (!currentDoctor) return;
    await MedecinStore.acceptConsultation(consultId, currentDoctor);
    selectedConsultId = consultId;
    toast('✅ Téléconsultation acceptée ! 2 500 FCFA transférés sur votre compte OM/MoMo.', 'success');
    renderConsultsPanel();
  }

  function selectConsult(id) {
    selectedConsultId = id;
    renderConsultsPanel();
  }

  async function sendChatMessage() {
    const inp = document.getElementById('doc-chat-input');
    if (!inp || !inp.value.trim() || !selectedConsultId || !currentDoctor) return;
    await MedecinStore.addConsultationMessage(selectedConsultId, 'doctor', `${currentDoctor.title} ${currentDoctor.full_name}`, inp.value.trim());
    inp.value = '';
    renderConsultsPanel();
  }

  function openRxForConsult(consultId) {
    selectedConsultId = consultId;
    switchTab('prescriptions');
  }

  // ── PÔLE 2 : ORDONNANCES SIGNÉES ───────────────────────────────
  function renderPrescriptionsPanel() {
    const host = document.getElementById('dpanel-prescriptions');
    if (!host || !currentDoctor) return;
    const consults = MedecinStore.getConsultations().filter((c) => c.doctor_id === currentDoctor.id || (window.PGAdmin && PGAdmin.isAdmin()));
    const rxs = MedecinStore.getPrescriptions().filter((r) => r.doctor_id === currentDoctor.id || (window.PGAdmin && PGAdmin.isAdmin()));

    host.innerHTML = `
      <div style="display:grid; grid-template-columns:1.1fr 0.9fr; gap:16px;" class="pg-two-col">
        <div class="pharm-card">
          <h3 style="margin:0 0 12px; font-size:15px; font-weight:800; color:#fbbf24;">📝 Rédiger une Ordonnance Médicale Signée</h3>
          <div class="form-group" style="margin-bottom:10px;">
            <label class="form-label">Patient / Téléconsultation associée</label>
            <select id="rx-consult-select" class="form-input form-select">
              ${consults.map((c) => `<option value="${esc(c.id)}" ${c.id === selectedConsultId ? 'selected' : ''}>${esc(c.patient_alias)} — ${esc(c.symptoms.slice(0, 42))}</option>`).join('')}
              <option value="">Patient externe / Consultation libre</option>
            </select>
          </div>
          <div class="pa-grid-2" style="margin-bottom:10px;">
            <div class="form-group"><label class="form-label">Nom du Patient</label><input type="text" id="rx-patient-name" class="form-input" placeholder="Ex: M. Jean Paul" value="${esc((consults.find((c) => c.id === selectedConsultId) || {}).patient_alias || '')}"></div>
            <div class="form-group"><label class="form-label">Diagnostic confidentiel</label><input type="text" id="rx-diagnosis" class="form-input" placeholder="Ex: Accès palustre simple"></div>
          </div>

          <div style="font-size:12px; font-weight:800; color:#34d399; margin-bottom:6px;">💊 Médicaments prescrits (transmis directement aux pharmacies par le patient)</div>
          <div id="rx-meds-rows" style="display:flex; flex-direction:column; gap:8px; margin-bottom:10px;">
            <div class="rx-med-row" style="display:grid; grid-template-columns:1.4fr 1fr 1fr; gap:6px;">
              <input type="text" class="form-input rx-m-name" placeholder="Médicament (ex: Coartem 20/120)">
              <input type="text" class="form-input rx-m-dosage" placeholder="Posologie (ex: 4 cp 2x/j)">
              <input type="text" class="form-input rx-m-dur" placeholder="Durée (ex: 3 jours)">
            </div>
          </div>
          <button type="button" class="btn btn--secondary btn--sm" onclick="MedecinApp.addRxMedRow()" style="margin-bottom:10px;">+ Ajouter un médicament</button>

          <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label">Conseils médicaux &amp; suivi</label>
            <textarea id="rx-advice" class="form-input" rows="2" placeholder="Hydratation abondante, contrôle dans 48h si fièvre persistante..."></textarea>
          </div>

          <div style="display:flex; align-items:center; justify-content:space-between; padding:10px; border-radius:10px; background:rgba(255,255,255,0.95); color:#0f172a; margin-bottom:12px;">
            <span style="font-size:11.5px; font-weight:700;">✍️ Signature apposée automatiquement :</span>
            <img src="${currentDoctor.signature_data_url || ''}" alt="Signature" style="max-height:42px; max-width:160px;">
          </div>

          <button type="button" class="btn btn--primary btn--block" onclick="MedecinApp.submitPrescription()">✅ Signer &amp; Transmettre au Patient (PDF)</button>
        </div>

        <div class="pharm-card">
          <h3 style="margin:0 0 12px; font-size:15px; font-weight:800; color:#34d399;">📜 Ordonnances Signées Émises (${rxs.length})</h3>
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${rxs.length === 0 ? '<div style="text-align:center; padding:24px; color:#94a3b8;">Aucune ordonnance émise pour l\'instant.</div>' : rxs.map((r) => `
              <div style="padding:12px; border-radius:12px; background:rgba(15,23,42,0.65); border:1px solid rgba(45,212,191,0.28);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                  <strong style="color:#fbbf24; font-family:monospace;">${esc(r.rx_code)}</strong>
                  <span style="font-size:11px; color:#94a3b8;">${esc(new Date(r.created_at).toLocaleString('fr-FR'))}</span>
                </div>
                <div style="font-size:13px; font-weight:700; color:#fff;">👤 ${esc(r.patient_alias)}</div>
                <div style="font-size:12px; color:#cbd5e1; margin:4px 0 8px;">💊 ${(r.medications || []).map((m) => esc(m.name)).join(' · ')}</div>
                <button type="button" class="btn btn--secondary btn--sm" onclick="MedecinStore.downloadPrescriptionPDF('${esc(r.id)}')">📄 Télécharger Ordonnance PDF Signée</button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function addRxMedRow() {
    const wrap = document.getElementById('rx-meds-rows');
    if (!wrap) return;
    const row = document.createElement('div');
    row.className = 'rx-med-row';
    row.style.cssText = 'display:grid; grid-template-columns:1.4fr 1fr 1fr; gap:6px;';
    row.innerHTML = `
      <input type="text" class="form-input rx-m-name" placeholder="Médicament...">
      <input type="text" class="form-input rx-m-dosage" placeholder="Posologie...">
      <input type="text" class="form-input rx-m-dur" placeholder="Durée...">
    `;
    wrap.appendChild(row);
  }

  async function submitPrescription() {
    if (!currentDoctor) return;
    const cid = document.getElementById('rx-consult-select')?.value || '';
    const consult = MedecinStore.getConsultations().find((c) => c.id === cid) || null;
    const meds = [];
    document.querySelectorAll('.rx-med-row').forEach((row) => {
      const name = (row.querySelector('.rx-m-name')?.value || '').trim();
      const dosage = (row.querySelector('.rx-m-dosage')?.value || '').trim();
      const duration = (row.querySelector('.rx-m-dur')?.value || '').trim();
      if (name) meds.push({ name, dosage, duration });
    });
    try {
      const rx = await MedecinStore.issueSignedPrescription(currentDoctor, consult, {
        patient_alias: document.getElementById('rx-patient-name')?.value || 'Patient',
        diagnosis: document.getElementById('rx-diagnosis')?.value || '',
        advice: document.getElementById('rx-advice')?.value || '',
        medications: meds
      });
      toast(`✅ Ordonnance ${rx.rx_code} signée et envoyée au patient !`, 'success');
      renderPrescriptionsPanel();
    } catch (err) {
      toast('❌ ' + err.message, 'error');
    }
  }

  // ── PÔLE 3 : HORAIRES DE CONSULTATION & RENDEZ-VOUS ────────────
  function renderSchedulePanel() {
    const host = document.getElementById('dpanel-schedule');
    if (!host || !currentDoctor) return;
    const sched = currentDoctor.consultation_hours || MedecinStore.DEFAULT_SCHEDULE;
    const days = [
      ['lun', 'Lundi'], ['mar', 'Mardi'], ['mer', 'Mercredi'],
      ['jeu', 'Jeudi'], ['ven', 'Vendredi'], ['sam', 'Samedi'], ['dim', 'Dimanche']
    ];
    const appts = MedecinStore.getAppointments().filter((a) => a.doctor_id === currentDoctor.id || (window.PGAdmin && PGAdmin.isAdmin()));

    host.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;" class="pg-two-col">
        <div class="pharm-card">
          <h3 style="margin:0 0 10px; font-size:15px; font-weight:800; color:#2dd4bf;">🕒 Mes Horaires de Consultation Automatisés</h3>
          <p style="font-size:12px; color:#94a3b8; margin-bottom:12px;">Définissez vos plages d'ouverture : la plateforme vous rend automatiquement visible et sélectionnable par les patients.</p>
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px;">
            ${days.map(([k, lbl]) => {
              const s = sched[k] || { active: false, start: '08:00', end: '18:00' };
              return `
                <div style="display:grid; grid-template-columns:110px 1fr 1fr; gap:8px; align-items:center;">
                  <label style="display:flex; align-items:center; gap:6px; font-size:13px; font-weight:700; color:#e2e8f0;">
                    <input type="checkbox" id="sch-act-${k}" ${s.active ? 'checked' : ''}> ${lbl}
                  </label>
                  <input type="time" id="sch-start-${k}" class="form-input" value="${esc(s.start || '08:00')}" style="min-height:38px;">
                  <input type="time" id="sch-end-${k}" class="form-input" value="${esc(s.end || '18:00')}" style="min-height:38px;">
                </div>
              `;
            }).join('')}
          </div>
          <button type="button" class="btn btn--primary btn--block" onclick="MedecinApp.saveSchedule()">💾 Enregistrer mes Horaires</button>
        </div>

        <div class="pharm-card">
          <h3 style="margin:0 0 12px; font-size:15px; font-weight:800; color:#fbbf24;">📅 Rendez-Vous Patients (${appts.length})</h3>
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${appts.length === 0 ? '<div style="text-align:center; padding:26px; color:#94a3b8;">Aucun rendez-vous réservé pour le moment.</div>' : appts.map((a) => `
              <div style="padding:12px; border-radius:12px; background:rgba(15,23,42,0.65); border:1px solid rgba(148,163,184,0.2);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <strong style="color:#fff;">👤 ${esc(a.patient_name)}</strong>
                  <span style="font-size:11px; font-weight:800; color:${a.status === 'confirmed' ? '#34d399' : '#fbbf24'};">${esc(a.status.toUpperCase())}</span>
                </div>
                <div style="font-size:12px; color:#cbd5e1; margin:4px 0;">📅 ${esc(new Date(a.scheduled_at).toLocaleString('fr-FR'))} · ${a.mode === 'cabinet' ? '🏥 Cabinet' : '📱 Téléconsultation'}</div>
                <div style="font-size:11.5px; color:#94a3b8; margin-bottom:8px;">Motif : ${esc(a.reason)}</div>
                <div style="display:flex; gap:6px;">
                  <button type="button" class="btn btn--primary btn--sm" onclick="MedecinApp.setApptStatus('${esc(a.id)}', 'confirmed')">✅ Confirmer</button>
                  <button type="button" class="btn btn--secondary btn--sm" onclick="MedecinApp.setApptStatus('${esc(a.id)}', 'cancelled')" style="color:#f87171;">❌ Annuler</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function saveSchedule() {
    if (!currentDoctor) return;
    const out = {};
    ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].forEach((k) => {
      out[k] = {
        active: !!document.getElementById('sch-act-' + k)?.checked,
        start: document.getElementById('sch-start-' + k)?.value || '08:00',
        end: document.getElementById('sch-end-' + k)?.value || '18:00'
      };
    });
    currentDoctor.consultation_hours = out;
    MedecinStore.saveSession(currentDoctor);
    toast('✅ Horaires de consultation sauvegardés et publiés.', 'success');
  }

  function setApptStatus(id, st) {
    MedecinStore.updateAppointmentStatus(id, st);
    toast('✅ Statut du rendez-vous mis à jour.', 'success');
    renderSchedulePanel();
  }

  // ── PÔLE 4 : REVENUS OM/MoMo & ABONNEMENT ──────────────────────
  function renderFinancePanel() {
    const host = document.getElementById('dpanel-finance');
    if (!host || !currentDoctor) return;
    const mine = MedecinStore.getConsultations().filter((c) => c.doctor_id === currentDoctor.id);
    const totalEarned = mine.reduce((s, c) => s + Number(c.doctor_payout_amount || 2500), 0);
    const rxCount = MedecinStore.getPrescriptions().filter((r) => r.doctor_id === currentDoctor.id).length;

    host.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:16px;">
        <div class="pharm-card" style="text-align:center;"><div style="font-size:11px; color:#94a3b8; font-weight:800;">HONORAIRES DIRECTS OM/MoMo</div><div style="font-size:26px; font-weight:900; color:#34d399; margin-top:4px;">${totalEarned.toLocaleString('fr-FR')} F</div></div>
        <div class="pharm-card" style="text-align:center;"><div style="font-size:11px; color:#94a3b8; font-weight:800;">TÉLÉCONSULTATIONS 48H</div><div style="font-size:26px; font-weight:900; color:#38bdf8; margin-top:4px;">${mine.length}</div></div>
        <div class="pharm-card" style="text-align:center;"><div style="font-size:11px; color:#94a3b8; font-weight:800;">ORDONNANCES SIGNÉES</div><div style="font-size:26px; font-weight:900; color:#fbbf24; margin-top:4px;">${rxCount}</div></div>
        <div class="pharm-card" style="text-align:center;"><div style="font-size:11px; color:#94a3b8; font-weight:800;">COMPTE VERSEMENT DIRECT</div><div style="font-size:16px; font-weight:900; color:#2dd4bf; margin-top:10px;">${(currentDoctor.payout_operator || 'momo').toUpperCase()} · ${esc(currentDoctor.payout_phone || currentDoctor.phone)}</div></div>
      </div>

      <div class="pharm-card">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          <h3 style="margin:0; font-size:15px; font-weight:800; color:#fbbf24;">💳 Mon Abonnement Plateforme (5 000 F/mois · 50 000 F/an · 14j gratuits)</h3>
          <button type="button" class="btn btn--primary btn--sm" onclick="PGSubscription && PGSubscription.openPaywallModal(MedecinApp.getCurrentDoctor(), 'doctor')">💳 Gérer mon Abonnement</button>
        </div>
        <p style="font-size:12.5px; color:#cbd5e1; margin:0;">
          Chaque téléconsultation patient est facturée <strong>2 600 FCFA</strong> : <strong>2 500 FCFA</strong> sont transférés automatiquement sur votre compte <strong>${(currentDoctor.payout_operator || 'momo').toUpperCase()} (${esc(currentDoctor.payout_phone || currentDoctor.phone)})</strong> et <strong>100 FCFA</strong> couvrent les frais de mise en relation NotchPay.
        </p>
      </div>
    `;
  }

  // ── PÔLE 5 : PROFIL ONMC & SIGNATURE ───────────────────────────
  function renderProfilePanel() {
    const host = document.getElementById('dpanel-profile');
    if (!host || !currentDoctor) return;
    host.innerHTML = `
      <div class="pharm-card" style="max-width:680px; margin:0 auto;">
        <h3 style="margin:0 0 12px; font-size:15.5px; font-weight:800; color:#2dd4bf;">✍️ Profil ONMC, Compte OM/MoMo &amp; Signature Manuscrite</h3>
        <div class="pa-grid-2" style="margin-bottom:12px;">
          <div class="form-group"><label class="form-label">Numéro Versement OM / MoMo</label><input type="tel" id="prof-payout-phone" class="form-input" value="${esc(currentDoctor.payout_phone || currentDoctor.phone || '')}"></div>
          <div class="form-group"><label class="form-label">Opérateur Versement</label>
            <select id="prof-payout-op" class="form-input form-select">
              <option value="momo" ${currentDoctor.payout_operator !== 'om' ? 'selected' : ''}>MTN MoMo</option>
              <option value="om" ${currentDoctor.payout_operator === 'om' ? 'selected' : ''}>Orange Money</option>
            </select>
          </div>
        </div>
        <label class="form-label">Redessiner votre signature manuscrite (apposée sur vos ordonnances PDF)</label>
        <div class="pg-sig-wrap" style="margin-bottom:8px;">
          <canvas id="doc-prof-sig-canvas" class="pg-sig-canvas"></canvas>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn btn--secondary btn--sm" id="btn-prof-sig-clear">🧹 Effacer Signature</button>
          <button type="button" class="btn btn--primary btn--sm" onclick="MedecinApp.saveProfileAndSignature()">💾 Enregistrer Profil &amp; Signature</button>
        </div>
      </div>
    `;
    setTimeout(() => {
      profSigPad = createSignaturePad('doc-prof-sig-canvas');
      if (profSigPad && currentDoctor.signature_data_url) profSigPad.loadImage(currentDoctor.signature_data_url);
      document.getElementById('btn-prof-sig-clear')?.addEventListener('click', () => profSigPad && profSigPad.clear());
    }, 60);
  }

  function saveProfileAndSignature() {
    if (!currentDoctor) return;
    const ph = (document.getElementById('prof-payout-phone')?.value || '').replace(/\D/g, '').replace(/^237/, '');
    if (ph.length === 9) currentDoctor.payout_phone = ph;
    currentDoctor.payout_operator = document.getElementById('prof-payout-op')?.value || 'momo';
    if (profSigPad && profSigPad.hasSignature()) {
      currentDoctor.signature_data_url = profSigPad.toDataURL();
    }
    MedecinStore.saveSession(currentDoctor);
    toast('✅ Profil médical et signature manuscrite mis à jour !', 'success');
  }

  async function adminEnter() {
    const list = MedecinStore.getDoctors();
    currentDoctor = Object.assign({}, list[0], { _isAdminPreview: true, verification_status: 'verified' });
    MedecinStore.saveSession(currentDoctor);
    showDashboard();
  }

  document.addEventListener('DOMContentLoaded', init);

  window.MedecinApp = {
    switchTab,
    toggleStatus,
    acceptRequest,
    selectConsult,
    sendChatMessage,
    openRxForConsult,
    addRxMedRow,
    submitPrescription,
    saveSchedule,
    setApptStatus,
    saveProfileAndSignature,
    adminEnter,
    getCurrentDoctor: () => currentDoctor
  };
})(window);
