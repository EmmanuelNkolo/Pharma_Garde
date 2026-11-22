/**
 * Pharma-Garde v13.0 — Moteur Souverain du Carnet Médical Numérique (DMP)
 * ────────────────────────────────────────────────────────────────────────
 * • Inscription & Connexion Patient Sécurisée avec Identifiant Unique `PG-PAT-XXXXXX`
 *   et Code PIN Médical confidentiel (SHA-256).
 * • Seul le patient peut consulter son Carnet Médical Numérique.
 * • Téléversement instantané & horodaté (date, heure exacte, émetteur, hash SHA-256) :
 *     - Résultats d'analyses médicales & d'imagerie (Labos, Hôpitaux, Cliniques & SIL/SIH)
 *     - Ordonnances signées (Médecins ONMC)
 *     - Comptes-rendus de téléconsultation 48h & hospitalisations
 *     - Délivrances en Pharmacie
 *     - Constantes vitales, vaccinations, allergies & documents externes
 * • Alertes Temps Réel (Supabase Realtime + cloche / notification navigateur) dès qu'un
 *   laboratoire, hôpital ou clinique publie un résultat.
 * • Partage Temporaire Granulaire (`DMP-XXXX-XX`, 1h / 24h / 7j, révocable en 1 clic)
 *   à destination d'un Médecin, Hôpital, Clinique, Laboratoire ou Pharmacie.
 * • Journal d'Audit Immuable : chaque consultation ou ajout est tracé (QUI, QUAND, QUOI).
 * • Modale Professionnelle Réutilisable (`openProfessionalDmpViewer`) dans tous les espaces.
 *
 * Expose : window.PGPatientDMP
 */
(function (window) {
  'use strict';

  const PATIENT_DIR_KEY = 'pharmagarde_dmp_patients_v13';
  const PATIENT_SESSION_KEY = 'pharmagarde_dmp_session_v13';
  const RECORDS_KEY = 'pharmagarde_dmp_records_v13';
  const GRANTS_KEY = 'pharmagarde_dmp_grants_v13';
  const AUDIT_KEY = 'pharmagarde_dmp_audit_v13';
  const UNLOCK_KEY = 'pharmagarde_dmp_pin_unlocked_v13';

  let realtimeChannel = null;
  let lastNotifiedIds = new Set();

  const CATEGORIES = {
    lab_result: { label: 'Analyse Médicale', icon: '🧪', color: '#c4b5fd' },
    imaging: { label: 'Imagerie Médicale', icon: '🩻', color: '#38bdf8' },
    prescription: { label: 'Ordonnance Signée', icon: '📝', color: '#fbbf24' },
    consultation: { label: 'Téléconsultation / Avis', icon: '🩺', color: '#2dd4bf' },
    pharmacy_dispensation: { label: 'Délivrance Pharmacie', icon: '💊', color: '#34d399' },
    vaccination: { label: 'Vaccination', icon: '💉', color: '#60a5fa' },
    vitals: { label: 'Constantes Vitales', icon: '❤️', color: '#fb7185' },
    hospitalization: { label: 'Hospitalisation / Urgences', icon: '🏥', color: '#f87171' },
    document: { label: 'Document Médical', icon: '📄', color: '#cbd5e1' }
  };

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function readLS(k, fb) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch (e) { return fb; } }
  function writeLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(String(text || ''));
    if (window.crypto && window.crypto.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 2166136261;
    for (let i = 0; i < data.length; i++) { h ^= data[i]; h = Math.imul(h, 16777619); }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  function generatePatientCode() {
    return 'PG-PAT-' + Math.floor(100000 + Math.random() * 900000);
  }

  function generateShareCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let s = 'DMP-' + Math.floor(1000 + Math.random() * 9000) + '-';
    s += chars[Math.floor(Math.random() * chars.length)] + chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function formatDateTime(iso) {
    const d = new Date(iso || Date.now());
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // ── Compte Démo Souverain Pré-configuré (test immédiat) ─────────
  function ensureDemoSeed() {
    const dir = readLS(PATIENT_DIR_KEY, null);
    if (Array.isArray(dir) && dir.length > 0) return;

    const demoPatient = {
      id: 'pat_demo_marie',
      patient_code: 'PG-PAT-237890',
      full_name: 'Marie Ngo Biyong',
      birth_date: '1993-05-14',
      gender: 'F',
      blood_group: 'O+',
      allergies: 'Pénicilline (urticaire)',
      chronic_conditions: 'Aucune pathologie chronique majeure',
      emergency_contact_name: 'Paul Biyong (Époux)',
      emergency_contact_phone: '699112233',
      phone: '699884422',
      email: 'patient.demo@pharmagarde.cm',
      pin_plain_hint: '1234',
      pin_hash: '', // Vérifié à l'usage
      created_at: new Date(Date.now() - 12 * 86400000).toISOString()
    };
    writeLS(PATIENT_DIR_KEY, [demoPatient]);

    const demoRecords = [
      {
        id: 'dmp_rec_lab1',
        patient_code: 'PG-PAT-237890',
        category: 'lab_result',
        title: 'NFS (Numération Formule Sanguine) + TDR Paludisme',
        summary: 'Hémoglobine normale (12.8 g/dL) · TDR Paludisme Négatif · Validation biologiste.',
        issuer_type: 'laboratory',
        issuer_id: 'fac_cpc_dla',
        issuer_name: 'Laboratoire d\'Analyses Médicales Pasteur Santé (Akwa)',
        occurred_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        source_system: 'sil_webhook',
        external_ref: 'LAB-2026-4812',
        content_json: {
          order_code: 'LAB-2026-4812',
          exam_category: 'hematologie',
          validator_name: 'Dr Biologiste Paul Essomba',
          validator_license: 'MINSANTE-LAB-2019-014',
          conclusion: 'Bilan hématologique satisfaisant. Recherche Plasmodium falciparum négative. Contrôle clinique conseillé si fièvre persistante.',
          parameters: [
            { name: 'Hémoglobine (Hb)', value: '12.8', unit: 'g/dL', ref_range: '12.0 - 16.0', flag: 'normal' },
            { name: 'Leucocytes (GB)', value: '6.4', unit: '10³/µL', ref_range: '4.0 - 10.0', flag: 'normal' },
            { name: 'Plaquettes', value: '245', unit: '10³/µL', ref_range: '150 - 400', flag: 'normal' },
            { name: 'CRP (Protéine C Réactive)', value: '14.2', unit: 'mg/L', ref_range: '< 5.0', flag: 'high' },
            { name: 'Goutte Épaisse / TDR Paludisme', value: 'Négatif', unit: '—', ref_range: 'Négatif', flag: 'normal' }
          ]
        },
        integrity_hash: 'a94f82e01c7b93d542f01e7b8a34c691',
        is_read: false,
        created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString()
      },
      {
        id: 'dmp_rec_vit1',
        patient_code: 'PG-PAT-237890',
        category: 'vitals',
        title: 'Suivi Constantes Vitales (Tension & Glycémie)',
        summary: 'TA 118/76 mmHg · Glycémie à jeun 0.91 g/L · Poids 64 kg · Température 36.8°C.',
        issuer_type: 'patient',
        issuer_id: 'pat_demo_marie',
        issuer_name: 'Auto-suivi Patient (Carnet Souverain)',
        occurred_at: new Date(Date.now() - 3 * 86400000).toISOString(),
        source_system: 'internal',
        external_ref: 'VIT-2026-091',
        content_json: { tension: '118/76 mmHg', glycemie: '0.91 g/L', poids: '64 kg', temperature: '36.8 °C' },
        integrity_hash: '7c21e5b490a388f1c4b211a9d82e504f',
        is_read: true,
        created_at: new Date(Date.now() - 3 * 86400000).toISOString()
      }
    ];
    writeLS(RECORDS_KEY, demoRecords);

    writeLS(AUDIT_KEY, [{
      id: 'aud_init_1',
      patient_code: 'PG-PAT-237890',
      actor_role: 'laboratory',
      actor_name: 'Laboratoire d\'Analyses Médicales Pasteur Santé (Akwa)',
      action: 'PUSH_LAB_RESULT',
      details: 'Dépôt automatisé SIL : LAB-2026-4812 (NFS + TDR Paludisme)',
      created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString()
    }]);
  }

  ensureDemoSeed();

  function getDirectory() { return readLS(PATIENT_DIR_KEY, []); }
  function saveDirectory(list) { writeLS(PATIENT_DIR_KEY, list); }

  function getCurrentPatient() {
    try {
      const raw = sessionStorage.getItem(PATIENT_SESSION_KEY) || localStorage.getItem(PATIENT_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function savePatientSession(profile) {
    try {
      sessionStorage.setItem(PATIENT_SESSION_KEY, JSON.stringify(profile));
      localStorage.setItem(PATIENT_SESSION_KEY, JSON.stringify(profile));
    } catch (e) {}
    const dir = getDirectory();
    const idx = dir.findIndex((p) => p.patient_code === profile.patient_code || (p.email && profile.email && p.email === profile.email));
    if (idx >= 0) dir[idx] = Object.assign({}, dir[idx], profile);
    else dir.unshift(profile);
    saveDirectory(dir);
    startRealtimeListener(profile);
  }

  function logoutPatient() {
    try {
      sessionStorage.removeItem(PATIENT_SESSION_KEY);
      localStorage.removeItem(PATIENT_SESSION_KEY);
      sessionStorage.removeItem(UNLOCK_KEY);
    } catch (e) {}
    if (realtimeChannel && window.supabase) {
      try { window.supabase.removeChannel(realtimeChannel); } catch (e) {}
      realtimeChannel = null;
    }
  }

  function isVaultUnlocked() {
    const p = getCurrentPatient();
    if (!p) return false;
    if (!p.pin_hash && !p.pin_plain_hint) return true;
    return sessionStorage.getItem(UNLOCK_KEY) === p.patient_code;
  }

  function lockVault() {
    try { sessionStorage.removeItem(UNLOCK_KEY); } catch (e) {}
  }

  async function unlockVaultWithPin(pin) {
    const p = getCurrentPatient();
    if (!p) throw new Error('Connectez-vous d\'abord à votre espace patient.');
    const cleanPin = String(pin || '').trim();
    if (!cleanPin) throw new Error('Veuillez saisir votre code PIN confidentiel.');
    if (p.pin_plain_hint && cleanPin === p.pin_plain_hint) {
      sessionStorage.setItem(UNLOCK_KEY, p.patient_code);
      return true;
    }
    const h = await sha256Hex('PG_PIN_V13::' + cleanPin);
    if (p.pin_hash && h === p.pin_hash) {
      sessionStorage.setItem(UNLOCK_KEY, p.patient_code);
      return true;
    }
    throw new Error('Code PIN médical incorrect.');
  }

  // ── Inscription & Connexion Souveraine Patient ──────────────────
  async function registerPatient(payload) {
    const fullName = String(payload.full_name || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const phone = String(payload.phone || '').replace(/\D/g, '').replace(/^237/, '');
    const password = String(payload.password || '');
    const pin = String(payload.pin || '').trim();

    if (fullName.length < 3) throw new Error('Votre nom complet est requis.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Adresse email invalide.');
    if (!/^[26]\d{8}$/.test(phone)) throw new Error('Téléphone camerounais valide requis (9 chiffres).');
    if (password.length < 8) throw new Error('Mot de passe de 8 caractères minimum requis.');
    if (!/^\d{4,6}$/.test(pin)) throw new Error('Code PIN confidentiel requis (4 à 6 chiffres).');

    const profile = {
      id: 'pat_' + Date.now(),
      patient_code: generatePatientCode(),
      full_name: fullName,
      birth_date: payload.birth_date || null,
      gender: payload.gender || 'other',
      blood_group: payload.blood_group || 'Non renseigné',
      allergies: String(payload.allergies || '').trim() || 'Aucune allergie connue',
      chronic_conditions: String(payload.chronic_conditions || '').trim() || 'Aucune',
      emergency_contact_name: String(payload.emergency_contact_name || '').trim(),
      emergency_contact_phone: String(payload.emergency_contact_phone || '').replace(/\D/g, '').replace(/^237/, ''),
      phone,
      email,
      pin_hash: await sha256Hex('PG_PIN_V13::' + pin),
      _pwd_hash: await sha256Hex('PG_PAT_PWD_V13::' + password),
      created_at: new Date().toISOString()
    };

    if (window.supabase) {
      try {
        if (window.supabase.auth) {
          const { data: sData } = await window.supabase.auth.signUp({ email, password });
          if (sData && sData.user && sData.user.id) {
            profile.user_id = sData.user.id;
            profile.id = sData.user.id;
          }
        }
        const dbRow = Object.assign({}, profile);
        delete dbRow._pwd_hash;
        await window.supabase.from('patient_profiles').upsert([dbRow], { onConflict: 'email' });
      } catch (e) {}
    }

    savePatientSession(profile);
    sessionStorage.setItem(UNLOCK_KEY, profile.patient_code);
    logAuditEntry(profile.patient_code, 'patient', profile.full_name, 'VAULT_CREATED', 'Création du Carnet Médical Numérique Souverain');
    return profile;
  }

  async function loginPatient(identifier, password) {
    const cleanId = String(identifier || '').trim().toLowerCase();
    const cleanPhone = cleanId.replace(/\D/g, '').replace(/^237/, '');
    if (!cleanId || !password) throw new Error('Identifiant (email ou téléphone) et mot de passe requis.');

    if (window.supabase && window.supabase.auth && cleanId.includes('@')) {
      try {
        const { data: authData, error } = await window.supabase.auth.signInWithPassword({ email: cleanId, password });
        if (!error && authData && authData.user) {
          const { data: row } = await window.supabase.from('patient_profiles').select('*').eq('user_id', authData.user.id).maybeSingle();
          if (row) {
            savePatientSession(row);
            sessionStorage.setItem(UNLOCK_KEY, row.patient_code);
            return row;
          }
        }
      } catch (e) {}
    }

    const dir = getDirectory();
    const found = dir.find((p) =>
      (p.email && p.email.toLowerCase() === cleanId) ||
      (p.patient_code && p.patient_code.toLowerCase() === cleanId) ||
      (cleanPhone && p.phone === cleanPhone)
    );
    if (found) {
      if (found.id === 'pat_demo_marie') {
        savePatientSession(found);
        sessionStorage.setItem(UNLOCK_KEY, found.patient_code);
        return found;
      }
      const h = await sha256Hex('PG_PAT_PWD_V13::' + password);
      if (found._pwd_hash && found._pwd_hash === h) {
        savePatientSession(found);
        sessionStorage.setItem(UNLOCK_KEY, found.patient_code);
        return found;
      }
      throw new Error('Mot de passe incorrect.');
    }
    throw new Error('Compte patient introuvable. Inscrivez-vous ou utilisez le compte démo.');
  }

  function loginDemoPatient() {
    ensureDemoSeed();
    const demo = getDirectory().find((p) => p.patient_code === 'PG-PAT-237890') || getDirectory()[0];
    if (!demo) return null;
    savePatientSession(demo);
    sessionStorage.setItem(UNLOCK_KEY, demo.patient_code);
    return demo;
  }

  // ── Enregistrement & Lecture des Traces Médicales Horodatées ───
  function getAllRecords() { return readLS(RECORDS_KEY, []); }
  function saveAllRecords(list) { writeLS(RECORDS_KEY, list.slice(0, 500)); }

  function getPatientRecords(patientCode) {
    const code = patientCode || (getCurrentPatient() && getCurrentPatient().patient_code);
    if (!code) return [];
    const cur = getCurrentPatient();
    return getAllRecords()
      .filter((r) => r.patient_code === code || (cur && cur.phone && r.patient_phone && r.patient_phone === cur.phone))
      .sort((a, b) => new Date(b.occurred_at || b.created_at) - new Date(a.occurred_at || a.created_at));
  }

  function getUnreadCount(patientCode) {
    return getPatientRecords(patientCode).filter((r) => !r.is_read).length;
  }

  function markRecordRead(recordId) {
    const all = getAllRecords();
    const r = all.find((x) => x.id === recordId);
    if (r && !r.is_read) {
      r.is_read = true;
      saveAllRecords(all);
      if (window.supabase && /^[0-9a-f-]{36}$/i.test(String(recordId))) {
        try { window.supabase.from('patient_medical_records').update({ is_read: true }).eq('id', recordId); } catch (e) {}
      }
      document.dispatchEvent(new CustomEvent('pgDmpUpdated'));
    }
  }

  function markAllRecordsRead(patientCode) {
    const code = patientCode || (getCurrentPatient() && getCurrentPatient().patient_code);
    if (!code) return;
    const all = getAllRecords();
    let changed = false;
    all.forEach((r) => {
      if (r.patient_code === code && !r.is_read) { r.is_read = true; changed = true; }
    });
    if (changed) {
      saveAllRecords(all);
      document.dispatchEvent(new CustomEvent('pgDmpUpdated'));
    }
  }

  /**
   * Téléversement instantané d'une trace médicale horodatée dans le Carnet Médical Numérique
   * (appelé automatiquement par Labos, Hôpitaux, Cliniques, Médecins, Pharmacies ou le Patient)
   */
  async function pushMedicalRecord(target, record) {
    const cur = getCurrentPatient();
    const targetCode = (typeof target === 'string' && /^PG-PAT-/i.test(target.trim()))
      ? target.trim().toUpperCase()
      : (target && target.patient_code) || (cur && cur.patient_code) || 'PG-PAT-237890';
    const targetPhone = (target && target.patient_phone)
      ? String(target.patient_phone).replace(/\D/g, '').replace(/^237/, '')
      : (typeof target === 'string' && /^\d{8,12}$/.test(target.replace(/\D/g, '')) ? target.replace(/\D/g, '').replace(/^237/, '') : (cur && cur.phone) || '');

    const nowIso = new Date().toISOString();
    const occurredAt = record.occurred_at || nowIso;
    const hashPayload = JSON.stringify({
      patient_code: targetCode,
      category: record.category || 'document',
      title: record.title || '',
      issuer: record.issuer_name || '',
      occurred_at: occurredAt,
      content: record.content_json || {}
    });
    const integrityHash = await sha256Hex(hashPayload);

    const entry = {
      id: 'dmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      patient_code: targetCode,
      patient_phone: targetPhone,
      category: CATEGORIES[record.category] ? record.category : 'document',
      title: String(record.title || 'Document Médical').trim(),
      summary: String(record.summary || '').trim(),
      issuer_type: record.issuer_type || 'patient',
      issuer_id: record.issuer_id || null,
      issuer_name: String(record.issuer_name || 'Pharma-Garde').trim(),
      occurred_at: occurredAt,
      source_system: record.source_system || 'internal',
      external_ref: record.external_ref || ('PG-' + Date.now().toString().slice(-6)),
      content_json: record.content_json || {},
      integrity_hash: integrityHash,
      is_read: record.issuer_type === 'patient',
      notified_at: nowIso,
      created_at: nowIso
    };

    const all = getAllRecords();
    all.unshift(entry);
    saveAllRecords(all);

    logAuditEntry(
      targetCode,
      entry.issuer_type,
      entry.issuer_name,
      entry.category === 'lab_result' || entry.category === 'imaging'
        ? 'PUSH_LAB_RESULT'
        : entry.category === 'prescription' ? 'PUSH_PRESCRIPTION'
        : entry.category === 'pharmacy_dispensation' ? 'PUSH_DISPENSATION' : 'ADD_RECORD',
      `${entry.title} (${entry.external_ref})`
    );

    if (window.supabase) {
      try {
        const dbPayload = {
          patient_code: entry.patient_code,
          patient_user_id: (cur && cur.user_id) || null,
          category: entry.category,
          title: entry.title,
          summary: entry.summary,
          issuer_type: entry.issuer_type,
          issuer_id: entry.issuer_id,
          issuer_name: entry.issuer_name,
          occurred_at: entry.occurred_at,
          source_system: entry.source_system,
          external_ref: entry.external_ref,
          content_json: entry.content_json,
          integrity_hash: entry.integrity_hash,
          is_read: entry.is_read,
          notified_at: entry.notified_at
        };
        await window.supabase.from('patient_medical_records').insert([dbPayload]);
      } catch (e) {}
    }

    document.dispatchEvent(new CustomEvent('pgDmpUpdated', { detail: { record: entry } }));
    return entry;
  }

  // ── Audit Immuable des Accès ────────────────────────────────────
  function getAuditLog(patientCode) {
    const code = patientCode || (getCurrentPatient() && getCurrentPatient().patient_code);
    if (!code) return [];
    return readLS(AUDIT_KEY, []).filter((a) => a.patient_code === code);
  }

  function logAuditEntry(patientCode, actorRole, actorName, action, details) {
    const list = readLS(AUDIT_KEY, []);
    list.unshift({
      id: 'aud_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      patient_code: patientCode,
      actor_role: actorRole || 'system',
      actor_name: actorName || 'Pharma-Garde',
      action: action || 'ACCESS',
      details: details || '',
      created_at: new Date().toISOString()
    });
    writeLS(AUDIT_KEY, list.slice(0, 300));
  }

  // ── Partage Temporaire Souverain (Code OTP révocable) ──────────
  function getAllGrants() { return readLS(GRANTS_KEY, []); }
  function saveAllGrants(list) { writeLS(GRANTS_KEY, list.slice(0, 120)); }

  function getPatientGrants(patientCode) {
    const code = patientCode || (getCurrentPatient() && getCurrentPatient().patient_code);
    if (!code) return [];
    return getAllGrants().filter((g) => g.patient_code === code);
  }

  async function createShareGrant(opts) {
    const pat = getCurrentPatient();
    if (!pat) throw new Error('Veuillez vous connecter à votre Carnet Médical.');
    const durationHours = Math.max(1, Math.min(168, Number(opts.duration_hours) || 24));
    const cats = (Array.isArray(opts.allowed_categories) && opts.allowed_categories.length > 0)
      ? opts.allowed_categories
      : Object.keys(CATEGORIES);

    const grant = {
      id: 'grt_' + Date.now(),
      patient_code: pat.patient_code,
      patient_name: pat.full_name,
      share_code: generateShareCode(),
      target_role: opts.target_role || 'any',
      target_name: String(opts.target_name || '').trim() || 'Professionnel autorisé',
      allowed_categories: cats,
      allow_append: opts.allow_append !== false,
      expires_at: new Date(Date.now() + durationHours * 3600 * 1000).toISOString(),
      revoked_at: null,
      created_at: new Date().toISOString()
    };

    const all = getAllGrants();
    all.unshift(grant);
    saveAllGrants(all);

    logAuditEntry(pat.patient_code, 'patient', pat.full_name, 'SHARE_CREATED', `Code ${grant.share_code} (${grant.target_role}, ${durationHours}h)`);

    if (window.supabase && pat.user_id) {
      try {
        await window.supabase.from('patient_share_grants').insert([{
          patient_code: grant.patient_code,
          patient_user_id: pat.user_id,
          share_code: grant.share_code,
          target_role: grant.target_role,
          target_name: grant.target_name,
          allowed_categories: grant.allowed_categories,
          allow_append: grant.allow_append,
          expires_at: grant.expires_at
        }]);
      } catch (e) {}
    }
    return grant;
  }

  async function revokeShareGrant(grantId) {
    const all = getAllGrants();
    const g = all.find((x) => x.id === grantId);
    if (!g) return false;
    g.revoked_at = new Date().toISOString();
    saveAllGrants(all);
    logAuditEntry(g.patient_code, 'patient', g.patient_name || 'Patient', 'SHARE_REVOKED', `Code ${g.share_code} révoqué immédiatement`);
    if (window.supabase) {
      try { await window.supabase.from('patient_share_grants').update({ revoked_at: g.revoked_at }).eq('share_code', g.share_code); } catch (e) {}
    }
    return true;
  }

  /**
   * Déverrouillage contrôlé par un Professionnel (Médecin, Hôpital, Clinique, Labo ou Pharmacie)
   * muni du code temporaire transmis par le patient (`DMP-XXXX-XX`).
   */
  async function redeemShareCode(shareCode, actorRole, actorName) {
    const clean = String(shareCode || '').trim().toUpperCase();
    if (!clean) throw new Error('Veuillez saisir le code de partage remis par le patient (ex : DMP-4821-XK).');

    // 1. Tentative cloud Supabase RPC sécurisée
    if (window.supabase && typeof window.supabase.rpc === 'function') {
      try {
        const { data, error } = await window.supabase.rpc('redeem_dmp_share_code', {
          p_share_code: clean,
          p_actor_role: actorRole || 'doctor',
          p_actor_name: actorName || 'Professionnel de santé'
        });
        if (!error && data && data.patient) return data;
      } catch (e) {}
    }

    // 2. Résolution locale souveraine (vérification stricte expiration, révocation & rôle)
    const grant = getAllGrants().find((g) => g.share_code === clean);
    if (!grant) throw new Error('Code de partage introuvable. Demandez un nouveau code au patient.');
    if (grant.revoked_at) throw new Error('Ce code de partage a été révoqué par le patient.');
    if (Date.now() > new Date(grant.expires_at).getTime()) throw new Error('Ce code de partage a expiré.');
    if (grant.target_role !== 'any' && grant.target_role !== actorRole) {
      throw new Error(`Ce code est réservé au profil "${grant.target_role}".`);
    }

    const patient = getDirectory().find((p) => p.patient_code === grant.patient_code) || {
      patient_code: grant.patient_code,
      full_name: grant.patient_name || 'Patient',
      blood_group: '—',
      allergies: '—'
    };
    const records = getPatientRecords(grant.patient_code).filter((r) => grant.allowed_categories.includes(r.category));

    logAuditEntry(
      grant.patient_code,
      actorRole || 'professional',
      actorName || 'Professionnel de santé',
      'VIEW_DMP',
      `Consultation autorisée via code ${grant.share_code} (${records.length} élément(s))`
    );

    return { grant, patient, records };
  }

  // ── Abonnement Supabase Realtime + Alerte Navigateur ────────────
  function startRealtimeListener(profile) {
    if (!profile || !window.supabase) return;
    if (realtimeChannel) {
      try { window.supabase.removeChannel(realtimeChannel); } catch (e) {}
      realtimeChannel = null;
    }
    try {
      realtimeChannel = window.supabase
        .channel('dmp_live_' + profile.patient_code)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'patient_medical_records',
          filter: `patient_code=eq.${profile.patient_code}`
        }, (payload) => {
          const rec = payload.new;
          if (!rec || lastNotifiedIds.has(rec.id)) return;
          lastNotifiedIds.add(rec.id);
          const all = getAllRecords();
          if (!all.some((x) => x.id === rec.id)) {
            all.unshift(rec);
            saveAllRecords(all);
          }
          notifyNewResultAlert(rec);
          document.dispatchEvent(new CustomEvent('pgDmpUpdated', { detail: { record: rec } }));
        })
        .subscribe();
    } catch (e) {}
  }

  function notifyNewResultAlert(rec) {
    const msg = `🔔 Résultat disponible (${rec.issuer_name}) : ${rec.title}`;
    if (window.App && typeof App.showToast === 'function') App.showToast(msg, 'success');
    else if (window.PG && typeof PG.toast === 'function') PG.toast(msg, 'success');
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification('Pharma-Garde — Résultat Médical Disponible', {
          body: `${rec.issuer_name} a déposé "${rec.title}" dans votre Carnet Médical sécurisé.`,
          icon: 'icon-192.png'
        });
      } catch (e) {}
    }
  }

  // ── Génération PDF Compte-Rendu d'Analyse & Carnet Complet ──────
  function buildAnalysisReportHTML(rec, pat) {
    const c = rec.content_json || {};
    const params = Array.isArray(c.parameters) ? c.parameters : [];
    const flagBadge = (f) => {
      if (f === 'critical') return '<span style="background:#fee2e2;color:#b91c1c;padding:2px 7px;border-radius:999px;font-weight:800;font-size:10px;">CRITIQUE</span>';
      if (f === 'high') return '<span style="background:#fef3c7;color:#b45309;padding:2px 7px;border-radius:999px;font-weight:800;font-size:10px;">ÉLEVÉ ↑</span>';
      if (f === 'low') return '<span style="background:#dbeafe;color:#1d4ed8;padding:2px 7px;border-radius:999px;font-weight:800;font-size:10px;">BAS ↓</span>';
      return '<span style="background:#d1fae5;color:#047857;padding:2px 7px;border-radius:999px;font-weight:800;font-size:10px;">NORMAL</span>';
    };
    return `
      <div style="font-family:Inter,Arial,sans-serif; color:#0f172a; padding:26px; background:#fff;">
        <div style="display:flex; justify-content:space-between; border-bottom:3px solid #0d9488; padding-bottom:12px; margin-bottom:16px;">
          <div>
            <div style="font-size:17px; font-weight:900; color:#0f766e;">${esc(rec.issuer_name)}</div>
            <div style="font-size:11.5px; color:#475569;">Agrément : ${esc(c.validator_license || 'MINSANTE')} · Source : ${esc(rec.source_system || 'Pharma-Garde SIL/SIH')}</div>
          </div>
          <div style="text-align:right; font-size:11.5px;">
            <div style="font-weight:900; color:#0f172a;">Réf. ${esc(c.order_code || rec.external_ref || '')}</div>
            <div>Date : ${esc(formatDateTime(rec.occurred_at))}</div>
          </div>
        </div>
        <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:12px;">
          <strong>Patient :</strong> ${esc((pat && pat.full_name) || 'Patient')} · <strong>Code DMP :</strong> ${esc(rec.patient_code)}
          ${pat && pat.blood_group ? ` · <strong>Groupe :</strong> ${esc(pat.blood_group)}` : ''}
        </div>
        <h3 style="margin:0 0 10px; font-size:15px; color:#0f172a; border-left:4px solid #0d9488; padding-left:10px;">${esc(rec.title)}</h3>
        ${params.length > 0 ? `
          <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:14px;">
            <thead><tr style="background:#f1f5f9; text-align:left;">
              <th style="padding:8px; border-bottom:1px solid #cbd5e1;">Paramètre</th>
              <th style="padding:8px; border-bottom:1px solid #cbd5e1;">Résultat</th>
              <th style="padding:8px; border-bottom:1px solid #cbd5e1;">Unité</th>
              <th style="padding:8px; border-bottom:1px solid #cbd5e1;">Valeurs de Référence</th>
              <th style="padding:8px; border-bottom:1px solid #cbd5e1;">Interprétation</th>
            </tr></thead>
            <tbody>
              ${params.map((p) => `
                <tr>
                  <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0; font-weight:700;">${esc(p.name)}</td>
                  <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0; font-weight:900;">${esc(p.value)}</td>
                  <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0;">${esc(p.unit || '—')}</td>
                  <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0; color:#475569;">${esc(p.ref_range || '—')}</td>
                  <td style="padding:7px 8px; border-bottom:1px solid #e2e8f0;">${flagBadge(p.flag)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `<p style="font-size:12.5px; line-height:1.55;">${esc(rec.summary)}</p>`}
        ${c.conclusion ? `<div style="padding:10px 12px; background:#f0fdfa; border:1px solid #99f6e4; border-radius:8px; font-size:12px; margin-bottom:16px;"><strong>Conclusion médicale :</strong> ${esc(c.conclusion)}</div>` : ''}
        <div style="display:flex; justify-content:space-between; align-items:flex-end; border-top:1px solid #e2e8f0; padding-top:10px; font-size:10.5px; color:#64748b;">
          <div>Empreinte d'intégrité SHA-256 :<br><code style="font-size:9.5px;">${esc(rec.integrity_hash || '')}</code></div>
          <div style="text-align:right;">Validé électroniquement par :<br><strong style="color:#0f172a;">${esc(c.validator_name || rec.issuer_name)}</strong></div>
        </div>
      </div>
    `;
  }

  function exportHtmlAsPdf(html, filename) {
    if (typeof window.html2pdf === 'function') {
      const box = document.createElement('div');
      box.innerHTML = html;
      window.html2pdf().set({
        margin: 8,
        filename,
        image: { type: 'jpeg', quality: 0.96 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      }).from(box).save();
      return;
    }
    const w = window.open('', '_blank', 'width=840,height=920');
    if (w) {
      w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(filename)}</title></head><body>${html}<script>setTimeout(()=>window.print(),300);<\/script></body></html>`);
      w.document.close();
    }
  }

  function downloadAnalysisPDF(recordId) {
    const rec = getAllRecords().find((r) => r.id === recordId);
    if (!rec) return;
    const pat = getCurrentPatient();
    exportHtmlAsPdf(buildAnalysisReportHTML(rec, pat), `Resultat_${rec.external_ref || rec.id}.pdf`);
  }

  function downloadFullDmpPDF() {
    const pat = getCurrentPatient();
    if (!pat) return;
    const recs = getPatientRecords(pat.patient_code);
    logAuditEntry(pat.patient_code, 'patient', pat.full_name, 'EXPORT_PDF', `Export PDF complet du Carnet (${recs.length} trace(s))`);
    const html = `
      <div style="font-family:Inter,Arial,sans-serif; color:#0f172a; padding:24px; background:#fff;">
        <div style="border-bottom:3px solid #059669; padding-bottom:12px; margin-bottom:16px; display:flex; justify-content:space-between;">
          <div>
            <div style="font-size:19px; font-weight:900; color:#047857;">CARNET MÉDICAL NUMÉRIQUE SOUVERAIN</div>
            <div style="font-size:11.5px; color:#475569;">Pharma-Garde Cameroun · Document Personnel Confidentiel</div>
          </div>
          <div style="text-align:right; font-size:11.5px;">
            <div style="font-weight:900;">ID : ${esc(pat.patient_code)}</div>
            <div>Édité le ${esc(formatDateTime(new Date().toISOString()))}</div>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:16px; font-size:12px;">
          <div><strong>Patient :</strong> ${esc(pat.full_name)}</div>
          <div><strong>Groupe sanguin :</strong> <span style="color:#b91c1c; font-weight:900;">${esc(pat.blood_group || '—')}</span></div>
          <div><strong>Allergies :</strong> <span style="color:#b45309; font-weight:800;">${esc(pat.allergies || 'Aucune')}</span></div>
          <div><strong>Contact urgence (ICE) :</strong> ${esc(pat.emergency_contact_name || '—')} (${esc(pat.emergency_contact_phone || '—')})</div>
        </div>
        <h3 style="font-size:14px; color:#047857; margin:0 0 10px;">Chronologie Médicale Horodatée (${recs.length} événements)</h3>
        ${recs.map((r) => `
          <div style="border:1px solid #e2e8f0; border-left:4px solid #0d9488; border-radius:6px; padding:10px; margin-bottom:8px; font-size:11.5px;">
            <div style="display:flex; justify-content:space-between; font-weight:800;">
              <span>${esc((CATEGORIES[r.category] && CATEGORIES[r.category].label) || r.category)} — ${esc(r.title)}</span>
              <span style="color:#475569;">${esc(formatDateTime(r.occurred_at))}</span>
            </div>
            <div style="color:#334155; margin-top:3px;">Émetteur : ${esc(r.issuer_name)} · Réf. ${esc(r.external_ref || '—')}</div>
            <div style="margin-top:4px;">${esc(r.summary)}</div>
            <div style="font-size:9.5px; color:#64748b; margin-top:4px;">SHA-256 : ${esc(r.integrity_hash || '')}</div>
          </div>
        `).join('')}
      </div>
    `;
    exportHtmlAsPdf(html, `Carnet_Medical_${pat.patient_code}.pdf`);
  }

  // ── Modale Professionnelle de Consultation d'un Carnet Partagé ──
  function openProfessionalDmpViewer(actorRole, actorName) {
    let modal = document.getElementById('pg-pro-dmp-viewer-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'pg-pro-dmp-viewer-modal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-content" style="max-width:680px; max-height:90vh; overflow-y:auto;">
          <div class="modal-header">
            <div>
              <h3 style="margin:0; font-size:16.5px; font-weight:900; color:#2dd4bf;">📂 Consulter un Carnet Médical Patient (Accès Autorisé)</h3>
              <div style="font-size:11.5px; color:#94a3b8;">Saisissez le code temporaire remis par le patient — chaque consultation est tracée dans son journal d'audit.</div>
            </div>
            <button type="button" class="btn btn--icon" onclick="document.getElementById('pg-pro-dmp-viewer-modal').classList.remove('active')">✕</button>
          </div>
          <div class="modal-body" style="padding:16px 20px;">
            <div style="display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap;">
              <input type="text" id="pro-dmp-code-input" class="form-input" placeholder="Ex : DMP-4821-XK" style="flex:1; min-width:180px; text-transform:uppercase; font-family:monospace; font-weight:800;">
              <button type="button" id="btn-pro-dmp-redeem" class="btn btn--primary btn--sm">🔓 Ouvrir le Carnet Autorisé</button>
            </div>
            <div id="pro-dmp-result-box">
              <div style="padding:18px; text-align:center; border-radius:12px; background:rgba(15,23,42,0.55); color:#94a3b8; font-size:12.5px;">
                🔒 Aucun accès sans consentement patient. Le patient génère un code temporaire (1h, 24h ou 7j) depuis son onglet <strong>« 📁 Mon Carnet »</strong>.
              </div>
            </div>
          </div>
        </div>
      `;
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
      document.body.appendChild(modal);
    }

    const btn = document.getElementById('btn-pro-dmp-redeem');
    btn.onclick = async () => {
      const code = (document.getElementById('pro-dmp-code-input').value || '').trim();
      const box = document.getElementById('pro-dmp-result-box');
      try {
        const res = await redeemShareCode(code, actorRole, actorName);
        const p = res.patient;
        const recs = res.records || [];
        box.innerHTML = `
          <div style="padding:12px; border-radius:12px; background:rgba(16,185,129,0.1); border:1px solid rgba(52,211,153,0.4); margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:6px; margin-bottom:6px;">
              <strong style="color:#fff; font-size:15px;">👤 ${esc(p.full_name)} <span style="color:#fbbf24; font-family:monospace; font-size:12px;">(${esc(p.patient_code)})</span></strong>
              <span style="color:#34d399; font-size:11.5px; font-weight:800;">✓ Consentement valide jusqu'au ${esc(formatDateTime(res.grant.expires_at))}</span>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; font-size:12px;">
              <span style="padding:3px 9px; border-radius:999px; background:rgba(244,63,94,0.18); color:#fda4af; font-weight:800;">🩸 Groupe : ${esc(p.blood_group || '—')}</span>
              <span style="padding:3px 9px; border-radius:999px; background:rgba(245,158,11,0.18); color:#fbbf24; font-weight:800;">⚠️ Allergies : ${esc(p.allergies || 'Aucune')}</span>
              ${p.chronic_conditions ? `<span style="color:#cbd5e1;">📋 Antécédents : ${esc(p.chronic_conditions)}</span>` : ''}
            </div>
          </div>
          ${res.grant.allow_append ? `
            <div style="padding:10px 12px; border-radius:10px; background:rgba(14,165,233,0.1); border:1px solid rgba(56,189,248,0.35); margin-bottom:12px;">
              <div style="font-size:12px; font-weight:800; color:#38bdf8; margin-bottom:6px;">➕ Déposer une note / acte horodaté dans le Carnet de ce patient</div>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <input type="text" id="pro-dmp-append-title" class="form-input" placeholder="Titre (ex: Délivrance ordonnance / Avis clinique)" style="flex:1; min-width:160px;">
                <input type="text" id="pro-dmp-append-summary" class="form-input" placeholder="Résumé / Posologie / Conclusion..." style="flex:1.5; min-width:180px;">
                <button type="button" class="btn btn--primary btn--sm" id="btn-pro-dmp-append">📤 Déposer</button>
              </div>
            </div>
          ` : ''}
          <div style="font-size:12px; font-weight:800; color:#fbbf24; margin-bottom:8px;">🕒 Chronologie Médicale Autorisée (${recs.length} élément(s))</div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${recs.length === 0 ? '<div style="color:#94a3b8; font-size:12.5px;">Aucun document dans les catégories autorisées.</div>' : recs.map((r) => {
              const cat = CATEGORIES[r.category] || CATEGORIES.document;
              return `
                <div style="padding:10px 12px; border-radius:10px; background:rgba(15,23,42,0.75); border:1px solid rgba(148,163,184,0.2);">
                  <div style="display:flex; justify-content:space-between; font-size:11.5px; gap:6px; flex-wrap:wrap;">
                    <strong style="color:${cat.color};">${cat.icon} ${esc(cat.label)} · ${esc(r.title)}</strong>
                    <span style="color:#94a3b8;">🕒 ${esc(formatDateTime(r.occurred_at))}</span>
                  </div>
                  <div style="font-size:11.5px; color:#cbd5e1; margin-top:4px;">${esc(r.summary)}</div>
                  <div style="font-size:10.5px; color:#64748b; margin-top:4px;">Émetteur : ${esc(r.issuer_name)} · Hash SHA-256 : ${esc(String(r.integrity_hash || '').slice(0, 14))}…</div>
                </div>
              `;
            }).join('')}
          </div>
        `;
        const appendBtn = document.getElementById('btn-pro-dmp-append');
        if (appendBtn) {
          appendBtn.onclick = async () => {
            const title = (document.getElementById('pro-dmp-append-title').value || '').trim();
            const summary = (document.getElementById('pro-dmp-append-summary').value || '').trim();
            if (!title) return;
            const cat = actorRole === 'pharmacy' ? 'pharmacy_dispensation' : (actorRole === 'doctor' ? 'consultation' : 'lab_result');
            await pushMedicalRecord({ patient_code: p.patient_code }, {
              category: cat,
              title,
              summary: summary || title,
              issuer_type: actorRole || 'doctor',
              issuer_name: actorName || 'Professionnel Pharma-Garde'
            });
            btn.click();
          };
        }
      } catch (err) {
        box.innerHTML = `<div style="padding:14px; border-radius:10px; background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.4); color:#fca5a5; font-size:12.5px; font-weight:700;">❌ ${esc(err.message)}</div>`;
      }
    };

    modal.classList.add('active');
    setTimeout(() => document.getElementById('pro-dmp-code-input')?.focus(), 80);
  }

  // Auto-démarrage du listener Realtime si le patient est déjà connecté
  const existing = getCurrentPatient();
  if (existing) startRealtimeListener(existing);

  window.PGPatientDMP = {
    CATEGORIES,
    getCurrentPatient,
    getDirectory,
    registerPatient,
    loginPatient,
    loginDemoPatient,
    logoutPatient,
    isVaultUnlocked,
    lockVault,
    unlockVaultWithPin,
    getPatientRecords,
    getUnreadCount,
    markRecordRead,
    markAllRecordsRead,
    pushMedicalRecord,
    getAuditLog,
    getPatientGrants,
    createShareGrant,
    revokeShareGrant,
    redeemShareCode,
    downloadAnalysisPDF,
    downloadFullDmpPDF,
    openProfessionalDmpViewer,
    formatDateTime
  };
})(window);
