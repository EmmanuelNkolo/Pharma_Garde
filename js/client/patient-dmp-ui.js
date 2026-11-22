/**
 * Pharma-Garde v13.0 — Interface Carnet Médical Numérique Souverain (Espace Patient)
 * ──────────────────────────────────────────────────────────────────────────────────
 * S'intègre directement dans le Hub Santé Patient (`index.html`) via l'onglet
 * `📁 Mon Carnet` (avec badge temps réel 🔴 lorsqu'un laboratoire, hôpital ou
 * clinique publie un résultat d'analyse) :
 *   • Inscription / Connexion Patient Souveraine + Code PIN Confidentiel
 *   • Carte Santé & Urgence (Code unique PG-PAT-XXXXXX, Groupe sanguin, Allergies, ICE)
 *   • Chronologie horodatée complète (Analyses/Imagerie avec tableau normes, Ordonnances
 *     PDF → 1-clic pharmacies, Téléconsultations, Pharmacie, Constantes vitales, Vaccins)
 *   • Partage Temporaire Granulaire (`DMP-XXXX-XX`, 1h / 24h / 7j, révocable en 1 clic)
 *     vers Médecin, Hôpital, Clinique, Laboratoire ou Pharmacie
 *   • Journal d'Audit Immuable des accès au dossier
 *
 * Expose : window.PGPatientDmpUI
 */
(function (window) {
  'use strict';

  let subTab = 'timeline'; // timeline | share | add | audit
  let catFilter = 'all';
  let authMode = 'login'; // login | register

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function notify(msg, type) {
    if (window.App && typeof App.showToast === 'function') App.showToast(msg, type || 'info');
    else if (window.PG && typeof PG.toast === 'function') PG.toast(msg, type || 'info');
  }

  function updateUnreadBadge() {
    const badge = document.getElementById('patient-dmp-unread-badge');
    if (!badge || !window.PGPatientDMP) return;
    const pat = PGPatientDMP.getCurrentPatient();
    const count = pat ? PGPatientDMP.getUnreadCount(pat.patient_code) : 0;
    badge.textContent = count > 0 ? String(count) : '';
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  }

  function renderDmpView(host) {
    if (!host || !window.PGPatientDMP) return;
    const pat = PGPatientDMP.getCurrentPatient();

    // 1. Non connecté → Écran Connexion / Inscription Souveraine Patient
    if (!pat) {
      host.innerHTML = renderAuthScreen();
      return;
    }

    // 2. Coffre-fort verrouillé par PIN → Écran PIN Confidentiel
    if (!PGPatientDMP.isVaultUnlocked()) {
      host.innerHTML = `
        <div style="padding:18px; border-radius:16px; background:rgba(15,23,42,0.85); border:1px solid rgba(45,212,191,0.4); text-align:center;">
          <div style="font-size:32px; margin-bottom:6px;">🔐</div>
          <div style="font-weight:900; font-size:15.5px; color:#2dd4bf; margin-bottom:4px;">Carnet Médical Verrouillé</div>
          <div style="font-size:12px; color:#94a3b8; margin-bottom:12px;">
            Propriétaire : <strong style="color:#fff;">${esc(pat.full_name)}</strong> (<code style="color:#fbbf24;">${esc(pat.patient_code)}</code>)<br>
            Seul vous pouvez consulter vos données médicales.
          </div>
          <div style="display:flex; gap:8px; max-width:290px; margin:0 auto 10px;">
            <input type="password" id="dmp-pin-unlock-input" class="form-input" inputmode="numeric" maxlength="6" placeholder="Code PIN (4-6 chiffres)" style="text-align:center; letter-spacing:4px; font-weight:800;">
            <button type="button" class="btn btn--primary btn--sm" onclick="PGPatientDmpUI.unlockPin()">🔓 Ouvrir</button>
          </div>
          ${pat.pin_plain_hint ? `<div style="font-size:11px; color:#64748b; margin-bottom:8px;">Compte démo : PIN = <strong>${esc(pat.pin_plain_hint)}</strong></div>` : ''}
          <button type="button" class="btn btn--ghost btn--sm" onclick="PGPatientDmpUI.logout()" style="color:#f87171; font-size:11.5px;">Changer de compte patient</button>
        </div>
      `;
      return;
    }

    // 3. Carnet Médical Numérique Déverrouillé
    const records = PGPatientDMP.getPatientRecords(pat.patient_code);
    const unreadLabs = records.filter((r) => !r.is_read && (r.category === 'lab_result' || r.category === 'imaging'));
    const grants = PGPatientDMP.getPatientGrants(pat.patient_code).filter((g) => !g.revoked_at && Date.now() < new Date(g.expires_at).getTime());

    host.innerHTML = `
      <!-- Carte d'Identité Médicale & Urgence (ICE) -->
      <div style="background:linear-gradient(135deg, rgba(13,148,136,0.22), rgba(14,165,233,0.14)); border:1px solid rgba(45,212,191,0.45); border-radius:14px; padding:13px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
          <div>
            <div style="font-size:11px; font-weight:800; color:#2dd4bf; text-transform:uppercase;">🛡️ Carnet Médical Numérique Souverain</div>
            <div style="font-size:16px; font-weight:900; color:#fff; margin-top:2px;">${esc(pat.full_name)}</div>
          </div>
          <div style="display:flex; gap:5px; flex-wrap:wrap;">
            <button type="button" class="btn btn--secondary btn--sm" onclick="PGPatientDmpUI.copyPatientCode('${esc(pat.patient_code)}')" style="padding:4px 9px; font-size:11px; font-family:monospace; color:#fbbf24; border-color:rgba(251,191,36,0.45);">🪪 ${esc(pat.patient_code)} 📋</button>
            <button type="button" class="btn btn--secondary btn--sm" onclick="PGPatientDMP.downloadFullDmpPDF()" style="padding:4px 9px; font-size:11px;">📄 PDF</button>
            <button type="button" class="btn btn--secondary btn--sm" onclick="PGPatientDmpUI.lock()" style="padding:4px 8px; font-size:11px;" title="Verrouiller PIN">🔒</button>
          </div>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; font-size:11px; margin-bottom:8px;">
          <span style="padding:2px 8px; border-radius:999px; background:rgba(244,63,94,0.18); color:#fda4af; font-weight:800;">🩸 ${esc(pat.blood_group || '—')}</span>
          <span style="padding:2px 8px; border-radius:999px; background:rgba(245,158,11,0.18); color:#fbbf24; font-weight:800;">⚠️ ${esc(pat.allergies || 'Aucune allergie')}</span>
          ${pat.emergency_contact_phone ? `<span style="padding:2px 8px; border-radius:999px; background:rgba(56,189,248,0.16); color:#7dd3fc; font-weight:700;">🆘 ICE : ${esc(pat.emergency_contact_name || '')} ${esc(pat.emergency_contact_phone)}</span>` : ''}
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; font-size:11px; color:#cbd5e1;">
          <span>Donnez votre code <strong style="color:#fbbf24;">${esc(pat.patient_code)}</strong> au labo/hôpital pour recevoir vos résultats automatiquement.</span>
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn btn--ghost btn--sm" onclick="PGPatientDmpUI.enableAlerts()" style="padding:2px 7px; font-size:10.5px; color:#34d399;">🔔 Alertes Push</button>
            <button type="button" class="btn btn--ghost btn--sm" onclick="PGPatientDmpUI.logout()" style="padding:2px 7px; font-size:10.5px; color:#f87171;">Déconnexion</button>
          </div>
        </div>
      </div>

      <!-- Alerte Résultats d'Analyses Nouvellement Disponibles -->
      ${unreadLabs.length > 0 ? `
        <div style="padding:11px 13px; border-radius:12px; background:linear-gradient(135deg, rgba(16,185,129,0.2), rgba(139,92,246,0.18)); border:1px solid rgba(52,211,153,0.55); margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
            <div>
              <div style="font-size:13px; font-weight:900; color:#34d399;">🔔 ${unreadLabs.length} nouveau(x) résultat(s) d'analyse disponible(s) !</div>
              <div style="font-size:11.5px; color:#e2e8f0; margin-top:2px;">${esc(unreadLabs[0].issuer_name)} — <strong>${esc(unreadLabs[0].title)}</strong></div>
            </div>
            <div style="display:flex; gap:6px;">
              <button type="button" class="btn btn--primary btn--sm" onclick="PGPatientDmpUI.openLabPdfAndRead('${esc(unreadLabs[0].id)}')" style="padding:5px 10px; font-size:11.5px;">📄 Voir PDF</button>
              <button type="button" class="btn btn--secondary btn--sm" onclick="PGPatientDmpUI.markAllRead()" style="padding:5px 9px; font-size:11px;">✓ Lu</button>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Sous-navigation du Carnet Souverain -->
      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; margin-bottom:12px;">
        <button type="button" class="btn btn--sm ${subTab === 'timeline' ? 'btn--primary' : 'btn--secondary'}" onclick="PGPatientDmpUI.setSubTab('timeline')" style="font-size:11.5px; padding:7px 4px;">🕒 Parcours (${records.length})</button>
        <button type="button" class="btn btn--sm ${subTab === 'share' ? 'btn--primary' : 'btn--secondary'}" onclick="PGPatientDmpUI.setSubTab('share')" style="font-size:11.5px; padding:7px 4px;">🤝 Partager (${grants.length})</button>
        <button type="button" class="btn btn--sm ${subTab === 'add' ? 'btn--primary' : 'btn--secondary'}" onclick="PGPatientDmpUI.setSubTab('add')" style="font-size:11.5px; padding:7px 4px;">➕ Ajouter</button>
        <button type="button" class="btn btn--sm ${subTab === 'audit' ? 'btn--primary' : 'btn--secondary'}" onclick="PGPatientDmpUI.setSubTab('audit')" style="font-size:11.5px; padding:7px 4px;">🛡️ Audit</button>
      </div>

      ${subTab === 'timeline' ? renderTimelineSection(records)
        : subTab === 'share' ? renderShareSection(pat)
        : subTab === 'add' ? renderAddSection()
        : renderAuditSection(pat)}
    `;
    updateUnreadBadge();
  }

  function renderAuthScreen() {
    if (authMode === 'register') {
      return `
        <div class="pharma-card" style="border-color:rgba(45,212,191,0.4);">
          <div style="font-weight:900; font-size:15px; color:#2dd4bf; margin-bottom:4px;">🛡️ Créer mon Carnet Médical Numérique Souverain</div>
          <p style="font-size:11.5px; color:#94a3b8; margin:0 0 12px;">
            Recevez instantanément vos résultats d'analyses (labos, hôpitaux, cliniques) et ordonnances signées. Seul vous pouvez consulter ou partager votre dossier.
          </p>
          <div class="pa-grid-2" style="margin-bottom:8px;">
            <input type="text" id="dmp-reg-name" class="form-input" placeholder="Nom & Prénom complets *">
            <input type="tel" id="dmp-reg-phone" class="form-input" placeholder="Téléphone (6XX XXX XXX) *">
          </div>
          <div class="pa-grid-2" style="margin-bottom:8px;">
            <input type="email" id="dmp-reg-email" class="form-input" placeholder="Email personnel *">
            <input type="date" id="dmp-reg-birth" class="form-input" title="Date de naissance">
          </div>
          <div class="pa-grid-2" style="margin-bottom:8px;">
            <select id="dmp-reg-blood" class="form-input form-select">
              <option value="Non renseigné">Groupe sanguin...</option>
              <option value="O+">O+</option><option value="O-">O-</option>
              <option value="A+">A+</option><option value="A-">A-</option>
              <option value="B+">B+</option><option value="B-">B-</option>
              <option value="AB+">AB+</option><option value="AB-">AB-</option>
            </select>
            <input type="text" id="dmp-reg-allergies" class="form-input" placeholder="Allergies (ex: Pénicilline)">
          </div>
          <div class="pa-grid-2" style="margin-bottom:8px;">
            <input type="text" id="dmp-reg-ice-name" class="form-input" placeholder="Contact Urgence (ICE)">
            <input type="tel" id="dmp-reg-ice-phone" class="form-input" placeholder="Tél. Urgence (ICE)">
          </div>
          <div class="pa-grid-2" style="margin-bottom:10px;">
            <input type="password" id="dmp-reg-pwd" class="form-input" placeholder="Mot de passe (8 car. min.) *">
            <input type="password" id="dmp-reg-pin" class="form-input" inputmode="numeric" maxlength="6" placeholder="Code PIN médical (4-6 chiffres) *">
          </div>
          <button type="button" class="btn btn--primary btn--block" onclick="PGPatientDmpUI.submitRegister()">🔐 Créer mon Carnet Médical Sécurisé</button>
          <button type="button" class="btn btn--ghost btn--block" onclick="PGPatientDmpUI.setAuthMode('login')" style="margin-top:6px; font-size:12px;">Déjà inscrit ? Se connecter</button>
        </div>
      `;
    }
    return `
      <div class="pharma-card" style="border-color:rgba(45,212,191,0.4);">
        <div style="font-weight:900; font-size:15px; color:#2dd4bf; margin-bottom:4px;">📁 Mon Carnet Médical Numérique Confidentiel</div>
        <p style="font-size:12px; color:#cbd5e1; line-height:1.45; margin:0 0 12px;">
          Conservez tout votre parcours médical horodaté (analyses labos/hôpitaux, imagerie, ordonnances signées, délivrances pharmacies) et partagez-le uniquement sur votre accord.
        </p>
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:10px;">
          <input type="text" id="dmp-login-id" class="form-input" placeholder="Email, Téléphone ou Code PG-PAT-XXXXXX">
          <input type="password" id="dmp-login-pwd" class="form-input" placeholder="Mot de passe">
          <button type="button" class="btn btn--primary btn--block" onclick="PGPatientDmpUI.submitLogin()">🔓 Ouvrir mon Carnet Médical</button>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn btn--secondary btn--sm" onclick="PGPatientDmpUI.setAuthMode('register')" style="flex:1;">➕ S'inscrire (Gratuit)</button>
          <button type="button" class="btn btn--secondary btn--sm" onclick="PGPatientDmpUI.enterDemo()" style="flex:1; color:#fbbf24; border-color:rgba(251,191,36,0.4);">⚡ Démo (PG-PAT-237890)</button>
        </div>
      </div>
    `;
  }

  function renderTimelineSection(records) {
    const filtered = catFilter === 'all' ? records : records.filter((r) => {
      if (catFilter === 'analyses') return r.category === 'lab_result' || r.category === 'imaging';
      return r.category === catFilter;
    });

    const flagTag = (f) => {
      if (f === 'critical') return '<span style="color:#f87171; font-weight:900;">🔴 CRITIQUE</span>';
      if (f === 'high') return '<span style="color:#fbbf24; font-weight:800;">🟠 ÉLEVÉ</span>';
      if (f === 'low') return '<span style="color:#60a5fa; font-weight:800;">🔵 BAS</span>';
      return '<span style="color:#34d399; font-weight:700;">✅ Normal</span>';
    };

    return `
      <div style="display:flex; gap:5px; overflow-x:auto; padding-bottom:6px; margin-bottom:10px;">
        ${[
          ['all', 'Tout'],
          ['analyses', '🧪 Analyses & Imagerie'],
          ['prescription', '📝 Ordonnances'],
          ['consultation', '🩺 Consultations'],
          ['pharmacy_dispensation', '💊 Pharmacies'],
          ['vitals', '❤️ Constantes']
        ].map(([k, lbl]) => `
          <button type="button" class="btn btn--sm ${catFilter === k ? 'btn--primary' : 'btn--secondary'}" onclick="PGPatientDmpUI.setCatFilter('${k}')" style="white-space:nowrap; font-size:11px; padding:4px 9px;">${lbl}</button>
        `).join('')}
      </div>

      <div style="display:flex; flex-direction:column; gap:10px;">
        ${filtered.length === 0 ? '<div style="text-align:center; padding:24px; color:#94a3b8; font-size:12.5px;">Aucune trace dans cette catégorie pour le moment.</div>' : filtered.map((r) => {
          const cat = PGPatientDMP.CATEGORIES[r.category] || PGPatientDMP.CATEGORIES.document;
          const c = r.content_json || {};
          const params = Array.isArray(c.parameters) ? c.parameters : [];
          return `
            <div class="pharma-card" style="border-color:${!r.is_read ? 'rgba(52,211,153,0.65)' : 'rgba(148,163,184,0.22)'};">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:6px; flex-wrap:wrap; margin-bottom:6px;">
                <span style="font-size:11px; font-weight:800; color:${cat.color};">${cat.icon} ${esc(cat.label)} ${!r.is_read ? '<span style="background:#10b981;color:#fff;padding:1px 6px;border-radius:999px;font-size:9.5px;margin-left:4px;">NOUVEAU</span>' : ''}</span>
                <span style="font-size:10.5px; color:#94a3b8;">🕒 ${esc(PGPatientDMP.formatDateTime(r.occurred_at))}</span>
              </div>
              <div style="font-weight:800; font-size:14px; color:#fff; margin-bottom:3px;">${esc(r.title)}</div>
              <div style="font-size:11.5px; color:#94a3b8; margin-bottom:6px;">🏛️ ${esc(r.issuer_name)} · Réf. <code style="color:#fbbf24;">${esc(r.external_ref || '—')}</code></div>
              ${r.summary ? `<div style="font-size:12px; color:#e2e8f0; margin-bottom:8px;">${esc(r.summary)}</div>` : ''}

              ${params.length > 0 ? `
                <div style="background:rgba(0,0,0,0.28); border-radius:8px; padding:8px; margin-bottom:8px; font-size:11.5px;">
                  ${params.map((p) => `
                    <div style="display:flex; justify-content:space-between; gap:6px; padding:3px 0; border-bottom:1px dashed rgba(255,255,255,0.06);">
                      <span style="color:#cbd5e1;">${esc(p.name)}</span>
                      <span><strong style="color:#fff;">${esc(p.value)}</strong> <small style="color:#94a3b8;">${esc(p.unit || '')} (${esc(p.ref_range || '')})</small> ${flagTag(p.flag)}</span>
                    </div>
                  `).join('')}
                </div>
              ` : ''}

              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                <span style="font-size:10px; color:#64748b; font-family:monospace;">🔒 SHA-256 : ${esc(String(r.integrity_hash || '').slice(0, 14))}…</span>
                <div style="display:flex; gap:6px;">
                  ${(r.category === 'lab_result' || r.category === 'imaging') ? `<button type="button" class="btn btn--secondary btn--sm" onclick="PGPatientDmpUI.openLabPdfAndRead('${esc(r.id)}')" style="padding:4px 9px; font-size:11px;">📄 Compte-Rendu PDF</button>` : ''}
                  ${(r.category === 'prescription' && c.rx_id) ? `<button type="button" class="btn btn--primary btn--sm" onclick="PGPatientCare && PGPatientCare.searchRxInPharmacies('${esc(c.rx_id)}')" style="padding:4px 9px; font-size:11px;">💊 Chercher Pharmacie</button>` : ''}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderShareSection(pat) {
    const grants = PGPatientDMP.getPatientGrants(pat.patient_code);
    return `
      <div class="pharma-card" style="margin-bottom:12px; border-color:rgba(251,191,36,0.4);">
        <div style="font-weight:800; font-size:14px; color:#fbbf24; margin-bottom:4px;">🤝 Transmettre mon Carnet à un Professionnel de Santé</div>
        <p style="font-size:11.5px; color:#94a3b8; margin:0 0 10px;">
          Générez un code d'accès temporaire chiffré à communiquer à votre Médecin, Hôpital, Clinique, Laboratoire ou Pharmacie. Révocable à tout instant en 1 clic.
        </p>
        <div class="pa-grid-2" style="margin-bottom:8px;">
          <select id="dmp-sh-role" class="form-input form-select">
            <option value="doctor">🩺 Médecin (ONMC)</option>
            <option value="hospital">🏥 Hôpital</option>
            <option value="clinic">🏨 Clinique</option>
            <option value="laboratory">🔬 Laboratoire d'Analyses</option>
            <option value="pharmacy">💊 Pharmacie (Allergies &amp; Ordonnances)</option>
            <option value="any">🌐 Tout professionnel habilité</option>
          </select>
          <select id="dmp-sh-dur" class="form-input form-select">
            <option value="1">⏱️ Valide 1 heure</option>
            <option value="24" selected>⏱️ Valide 24 heures</option>
            <option value="168">⏱️ Valide 7 jours</option>
          </select>
        </div>
        <input type="text" id="dmp-sh-target" class="form-input" placeholder="Nom du médecin / établissement (optionnel)" style="margin-bottom:8px;">
        <div style="display:flex; gap:8px; flex-wrap:wrap; font-size:11.5px; margin-bottom:10px; color:#cbd5e1;">
          <label><input type="checkbox" class="dmp-sh-cat" value="lab_result" checked> 🧪 Analyses</label>
          <label><input type="checkbox" class="dmp-sh-cat" value="imaging" checked> 🩻 Imagerie</label>
          <label><input type="checkbox" class="dmp-sh-cat" value="prescription" checked> 📝 Ordonnances</label>
          <label><input type="checkbox" class="dmp-sh-cat" value="consultation" checked> 🩺 Consultations</label>
          <label><input type="checkbox" class="dmp-sh-cat" value="pharmacy_dispensation" checked> 💊 Pharmacies</label>
          <label><input type="checkbox" class="dmp-sh-cat" value="vitals" checked> ❤️ Constantes</label>
        </div>
        <button type="button" class="btn btn--primary btn--block" onclick="PGPatientDmpUI.createGrant()">🔐 Générer un Code de Partage Temporaire</button>
      </div>

      <div style="font-size:12px; font-weight:800; color:#34d399; margin-bottom:8px;">🔑 Mes Partages (${grants.length})</div>
      ${grants.length === 0 ? '<div style="font-size:12px; color:#94a3b8; text-align:center; padding:16px;">Aucun partage actif. Votre dossier est 100 % privé.</div>' : grants.map((g) => {
        const active = !g.revoked_at && Date.now() < new Date(g.expires_at).getTime();
        return `
          <div class="pharma-card" style="margin-bottom:8px; opacity:${active ? '1' : '0.55'};">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
              <div>
                <strong style="font-family:monospace; font-size:15px; color:#fbbf24;">${esc(g.share_code)}</strong>
                <span style="font-size:11px; color:#94a3b8; margin-left:6px;">(${esc(g.target_role)} · ${esc(g.target_name)})</span>
              </div>
              <div style="display:flex; gap:6px;">
                ${active ? `<button type="button" class="btn btn--secondary btn--sm" onclick="navigator.clipboard && navigator.clipboard.writeText('${esc(g.share_code)}'); PGPatientDmpUI.notifyInfo('Code copié !')" style="padding:3px 8px; font-size:11px;">📋 Copier</button>` : ''}
                ${active ? `<button type="button" class="btn btn--sm" onclick="PGPatientDmpUI.revokeGrant('${esc(g.id)}')" style="padding:3px 8px; font-size:11px; background:rgba(239,68,68,0.16); color:#f87171; border:1px solid rgba(239,68,68,0.4);">🚫 Révoquer</button>` : `<span style="font-size:11px; color:#f87171;">${g.revoked_at ? 'Révoqué' : 'Expiré'}</span>`}
              </div>
            </div>
            <div style="font-size:11px; color:#94a3b8; margin-top:4px;">Expire le : ${esc(PGPatientDMP.formatDateTime(g.expires_at))}</div>
          </div>
        `;
      }).join('')}
    `;
  }

  function renderAddSection() {
    return `
      <div class="pharma-card">
        <div style="font-weight:800; font-size:14px; color:#34d399; margin-bottom:8px;">➕ Ajouter une Information Médicale Horodatée</div>
        <div class="form-group" style="margin-bottom:8px;">
          <label class="form-label">Type d'entrée</label>
          <select id="dmp-add-cat" class="form-input form-select">
            <option value="vitals">❤️ Constantes Vitales (Tension, Glycémie, Poids)</option>
            <option value="vaccination">💉 Vaccination</option>
            <option value="hospitalization">🏥 Hospitalisation / Urgences</option>
            <option value="document">📄 Document / Compte-Rendu Externe</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:8px;">
          <label class="form-label">Titre *</label>
          <input type="text" id="dmp-add-title" class="form-input" placeholder="Ex : Mesure Tension & Glycémie / Vaccin Fièvre Jaune">
        </div>
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label">Détails / Valeurs / Observations *</label>
          <textarea id="dmp-add-summary" class="form-input" rows="3" placeholder="Ex : TA 120/80 mmHg, Glycémie 0.92 g/L, Poids 68 kg..."></textarea>
        </div>
        <button type="button" class="btn btn--primary btn--block" onclick="PGPatientDmpUI.submitManualEntry()">💾 Enregistrer &amp; Sceller (SHA-256)</button>
      </div>
    `;
  }

  function renderAuditSection(pat) {
    const logs = PGPatientDMP.getAuditLog(pat.patient_code);
    return `
      <div class="pharma-card">
        <div style="font-weight:800; font-size:14px; color:#38bdf8; margin-bottom:4px;">🛡️ Journal d'Accès &amp; Traçabilité Complète (${logs.length})</div>
        <p style="font-size:11.5px; color:#94a3b8; margin:0 0 10px;">
          Chaque lecture par un professionnel autorisé et chaque dépôt automatique de résultat ou d'ordonnance est tracé ici avec la date et l'heure exactes.
        </p>
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${logs.map((l) => `
            <div style="padding:8px 10px; border-radius:8px; background:rgba(15,23,42,0.65); border:1px solid rgba(148,163,184,0.16); font-size:11.5px;">
              <div style="display:flex; justify-content:space-between; gap:6px;">
                <strong style="color:#fbbf24;">${esc(l.action)}</strong>
                <span style="color:#94a3b8; font-size:10.5px;">${esc(PGPatientDMP.formatDateTime(l.created_at))}</span>
              </div>
              <div style="color:#e2e8f0; margin-top:2px;">👤 ${esc(l.actor_name)} (${esc(l.actor_role)})</div>
              <div style="color:#94a3b8; font-size:11px;">${esc(l.details)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function refresh() {
    const panel = document.getElementById('patient-care-panel');
    if (panel && panel.style.display !== 'none' && window.PGPatientCare && PGPatientCare.getMode && PGPatientCare.getMode() === 'dmp') {
      renderDmpView(panel);
    }
    updateUnreadBadge();
  }

  async function submitRegister() {
    try {
      const p = await PGPatientDMP.registerPatient({
        full_name: document.getElementById('dmp-reg-name')?.value,
        phone: document.getElementById('dmp-reg-phone')?.value,
        email: document.getElementById('dmp-reg-email')?.value,
        birth_date: document.getElementById('dmp-reg-birth')?.value,
        blood_group: document.getElementById('dmp-reg-blood')?.value,
        allergies: document.getElementById('dmp-reg-allergies')?.value,
        emergency_contact_name: document.getElementById('dmp-reg-ice-name')?.value,
        emergency_contact_phone: document.getElementById('dmp-reg-ice-phone')?.value,
        password: document.getElementById('dmp-reg-pwd')?.value,
        pin: document.getElementById('dmp-reg-pin')?.value
      });
      notify(`🛡️ Carnet Médical créé ! Votre code personnel : ${p.patient_code}`, 'success');
      refresh();
    } catch (err) { notify('❌ ' + err.message, 'error'); }
  }

  async function submitLogin() {
    try {
      const p = await PGPatientDMP.loginPatient(
        document.getElementById('dmp-login-id')?.value,
        document.getElementById('dmp-login-pwd')?.value
      );
      notify(`✅ Bienvenue dans votre Carnet Souverain, ${p.full_name} !`, 'success');
      refresh();
    } catch (err) { notify('❌ ' + err.message, 'error'); }
  }

  function enterDemo() {
    PGPatientDMP.loginDemoPatient();
    notify('🛡️ Carnet Médical Démo ouvert (PG-PAT-237890 · PIN : 1234)', 'success');
    refresh();
  }

  async function unlockPin() {
    try {
      await PGPatientDMP.unlockVaultWithPin(document.getElementById('dmp-pin-unlock-input')?.value);
      notify('🔓 Carnet Médical déverrouillé.', 'success');
      refresh();
    } catch (err) { notify('❌ ' + err.message, 'error'); }
  }

  function lock() { PGPatientDMP.lockVault(); notify('🔒 Carnet Médical verrouillé.', 'info'); refresh(); }
  function logout() { PGPatientDMP.logoutPatient(); authMode = 'login'; notify('👋 Carnet Médical déconnecté.', 'info'); refresh(); }
  function setAuthMode(m) { authMode = m; refresh(); }
  function setSubTab(t) { subTab = t; refresh(); }
  function setCatFilter(c) { catFilter = c; refresh(); }
  function notifyInfo(m) { notify(m, 'info'); }

  function copyPatientCode(code) {
    if (navigator.clipboard) navigator.clipboard.writeText(code).catch(() => {});
    notify(`📋 Code Patient ${code} copié ! Donnez-le au laboratoire ou à l'hôpital.`, 'success');
  }

  function openLabPdfAndRead(recId) {
    PGPatientDMP.markRecordRead(recId);
    PGPatientDMP.downloadAnalysisPDF(recId);
    refresh();
  }

  function markAllRead() {
    PGPatientDMP.markAllRecordsRead();
    notify('✅ Tous les résultats marqués comme lus.', 'info');
    refresh();
  }

  async function createGrant() {
    const cats = Array.from(document.querySelectorAll('.dmp-sh-cat:checked')).map((el) => el.value);
    try {
      const g = await PGPatientDMP.createShareGrant({
        target_role: document.getElementById('dmp-sh-role')?.value,
        duration_hours: Number(document.getElementById('dmp-sh-dur')?.value) || 24,
        target_name: document.getElementById('dmp-sh-target')?.value,
        allowed_categories: cats
      });
      notify(`🔐 Code de partage généré : ${g.share_code}`, 'success');
      refresh();
    } catch (err) { notify('❌ ' + err.message, 'error'); }
  }

  async function revokeGrant(id) {
    await PGPatientDMP.revokeShareGrant(id);
    notify('🚫 Accès révoqué immédiatement.', 'info');
    refresh();
  }

  async function submitManualEntry() {
    const pat = PGPatientDMP.getCurrentPatient();
    const title = (document.getElementById('dmp-add-title')?.value || '').trim();
    const summary = (document.getElementById('dmp-add-summary')?.value || '').trim();
    const cat = document.getElementById('dmp-add-cat')?.value || 'vitals';
    if (!pat || !title || !summary) { notify('⚠️ Veuillez renseigner le titre et les détails.', 'error'); return; }
    await PGPatientDMP.pushMedicalRecord({ patient_code: pat.patient_code }, {
      category: cat,
      title,
      summary,
      issuer_type: 'patient',
      issuer_id: pat.id,
      issuer_name: `${pat.full_name} (Auto-suivi Souverain)`
    });
    subTab = 'timeline';
    notify('✅ Entrée enregistrée, horodatée et scellée SHA-256 !', 'success');
    refresh();
  }

  function enableAlerts() {
    if (typeof Notification === 'undefined') { notify('🔔 Alertes temps réel actives dans l\'application.', 'info'); return; }
    Notification.requestPermission().then((p) => {
      notify(p === 'granted' ? '🔔 Alertes push activées : vous serez averti dès qu\'un résultat est prêt !' : 'ℹ️ Alertes navigateur refusées (alertes internes toujours actives).', p === 'granted' ? 'success' : 'info');
    });
  }

  document.addEventListener('pgDmpUpdated', refresh);
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.includes('pharmagarde_dmp_')) refresh();
  });

  window.PGPatientDmpUI = {
    renderDmpView,
    updateUnreadBadge,
    submitRegister,
    submitLogin,
    enterDemo,
    unlockPin,
    lock,
    logout,
    setAuthMode,
    setSubTab,
    setCatFilter,
    copyPatientCode,
    openLabPdfAndRead,
    markAllRead,
    createGrant,
    revokeGrant,
    submitManualEntry,
    enableAlerts,
    notifyInfo
  };
})(window);

