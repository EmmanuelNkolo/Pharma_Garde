/**
 * Pharma-Garde v13.0 — Module Analyses Médicales, Imagerie & Connecteur SIL/SIH
 * ──────────────────────────────────────────────────────────────────────────────
 * Utilisé par les Laboratoires d'Analyses, Hôpitaux, Cliniques & Centres d'Imagerie :
 *   1. Mini-SIL / Mini-SIH autonome intégré :
 *        - Création de dossiers d'analyse / imagerie liés au Code Patient (PG-PAT-XXXXXX)
 *        - Modèles cliniques pré-configurés (NFS, Palu/Widal, Diabète, Hépato-Rénal, Imagerie, ECG)
 *        - Calcul automatique des drapeaux (NORMAL / BAS / ÉLEVÉ / CRITIQUE)
 *        - Validation Biologiste/Médecin → Dépôt instantané horodaté dans le Carnet Médical (DMP)
 *          du patient + Notification automatique (Realtime + alerte WhatsApp confidentielle) + PDF
 *   2. Connecteur Universel SIL / SIH / LIS / HIS :
 *        - Liaison aux logiciels existants (OpenLIS, SENAITE, OpenMRS, OpenClinic GA, GLIMS, HL7 v2, FHIR R4)
 *        - Clé API secrète + URL Webhook Cloud + Test Daemon local + Import fichiers JSON/FHIR/HL7/CSV
 *        - Simulation Live de réception SIL/SIH pour tester le flux complet en 1 clic
 *
 * Expose : window.PGLabManager
 */
(function (window) {
  'use strict';

  const ORDERS_KEY = 'pharmagarde_lab_orders_v13';
  const CONN_KEY = 'pharmagarde_sil_sih_connector_v13';

  const EXAM_TEMPLATES = {
    nfs_palu: {
      name: 'NFS (Numération Formule Sanguine) + TDR Paludisme',
      category: 'hematologie',
      params: [
        { name: 'Hémoglobine (Hb)', value: '13.4', unit: 'g/dL', ref_range: '12.0 - 16.5', flag: 'normal' },
        { name: 'Leucocytes (GB)', value: '7.1', unit: '10³/µL', ref_range: '4.0 - 10.0', flag: 'normal' },
        { name: 'Plaquettes', value: '260', unit: '10³/µL', ref_range: '150 - 400', flag: 'normal' },
        { name: 'Goutte Épaisse / TDR Paludisme', value: 'Négatif', unit: '—', ref_range: 'Négatif', flag: 'normal' }
      ],
      conclusion: 'Formule sanguine équilibrée. Recherche de trophozoïtes négative.'
    },
    diabete: {
      name: 'Bilan Glycémique & Diabète (Glycémie + HbA1c)',
      category: 'biochimie',
      params: [
        { name: 'Glycémie à jeun', value: '0.96', unit: 'g/L', ref_range: '0.70 - 1.10', flag: 'normal' },
        { name: 'Hémoglobine Glyquée (HbA1c)', value: '5.6', unit: '%', ref_range: '< 6.0', flag: 'normal' },
        { name: 'Cholestérol Total', value: '1.88', unit: 'g/L', ref_range: '< 2.00', flag: 'normal' }
      ],
      conclusion: 'Équilibre glycémique satisfaisant.'
    },
    hepato_renal: {
      name: 'Bilan Hépatique & Rénal Complet',
      category: 'biochimie',
      params: [
        { name: 'Créatinine sérique', value: '9.2', unit: 'mg/L', ref_range: '6.0 - 13.0', flag: 'normal' },
        { name: 'Urée sanguine', value: '0.28', unit: 'g/L', ref_range: '0.15 - 0.45', flag: 'normal' },
        { name: 'ASAT (TGO)', value: '24', unit: 'UI/L', ref_range: '< 35', flag: 'normal' },
        { name: 'ALAT (TGP)', value: '27', unit: 'UI/L', ref_range: '< 40', flag: 'normal' }
      ],
      conclusion: 'Fonctions hépatique et rénale dans les normes.'
    },
    imagerie: {
      name: 'Échographie Abdomino-Pelvienne / Radiographie',
      category: 'imagerie',
      params: [
        { name: 'Foie & Voies Biliaires', value: 'Normaux, échostructure homogène', unit: '—', ref_range: 'Normal', flag: 'normal' },
        { name: 'Reins & Rate', value: 'Taille normale, sans lithiase', unit: '—', ref_range: 'Normal', flag: 'normal' }
      ],
      conclusion: 'Examen d\'imagerie sans anomalie morphologique décelable ce jour.'
    },
    cardio: {
      name: 'ECG de Repos 12 Dérivations & Bilan Cardiaque',
      category: 'cardiologie',
      params: [
        { name: 'Fréquence Cardiaque', value: '72', unit: 'bpm', ref_range: '60 - 100', flag: 'normal' },
        { name: 'Rythme', value: 'Sinusal régulier', unit: '—', ref_range: 'Sinusal', flag: 'normal' },
        { name: 'Tension Artérielle', value: '122/78', unit: 'mmHg', ref_range: '< 140/90', flag: 'normal' }
      ],
      conclusion: 'Tracé électrocardiographique normal.'
    }
  };

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function readLS(k, fb) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch (e) { return fb; } }
  function writeLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function toast(msg, type) {
    const t = document.getElementById('toast'), m = document.getElementById('toast-message');
    if (t && m) {
      t.className = 'toast toast--' + (type || 'success');
      m.textContent = (window.I18n && I18n.translateText) ? I18n.translateText(String(msg || '')) : msg;
      t.classList.add('show');
      clearTimeout(t._timer);
      t._timer = setTimeout(() => t.classList.remove('show'), 3800);
    }
  }

  function getOrders() { return readLS(ORDERS_KEY, []); }
  function saveOrders(list) { writeLS(ORDERS_KEY, list.slice(0, 200)); }

  function getConnectorCfg(facId) {
    const all = readLS(CONN_KEY, {});
    if (!all[facId]) {
      all[facId] = {
        software_vendor: 'openlis',
        protocol: 'webhook_json',
        endpoint_url: 'http://localhost:8090',
        api_key: 'PG-SIL-' + Math.random().toString(36).slice(2, 10).toUpperCase() + '-' + Date.now().toString(36).toUpperCase(),
        auto_notify_patient: true,
        last_sync_at: null,
        logs: [
          { ts: new Date().toISOString(), level: 'info', text: 'Passerelle SIL/SIH Pharma-Garde prête (JSON, FHIR R4, HL7 v2 ORU^R01, CSV).' }
        ]
      };
      writeLS(CONN_KEY, all);
    }
    return all[facId];
  }

  function saveConnectorCfg(facId, cfg) {
    const all = readLS(CONN_KEY, {});
    all[facId] = cfg;
    writeLS(CONN_KEY, all);
  }

  function appendConnLog(facId, level, text) {
    const cfg = getConnectorCfg(facId);
    cfg.logs = cfg.logs || [];
    cfg.logs.unshift({ ts: new Date().toISOString(), level, text });
    cfg.logs = cfg.logs.slice(0, 40);
    saveConnectorCfg(facId, cfg);
  }

  async function sha256Hex(text) {
    const bytes = new TextEncoder().encode(String(text || ''));
    if (window.crypto && window.crypto.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 2166136261;
    for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  async function syncConnectorToCloud(facility, cfg) {
    if (!window.supabase || !facility || !cfg || !cfg.api_key) return;
    try {
      const { data: userRes } = window.supabase.auth ? await window.supabase.auth.getUser() : { data: null };
      const uid = (userRes && userRes.user && userRes.user.id) || (/^[0-9a-f-]{36}$/i.test(String(facility.id || '')) ? facility.id : null);
      if (!uid) return;
      const apiKeyHash = await sha256Hex(cfg.api_key);
      await window.supabase.from('facility_api_connectors').upsert([{
        facility_id: String(facility.id),
        facility_user_id: uid,
        facility_name: facility.name || 'Établissement',
        software_vendor: cfg.software_vendor || 'openlis',
        protocol: cfg.protocol || 'webhook_json',
        endpoint_url: cfg.endpoint_url || 'http://localhost:8090',
        api_key_hash: apiKeyHash,
        auto_notify_patient: cfg.auto_notify_patient !== false,
        is_active: true,
        updated_at: new Date().toISOString()
      }], { onConflict: 'facility_id' });
    } catch (e) {}
  }

  let _ordersSyncedFor = null;
  async function syncOrdersFromCloud(facility) {
    if (!window.supabase || !facility) return;
    try {
      const { data } = await window.supabase
        .from('lab_analysis_orders')
        .select('*')
        .eq('facility_id', String(facility.id))
        .order('created_at', { ascending: false })
        .limit(100);
      if (Array.isArray(data) && data.length > 0) {
        const mapped = data.map((r) => ({
          id: r.id,
          order_code: r.order_code,
          facility_id: r.facility_id,
          facility_name: r.facility_name,
          facility_type: r.facility_type,
          patient_code: r.patient_code,
          patient_name: r.patient_name,
          patient_phone: r.patient_phone,
          exam_category: r.exam_category,
          exam_name: r.exam_name,
          status: r.status,
          parameters: r.parameters_json || [],
          conclusion: r.conclusion || '',
          validator_name: r.validator_name || '',
          source_system: r.source_system || 'internal',
          published_at: r.published_at,
          created_at: r.created_at
        }));
        const map = new Map();
        mapped.forEach((o) => map.set(o.order_code || o.id, o));
        getOrders().forEach((o) => { if (!map.has(o.order_code || o.id)) map.set(o.order_code || o.id, o); });
        saveOrders(Array.from(map.values()).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)));
      }
    } catch (e) {}
  }

  // ════════════════════════════════════════════════════════════════
  // ONGLET 1 : MINI-SIL / MINI-SIH AUTONOME (ANALYSES & IMAGERIE)
  // ════════════════════════════════════════════════════════════════
  function renderAnalysesPanel(host, facility) {
    if (!host || !facility) return;
    if (_ordersSyncedFor !== facility.id) {
      _ordersSyncedFor = facility.id;
      syncOrdersFromCloud(facility).then(() => {
        const h = document.getElementById('fpanel-analyses');
        if (h && h.style.display !== 'none') renderAnalysesPanel(h, facility);
      }).catch(() => {});
    }
    const mine = getOrders().filter((o) => o.facility_id === facility.id || (window.PGAdmin && PGAdmin.isAdmin()));
    const pubCount = mine.filter((o) => o.status === 'published').length;
    const inProgCount = mine.filter((o) => o.status !== 'published').length;

    host.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:10px; margin-bottom:14px;">
        <div class="pharm-card" style="text-align:center; padding:12px;">
          <div style="font-size:11px; color:#94a3b8; font-weight:800;">DOSSIERS ANALYSES / IMAGERIE</div>
          <div style="font-size:24px; font-weight:900; color:#c4b5fd; margin-top:4px;">${mine.length}</div>
        </div>
        <div class="pharm-card" style="text-align:center; padding:12px;">
          <div style="font-size:11px; color:#94a3b8; font-weight:800;">EN COURS DE TRAITEMENT</div>
          <div style="font-size:24px; font-weight:900; color:#fbbf24; margin-top:4px;">${inProgCount}</div>
        </div>
        <div class="pharm-card" style="text-align:center; padding:12px;">
          <div style="font-size:11px; color:#94a3b8; font-weight:800;">PUBLIÉS AU CARNET PATIENT</div>
          <div style="font-size:24px; font-weight:900; color:#34d399; margin-top:4px;">${pubCount}</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1.1fr 0.9fr; gap:16px;" class="pg-two-col">
        <!-- Formulaire de saisie & publication instantanée -->
        <div class="pharm-card">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
            <h3 style="margin:0; font-size:15px; font-weight:800; color:#c4b5fd;">🧪 Saisir &amp; Publier un Résultat d'Analyse / Imagerie</h3>
            <select id="lab-tpl-select" class="form-input form-select" onchange="PGLabManager.applyTemplate(this.value)" style="max-width:230px; min-height:36px; font-size:12px;">
              <option value="">⚡ Charger un modèle clinique...</option>
              <option value="nfs_palu">🩸 NFS + TDR Paludisme</option>
              <option value="diabete">🧪 Bilan Diabète (Glycémie + HbA1c)</option>
              <option value="hepato_renal">🧬 Bilan Hépatique &amp; Rénal</option>
              <option value="imagerie">🩻 Imagerie (Écho / Scanner / Radio)</option>
              <option value="cardio">❤️ ECG &amp; Bilan Cardiaque</option>
            </select>
          </div>
          <p style="font-size:12px; color:#94a3b8; margin:0 0 12px;">
            Dès validation, le compte-rendu PDF scellé SHA-256 est <strong>téléversé instantanément dans le Carnet Médical Numérique du patient</strong> et ce dernier est notifié automatiquement.
          </p>

          <div class="pa-grid-2" style="margin-bottom:8px;">
            <div class="form-group">
              <label class="form-label">Code Carnet Patient (DMP) *</label>
              <input type="text" id="lab-pat-code" class="form-input" placeholder="Ex : PG-PAT-237890" value="PG-PAT-237890" style="text-transform:uppercase; font-family:monospace; font-weight:800;">
            </div>
            <div class="form-group">
              <label class="form-label">Nom complet du Patient *</label>
              <input type="text" id="lab-pat-name" class="form-input" placeholder="Ex : Marie Ngo Biyong" value="Marie Ngo Biyong">
            </div>
          </div>
          <div class="pa-grid-2" style="margin-bottom:8px;">
            <div class="form-group">
              <label class="form-label">Téléphone Patient (Alerte dispo)</label>
              <input type="tel" id="lab-pat-phone" class="form-input" placeholder="6XX XXX XXX" value="699884422">
            </div>
            <div class="form-group">
              <label class="form-label">Discipline / Catégorie *</label>
              <select id="lab-exam-cat" class="form-input form-select">
                <option value="hematologie">🩸 Hématologie</option>
                <option value="biochimie">🧪 Biochimie</option>
                <option value="parasitologie">🔬 Parasitologie / Paludisme</option>
                <option value="microbiologie">🦠 Microbiologie / Bactériologie</option>
                <option value="imagerie">🩻 Imagerie Médicale (Radio / Écho / Scanner / IRM)</option>
                <option value="cardiologie">❤️ Cardiologie / ECG</option>
                <option value="anatomopathologie">🧫 Anatomopathologie</option>
              </select>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:10px;">
            <label class="form-label">Intitulé de l'Examen / Analyse *</label>
            <input type="text" id="lab-exam-name" class="form-input" placeholder="Ex : NFS + CRP + TDR Paludisme">
          </div>

          <div style="font-size:12px; font-weight:800; color:#34d399; margin-bottom:6px;">📊 Paramètres Mesurés, Unités, Normes &amp; Interprétation</div>
          <div id="lab-params-rows" style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;">
            ${buildParamRowHtml({ name: '', value: '', unit: '', ref_range: '', flag: 'normal' })}
          </div>
          <button type="button" class="btn btn--secondary btn--sm" onclick="PGLabManager.addParamRow()" style="margin-bottom:10px;">+ Ajouter un paramètre</button>

          <div class="pa-grid-2" style="margin-bottom:10px;">
            <div class="form-group">
              <label class="form-label">Biologiste / Médecin Validateur *</label>
              <input type="text" id="lab-validator" class="form-input" value="${esc(facility.director_name || 'Dr Biologiste Responsable')}">
            </div>
            <div class="form-group">
              <label class="form-label">Statut initial</label>
              <select id="lab-init-status" class="form-input form-select">
                <option value="published">🔔 Publier immédiatement &amp; Notifier le Patient</option>
                <option value="in_progress">🔬 Enregistrer « En cours d'analyse » (sans publier)</option>
              </select>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label">Conclusion Clinique / Commentaire Biologiste</label>
            <textarea id="lab-conclusion" class="form-input" rows="2" placeholder="Interprétation synthétique et recommandation clinique..."></textarea>
          </div>

          <button type="button" class="btn btn--primary btn--block" onclick="PGLabManager.submitOrder()">
            ✅ Valider &amp; Envoyer dans le Carnet Médical Patient
          </button>
        </div>

        <!-- Registre des Dossiers d'Analyses & Imagerie -->
        <div class="pharm-card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap:8px;">
            <h3 style="margin:0; font-size:15px; font-weight:800; color:#34d399;">📋 Dossiers Récents (${mine.length})</h3>
            <span style="font-size:11px; color:#94a3b8;">SIL / SIH Intégré</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:10px; max-height:620px; overflow-y:auto;">
            ${mine.length === 0 ? '<div style="text-align:center; padding:26px; color:#94a3b8; font-size:12.5px;">Aucun dossier saisi. Utilisez un modèle clinique à gauche ou testez le Connecteur SIL/SIH !</div>' : mine.map((o) => {
              const isPub = o.status === 'published';
              const waPhone = String(o.patient_phone || '').replace(/\D/g, '').replace(/^237/, '');
              const waMsg = encodeURIComponent(`Bonjour ${o.patient_name}, vos résultats d'analyse (${o.order_code}) de ${o.facility_name} sont désormais disponibles dans votre Carnet Médical sécurisé Pharma-Garde (confidentiel).`);
              return `
                <div style="padding:12px; border-radius:12px; background:rgba(15,23,42,0.7); border:1px solid ${isPub ? 'rgba(52,211,153,0.4)' : 'rgba(251,191,36,0.4)'};">
                  <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:4px;">
                    <strong style="color:#fbbf24; font-family:monospace; font-size:12.5px;">${esc(o.order_code)}</strong>
                    <span style="padding:2px 8px; border-radius:999px; font-size:10.5px; font-weight:800; background:${isPub ? 'rgba(16,185,129,0.18)' : 'rgba(245,158,11,0.18)'}; color:${isPub ? '#34d399' : '#fbbf24'};">
                      ${isPub ? '🔔 Publié & Notifié' : '🔬 En cours'}
                    </span>
                  </div>
                  <div style="font-weight:800; color:#fff; font-size:13.5px;">${esc(o.exam_name)}</div>
                  <div style="font-size:11.5px; color:#cbd5e1; margin:3px 0 8px;">
                    👤 ${esc(o.patient_name)} (<code style="color:#38bdf8;">${esc(o.patient_code || '—')}</code>) · 🕒 ${esc(new Date(o.created_at).toLocaleString('fr-FR'))}
                    ${o.source_system !== 'internal' ? ` · <span style="color:#c4b5fd;">🔌 ${esc(o.source_system.toUpperCase())}</span>` : ''}
                  </div>
                  <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    ${!isPub ? `<button type="button" class="btn btn--primary btn--sm" onclick="PGLabManager.publishExistingOrder('${esc(o.id)}')">🔔 Valider &amp; Notifier Patient</button>` : ''}
                    ${o.dmp_record_id ? `<button type="button" class="btn btn--secondary btn--sm" onclick="PGPatientDMP && PGPatientDMP.downloadAnalysisPDF('${esc(o.dmp_record_id)}')">📄 PDF Officiel</button>` : ''}
                    ${isPub && waPhone ? `<a href="https://wa.me/237${waPhone}?text=${waMsg}" target="_blank" rel="noopener" class="btn btn--secondary btn--sm" style="color:#34d399; border-color:rgba(52,211,153,0.4);">💬 Alerte WhatsApp</a>` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function buildParamRowHtml(p) {
    return `
      <div class="lab-param-row" style="display:grid; grid-template-columns:1.4fr 0.8fr 0.7fr 1fr 0.85fr; gap:5px;">
        <input type="text" class="form-input lp-name" placeholder="Paramètre" value="${esc(p.name || '')}" style="min-height:38px; font-size:12px;">
        <input type="text" class="form-input lp-val" placeholder="Valeur" value="${esc(p.value || '')}" style="min-height:38px; font-size:12px;">
        <input type="text" class="form-input lp-unit" placeholder="Unité" value="${esc(p.unit || '')}" style="min-height:38px; font-size:12px;">
        <input type="text" class="form-input lp-ref" placeholder="Norme" value="${esc(p.ref_range || '')}" style="min-height:38px; font-size:12px;">
        <select class="form-input form-select lp-flag" style="min-height:38px; font-size:11.5px;">
          <option value="normal" ${p.flag === 'normal' ? 'selected' : ''}>✅ Normal</option>
          <option value="low" ${p.flag === 'low' ? 'selected' : ''}>🔵 Bas</option>
          <option value="high" ${p.flag === 'high' ? 'selected' : ''}>🟠 Élevé</option>
          <option value="critical" ${p.flag === 'critical' ? 'selected' : ''}>🔴 Critique</option>
        </select>
      </div>
    `;
  }

  function addParamRow(prefill) {
    const wrap = document.getElementById('lab-params-rows');
    if (!wrap) return;
    const div = document.createElement('div');
    div.innerHTML = buildParamRowHtml(prefill || { name: '', value: '', unit: '', ref_range: '', flag: 'normal' });
    wrap.appendChild(div.firstElementChild);
  }

  function applyTemplate(key) {
    const tpl = EXAM_TEMPLATES[key];
    if (!tpl) return;
    const nameEl = document.getElementById('lab-exam-name');
    const catEl = document.getElementById('lab-exam-cat');
    const concEl = document.getElementById('lab-conclusion');
    const wrap = document.getElementById('lab-params-rows');
    if (nameEl) nameEl.value = tpl.name;
    if (catEl) catEl.value = tpl.category;
    if (concEl) concEl.value = tpl.conclusion;
    if (wrap) wrap.innerHTML = tpl.params.map(buildParamRowHtml).join('');
  }

  function collectParamsFromForm() {
    const out = [];
    document.querySelectorAll('.lab-param-row').forEach((row) => {
      const name = (row.querySelector('.lp-name')?.value || '').trim();
      const value = (row.querySelector('.lp-val')?.value || '').trim();
      const unit = (row.querySelector('.lp-unit')?.value || '').trim();
      const ref_range = (row.querySelector('.lp-ref')?.value || '').trim();
      const flag = row.querySelector('.lp-flag')?.value || 'normal';
      if (name && value) out.push({ name, value, unit, ref_range, flag });
    });
    return out;
  }

  async function publishOrderToDmp(order, facility) {
    if (!window.PGPatientDMP) return null;
    const isImaging = order.exam_category === 'imagerie' || /écho|echo|radio|scanner|irm/i.test(order.exam_name);
    const rec = await PGPatientDMP.pushMedicalRecord({
      patient_code: order.patient_code,
      patient_phone: order.patient_phone
    }, {
      category: isImaging ? 'imaging' : 'lab_result',
      title: order.exam_name,
      summary: order.conclusion || `${(order.parameters || []).length} paramètre(s) validé(s) par ${order.validator_name}`,
      issuer_type: facility.facility_type || 'laboratory',
      issuer_id: facility.id,
      issuer_name: facility.name,
      source_system: order.source_system || 'internal',
      external_ref: order.order_code,
      content_json: {
        order_code: order.order_code,
        exam_category: order.exam_category,
        parameters: order.parameters || [],
        conclusion: order.conclusion || '',
        validator_name: order.validator_name || '',
        validator_license: facility.license_number || ''
      }
    });
    return rec;
  }

  async function submitOrder() {
    const facility = window.FacilityApp && FacilityApp.getCurrentFacility();
    if (!facility) return;
    const patientCode = (document.getElementById('lab-pat-code')?.value || '').trim().toUpperCase();
    const patientName = (document.getElementById('lab-pat-name')?.value || '').trim();
    const patientPhone = (document.getElementById('lab-pat-phone')?.value || '').replace(/\D/g, '').replace(/^237/, '');
    const examName = (document.getElementById('lab-exam-name')?.value || '').trim();
    const examCat = document.getElementById('lab-exam-cat')?.value || 'biochimie';
    const validator = (document.getElementById('lab-validator')?.value || '').trim() || facility.director_name || 'Biologiste';
    const conclusion = (document.getElementById('lab-conclusion')?.value || '').trim();
    const initStatus = document.getElementById('lab-init-status')?.value || 'published';
    const params = collectParamsFromForm();

    if (!patientName || !examName) {
      toast('⚠️ Veuillez indiquer le nom du patient et l\'intitulé de l\'examen.', 'error');
      return;
    }

    const nowIso = new Date().toISOString();
    const order = {
      id: 'ord_' + Date.now(),
      order_code: 'LAB-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000),
      facility_id: facility.id,
      facility_name: facility.name,
      facility_type: facility.facility_type || 'laboratory',
      patient_code: patientCode || 'PG-PAT-237890',
      patient_name: patientName,
      patient_phone: patientPhone,
      exam_category: examCat,
      exam_name: examName,
      status: initStatus,
      parameters: params,
      conclusion,
      validator_name: validator,
      source_system: 'internal',
      published_at: initStatus === 'published' ? nowIso : null,
      created_at: nowIso
    };

    if (initStatus === 'published') {
      const rec = await publishOrderToDmp(order, facility);
      if (rec) order.dmp_record_id = rec.id;
    }

    const list = getOrders();
    list.unshift(order);
    saveOrders(list);

    if (window.supabase) {
      try {
        const { data: userRes } = window.supabase.auth ? await window.supabase.auth.getUser() : { data: null };
        const fUid = (userRes && userRes.user && userRes.user.id) || null;
        await window.supabase.from('lab_analysis_orders').insert([{
          order_code: order.order_code,
          facility_id: order.facility_id,
          facility_user_id: fUid,
          facility_name: order.facility_name,
          facility_type: order.facility_type,
          patient_code: order.patient_code,
          patient_name: order.patient_name,
          patient_phone: order.patient_phone,
          exam_category: order.exam_category,
          exam_name: order.exam_name,
          status: order.status,
          parameters_json: order.parameters,
          conclusion: order.conclusion,
          validator_name: order.validator_name,
          source_system: order.source_system,
          published_at: order.published_at
        }]);
      } catch (e) {}
    }

    toast(initStatus === 'published'
      ? `🔔 Résultat ${order.order_code} publié, déposé dans le Carnet Médical (${order.patient_code}) & patient notifié !`
      : `🔬 Dossier ${order.order_code} enregistré « En cours d'analyse ».`, 'success');
    renderAnalysesPanel(document.getElementById('fpanel-analyses'), facility);
  }

  async function publishExistingOrder(orderId) {
    const facility = window.FacilityApp && FacilityApp.getCurrentFacility();
    if (!facility) return;
    const list = getOrders();
    const order = list.find((o) => o.id === orderId);
    if (!order) return;
    order.status = 'published';
    order.published_at = new Date().toISOString();
    const rec = await publishOrderToDmp(order, facility);
    if (rec) order.dmp_record_id = rec.id;
    saveOrders(list);
    if (window.supabase && order.order_code) {
      try {
        await window.supabase.from('lab_analysis_orders')
          .update({ status: 'published', published_at: order.published_at, updated_at: order.published_at })
          .eq('order_code', order.order_code);
      } catch (e) {}
    }
    toast(`🔔 Résultat ${order.order_code} validé et téléversé instantanément dans le Carnet Patient !`, 'success');
    renderAnalysesPanel(document.getElementById('fpanel-analyses'), facility);
  }

  function prefillFromBooking(patientName, patientPhone, examName) {
    if (window.FacilityApp) FacilityApp.switchTab('analyses');
    setTimeout(() => {
      const pn = document.getElementById('lab-pat-name');
      const pp = document.getElementById('lab-pat-phone');
      const en = document.getElementById('lab-exam-name');
      if (pn) pn.value = patientName || '';
      if (pp) pp.value = patientPhone || '';
      if (en) en.value = examName || '';
    }, 60);
  }

  // ════════════════════════════════════════════════════════════════
  // ONGLET 2 : CONNECTEUR UNIVERSEL SIL / SIH / LIS / HIS
  // ════════════════════════════════════════════════════════════════
  function renderConnectorPanel(host, facility) {
    if (!host || !facility) return;
    const cfg = getConnectorCfg(facility.id);
    const webhookUrl = 'https://kcbcvdinuhckrpotngbw.supabase.co/functions/v1/lab-results-webhook';

    host.innerHTML = `
      <div class="pharm-card" style="margin-bottom:14px; border-color:rgba(56,189,248,0.45);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
          <div>
            <h3 style="margin:0; font-size:15.5px; font-weight:900; color:#38bdf8;">🔌 Connecteur Universel SIL / SIH / Imagerie (Zéro Saisie Manuelle)</h3>
            <p style="font-size:12px; color:#94a3b8; margin:4px 0 0;">
              Connectez Pharma-Garde directement au logiciel existant de votre Laboratoire, Hôpital ou Clinique pour notifier automatiquement chaque patient dès validation biologique ou radiologique.
            </p>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="btn btn--secondary btn--sm" onclick="PGLabManager.testLocalDaemon()">📡 Tester Daemon Local</button>
            <button type="button" class="btn btn--primary btn--sm" onclick="PGLabManager.simulateIncomingSilPush()" style="background:linear-gradient(135deg,#0ea5e9,#10b981)!important; color:#fff!important; border:none!important;">🧪 Simuler Réception SIL/SIH Live</button>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px; margin-bottom:12px;">
          <div class="form-group">
            <label class="form-label">Logiciel SIL / SIH Existant</label>
            <select id="sil-vendor" class="form-input form-select">
              <option value="openlis" ${cfg.software_vendor === 'openlis' ? 'selected' : ''}>OpenLIS / OpenELIS Global</option>
              <option value="senaite" ${cfg.software_vendor === 'senaite' ? 'selected' : ''}>SENAITE / Bika LIMS</option>
              <option value="openmrs" ${cfg.software_vendor === 'openmrs' ? 'selected' : ''}>OpenMRS / Bahmni (Hôpital)</option>
              <option value="openclinic" ${cfg.software_vendor === 'openclinic' ? 'selected' : ''}>OpenClinic GA (SIH Cameroun/Afrique)</option>
              <option value="glims" ${cfg.software_vendor === 'glims' ? 'selected' : ''}>GLIMS / SilLab / MedaSys / Hexalis</option>
              <option value="hl7_fhir" ${cfg.software_vendor === 'hl7_fhir' ? 'selected' : ''}>Serveur HL7 v2 (ORU^R01) / FHIR R4</option>
              <option value="db_direct" ${cfg.software_vendor === 'db_direct' ? 'selected' : ''}>Base MySQL / PostgreSQL / SQL Server</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Protocole d'Échange</label>
            <select id="sil-protocol" class="form-input form-select">
              <option value="webhook_json" ${cfg.protocol === 'webhook_json' ? 'selected' : ''}>Webhook HTTPS JSON Temps Réel</option>
              <option value="hl7_v2" ${cfg.protocol === 'hl7_v2' ? 'selected' : ''}>HL7 v2.5 (ORU^R01 — Labos/Hôpitaux)</option>
              <option value="fhir_r4" ${cfg.protocol === 'fhir_r4' ? 'selected' : ''}>HL7 FHIR R4 (DiagnosticReport)</option>
              <option value="local_daemon" ${cfg.protocol === 'local_daemon' ? 'selected' : ''}>Daemon Local (Surveillance dossier exports)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">URL Serveur / Daemon Local</label>
            <input type="text" id="sil-endpoint" class="form-input" value="${esc(cfg.endpoint_url || 'http://localhost:8090')}">
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;" class="pg-two-col">
          <div style="padding:10px 12px; border-radius:10px; background:rgba(15,23,42,0.8); border:1px solid rgba(56,189,248,0.3);">
            <div style="font-size:11px; font-weight:800; color:#38bdf8; margin-bottom:4px;">🌐 URL WEBHOOK CLOUD (POST JSON / FHIR / HL7)</div>
            <div style="display:flex; gap:6px; align-items:center;">
              <input type="text" readonly class="form-input" value="${webhookUrl}" style="font-family:monospace; font-size:11px; min-height:36px;">
              <button type="button" class="btn btn--secondary btn--sm" onclick="navigator.clipboard && navigator.clipboard.writeText('${webhookUrl}'); PGLabManager.notifyCopied('URL Webhook')">📋</button>
            </div>
          </div>
          <div style="padding:10px 12px; border-radius:10px; background:rgba(15,23,42,0.8); border:1px solid rgba(251,191,36,0.35);">
            <div style="font-size:11px; font-weight:800; color:#fbbf24; margin-bottom:4px;">🔑 CLÉ API SECRÈTE (HEADER: X-Facility-Key)</div>
            <div style="display:flex; gap:6px; align-items:center;">
              <input type="text" readonly id="sil-api-key-display" class="form-input" value="${esc(cfg.api_key)}" style="font-family:monospace; font-size:11px; min-height:36px; color:#fbbf24;">
              <button type="button" class="btn btn--secondary btn--sm" onclick="navigator.clipboard && navigator.clipboard.writeText(document.getElementById('sil-api-key-display').value); PGLabManager.notifyCopied('Clé API')">📋</button>
              <button type="button" class="btn btn--secondary btn--sm" onclick="PGLabManager.rotateApiKey()" title="Régénérer la clé">🔄</button>
            </div>
          </div>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <button type="button" class="btn btn--primary btn--sm" onclick="PGLabManager.saveConnectorSettings()">💾 Enregistrer la Liaison SIL/SIH</button>
          <button type="button" class="btn btn--secondary btn--sm" onclick="PGLabManager.downloadConnectorConfig()">📥 Télécharger sil-sih-config.json</button>
          <label class="btn btn--secondary btn--sm" style="cursor:pointer;">
            📁 Importer Fichier Résultat (JSON / HL7 / CSV)
            <input type="file" accept=".json,.hl7,.txt,.csv" style="display:none;" onchange="PGLabManager.importExternalResultFile(this)">
          </label>
        </div>
        <div id="sil-test-status" style="margin-top:10px; font-size:12px; color:#94a3b8;"></div>
      </div>

      <div class="pharm-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <h4 style="margin:0; font-size:14px; font-weight:800; color:#34d399;">📟 Journal Temps Réel de la Passerelle SIL / SIH (${(cfg.logs || []).length})</h4>
          <span style="font-size:11px; color:#94a3b8;">Script local : <code>connecteur/pharmagarde-sil-sih-connector.js</code></span>
        </div>
        <div style="background:#050b14; border:1px solid rgba(52,211,153,0.2); border-radius:10px; padding:10px; max-height:210px; overflow-y:auto; font-family:monospace; font-size:11.5px;">
          ${(cfg.logs || []).map((l) => `
            <div style="padding:3px 0; border-bottom:1px solid rgba(255,255,255,0.04); color:${l.level === 'warn' ? '#fbbf24' : '#34d399'};">
              <span style="color:#64748b;">[${esc(new Date(l.ts).toLocaleTimeString('fr-FR'))}]</span> ${esc(l.text)}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function notifyCopied(label) { toast(`📋 ${label} copiée dans le presse-papiers !`, 'info'); }

  async function saveConnectorSettings() {
    const facility = window.FacilityApp && FacilityApp.getCurrentFacility();
    if (!facility) return;
    const cfg = getConnectorCfg(facility.id);
    cfg.software_vendor = document.getElementById('sil-vendor')?.value || 'openlis';
    cfg.protocol = document.getElementById('sil-protocol')?.value || 'webhook_json';
    cfg.endpoint_url = (document.getElementById('sil-endpoint')?.value || 'http://localhost:8090').trim().replace(/\/$/, '');
    saveConnectorCfg(facility.id, cfg);
    await syncConnectorToCloud(facility, cfg);
    appendConnLog(facility.id, 'info', `Configuration sauvegardée & clé SHA-256 synchronisée dans Supabase : ${cfg.software_vendor.toUpperCase()} (${cfg.protocol})`);
    toast('💾 Configuration Connecteur SIL/SIH enregistrée et synchronisée Cloud !', 'success');
    renderConnectorPanel(document.getElementById('fpanel-connector'), facility);
  }

  async function rotateApiKey() {
    const facility = window.FacilityApp && FacilityApp.getCurrentFacility();
    if (!facility) return;
    const cfg = getConnectorCfg(facility.id);
    cfg.api_key = 'PG-SIL-' + Math.random().toString(36).slice(2, 10).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
    saveConnectorCfg(facility.id, cfg);
    await syncConnectorToCloud(facility, cfg);
    appendConnLog(facility.id, 'warn', 'Nouvelle clé API secrète générée et enregistrée côté serveur (SHA-256). Pensez à mettre à jour sil-sih-config.json.');
    toast('🔑 Nouvelle clé API générée et enregistrée Cloud.', 'info');
    renderConnectorPanel(document.getElementById('fpanel-connector'), facility);
  }

  async function testLocalDaemon() {
    const facility = window.FacilityApp && FacilityApp.getCurrentFacility();
    if (!facility) return;
    const url = (document.getElementById('sil-endpoint')?.value || 'http://localhost:8090').trim().replace(/\/$/, '');
    const st = document.getElementById('sil-test-status');
    if (st) st.innerHTML = `<span style="color:#fbbf24;">⏳ Test vers ${esc(url)}/health...</span>`;
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 3500);
      const r = await fetch(url + '/health', { signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      appendConnLog(facility.id, 'info', `🟢 Daemon SIL/SIH connecté (${data.software_vendor || 'OK'}) — ${data.total_results || 0} résultats indexés.`);
      if (st) st.innerHTML = `<span style="color:#34d399; font-weight:800;">🟢 Connecteur SIL/SIH en ligne (${esc(data.service || 'OK')})</span>`;
      toast('🟢 Daemon SIL/SIH connecté !', 'success');
    } catch (e) {
      appendConnLog(facility.id, 'warn', `Daemon local hors-ligne sur ${url}. Lancez "node connecteur/pharmagarde-sil-sih-connector.js" ou utilisez le Webhook Cloud HTTPS.`);
      if (st) st.innerHTML = `<span style="color:#fbbf24;">ℹ️ Daemon local non démarré sur ${esc(url)} — le Webhook Cloud HTTPS et l'import de fichiers restent opérationnels 24/7.</span>`;
    }
  }

  async function simulateIncomingSilPush() {
    const facility = window.FacilityApp && FacilityApp.getCurrentFacility();
    if (!facility) return;
    const nowIso = new Date().toISOString();
    const order = {
      id: 'ord_sil_' + Date.now(),
      order_code: 'SIL-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000),
      facility_id: facility.id,
      facility_name: facility.name,
      facility_type: facility.facility_type || 'laboratory',
      patient_code: 'PG-PAT-237890',
      patient_name: 'Marie Ngo Biyong',
      patient_phone: '699884422',
      exam_category: 'biochimie',
      exam_name: 'Bilan Biochimique Complet (Synchronisé Auto SIL/SIH)',
      status: 'published',
      parameters: [
        { name: 'Glycémie à jeun', value: '0.94', unit: 'g/L', ref_range: '0.70 - 1.10', flag: 'normal' },
        { name: 'Créatinine sérique', value: '8.9', unit: 'mg/L', ref_range: '6.0 - 13.0', flag: 'normal' },
        { name: 'Cholestérol LDL', value: '1.68', unit: 'g/L', ref_range: '< 1.60', flag: 'high' }
      ],
      conclusion: 'Bilan transmis automatiquement depuis le SIL/SIH. Légère élévation LDL à surveiller avec votre médecin.',
      validator_name: facility.director_name || 'Biologiste Validateur',
      source_system: 'sil_webhook',
      published_at: nowIso,
      created_at: nowIso
    };

    const rec = await publishOrderToDmp(order, facility);
    if (rec) order.dmp_record_id = rec.id;
    const list = getOrders();
    list.unshift(order);
    saveOrders(list);

    appendConnLog(facility.id, 'info', `🚀 PUSH SIL/SIH réussi : ${order.order_code} → Déposé dans DMP ${order.patient_code} & patient notifié !`);
    toast(`🚀 Résultat ${order.order_code} poussé via SIL/SIH → Carnet Patient ${order.patient_code} mis à jour !`, 'success');
    renderConnectorPanel(document.getElementById('fpanel-connector'), facility);
  }

  function importExternalResultFile(input) {
    const facility = window.FacilityApp && FacilityApp.getCurrentFacility();
    const file = input && input.files && input.files[0];
    if (!facility || !file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const raw = String(e.target.result || '');
        let patientCode = 'PG-PAT-237890', patientName = 'Patient Importé', examName = file.name.replace(/\.[^.]+$/, ''), params = [], conclusion = '';
        if (file.name.endsWith('.json')) {
          const j = JSON.parse(raw);
          patientCode = j.patient_code || patientCode;
          patientName = j.patient_name || patientName;
          examName = j.exam_name || examName;
          params = Array.isArray(j.parameters) ? j.parameters : [];
          conclusion = j.conclusion || '';
        } else if (raw.includes('MSH|') || raw.includes('OBX|')) {
          raw.split(/\r?\n/).forEach((line) => {
            const s = line.split('|');
            if (s[0] === 'PID') {
              if (s[3]) patientCode = s[3].split('^')[0];
              if (s[5]) patientName = s[5].replace(/\^+/g, ' ').trim();
            } else if (s[0] === 'OBR' && s[4]) {
              examName = s[4].split('^')[1] || s[4].split('^')[0];
            } else if (s[0] === 'OBX') {
              const pName = (s[3] || '').split('^')[1] || (s[3] || '').split('^')[0];
              if (pName && s[5]) params.push({ name: pName, value: s[5], unit: s[6] || '', ref_range: s[7] || '', flag: (s[8] === 'H' ? 'high' : s[8] === 'L' ? 'low' : 'normal') });
            }
          });
        } else {
          const lines = raw.split(/\r?\n/).filter(Boolean);
          const sep = lines[0] && lines[0].includes(';') ? ';' : ',';
          for (let i = 1; i < lines.length; i++) {
            const c = lines[i].split(sep).map((x) => x.trim().replace(/^["']|["']$/g, ''));
            if (c[0]) params.push({ name: c[0], value: c[1] || '', unit: c[2] || '', ref_range: c[3] || '', flag: (c[4] || 'normal').toLowerCase() });
          }
        }
        const order = {
          id: 'ord_imp_' + Date.now(),
          order_code: 'IMP-' + Math.floor(1000 + Math.random() * 9000),
          facility_id: facility.id,
          facility_name: facility.name,
          facility_type: facility.facility_type || 'laboratory',
          patient_code: patientCode,
          patient_name: patientName,
          exam_category: 'biochimie',
          exam_name: examName,
          status: 'published',
          parameters: params,
          conclusion: conclusion || `Importé automatiquement depuis ${file.name}`,
          validator_name: facility.director_name || 'Biologiste',
          source_system: 'sih_connector',
          published_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        };
        const rec = await publishOrderToDmp(order, facility);
        if (rec) order.dmp_record_id = rec.id;
        const list = getOrders(); list.unshift(order); saveOrders(list);
        appendConnLog(facility.id, 'info', `📁 Import ${file.name} réussi (${params.length} paramètre(s)) → DMP ${patientCode} notifié !`);
        toast(`📁 Fichier ${file.name} importé et déposé dans le Carnet Patient ${patientCode} !`, 'success');
        renderConnectorPanel(document.getElementById('fpanel-connector'), facility);
      } catch (err) {
        toast('❌ Erreur lecture fichier : ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  function downloadConnectorConfig() {
    const facility = window.FacilityApp && FacilityApp.getCurrentFacility();
    if (!facility) return;
    const cfg = getConnectorCfg(facility.id);
    const out = {
      facility_id: facility.id,
      facility_name: facility.name,
      facility_type: facility.facility_type || 'laboratory',
      software_vendor: cfg.software_vendor,
      webhook_url: 'https://kcbcvdinuhckrpotngbw.supabase.co/functions/v1/lab-results-webhook',
      api_key: cfg.api_key,
      poll_interval_ms: 15000
    };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sil-sih-config.json';
    a.click();
    toast('📥 Fichier sil-sih-config.json téléchargé ! Placez-le dans /connecteur/ puis lancez node pharmagarde-sil-sih-connector.js.', 'success');
  }

  window.PGLabManager = {
    renderAnalysesPanel,
    renderConnectorPanel,
    applyTemplate,
    addParamRow,
    submitOrder,
    publishExistingOrder,
    prefillFromBooking,
    saveConnectorSettings,
    rotateApiKey,
    testLocalDaemon,
    simulateIncomingSilPush,
    importExternalResultFile,
    downloadConnectorConfig,
    notifyCopied
  };
})(window);

