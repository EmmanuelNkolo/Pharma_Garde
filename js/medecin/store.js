/**
 * Pharma-Garde v12.0 — Moteur Partagé Médecins, Téléconsultations 48h & Ordonnances Signées
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Utilisé à la fois par :
 *   • medecin.html (Espace Médecins ONMC)
 *   • index.html   (Espace Patient : Requête 2 600 FCFA, Chat 48h, RDV, Ordonnance PDF → Pharmacies)
 *
 * Modèle financier automatisé :
 *   • Requête patient = 2 600 FCFA (100 FCFA vers NotchPay AVANT recherche médecin +
 *     2 500 FCFA transférés automatiquement au médecin assigné via OM / MTN MoMo)
 *   • Session ouverte 48 heures sans frais supplémentaires
 *   • Abonnement médecin : 5 000 FCFA/mois · 50 000 FCFA/an (14 jours essai gratuit)
 *
 * Expose : window.MedecinStore
 */
(function (window) {
  'use strict';

  const DOC_SESSION_KEY = 'pharmagarde_doctor_session_v12';
  const DOC_DIR_KEY = 'pharmagarde_doctors_directory_v12';
  const CONSULT_KEY = 'pharmagarde_consultations_v12';
  const MSGS_KEY = 'pharmagarde_consult_msgs_v12';
  const RX_KEY = 'pharmagarde_signed_prescriptions_v12';
  const APPT_KEY = 'pharmagarde_doctor_appointments_v12';

  const CONSULT_TOTAL_FCFA = 2600;
  const PLATFORM_FEE_FCFA = 100;
  const DOCTOR_PAYOUT_FCFA = 2500;
  const SESSION_48H_MS = 48 * 60 * 60 * 1000;

  const SPECIALTIES = [
    'Médecine Générale',
    'Pédiatrie',
    'Gynécologie-Obstétrique',
    'Cardiologie',
    'Dermatologie',
    'Médecine Interne',
    'Ophtalmologie',
    'ORL',
    'Neurologie',
    'Pneumologie',
    'Gastro-entérologie',
    'Endocrinologie / Diabétologie',
    'Psychiatrie / Bien-être Mental',
    'Urologie'
  ];

  // Signature vectorielle SVG par défaut pour les médecins de démonstration certifiés
  const DEMO_SIG_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="72" viewBox="0 0 240 72"><path d="M18 52 C32 14, 54 14, 48 48 C44 62, 68 22, 86 38 C98 48, 114 26, 132 42 C148 54, 174 22, 218 36" fill="none" stroke="#0f172a" stroke-width="2.6" stroke-linecap="round"/><path d="M24 60 L214 54" stroke="#0d9488" stroke-width="1.2" opacity="0.6"/></svg>'
  );

  const DEFAULT_SCHEDULE = {
    lun: { active: true, start: '08:00', end: '20:00' },
    mar: { active: true, start: '08:00', end: '20:00' },
    mer: { active: true, start: '08:00', end: '20:00' },
    jeu: { active: true, start: '08:00', end: '20:00' },
    ven: { active: true, start: '08:00', end: '20:00' },
    sam: { active: true, start: '09:00', end: '17:00' },
    dim: { active: false, start: '10:00', end: '15:00' }
  };

  const DEFAULT_DOCTORS = [
    {
      id: 'doc_kamga_dla',
      title: 'Dr',
      full_name: 'Hervé Kamga Fotso',
      specialty: 'Médecine Générale',
      onmc_number: 'ONMC-2017-4821',
      cni_number: '114288901',
      diploma_title: 'Doctorat d\'État en Médecine (FMSB Yaoundé I)',
      university: 'Université de Yaoundé I',
      graduation_year: 2016,
      clinic_name: 'Cabinet Médical Bonapriso Santé',
      city: 'Douala',
      quarter: 'Bonapriso',
      address: 'Rue Tokoto, Bonapriso, Douala',
      lat: 4.0278,
      lng: 9.6982,
      phone: '699412580',
      whatsapp: '699412580',
      payout_phone: '699412580',
      payout_operator: 'om',
      email: 'dr.kamga@pharmagarde.cm',
      signature_data_url: DEMO_SIG_SVG,
      consultation_hours: DEFAULT_SCHEDULE,
      availability_status: 'available',
      verification_status: 'verified',
      subscription_status: 'active',
      subscription_plan: 'annual'
    },
    {
      id: 'doc_mbarga_yde',
      title: 'Dr',
      full_name: 'Clarisse Mbarga Owona',
      specialty: 'Pédiatrie',
      onmc_number: 'ONMC-2019-5310',
      cni_number: '118903421',
      diploma_title: 'DES Pédiatrie & Néonatologie (FMSB)',
      university: 'Université de Yaoundé I',
      graduation_year: 2018,
      clinic_name: 'Pôle Pédiatrique Bastos',
      city: 'Yaoundé',
      quarter: 'Bastos',
      address: 'Avenue Rosa Parks, Bastos, Yaoundé',
      lat: 3.8924,
      lng: 11.5142,
      phone: '677823190',
      whatsapp: '677823190',
      payout_phone: '677823190',
      payout_operator: 'momo',
      email: 'dr.mbarga@pharmagarde.cm',
      signature_data_url: DEMO_SIG_SVG,
      consultation_hours: DEFAULT_SCHEDULE,
      availability_status: 'available',
      verification_status: 'verified',
      subscription_status: 'active',
      subscription_plan: 'monthly'
    },
    {
      id: 'doc_nguefack_dla',
      title: 'Pr',
      full_name: 'Alain Nguefack Tchoumi',
      specialty: 'Cardiologie',
      onmc_number: 'ONMC-2012-2194',
      cni_number: '108451209',
      diploma_title: 'Agrégation Cardiologie & Médecine Vasculaire',
      university: 'Université de Douala (FMSP)',
      graduation_year: 2011,
      clinic_name: 'Institut Cardiovasculaire Akwa',
      city: 'Douala',
      quarter: 'Akwa',
      address: 'Boulevard de la Liberté, Akwa, Douala',
      lat: 4.0518,
      lng: 9.7048,
      phone: '694552100',
      whatsapp: '694552100',
      payout_phone: '694552100',
      payout_operator: 'om',
      email: 'pr.nguefack@pharmagarde.cm',
      signature_data_url: DEMO_SIG_SVG,
      consultation_hours: DEFAULT_SCHEDULE,
      availability_status: 'available',
      verification_status: 'verified',
      subscription_status: 'active',
      subscription_plan: 'annual'
    },
    {
      id: 'doc_ebongue_yde',
      title: 'Dr',
      full_name: 'Nadine Ebongue Ndongo',
      specialty: 'Gynécologie-Obstétrique',
      onmc_number: 'ONMC-2020-6044',
      cni_number: '121044782',
      diploma_title: 'DES Gynécologie-Obstétrique (FMSB)',
      university: 'Université de Yaoundé I',
      graduation_year: 2019,
      clinic_name: 'Centre Mère-Enfant Nlongkak',
      city: 'Yaoundé',
      quarter: 'Nlongkak',
      address: 'Carrefour Nlongkak, Yaoundé',
      lat: 3.8781,
      lng: 11.5229,
      phone: '675339011',
      whatsapp: '675339011',
      payout_phone: '675339011',
      payout_operator: 'momo',
      email: 'dr.ebongue@pharmagarde.cm',
      signature_data_url: DEMO_SIG_SVG,
      consultation_hours: DEFAULT_SCHEDULE,
      availability_status: 'available',
      verification_status: 'verified',
      subscription_status: 'active',
      subscription_plan: 'monthly'
    }
  ];

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  async function hashPwd(pwd) {
    const data = new TextEncoder().encode('PG_DOC_V12::' + String(pwd || ''));
    if (window.crypto && window.crypto.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return String(pwd || '');
  }

  function readLS(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return fallback;
  }
  function writeLS(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  // ── Annuaire Médecins ──────────────────────────────────────────
  function getDoctors() {
    const saved = readLS(DOC_DIR_KEY, null);
    if (Array.isArray(saved) && saved.length > 0) return saved;
    writeLS(DOC_DIR_KEY, DEFAULT_DOCTORS);
    return DEFAULT_DOCTORS.slice();
  }

  async function syncDoctors() {
    const local = getDoctors();
    if (!window.supabase) return local;
    try {
      const { data, error } = await window.supabase.from('doctors').select('*').order('created_at', { ascending: false }).limit(80);
      if (!error && Array.isArray(data) && data.length > 0) {
        const merged = data.slice();
        local.forEach((d) => {
          if (!merged.some((m) => m.id === d.id || (m.email && m.email === d.email))) merged.push(d);
        });
        writeLS(DOC_DIR_KEY, merged);
        return merged;
      }
    } catch (e) {}
    return local;
  }

  function saveDoctorInDirectory(doc) {
    const list = getDoctors();
    const idx = list.findIndex((d) => d.id === doc.id || (d.email && doc.email && d.email.toLowerCase() === doc.email.toLowerCase()));
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], doc);
    else list.unshift(doc);
    writeLS(DOC_DIR_KEY, list);
    return list;
  }

  function loadSession() {
    try {
      const raw = sessionStorage.getItem(DOC_SESSION_KEY) || localStorage.getItem(DOC_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveSession(doc) {
    try {
      sessionStorage.setItem(DOC_SESSION_KEY, JSON.stringify(doc));
      localStorage.setItem(DOC_SESSION_KEY, JSON.stringify(doc));
    } catch (e) {}
    saveDoctorInDirectory(doc);
  }
  function clearSession() {
    try {
      sessionStorage.removeItem(DOC_SESSION_KEY);
      localStorage.removeItem(DOC_SESSION_KEY);
    } catch (e) {}
  }

  // ── Validation Médicale Stricte ONMC (vérifiable) ──────────────
  function validateDoctorRegistration(p) {
    const errors = [];
    if (!p.full_name || p.full_name.trim().length < 4) errors.push('Nom complet du médecin requis.');
    if (!p.specialty) errors.push('Spécialité médicale requise.');
    if (!p.onmc_number || !/^(ONMC|ORD|MD)[-\s]?[A-Z0-9-]{4,}$/i.test(p.onmc_number.trim())) {
      errors.push('N° d\'inscription ONMC invalide (ex : ONMC-2021-4580).');
    }
    if (!p.cni_number || p.cni_number.trim().length < 6) errors.push('N° CNI / Passeport valide requis.');
    if (!p.diploma_title || p.diploma_title.trim().length < 5) errors.push('Intitulé du diplôme de Doctorat en Médecine requis.');
    const cleanPhone = String(p.phone || '').replace(/\D/g, '').replace(/^237/, '');
    if (!/^[26]\d{8}$/.test(cleanPhone)) errors.push('Numéro de téléphone camerounais invalide (9 chiffres).');
    const cleanPayout = String(p.payout_phone || p.phone || '').replace(/\D/g, '').replace(/^237/, '');
    if (!/^6\d{8}$/.test(cleanPayout)) errors.push('Numéro OM / MTN MoMo de versement direct invalide (6XX XXX XXX).');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(p.email || '').trim())) errors.push('Adresse email professionnelle invalide.');
    if (!p.password || p.password.length < 8) errors.push('Mot de passe de 8 caractères minimum requis.');
    if (!p.signature_data_url || !String(p.signature_data_url).startsWith('data:image/')) {
      errors.push('Votre signature manuscrite numérique est obligatoire pour signer les ordonnances.');
    }
    return errors;
  }

  async function registerDoctor(payload) {
    const errs = validateDoctorRegistration(payload);
    if (errs.length > 0) throw new Error(errs[0]);

    const cleanPhone = String(payload.phone).replace(/\D/g, '').replace(/^237/, '');
    const cleanPayout = String(payload.payout_phone || payload.phone).replace(/\D/g, '').replace(/^237/, '');
    const hub = (window.CAMEROON_DEPARTMENT_HUBS && window.CAMEROON_DEPARTMENT_HUBS[payload.city]) || { lat: 4.0511, lng: 9.7085 };
    const trialEnd = new Date(Date.now() + 14 * 86400000).toISOString();

    const doc = {
      id: 'doc_' + Date.now(),
      title: payload.title || 'Dr',
      full_name: payload.full_name.trim(),
      specialty: payload.specialty,
      onmc_number: payload.onmc_number.trim().toUpperCase(),
      cni_number: payload.cni_number.trim().toUpperCase(),
      diploma_title: payload.diploma_title.trim(),
      university: (payload.university || '').trim(),
      graduation_year: Number(payload.graduation_year) || new Date().getFullYear() - 3,
      clinic_name: (payload.clinic_name || '').trim() || 'Cabinet Médical Privé',
      city: payload.city || 'Douala',
      quarter: (payload.quarter || '').trim(),
      address: `${(payload.quarter || '').trim()}, ${payload.city || 'Douala'}`,
      lat: Number(payload.lat) || hub.lat,
      lng: Number(payload.lng) || hub.lng,
      phone: cleanPhone,
      whatsapp: String(payload.whatsapp || cleanPhone).replace(/\D/g, '').replace(/^237/, ''),
      payout_phone: cleanPayout,
      payout_operator: payload.payout_operator === 'om' ? 'om' : 'momo',
      email: payload.email.trim().toLowerCase(),
      signature_data_url: payload.signature_data_url,
      license_doc_name: payload.license_doc_name || 'justificatif_onmc_soumis',
      consultation_hours: payload.consultation_hours || DEFAULT_SCHEDULE,
      availability_status: 'available',
      verification_status: 'pending', // Doit être vérifié par l'Admin ONMC avant publication complète
      subscription_status: 'trial',
      subscription_plan: 'trial',
      trial_ends_at: trialEnd,
      subscription_expires_at: trialEnd,
      created_at: new Date().toISOString(),
      _local_pwd_hash: await hashPwd(payload.password)
    };

    if (window.supabase) {
      try {
        if (window.supabase.auth) {
          const { data: sData } = await window.supabase.auth.signUp({ email: doc.email, password: payload.password });
          if (sData && sData.user && sData.user.id) { doc.id = sData.user.id; doc.user_id = sData.user.id; }
        }
        const dbRow = Object.assign({}, doc);
        delete dbRow._local_pwd_hash;
        await window.supabase.from('doctors').upsert([dbRow], { onConflict: 'email' });
      } catch (e) {}
    }

    saveSession(doc);
    return doc;
  }

  async function loginDoctor(email, password) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !password) throw new Error('Email professionnel et mot de passe requis.');

    if (window.supabase && window.supabase.auth) {
      try {
        const { data: authData, error: authErr } = await window.supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (!authErr && authData && authData.user) {
          const { data: row } = await window.supabase.from('doctors').select('*').or(`id.eq.${authData.user.id},email.eq.${cleanEmail}`).maybeSingle();
          if (row) { saveSession(row); return row; }
        }
      } catch (e) {}
    }

    const dir = getDoctors();
    const found = dir.find((d) => (d.email || '').toLowerCase() === cleanEmail);
    if (found && found._local_pwd_hash) {
      const h = await hashPwd(password);
      if (h === found._local_pwd_hash) { saveSession(found); return found; }
      throw new Error('Mot de passe incorrect.');
    }
    throw new Error('Identifiants incorrects ou médecin non inscrit. Utilisez un accès démo certifié ou inscrivez-vous.');
  }

  // ── Disponibilité Automatisée selon les Horaires ───────────────
  function isWithinSchedule(doc) {
    if (!doc || doc.availability_status === 'offline') return false;
    if (doc.availability_status === 'available') return true;
    const days = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
    const now = new Date();
    const slot = (doc.consultation_hours || DEFAULT_SCHEDULE)[days[now.getDay()]];
    if (!slot || !slot.active) return false;
    const cur = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    return cur >= (slot.start || '08:00') && cur <= (slot.end || '20:00');
  }

  function findAvailableDoctor(specialty, preferredDoctorId) {
    const docs = getDoctors();
    if (preferredDoctorId) {
      const exact = docs.find((d) => d.id === preferredDoctorId);
      if (exact) return exact;
    }
    const verifiedAvail = docs.filter((d) =>
      (d.verification_status === 'verified' || (window.PGAdmin && PGAdmin.isVerified('doctor', d.id))) &&
      isWithinSchedule(d)
    );
    const sameSpec = verifiedAvail.find((d) => d.specialty === specialty);
    return sameSpec || verifiedAvail[0] || docs[0] || null;
  }

  // ── Téléconsultations 48h & Paiement Split 2 600 FCFA ──────────
  function getConsultations() { return readLS(CONSULT_KEY, []); }
  function saveConsultations(list) { writeLS(CONSULT_KEY, list.slice(0, 80)); }

  function getPatientSessionId() {
    let sid = localStorage.getItem('pg_patient_uid_v12');
    if (!sid) {
      sid = 'PAT-' + Math.random().toString(36).slice(2, 9).toUpperCase();
      localStorage.setItem('pg_patient_uid_v12', sid);
    }
    return sid;
  }

  async function initiatePatientConsultation(payload) {
    const isAdmin = window.PGAdmin && PGAdmin.isAdmin();
    const cleanPhone = String(payload.patient_phone || '').replace(/\D/g, '').replace(/^237/, '');
    if (!isAdmin && !/^6\d{8}$/.test(cleanPhone)) {
      throw new Error('Veuillez saisir un numéro MTN MoMo ou Orange Money valide (9 chiffres : 6XX XXX XXX).');
    }

    const consultId = 'CONS-' + Date.now();
    let paymentRef = isAdmin ? 'ADMIN_FREE_' + Date.now() : 'PG_DOC_' + Date.now();

    // Étape 1 : Encaissement 2 600 FCFA (100 FCFA transférés vers NotchPay AVANT recherche médecin)
    if (!isAdmin && window.supabase && window.supabase.functions) {
      try {
        const { data: payData } = await window.supabase.functions.invoke('doctor-consultation-payment', {
          body: {
            action: 'init_consultation_payment',
            patient_phone: cleanPhone,
            payment_method: payload.payment_method || 'momo',
            consultation_id: consultId
          }
        });
        if (payData && payData.reference) paymentRef = payData.reference;
      } catch (e) {}
    }

    // Étape 2 : Recherche automatique d'un médecin disponible & vérifié ONMC
    const matchedDoc = findAvailableDoctor(payload.specialty, payload.preferred_doctor_id);
    const expiresAt = new Date(Date.now() + SESSION_48H_MS).toISOString();

    const consult = {
      id: consultId,
      patient_session_id: getPatientSessionId(),
      patient_alias: (payload.patient_alias || 'Patient').trim(),
      patient_phone: cleanPhone || '694929909',
      patient_age: Number(payload.patient_age) || null,
      patient_sex: payload.patient_sex || '',
      specialty_requested: payload.specialty || 'Médecine Générale',
      symptoms: (payload.symptoms || '').trim(),
      allergies: (payload.allergies || '').trim(),
      doctor_id: matchedDoc ? matchedDoc.id : null,
      doctor_name: matchedDoc ? `${matchedDoc.title || 'Dr'} ${matchedDoc.full_name}` : 'En recherche de médecin...',
      doctor_specialty: matchedDoc ? matchedDoc.specialty : payload.specialty,
      doctor_onmc: matchedDoc ? matchedDoc.onmc_number : '',
      doctor_phone: matchedDoc ? matchedDoc.phone : '',
      status: matchedDoc ? 'active_48h' : 'searching',
      total_fee: isAdmin ? 0 : CONSULT_TOTAL_FCFA,
      platform_fee: isAdmin ? 0 : PLATFORM_FEE_FCFA,
      doctor_payout_amount: isAdmin ? 0 : DOCTOR_PAYOUT_FCFA,
      payment_ref: paymentRef,
      payment_method: payload.payment_method || 'momo',
      doctor_payout_status: matchedDoc ? 'transferred_direct' : 'pending',
      doctor_payout_ref: matchedDoc ? ('PAYOUT-' + Date.now().toString().slice(-6)) : null,
      session_expires_at: expiresAt,
      created_at: new Date().toISOString()
    };

    // Étape 3 : Transfert automatique direct des 2 500 FCFA au compte OM/MoMo du médecin assigné
    if (matchedDoc && !isAdmin && window.supabase && window.supabase.functions) {
      try {
        await window.supabase.functions.invoke('doctor-consultation-payment', {
          body: {
            action: 'transfer_doctor_payout',
            consultation_id: consultId,
            doctor_id: matchedDoc.id,
            doctor_payout_phone: matchedDoc.payout_phone || matchedDoc.phone,
            doctor_payout_operator: matchedDoc.payout_operator || 'momo'
          }
        });
      } catch (e) {}
    }

    const list = getConsultations();
    list.unshift(consult);
    saveConsultations(list);

    if (window.supabase) {
      try {
        const dbRow = Object.assign({}, consult);
        delete dbRow.doctor_specialty; delete dbRow.doctor_onmc; delete dbRow.doctor_phone;
        await window.supabase.from('medical_consultations').insert([dbRow]);
      } catch (e) {}
    }

    // Message d'accueil automatique dans la session 48h
    addConsultationMessage(consult.id, 'system', 'Pharma-Garde',
      matchedDoc
        ? `✅ Paiement confirmé (100 F plateforme + 2 500 F transférés directement au ${consult.doctor_name}). Votre session médicale est ouverte pendant 48h.`
        : '⏳ Paiement confirmé (100 F plateforme validés). Recherche automatique d\'un médecin disponible en cours...'
    );
    addConsultationMessage(consult.id, 'patient', consult.patient_alias,
      `Motif / Symptômes : ${consult.symptoms}${consult.allergies ? ' · Allergies : ' + consult.allergies : ''}`
    );

    return consult;
  }

  async function acceptConsultation(consultId, doctor) {
    const list = getConsultations();
    const c = list.find((x) => x.id === consultId);
    if (!c || !doctor) return null;
    c.doctor_id = doctor.id;
    c.doctor_name = `${doctor.title || 'Dr'} ${doctor.full_name}`;
    c.doctor_specialty = doctor.specialty;
    c.doctor_onmc = doctor.onmc_number;
    c.doctor_phone = doctor.phone;
    c.status = 'active_48h';
    c.doctor_payout_status = 'transferred_direct';
    c.doctor_payout_ref = c.doctor_payout_ref || ('PAYOUT-' + Date.now().toString().slice(-6));
    c.session_expires_at = new Date(Date.now() + SESSION_48H_MS).toISOString();
    saveConsultations(list);

    if (window.supabase && window.supabase.functions) {
      try {
        await window.supabase.functions.invoke('doctor-consultation-payment', {
          body: {
            action: 'transfer_doctor_payout',
            consultation_id: consultId,
            doctor_id: doctor.id,
            doctor_payout_phone: doctor.payout_phone || doctor.phone,
            doctor_payout_operator: doctor.payout_operator || 'momo'
          }
        });
      } catch (e) {}
    }

    addConsultationMessage(consultId, 'doctor', c.doctor_name,
      `Bonjour ${c.patient_alias}, je suis ${c.doctor_name} (${doctor.specialty}, ${doctor.onmc_number}). J'ai pris en charge votre demande. Votre session reste ouverte pendant 48 heures.`
    );
    return c;
  }

  // ── Messages 48h ───────────────────────────────────────────────
  function getMessages(consultId) {
    const all = readLS(MSGS_KEY, {});
    return all[consultId] || [];
  }

  async function addConsultationMessage(consultId, senderRole, senderName, body) {
    const txt = String(body || '').trim();
    if (!consultId || !txt) return null;
    const msg = {
      id: 'cmsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      consultation_id: consultId,
      sender_role: senderRole,
      sender_name: senderName || senderRole,
      body: txt,
      created_at: new Date().toISOString()
    };
    const all = readLS(MSGS_KEY, {});
    all[consultId] = all[consultId] || [];
    all[consultId].push(msg);
    writeLS(MSGS_KEY, all);
    if (window.supabase) {
      try { await window.supabase.from('consultation_messages').insert([msg]); } catch (e) {}
    }
    return msg;
  }

  function remaining48hLabel(expiresIso) {
    const diff = new Date(expiresIso).getTime() - Date.now();
    if (isNaN(diff) || diff <= 0) return 'Session 48h expirée';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${String(m).padStart(2, '0')}m restantes (48h)`;
  }

  // ── Ordonnances Signées & Téléchargement PDF Officiel ──────────
  function getPrescriptions() { return readLS(RX_KEY, []); }
  function savePrescriptions(list) { writeLS(RX_KEY, list.slice(0, 80)); }

  async function issueSignedPrescription(doctor, consult, rxPayload) {
    if (!doctor) throw new Error('Profil médecin requis.');
    const meds = (rxPayload.medications || []).filter((m) => m && m.name && m.name.trim());
    if (!meds.length) throw new Error('Ajoutez au moins un médicament à prescrire.');

    const rx = {
      id: 'rx_' + Date.now(),
      rx_code: 'RX-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
      consultation_id: consult ? consult.id : null,
      doctor_id: doctor.id,
      doctor_name: `${doctor.title || 'Dr'} ${doctor.full_name}`,
      doctor_specialty: doctor.specialty || 'Médecine Générale',
      doctor_onmc: doctor.onmc_number || 'ONMC',
      doctor_clinic: doctor.clinic_name || '',
      doctor_city: doctor.city || 'Cameroun',
      doctor_phone: doctor.phone || '',
      doctor_signature: doctor.signature_data_url || DEMO_SIG_SVG,
      patient_session_id: (consult && consult.patient_session_id) || getPatientSessionId(),
      patient_alias: (consult && consult.patient_alias) || rxPayload.patient_alias || 'Patient',
      diagnosis: (rxPayload.diagnosis || '').trim(),
      medications: meds,
      advice: (rxPayload.advice || '').trim(),
      valid_until: new Date(Date.now() + 30 * 86400000).toISOString(),
      created_at: new Date().toISOString()
    };

    const list = getPrescriptions();
    list.unshift(rx);
    savePrescriptions(list);

    if (consult) {
      const cList = getConsultations();
      const target = cList.find((x) => x.id === consult.id);
      if (target) { target.status = 'prescribed'; target.prescription_id = rx.id; saveConsultations(cList); }
      addConsultationMessage(consult.id, 'doctor', rx.doctor_name,
        `📝 Ordonnance médicale signée émise (${rx.rx_code}) : ${meds.map((m) => m.name).join(', ')}. Vous pouvez la télécharger en PDF ou l'envoyer directement aux pharmacies en 1 clic.`
      );
    }

    if (window.supabase) {
      try {
        const dbRow = Object.assign({}, rx);
        delete dbRow.doctor_clinic; delete dbRow.doctor_city; delete dbRow.doctor_phone;
        await window.supabase.from('medical_prescriptions').insert([dbRow]);
      } catch (e) {}
    }

    return rx;
  }

  function buildPrescriptionHTML(rx) {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=96x96&data=${encodeURIComponent('PHARMAGARDE-RX:' + rx.rx_code + ':' + rx.doctor_onmc)}`;
    return `
      <div style="font-family:Inter,Arial,sans-serif; color:#0f172a; background:#ffffff; padding:26px; border:2px solid #0d9488; border-radius:12px; max-width:740px; margin:0 auto;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #0d9488; padding-bottom:14px; margin-bottom:16px;">
          <div>
            <div style="font-size:19px; font-weight:900; color:#0f766e;">${esc(rx.doctor_name)}</div>
            <div style="font-size:13px; font-weight:700; color:#334155;">${esc(rx.doctor_specialty)}</div>
            <div style="font-size:12px; color:#475569;">N° Ordre ONMC : <strong>${esc(rx.doctor_onmc)}</strong> · ${esc(rx.doctor_clinic || 'Téléconsultation Pharma-Garde')}</div>
            <div style="font-size:11.5px; color:#64748b;">📍 ${esc(rx.doctor_city || 'Cameroun')} · ☎️ ${esc(rx.doctor_phone || '')}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px; font-weight:800; color:#0d9488; text-transform:uppercase;">ORDONNANCE MÉDICALE NUMÉRIQUE</div>
            <div style="font-family:monospace; font-size:15px; font-weight:900; color:#0f172a;">${esc(rx.rx_code)}</div>
            <div style="font-size:11.5px; color:#475569;">Date : ${esc(new Date(rx.created_at).toLocaleDateString('fr-FR'))}</div>
          </div>
        </div>

        <div style="background:#f0fdfa; border:1px solid #99f6e4; border-radius:8px; padding:10px 14px; margin-bottom:16px; font-size:13px;">
          <strong>Patient :</strong> ${esc(rx.patient_alias || 'Patient')}
          ${rx.diagnosis ? `<br><strong>Indication / Diagnostic confidentiel :</strong> ${esc(rx.diagnosis)}` : ''}
        </div>

        <div style="font-size:13px; font-weight:800; color:#0f766e; text-transform:uppercase; margin-bottom:10px;">💊 Prescription Médicamenteuse</div>
        <ol style="margin:0 0 18px; padding-left:20px; line-height:1.7; font-size:13.5px;">
          ${(rx.medications || []).map((m) => `
            <li style="margin-bottom:8px;">
              <strong>${esc(m.name)}</strong> ${m.dosage ? `— <em>${esc(m.dosage)}</em>` : ''}
              ${m.duration ? `<div style="font-size:12px; color:#475569;">Durée / Posologie : ${esc(m.duration)}</div>` : ''}
            </li>
          `).join('')}
        </ol>

        ${rx.advice ? `<div style="background:#fffbeb; border-left:4px solid #f59e0b; padding:10px 14px; font-size:12.5px; margin-bottom:18px;"><strong>Conseils médicaux :</strong> ${esc(rx.advice)}</div>` : ''}

        <div style="display:flex; justify-content:space-between; align-items:flex-end; border-top:1px solid #cbd5e1; padding-top:14px; margin-top:18px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <img src="${qrUrl}" width="78" height="78" alt="QR Authenticité" style="border:1px solid #cbd5e1; padding:3px; border-radius:6px;">
            <div style="font-size:10.5px; color:#64748b; max-width:220px;">
              Ordonnance certifiée Pharma-Garde Cameroun.<br>
              Valide jusqu'au ${esc(new Date(rx.valid_until || Date.now() + 30 * 86400000).toLocaleDateString('fr-FR'))}.<br>
              Présentez ce document en officine.
            </div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:11px; color:#475569; margin-bottom:4px;">Cachet &amp; Signature du Médecin</div>
            <img src="${rx.doctor_signature || DEMO_SIG_SVG}" alt="Signature Médecin" style="max-height:68px; max-width:210px; display:block; margin:0 auto;">
            <div style="font-size:11.5px; font-weight:800; color:#0f172a; margin-top:4px;">${esc(rx.doctor_name)} (${esc(rx.doctor_onmc)})</div>
          </div>
        </div>
      </div>
    `;
  }

  async function downloadPrescriptionPDF(rxIdOrObj) {
    const rx = typeof rxIdOrObj === 'object' ? rxIdOrObj : getPrescriptions().find((x) => x.id === rxIdOrObj);
    if (!rx) return;
    const html = buildPrescriptionHTML(rx);
    if (window.PG && typeof PG.exportPDF === 'function') {
      await PG.exportPDF(html, `Ordonnance_${rx.rx_code}.pdf`);
      return;
    }
    const w = window.open('', '_blank', 'width=820,height=920');
    if (w) { w.document.write(`<!DOCTYPE html><html><head><title>Ordonnance ${esc(rx.rx_code)}</title></head><body style="padding:20px;">${html}<script>setTimeout(()=>window.print(),400)</script></body></html>`); w.document.close(); }
  }

  // ── Rendez-vous Médecins (Cabinet / Téléconsultation) ──────────
  function getAppointments() { return readLS(APPT_KEY, []); }
  function saveAppointments(list) { writeLS(APPT_KEY, list.slice(0, 100)); }

  async function bookAppointment(payload) {
    if (!payload.doctor_id || !payload.patient_name || !payload.scheduled_at) {
      throw new Error('Médecin, nom du patient et date/heure de rendez-vous requis.');
    }
    const appt = {
      id: 'appt_' + Date.now(),
      doctor_id: payload.doctor_id,
      doctor_name: payload.doctor_name || 'Médecin',
      patient_session_id: getPatientSessionId(),
      patient_name: payload.patient_name.trim(),
      patient_phone: String(payload.patient_phone || '').replace(/\D/g, '').replace(/^237/, ''),
      mode: payload.mode === 'cabinet' ? 'cabinet' : 'teleconsultation',
      scheduled_at: payload.scheduled_at,
      reason: (payload.reason || 'Consultation médicale').trim(),
      status: 'pending',
      created_at: new Date().toISOString()
    };
    const list = getAppointments();
    list.unshift(appt);
    saveAppointments(list);
    if (window.supabase) {
      try { await window.supabase.from('doctor_appointments').insert([appt]); } catch (e) {}
    }
    return appt;
  }

  function updateAppointmentStatus(id, status) {
    const list = getAppointments();
    const item = list.find((a) => a.id === id);
    if (!item) return null;
    item.status = status;
    saveAppointments(list);
    if (window.supabase) {
      try { window.supabase.from('doctor_appointments').update({ status }).eq('id', id); } catch (e) {}
    }
    return item;
  }

  window.MedecinStore = {
    SPECIALTIES,
    DEFAULT_SCHEDULE,
    CONSULT_TOTAL_FCFA,
    PLATFORM_FEE_FCFA,
    DOCTOR_PAYOUT_FCFA,
    getDoctors,
    syncDoctors,
    saveDoctorInDirectory,
    loadSession,
    saveSession,
    clearSession,
    validateDoctorRegistration,
    registerDoctor,
    loginDoctor,
    isWithinSchedule,
    findAvailableDoctor,
    getConsultations,
    saveConsultations,
    getPatientSessionId,
    initiatePatientConsultation,
    acceptConsultation,
    getMessages,
    addConsultationMessage,
    remaining48hLabel,
    getPrescriptions,
    issueSignedPrescription,
    buildPrescriptionHTML,
    downloadPrescriptionPDF,
    getAppointments,
    bookAppointment,
    updateAppointmentStatus
  };
})(window);

