/**
 * Pharma-Garde v12.0 — Moteur Partagé Laboratoires d'Analyses, Hôpitaux & Cliniques
 * ─────────────────────────────────────────────────────────────────────────────────
 * Utilisé par :
 *   • etablissement.html (Portail Gestion Laboratoires, Hôpitaux, Cliniques & Imagerie)
 *   • index.html         (Carte Patient : géolocalisation par rayon, services, promos & RDV)
 *
 * Expose : window.FacilityStore
 */
(function (window) {
  'use strict';

  const SESSION_KEY = 'pharmagarde_facility_session_v12';
  const DIR_KEY = 'pharmagarde_facilities_directory_v12';
  const BOOKINGS_KEY = 'pharmagarde_facility_bookings_v12';

  const DEFAULT_FACILITIES = [
    {
      id: 'fac_cpc_dla',
      facility_type: 'laboratory',
      name: 'Laboratoire d\'Analyses Médicales Pasteur Santé (Akwa)',
      director_name: 'Dr Biologiste Paul Essomba',
      license_number: 'MINSANTE-LAB-2019-014',
      city: 'Douala',
      quarter: 'Akwa',
      address: 'Boulevard de la Liberté, Akwa, Douala',
      lat: 4.0531,
      lng: 9.7012,
      phone: '699220140',
      whatsapp: '699220140',
      email: 'contact@labo-pasteur-dla.cm',
      opening_hours: '06:30 - 19:00 (Sam 07h-14h)',
      emergency_24_7: false,
      home_sampling: true,
      online_results: true,
      verification_status: 'verified',
      services: [
        { id: 's1', name: 'NFS (Numération Formule Sanguine)', category: 'Hématologie', price: 4500, delay: '2h' },
        { id: 's2', name: 'Goutte Épaisse + TDR Paludisme', category: 'Parasitologie', price: 2500, delay: '45 min' },
        { id: 's3', name: 'Bilan Glycémie + HbA1c (Diabète)', category: 'Biochimie', price: 12000, delay: '3h' },
        { id: 's4', name: 'Bilan Hépatique & Rénal Complet', category: 'Biochimie', price: 18500, delay: '4h' },
        { id: 's5', name: 'Prélèvement à Domicile (Douala)', category: 'Service Mobile', price: 5000, delay: 'Sous 2h' }
      ],
      promotions: [
        { id: 'p1', title: 'Bilan Santé Complet Adulte -20%', desc: 'NFS + Glycémie + Cholestérol + Créatinine + Transaminases avec résultats WhatsApp/PDF.', price: 24000, badge: '-20%' }
      ]
    },
    {
      id: 'fac_lab_yassa',
      facility_type: 'laboratory',
      name: 'Laboratoire BioMed Express Yassa',
      director_name: 'Dr Sylvie Mballa',
      license_number: 'MINSANTE-LAB-2021-088',
      city: 'Douala',
      quarter: 'Yassa',
      address: 'Carrefour Yassa, Douala III',
      lat: 4.0065,
      lng: 9.8112,
      phone: '677910230',
      whatsapp: '677910230',
      email: 'labo.yassa@biomed-cm.com',
      opening_hours: '07:00 - 19:30',
      emergency_24_7: false,
      home_sampling: true,
      online_results: true,
      verification_status: 'verified',
      services: [
        { id: 's10', name: 'Test Paludisme & Typhoïde (Widal)', category: 'Microbiologie', price: 4000, delay: '1h' },
        { id: 's11', name: 'Bilan Prénatal Complet', category: 'Maternité', price: 22000, delay: '4h' },
        { id: 's12', name: 'ECBU + Antibiogramme', category: 'Bactériologie', price: 9500, delay: '24h' }
      ],
      promotions: [
        { id: 'p10', title: 'Dépistage Diabète & Tension Gratuit', desc: 'Pour tout bilan sanguin complet effectué avant 11h.', price: 15000, badge: 'OFFRE' }
      ]
    },
    {
      id: 'fac_hosp_laquintinie',
      facility_type: 'hospital',
      name: 'Hôpital Général & Urgences de Douala',
      director_name: 'Direction Médicale',
      license_number: 'MINSANTE-HOP-001',
      city: 'Douala',
      quarter: 'Beedi / Makèpè',
      address: 'Avenue de l\'Hôpital Général, Douala',
      lat: 4.0842,
      lng: 9.7615,
      phone: '233370144',
      whatsapp: '699100200',
      email: 'urgences@hopital-dla.cm',
      opening_hours: '24h/24 · 7j/7',
      emergency_24_7: true,
      home_sampling: false,
      online_results: true,
      verification_status: 'verified',
      services: [
        { id: 'h1', name: 'Urgences Médico-Chirurgicales 24h/24', category: 'Urgences', price: 5000, delay: 'Immédiat' },
        { id: 'h2', name: 'Scanner / IRM / Radiographie Numérique', category: 'Imagerie', price: 45000, delay: '2h' },
        { id: 'h3', name: 'Maternité & Néonatologie', category: 'Maternité', price: 15000, delay: '24h/24' },
        { id: 'h4', name: 'Pédiatrie & Cardiologie Spécialisée', category: 'Spécialités', price: 10000, delay: 'Sur RDV' }
      ],
      promotions: [
        { id: 'hp1', title: 'Campagne Prévention Cardiovasculaire', desc: 'ECG + Consultation Cardiologue + Bilan Lipidique.', price: 25000, badge: 'PRÉVENTION' }
      ]
    },
    {
      id: 'fac_clinic_bonapriso',
      facility_type: 'clinic',
      name: 'Polyclinique Bien-Être & Maternité Bonapriso',
      director_name: 'Dr Emmanuel Tchoua',
      license_number: 'MINSANTE-CLN-2018-042',
      city: 'Douala',
      quarter: 'Bonapriso',
      address: 'Rue Koloko, Bonapriso, Douala',
      lat: 4.0294,
      lng: 9.6961,
      phone: '696504030',
      whatsapp: '696504030',
      email: 'accueil@polyclinique-bienetre.cm',
      opening_hours: '24h/24 · 7j/7',
      emergency_24_7: true,
      home_sampling: true,
      online_results: true,
      verification_status: 'verified',
      services: [
        { id: 'c1', name: 'Consultation Générale & Spécialisée', category: 'Consultations', price: 10000, delay: 'Immédiat' },
        { id: 'c2', name: 'Échographie 3D/4D & Obstétricale', category: 'Imagerie', price: 18000, delay: '30 min' },
        { id: 'c3', name: 'Hospitalisation VIP & Chirurgie', category: 'Chirurgie', price: 35000, delay: '24h/24' }
      ],
      promotions: [
        { id: 'cp1', title: 'Forfait Suivi Grossesse Sérénité', desc: '4 consultations prénatales + 2 échographies + bilans.', price: 65000, badge: 'PACK' }
      ]
    },
    {
      id: 'fac_lab_yaounde',
      facility_type: 'laboratory',
      name: 'Centre Biologique & Diagnostics Bastos (Yaoundé)',
      director_name: 'Dr Jean-Claude Atangana',
      license_number: 'MINSANTE-LAB-2017-009',
      city: 'Yaoundé',
      quarter: 'Bastos',
      address: 'Route Bastos, Yaoundé',
      lat: 3.8911,
      lng: 11.5156,
      phone: '694778899',
      whatsapp: '694778899',
      email: 'labo@biobastos-yde.cm',
      opening_hours: '06:30 - 19:00',
      emergency_24_7: false,
      home_sampling: true,
      online_results: true,
      verification_status: 'verified',
      services: [
        { id: 'y1', name: 'Bilan Sanguin Complet & Sérologies', category: 'Biologie', price: 16000, delay: '3h' },
        { id: 'y2', name: 'Dosages Hormonaux (Thyroïde, Fertilité)', category: 'Hormonologie', price: 25000, delay: '6h' }
      ],
      promotions: [
        { id: 'yp1', title: 'Check-up Annuel Cadres -15%', desc: 'Bilan complet + prélèvement à domicile offert sur Yaoundé.', price: 32000, badge: '-15%' }
      ]
    },
    {
      id: 'fac_hosp_yde',
      facility_type: 'hospital',
      name: 'Centre Hospitalier & Clinique Centrale Yaoundé',
      director_name: 'Direction Médicale Yaoundé',
      license_number: 'MINSANTE-HOP-002',
      city: 'Yaoundé',
      quarter: 'Centre Ville',
      address: 'Avenue Henri Dunant, Yaoundé',
      lat: 3.8698,
      lng: 11.5122,
      phone: '222234020',
      whatsapp: '677112200',
      email: 'accueil@chc-yaounde.cm',
      opening_hours: '24h/24 · 7j/7',
      emergency_24_7: true,
      home_sampling: false,
      online_results: true,
      verification_status: 'verified',
      services: [
        { id: 'yh1', name: 'Urgences & Réanimation 24h/24', category: 'Urgences', price: 5000, delay: 'Immédiat' },
        { id: 'yh2', name: 'Imagerie Médicale & Scanner', category: 'Imagerie', price: 40000, delay: '2h' }
      ],
      promotions: []
    }
  ];

  function readLS(k, fb) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch (e) { return fb; } }
  function writeLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  async function hashPwd(pwd) {
    const data = new TextEncoder().encode('PG_FAC_V12::' + String(pwd || ''));
    if (window.crypto && window.crypto.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return String(pwd || '');
  }

  function getFacilities() {
    const saved = readLS(DIR_KEY, null);
    if (Array.isArray(saved) && saved.length > 0) return saved;
    writeLS(DIR_KEY, DEFAULT_FACILITIES);
    return DEFAULT_FACILITIES.slice();
  }

  async function syncFacilities() {
    const local = getFacilities();
    if (!window.supabase) return local;
    try {
      const { data, error } = await window.supabase.from('health_facilities').select('*').order('created_at', { ascending: false }).limit(80);
      if (!error && Array.isArray(data) && data.length > 0) {
        const merged = data.slice();
        local.forEach((f) => { if (!merged.some((m) => m.id === f.id || m.email === f.email)) merged.push(f); });
        writeLS(DIR_KEY, merged);
        return merged;
      }
    } catch (e) {}
    return local;
  }

  function saveFacilityInDir(fac) {
    const list = getFacilities();
    const idx = list.findIndex((x) => x.id === fac.id || (x.email && fac.email && x.email.toLowerCase() === fac.email.toLowerCase()));
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], fac);
    else list.unshift(fac);
    writeLS(DIR_KEY, list);
    return list;
  }

  function loadSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveSession(fac) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(fac));
      localStorage.setItem(SESSION_KEY, JSON.stringify(fac));
    } catch (e) {}
    saveFacilityInDir(fac);
  }
  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  async function registerFacility(p) {
    if (!p.name || !p.license_number || !p.email || !p.phone || !p.password) {
      throw new Error('Veuillez remplir tous les champs obligatoires (*).');
    }
    const hub = (window.CAMEROON_DEPARTMENT_HUBS && window.CAMEROON_DEPARTMENT_HUBS[p.city]) || { lat: 4.0511, lng: 9.7085 };
    const cleanPhone = String(p.phone).replace(/\D/g, '').replace(/^237/, '');
    const fac = {
      id: 'fac_' + Date.now(),
      facility_type: p.facility_type || 'laboratory',
      name: p.name.trim(),
      director_name: (p.director_name || '').trim(),
      license_number: p.license_number.trim().toUpperCase(),
      city: p.city || 'Douala',
      quarter: (p.quarter || '').trim(),
      address: `${(p.quarter || '').trim()}, ${p.city || 'Douala'}`,
      lat: Number(p.lat) || hub.lat,
      lng: Number(p.lng) || hub.lng,
      phone: cleanPhone,
      whatsapp: String(p.whatsapp || cleanPhone).replace(/\D/g, '').replace(/^237/, ''),
      email: p.email.trim().toLowerCase(),
      opening_hours: p.opening_hours || '07:00 - 19:00',
      emergency_24_7: !!p.emergency_24_7,
      home_sampling: !!p.home_sampling,
      online_results: true,
      services: [],
      promotions: [],
      verification_status: 'pending',
      subscription_status: 'trial',
      created_at: new Date().toISOString(),
      _local_pwd_hash: await hashPwd(p.password)
    };
    if (window.supabase) {
      try {
        if (window.supabase.auth) {
          const { data } = await window.supabase.auth.signUp({ email: fac.email, password: p.password });
          if (data && data.user) { fac.id = data.user.id; fac.user_id = data.user.id; }
        }
        const row = Object.assign({}, fac); delete row._local_pwd_hash;
        await window.supabase.from('health_facilities').upsert([row], { onConflict: 'email' });
      } catch (e) {}
    }
    saveSession(fac);
    return fac;
  }

  async function loginFacility(email, password) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !password) throw new Error('Email et mot de passe requis.');
    if (window.supabase && window.supabase.auth) {
      try {
        const { data: authData, error: authErr } = await window.supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (!authErr && authData && authData.user) {
          const { data: row } = await window.supabase.from('health_facilities').select('*').or(`id.eq.${authData.user.id},email.eq.${cleanEmail}`).maybeSingle();
          if (row) { saveSession(row); return row; }
        }
      } catch (e) {}
    }
    const found = getFacilities().find((f) => (f.email || '').toLowerCase() === cleanEmail);
    if (found && found._local_pwd_hash && (await hashPwd(password)) === found._local_pwd_hash) {
      saveSession(found);
      return found;
    }
    throw new Error('Identifiants invalides. Utilisez un compte démo ou inscrivez votre établissement.');
  }

  function getBookings() { return readLS(BOOKINGS_KEY, []); }
  function saveBookings(list) { writeLS(BOOKINGS_KEY, list.slice(0, 100)); }

  function bookFacilityService(payload) {
    if (!payload.facility_id || !payload.patient_name || !payload.service_name) {
      throw new Error('Établissement, nom du patient et service requis.');
    }
    const b = {
      id: 'fbk_' + Date.now(),
      facility_id: payload.facility_id,
      facility_name: payload.facility_name || 'Établissement',
      patient_name: payload.patient_name.trim(),
      patient_phone: String(payload.patient_phone || '').replace(/\D/g, '').replace(/^237/, ''),
      service_name: payload.service_name,
      preferred_date: payload.preferred_date || new Date().toISOString().slice(0, 10),
      home_sampling: !!payload.home_sampling,
      status: 'pending',
      created_at: new Date().toISOString()
    };
    const list = getBookings();
    list.unshift(b);
    saveBookings(list);
    return b;
  }

  window.FacilityStore = {
    getFacilities,
    syncFacilities,
    saveFacilityInDir,
    loadSession,
    saveSession,
    clearSession,
    registerFacility,
    loginFacility,
    getBookings,
    saveBookings,
    bookFacilityService
  };
})(window);
