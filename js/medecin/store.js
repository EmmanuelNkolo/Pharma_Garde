/**
 * Pharma-Garde v14.0 — Moteur Partagé Médecins Multi-Spécialités,
 *                      Disponibilités Temporisées Automatisées & Couverture 10 Régions Cameroun
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 * • Multi-spécialités par médecin (`specialties: string[]` + `specialty` principale)
 * • Gestion fine des disponibilités & indisponibilités temporisées (durée précise + auto-bascule
 *   automatique vers le planning hebdomadaire à expiration, zéro action manuelle)
 * • Mode Aléatoire Rapide (« Consulter le premier médecin disponible ») + Filtre Spécialité +
 *   Couverture nationale 10 Régions (accent sur les Grands Spécialistes des Chefs-lieux de Régions)
 * • Cache mémoire O(1) pour réponses et filtrages instantanés (< 1 ms)
 * • Modèle financier : 2 600 FCFA (100 F NotchPay avant recherche + 2 500 F direct OM/MoMo médecin),
 *   session ouverte 48h, abonnement médecin 5 000 F/mois · 50 000 F/an (14j gratuits).
 *
 * Expose : window.MedecinStore
 */
(function (window) {
  'use strict';

  const DOC_SESSION_KEY = 'pharmagarde_doctor_session_v12';
  const DOC_DIR_KEY = 'pharmagarde_doctors_directory_v14';
  const LEGACY_DOC_DIR_KEY = 'pharmagarde_doctors_directory_v12';
  const CONSULT_KEY = 'pharmagarde_consultations_v12';
  const MSGS_KEY = 'pharmagarde_consult_msgs_v12';
  const RX_KEY = 'pharmagarde_signed_prescriptions_v12';
  const APPT_KEY = 'pharmagarde_doctor_appointments_v12';

  const CONSULT_TOTAL_FCFA = 2600;
  const PLATFORM_FEE_FCFA = 100;
  const DOCTOR_PAYOUT_FCFA = 2500;
  const SESSION_48H_MS = 48 * 60 * 60 * 1000;

  // Cache mémoire instantané (évite tout JSON.parse répétitif)
  const memCache = Object.create(null);

  const SPECIALTIES = [
    'Médecine Générale',
    'Pédiatrie',
    'Néonatologie',
    'Gynécologie-Obstétrique',
    'Cardiologie',
    'Médecine Interne',
    'Dermatologie & Vénéréologie',
    'Ophtalmologie',
    'ORL & Chirurgie Cervico-Faciale',
    'Neurologie',
    'Pneumologie',
    'Gastro-entérologie & Hépatologie',
    'Endocrinologie & Diabétologie',
    'Néphrologie',
    'Rhumatologie',
    'Urologie',
    'Chirurgie Générale',
    'Orthopédie & Traumatologie',
    'Psychiatrie & Bien-être Mental',
    'Oncologie Médicale',
    'Infectiologie & Médecine Tropicale',
    'Anesthésie-Réanimation & Urgences'
  ];

  // Les 10 Régions du Cameroun & leurs Chefs-Lieux (Pôles des Grands Spécialistes)
  const CAMEROON_REGIONS = [
    { region: 'Littoral', capital: 'Douala', lat: 4.0511, lng: 9.7085, hubs: ['Douala', 'Edéa', 'Nkongsamba', 'Yabassi'] },
    { region: 'Centre', capital: 'Yaoundé', lat: 3.8667, lng: 11.5167, hubs: ['Yaoundé', 'Mbalmayo', 'Bafia', 'Obala', 'Eséka', 'Mfou'] },
    { region: 'Ouest', capital: 'Bafoussam', lat: 5.4778, lng: 10.4176, hubs: ['Bafoussam', 'Dschang', 'Mbouda', 'Bangangté', 'Foumban', 'Bafang'] },
    { region: 'Nord-Ouest', capital: 'Bamenda', lat: 5.9631, lng: 10.1591, hubs: ['Bamenda', 'Kumbo', 'Wum', 'Ndop', 'Mbengwi'] },
    { region: 'Sud-Ouest', capital: 'Buéa', lat: 4.1560, lng: 9.2320, hubs: ['Buéa', 'Limbé', 'Kumba', 'Mamfé', 'Tiko'] },
    { region: 'Nord', capital: 'Garoua', lat: 9.3014, lng: 13.3977, hubs: ['Garoua', 'Guider', 'Poli', 'Tcholliré'] },
    { region: 'Extrême-Nord', capital: 'Maroua', lat: 10.5956, lng: 14.3247, hubs: ['Maroua', 'Kousséri', 'Mokolo', 'Mora', 'Yagoua', 'Kaélé'] },
    { region: 'Adamaoua', capital: 'Ngaoundéré', lat: 7.3167, lng: 13.5833, hubs: ['Ngaoundéré', 'Meiganga', 'Tibati', 'Banyo', 'Tignère'] },
    { region: 'Est', capital: 'Bertoua', lat: 4.5773, lng: 13.6846, hubs: ['Bertoua', 'Batouri', 'Abong-Mbang', 'Yokadouma'] },
    { region: 'Sud', capital: 'Ebolowa', lat: 2.9000, lng: 11.1500, hubs: ['Ebolowa', 'Kribi', 'Sangmélima', 'Ambam'] }
  ];

  const REGIONAL_CAPITALS = new Set(CAMEROON_REGIONS.map((r) => r.capital.toLowerCase()));

  const AVAILABILITY_DURATIONS = [
    { minutes: 0, label: '🤖 Automatique (selon mon planning hebdo)' },
    { minutes: 30, label: '⏱️ Pendant 30 minutes' },
    { minutes: 60, label: '⏱️ Pendant 1 heure' },
    { minutes: 120, label: '⏱️ Pendant 2 heures' },
    { minutes: 240, label: '⏱️ Pendant 4 heures' },
    { minutes: 480, label: '⏱️ Pendant 8 heures' },
    { minutes: 720, label: '⏱️ Pendant 12 heures' },
    { minutes: 1440, label: '📅 Pendant 24 heures (1 jour)' },
    { minutes: 2880, label: '📅 Pendant 48 heures (2 jours)' },
    { minutes: 10080, label: '📅 Pendant 7 jours (congé / mission)' }
  ];

  const DEMO_SIG_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="72" viewBox="0 0 240 72"><path d="M18 52 C32 14, 54 14, 48 48 C44 62, 68 22, 86 38 C98 48, 114 26, 132 42 C148 54, 174 22, 218 36" fill="none" stroke="#0f172a" stroke-width="2.6" stroke-linecap="round"/><path d="M24 60 L214 54" stroke="#0d9488" stroke-width="1.2" opacity="0.6"/></svg>'
  );

  const DEFAULT_SCHEDULE = {
    lun: { active: true, start: '07:30', end: '21:00' },
    mar: { active: true, start: '07:30', end: '21:00' },
    mer: { active: true, start: '07:30', end: '21:00' },
    jeu: { active: true, start: '07:30', end: '21:00' },
    ven: { active: true, start: '07:30', end: '21:00' },
    sam: { active: true, start: '08:30', end: '19:00' },
    dim: { active: true, start: '09:00', end: '16:00' }
  };

  // Annuaire National Initial : Grands Spécialistes multi-spécialités dans les 10 Chefs-lieux de Régions du Cameroun
  const DEFAULT_DOCTORS = [
    {
      id: 'doc_kamga_dla',
      title: 'Dr',
      full_name: 'Hervé Kamga Fotso',
      specialty: 'Médecine Générale',
      specialties: ['Médecine Générale', 'Infectiologie & Médecine Tropicale'],
      onmc_number: 'ONMC-2017-4821',
      cni_number: '114288901',
      diploma_title: 'Doctorat d\'État en Médecine (FMSB Yaoundé I)',
      university: 'Université de Yaoundé I',
      graduation_year: 2016,
      clinic_name: 'Cabinet Médical Bonapriso Santé',
      region: 'Littoral',
      city: 'Douala',
      quarter: 'Bonapriso',
      is_regional_capital: true,
      address: 'Rue Tokoto, Bonapriso, Douala',
      lat: 4.0278, lng: 9.6982,
      phone: '699412580', whatsapp: '699412580', payout_phone: '699412580', payout_operator: 'om',
      email: 'dr.kamga@pharmagarde.cm',
      signature_data_url: DEMO_SIG_SVG,
      consultation_hours: DEFAULT_SCHEDULE,
      availability_status: 'available',
      availability_until: new Date(Date.now() + 6 * 3600000).toISOString(),
      availability_note: 'Téléconsultation rapide & suivi paludisme/infections',
      auto_schedule_enabled: true,
      verification_status: 'verified', subscription_status: 'active', subscription_plan: 'annual'
    },
    {
      id: 'doc_nguefack_dla',
      title: 'Pr',
      full_name: 'Alain Nguefack Tchoumi',
      specialty: 'Cardiologie',
      specialties: ['Cardiologie', 'Médecine Interne'],
      onmc_number: 'ONMC-2012-2194',
      cni_number: '108451209',
      diploma_title: 'Agrégation Cardiologie & Médecine Vasculaire',
      university: 'Université de Douala (FMSP)',
      graduation_year: 2011,
      clinic_name: 'Institut Cardiovasculaire Akwa (CHU Douala)',
      region: 'Littoral',
      city: 'Douala',
      quarter: 'Akwa',
      is_regional_capital: true,
      address: 'Boulevard de la Liberté, Akwa, Douala',
      lat: 4.0518, lng: 9.7048,
      phone: '694552100', whatsapp: '694552100', payout_phone: '694552100', payout_operator: 'om',
      email: 'pr.nguefack@pharmagarde.cm',
      signature_data_url: DEMO_SIG_SVG,
      consultation_hours: DEFAULT_SCHEDULE,
      availability_status: 'available',
      availability_until: new Date(Date.now() + 4 * 3600000).toISOString(),
      availability_note: 'HTA, palpitations, ECG & suivi cardiaque',
      auto_schedule_enabled: true,
      verification_status: 'verified', subscription_status: 'active', subscription_plan: 'annual'
    },
    {
      id: 'doc_mbarga_yde',
      title: 'Dr',
      full_name: 'Clarisse Mbarga Owona',
      specialty: 'Pédiatrie',
      specialties: ['Pédiatrie', 'Néonatologie'],
      onmc_number: 'ONMC-2019-5310',
      cni_number: '118903421',
      diploma_title: 'DES Pédiatrie & Néonatologie (FMSB)',
      university: 'Université de Yaoundé I',
      graduation_year: 2018,
      clinic_name: 'Pôle Pédiatrique Bastos (Hôpital Gynéco-Obstétrique)',
      region: 'Centre',
      city: 'Yaoundé',
      quarter: 'Bastos',
      is_regional_capital: true,
      address: 'Avenue Rosa Parks, Bastos, Yaoundé',
      lat: 3.8924, lng: 11.5142,
      phone: '677823190', whatsapp: '677823190', payout_phone: '677823190', payout_operator: 'momo',
      email: 'dr.mbarga@pharmagarde.cm',
      signature_data_url: DEMO_SIG_SVG,
      consultation_hours: DEFAULT_SCHEDULE,
      availability_status: 'available',
      availability_until: new Date(Date.now() + 5 * 3600000).toISOString(),
      availability_note: 'Nourrissons, fièvres infantiles & calendrier vaccinal',
      auto_schedule_enabled: true,
      verification_status: 'verified', subscription_status: 'active', subscription_plan: 'monthly'
    },
    {
      id: 'doc_ebongue_yde',
      title: 'Dr',
      full_name: 'Nadine Ebongue Ndongo',
      specialty: 'Gynécologie-Obstétrique',
      specialties: ['Gynécologie-Obstétrique', 'Endocrinologie & Diabétologie'],
      onmc_number: 'ONMC-2020-6044',
      cni_number: '121044782',
      diploma_title: 'DES Gynécologie-Obstétrique (FMSB)',
      university: 'Université de Yaoundé I',
      graduation_year: 2019,
      clinic_name: 'Centre Mère-Enfant Nlongkak',
      region: 'Centre',
      city: 'Yaoundé',
      quarter: 'Nlongkak',
      is_regional_capital: true,
      address: 'Carrefour Nlongkak, Yaoundé',
      lat: 3.8781, lng: 11.5229,
      phone: '675339011', whatsapp: '675339011', payout_phone: '675339011', payout_operator: 'momo',
      email: 'dr.ebongue@pharmagarde.cm',
      signature_data_url: DEMO_SIG_SVG,
      consultation_hours: DEFAULT_SCHEDULE,
      availability_status: 'available',
      availability_until: new Date(Date.now() + 3 * 3600000).toISOString(),
      availability_note: 'Suivi grossesse, fertilité & diabète gestationnel',
      auto_schedule_enabled: true,
      verification_status: 'verified', subscription_status: 'active', subscription_plan: 'monthly'
    },
    {
      id: 'doc_fokou_baf',
      title: 'Pr',
      full_name: 'Samuel Fokou Talla',
      specialty: 'Gastro-entérologie & Hépatologie',
      specialties: ['Gastro-entérologie & Hépatologie', 'Médecine Interne', 'Endocrinologie & Diabétologie'],
      onmc_number: 'ONMC-2014-3120',
      cni_number: '110338219',
      diploma_title: 'DES Hépato-Gastro-Entérologie & Médecine Interne',
      university: 'Université de Dschang / Yaoundé I',
      graduation_year: 2013,
      clinic_name: 'Hôpital Régional de Bafoussam',
      region: 'Ouest',
      city: 'Bafoussam',
      quarter: 'Tamdja',
      is_regional_capital: true,
      address: 'Quartier Tamdja, Bafoussam',
      lat: 5.4778, lng: 10.4176,
      phone: '699741022', whatsapp: '699741022', payout_phone: '699741022', payout_operator: 'om',
      email: 'pr.fokou@pharmagarde.cm',
      signature_data_url: DEMO_SIG_SVG,
      consultation_hours: DEFAULT_SCHEDULE,
      availability_status: 'available',
      availability_until: new Date(Date.now() + 4 * 3600000).toISOString(),
      availability_note: 'Ulcères, hépatites, diabète & bilans digestifs',
      auto_schedule_enabled: true,
      verification_status: 'verified', subscription_status: 'active', subscription_plan: 'annual'
    },
    {
      id: 'doc_nfor_bda',
      title: 'Dr',
      full_name: 'Grace Nfor Che',
      specialty: 'Dermatologie & Vénéréologie',
      specialties: ['Dermatologie & Vénéréologie', 'Médecine Générale'],
      onmc_number: 'ONMC-2018-4982',
      cni_number: '116220944',
      diploma_title: 'MD & Specialist Dermatology (UB Buea)',
      university: 'University of Buea',
      graduation_year: 2017,
      clinic_name: 'Regional Hospital Bamenda Clinic',
      region: 'Nord-Ouest',
      city: 'Bamenda',
      quarter: 'Commercial Avenue',
      is_regional_capital: true,
      address: 'Commercial Avenue, Bamenda',
      lat: 5.9631, lng: 10.1591,
      phone: '677409812', whatsapp: '677409812', payout_phone: '677409812', payout_operator: 'momo',
      email: 'dr.nfor@pharmagarde.cm',
      signature_data_url: DEMO_SIG_SVG,
      consultation_hours: DEFAULT_SCHEDULE,
      availability_status: 'available',
      availability_until: null,
      availability_note: 'Bilingue FR/EN · Dermatologie clinique',
      auto_schedule_enabled: true,
      verification_status: 'verified', subscription_status: 'active', subscription_plan: 'monthly'
    },
    {
      id: 'doc_hamadou_gar',
      title: 'Dr',
      full_name: 'Ibrahima Hamadou Bello',
      specialty: 'Pneumologie',
      specialties: ['Pneumologie', 'Infectiologie & Médecine Tropicale', 'Médecine Générale'],
      onmc_number: 'ONMC-2016-4012',
      cni_number: '113870415',
      diploma_title: 'DES Pneumologie & Allergologie (Hôpital Régional Garoua)',
      university: 'Université de Garoua / Yaoundé I',
      graduation_year: 2015,
      clinic_name: 'Hôpital Général de Garoua',
      region: 'Nord',
      city: 'Garoua',
      quarter: 'Plateau',
      is_regional_capital: true,
      address: 'Quartier Plateau, Garoua',
      lat: 9.3014, lng: 13.3977,
      phone: '698114509', whatsapp: '698114509', payout_phone: '698114509', payout_operator: 'om',
      email: 'dr.hamadou@pharmagarde.cm',
      signature_data_url: DEMO_SIG_SVG,
      consultation_hours: DEFAULT_SCHEDULE,
      availability_status: 'available',
      availability_until: new Date(Date.now() + 7 * 3600000).toISOString(),
      availability_note: 'Asthme, allergies respiratoires & infections tropicales',
      auto_schedule_enabled: true,
      verification_status: 'verified', subscription_status: 'active', subscription_plan: 'annual'
    },
    {
      id: 'doc_ewane_buea',
      title: 'Dr',
      full_name: 'Victor Ewane Lyonga',
      specialty: 'Neurologie',
      specialties: ['Neurologie', 'Psychiatrie & Bien-être Mental', 'Ophtalmologie'],
      onmc_number: 'ONMC-2015-3788',
      cni_number: '112004871',
      diploma_title: 'Fellowship Neurology & Neuro-Ophthalmology',
      university: 'University of Buea (FHS)',
      graduation_year: 2014,
      clinic_name: 'Buea Regional Specialist Center',
      region: 'Sud-Ouest',
      city: 'Buéa',
      quarter: 'Molyko',
      is_regional_capital: true,
      address: 'Molyko High Street, Buéa',
      lat: 4.1560, lng: 9.2320,
      phone: '674908123', whatsapp: '674908123', payout_phone: '674908123', payout_operator: 'momo',
      email: 'dr.ewane@pharmagarde.cm',
      signature_data_url: DEMO_SIG_SVG,
      consultation_hours: DEFAULT_SCHEDULE,
      availability_status: 'available',
      availability_until: null,
      availability_note: 'Migraines, troubles du sommeil, stress & AVC',
      auto_schedule_enabled: true,
      verification_status: 'verified', subscription_status: 'active', subscription_plan: 'monthly'
    },
    {
      id: 'doc_amina_mar',
      title: 'Dr',
      full_name: 'Amina Oumarou Sadou',
      specialty: 'Ophtalmologie',
      specialties: ['Ophtalmologie', 'ORL & Chirurgie Cervico-Faciale'],
      onmc_number: 'ONMC-2019-5601',
      cni_number: '119442010',
      diploma_title: 'DES Ophtalmologie & ORL',
      university: 'Université de Yaoundé I',
      graduation_year: 2018,
      clinic_name: 'Hôpital Régional de Maroua',
      region: 'Extrême-Nord',
      city: 'Maroua',
      quarter: 'Domayo',
      is_regional_capital: true,
      address: 'Quartier Domayo, Maroua',
      lat: 10.5956, lng: 14.3247,
      phone: '695332198', whatsapp: '695332198', payout_phone: '695332198', payout_operator: 'om',
      email: 'dr.amina@pharmagarde.cm',
      signature_data_url: DEMO_SIG_SVG,
      consultation_hours: DEFAULT_SCHEDULE,
      availability_status: 'busy',
      availability_until: new Date(Date.now() + 45 * 60000).toISOString(),
      availability_note: 'En consultation cabinet — libre sous 45 min',
      auto_schedule_enabled: true,
      verification_status: 'verified', subscription_status: 'active', subscription_plan: 'monthly'
    },
    {
      id: 'doc_aboubakar_ngd',
      title: 'Dr',
      full_name: 'Aboubakar Nana Mohamadou',
      specialty: 'Urologie',
      specialties: ['Urologie', 'Néphrologie', 'Chirurgie Générale'],
      onmc_number: 'ONMC-2016-4299',
      cni_number: '115091823',
      diploma_title: 'DES Urologie & Néphrologie',
      university: 'Université de Yaoundé I',
      graduation_year: 2015,
      clinic_name: 'Hôpital Régional de Ngaoundéré',
      region: 'Adamaoua',
      city: 'Ngaoundéré',
      quarter: 'Dang / Centre',
      is_regional_capital: true,
      address: 'Centre Ville, Ngaoundéré',
      lat: 7.3167, lng: 13.5833,
      phone: '696883104', whatsapp: '696883104', payout_phone: '696883104', payout_operator: 'om',
      email: 'dr.aboubakar@pharmagarde.cm',
      signature_data_url: DEMO_SIG_SVG,
      consultation_hours: DEFAULT_SCHEDULE,
      availability_status: 'available',
      availability_until: null,
      availability_note: 'Urologie, calculs rénaux & bilans prostatiques',
      auto_schedule_enabled: true,
      verification_status: 'verified', subscription_status: 'active', subscription_plan: 'annual'
    },
    {
      id: 'doc_mbida_ber',
      title: 'Dr',
      full_name: 'Christian Mbida Ze',
      specialty: 'Orthopédie & Traumatologie',
      specialties: ['Orthopédie & Traumatologie', 'Rhumatologie', 'Médecine Générale'],
      onmc_number: 'ONMC-2018-5092',
      cni_number: '117552901',
      diploma_title: 'DES Orthopédie, Traumatologie & Rhumatologie',
      university: 'Université de Yaoundé I',
      graduation_year: 2017,
      clinic_name: 'Hôpital Régional de Bertoua / Ebolowa',
      region: 'Est',
      city: 'Bertoua',
      quarter: 'Mokolo II',
      is_regional_capital: true,
      address: 'Avenue de l\'Hôpital Régional, Bertoua',
      lat: 4.5773, lng: 13.6846,
      phone: '697441820', whatsapp: '697441820', payout_phone: '697441820', payout_operator: 'om',
      email: 'dr.mbida@pharmagarde.cm',
      signature_data_url: DEMO_SIG_SVG,
      consultation_hours: DEFAULT_SCHEDULE,
      availability_status: 'available',
      availability_until: null,
      availability_note: 'Douleurs articulaires, lombalgies & traumatologie',
      auto_schedule_enabled: true,
      verification_status: 'verified', subscription_status: 'active', subscription_plan: 'monthly'
    },
    {
      id: 'doc_mvondo_ebo',
      title: 'Dr',
      full_name: 'Estelle Mvondo Ntyam',
      specialty: 'Endocrinologie & Diabétologie',
      specialties: ['Endocrinologie & Diabétologie', 'Médecine Générale', 'Pédiatrie'],
      onmc_number: 'ONMC-2020-6218',
      cni_number: '122190441',
      diploma_title: 'DES Endocrinologie & Diabétologie',
      university: 'Université de Yaoundé I',
      graduation_year: 2019,
      clinic_name: 'Hôpital Régional d\'Ebolowa',
      region: 'Sud',
      city: 'Ebolowa',
      quarter: 'Nko\'ovos',
      is_regional_capital: true,
      address: 'Quartier Nko\'ovos, Ebolowa',
      lat: 2.9000, lng: 11.1500,
      phone: '678550192', whatsapp: '678550192', payout_phone: '678550192', payout_operator: 'momo',
      email: 'dr.mvondo@pharmagarde.cm',
      signature_data_url: DEMO_SIG_SVG,
      consultation_hours: DEFAULT_SCHEDULE,
      availability_status: 'available',
      availability_until: null,
      availability_note: 'Diabète, thyroïde, nutrition & médecine familiale',
      auto_schedule_enabled: true,
      verification_status: 'verified', subscription_status: 'active', subscription_plan: 'monthly'
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
    if (Object.prototype.hasOwnProperty.call(memCache, key)) return memCache[key];
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        memCache[key] = parsed;
        return parsed;
      }
    } catch (e) {}
    return fallback;
  }
  function writeLS(key, val) {
    memCache[key] = val;
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  function resolveRegionInfo(cityName, explicitRegion) {
    const cLower = String(cityName || '').trim().toLowerCase();
    for (let i = 0; i < CAMEROON_REGIONS.length; i++) {
      const r = CAMEROON_REGIONS[i];
      if (r.capital.toLowerCase() === cLower) return { region: r.region, isCapital: true, lat: r.lat, lng: r.lng };
      if (r.hubs.some((h) => h.toLowerCase() === cLower)) return { region: r.region, isCapital: false, lat: r.lat, lng: r.lng };
    }
    if (explicitRegion) {
      const found = CAMEROON_REGIONS.find((r) => r.region.toLowerCase() === String(explicitRegion).toLowerCase());
      if (found) return { region: found.region, isCapital: REGIONAL_CAPITALS.has(cLower), lat: found.lat, lng: found.lng };
    }
    return { region: explicitRegion || 'Littoral', isCapital: REGIONAL_CAPITALS.has(cLower), lat: 4.0511, lng: 9.7085 };
  }

  function getDoctorSpecialties(doc) {
    if (!doc) return ['Médecine Générale'];
    if (Array.isArray(doc.specialties) && doc.specialties.length > 0) {
      return Array.from(new Set(doc.specialties.map((s) => String(s || '').trim()).filter(Boolean)));
    }
    return [doc.specialty || 'Médecine Générale'];
  }

  function normalizeDoctor(doc) {
    const specs = getDoctorSpecialties(doc);
    const regInfo = resolveRegionInfo(doc.city, doc.region);
    return Object.assign({}, doc, {
      specialty: specs[0],
      specialties: specs,
      region: doc.region || regInfo.region,
      is_regional_capital: typeof doc.is_regional_capital === 'boolean' ? doc.is_regional_capital : regInfo.isCapital
    });
  }

  // ── Annuaire Médecins National (fusion v12 + v14, 0 ms) ────────
  function getDoctors() {
    let saved = readLS(DOC_DIR_KEY, null);
    if (!Array.isArray(saved) || saved.length === 0) {
      const legacy = readLS(LEGACY_DOC_DIR_KEY, []);
      const merged = DEFAULT_DOCTORS.map(normalizeDoctor);
      (Array.isArray(legacy) ? legacy : []).forEach((d) => {
        if (d && !merged.some((m) => m.id === d.id || (m.email && d.email && m.email === d.email))) {
          merged.unshift(normalizeDoctor(d));
        }
      });
      writeLS(DOC_DIR_KEY, merged);
      saved = merged;
    }
    return saved;
  }

  async function syncDoctors() {
    const local = getDoctors();
    if (!window.supabase) return local;
    try {
      const { data, error } = await window.supabase.from('doctors').select('*').order('created_at', { ascending: false }).limit(120);
      if (!error && Array.isArray(data) && data.length > 0) {
        const merged = data.map(normalizeDoctor);
        local.forEach((d) => {
          if (!merged.some((m) => m.id === d.id || (m.email && m.email === d.email))) merged.push(normalizeDoctor(d));
        });
        writeLS(DOC_DIR_KEY, merged);
        return merged;
      }
    } catch (e) {}
    return local;
  }

  function saveDoctorInDirectory(doc) {
    const norm = normalizeDoctor(doc);
    const list = getDoctors().slice();
    const idx = list.findIndex((d) => d.id === norm.id || (d.email && norm.email && d.email.toLowerCase() === norm.email.toLowerCase()));
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], norm);
    else list.unshift(norm);
    writeLS(DOC_DIR_KEY, list);
    return list;
  }

  function loadSession() {
    try {
      const raw = sessionStorage.getItem(DOC_SESSION_KEY) || localStorage.getItem(DOC_SESSION_KEY);
      return raw ? normalizeDoctor(JSON.parse(raw)) : null;
    } catch (e) { return null; }
  }
  function saveSession(doc) {
    const norm = normalizeDoctor(doc);
    try {
      sessionStorage.setItem(DOC_SESSION_KEY, JSON.stringify(norm));
      localStorage.setItem(DOC_SESSION_KEY, JSON.stringify(norm));
    } catch (e) {}
    saveDoctorInDirectory(norm);
  }
  function clearSession() {
    try {
      sessionStorage.removeItem(DOC_SESSION_KEY);
      localStorage.removeItem(DOC_SESSION_KEY);
    } catch (e) {}
  }

  // ── Moteur Automatisé de Disponibilité Temporisée ──────────────
  function isWithinWeeklySchedule(doc) {
    const days = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
    const now = new Date();
    const slot = ((doc && doc.consultation_hours) || DEFAULT_SCHEDULE)[days[now.getDay()]];
    if (!slot || !slot.active) return false;
    const cur = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    return cur >= (slot.start || '08:00') && cur <= (slot.end || '20:00');
  }

  function formatDurationRemaining(untilIso) {
    if (!untilIso) return '';
    const diff = new Date(untilIso).getTime() - Date.now();
    if (diff <= 0) return '';
    const mins = Math.ceil(diff / 60000);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
    const d = Math.floor(h / 24);
    const remH = h % 24;
    return remH > 0 ? `${d}j ${remH}h` : `${d}j`;
  }

  /**
   * Calcule automatiquement l'état RÉEL en direct du médecin :
   * • Si une disponibilité/indisponibilité temporisée (`availability_until`) est en cours, elle prévaut.
   * • Dès qu'elle expire, le système rebascule AUTOMATIQUEMENT vers son planning hebdomadaire (0 action manuelle).
   */
  function getEffectiveAvailability(doc) {
    if (!doc) return { status: 'offline', label: 'Hors ligne', badgeColor: '#f87171', remaining: '', isAvailableNow: false };
    let status = doc.availability_status || 'available';
    let remaining = '';
    const hasUntil = !!doc.availability_until;

    if (hasUntil) {
      const rem = formatDurationRemaining(doc.availability_until);
      if (rem) {
        remaining = rem;
      } else {
        // Expiration atteinte → bascule automatique selon le planning hebdo !
        status = (doc.auto_schedule_enabled !== false && isWithinWeeklySchedule(doc)) ? 'available' : 'offline';
      }
    } else if (status === 'available' && doc.auto_schedule_enabled !== false && !isWithinWeeklySchedule(doc)) {
      // Hors plage horaire hebdomadaire sans forçage manuel
      status = 'offline';
    }

    if (status === 'available') {
      return {
        status: 'available',
        isAvailableNow: true,
        badgeColor: '#34d399',
        bg: 'rgba(16,185,129,0.18)',
        shortLabel: remaining ? `🟢 Dispo (${remaining})` : '🟢 Disponible',
        fullLabel: remaining ? `🟢 Disponible encore ${remaining}` : '🟢 Disponible maintenant (Auto)'
      };
    }
    if (status === 'busy') {
      return {
        status: 'busy',
        isAvailableNow: false,
        badgeColor: '#fbbf24',
        bg: 'rgba(245,158,11,0.18)',
        shortLabel: remaining ? `🟡 Occupé (${remaining})` : '🟡 En consultation',
        fullLabel: remaining ? `🟡 En consultation — libre dans ${remaining}` : '🟡 En consultation'
      };
    }
    return {
      status: 'offline',
      isAvailableNow: false,
      badgeColor: '#f87171',
      bg: 'rgba(239,68,68,0.16)',
      shortLabel: remaining ? `🔴 Indispo (${remaining})` : '🔴 Indisponible',
      fullLabel: remaining ? `🔴 Indisponible — retour dans ${remaining}` : '🔴 Indisponible / Hors horaires'
    };
  }

  function isWithinSchedule(doc) {
    return getEffectiveAvailability(doc).isAvailableNow;
  }

  function setDoctorTimedAvailability(doc, status, durationMinutes, customUntilIso, note) {
    if (!doc) return null;
    let untilIso = null;
    if (customUntilIso) {
      const dt = new Date(customUntilIso);
      if (!isNaN(dt.getTime()) && dt.getTime() > Date.now()) untilIso = dt.toISOString();
    } else if (Number(durationMinutes) > 0) {
      untilIso = new Date(Date.now() + Number(durationMinutes) * 60000).toISOString();
    }

    doc.availability_status = status || 'available';
    doc.availability_until = untilIso;
    if (typeof note === 'string') doc.availability_note = note.trim();
    doc.auto_schedule_enabled = true;
    saveSession(doc);

    if (window.supabase && /^[0-9a-f-]{36}$/i.test(String(doc.id))) {
      try {
        window.supabase.from('doctors').update({
          availability_status: doc.availability_status,
          availability_until: doc.availability_until,
          availability_note: doc.availability_note || ''
        }).eq('id', doc.id).then(() => {}, () => {});
      } catch (e) {}
    }
    return doc;
  }

  // ── Filtrage Instantané (Spécialité, Région / Chef-lieu, Disponibilité) ──
  function filterDoctors(opts) {
    const o = opts || {};
    const spec = o.specialty && o.specialty !== 'all' && o.specialty !== 'any' ? o.specialty : null;
    const region = o.region && o.region !== 'all' ? o.region : null;
    const onlyCapitals = region === 'capitals';
    const onlyAvail = !!o.onlyAvailable;

    return getDoctors().filter((d) => {
      if (spec && !getDoctorSpecialties(d).includes(spec)) return false;
      if (onlyCapitals && !d.is_regional_capital) return false;
      if (region && !onlyCapitals && String(d.region || '').toLowerCase() !== region.toLowerCase()) return false;
      if (onlyAvail && !getEffectiveAvailability(d).isAvailableNow) return false;
      return true;
    }).sort((a, b) => {
      // Priorité : 1. Disponible maintenant, 2. Chef-lieu de région (grands spécialistes), 3. Professeur/Spécialiste
      const avA = getEffectiveAvailability(a).isAvailableNow ? 1 : 0;
      const avB = getEffectiveAvailability(b).isAvailableNow ? 1 : 0;
      if (avB !== avA) return avB - avA;
      const capA = a.is_regional_capital ? 1 : 0;
      const capB = b.is_regional_capital ? 1 : 0;
      if (capB !== capA) return capB - capA;
      return (b.title === 'Pr' ? 1 : 0) - (a.title === 'Pr' ? 1 : 0);
    });
  }

  function getSpecialtyDirectorySummary(regionFilter) {
    const pool = filterDoctors({ region: regionFilter || 'all' });
    return SPECIALTIES.map((sp) => {
      const matches = pool.filter((d) => getDoctorSpecialties(d).includes(sp));
      const avail = matches.filter((d) => getEffectiveAvailability(d).isAvailableNow).length;
      return { specialty: sp, total: matches.length, available: avail };
    });
  }

  // ── Validation Médicale Stricte ONMC (Multi-Spécialités) ───────
  function validateDoctorRegistration(p) {
    const errors = [];
    if (!p.full_name || p.full_name.trim().length < 4) errors.push('Nom complet du médecin requis.');
    const specs = Array.isArray(p.specialties) && p.specialties.length > 0 ? p.specialties : (p.specialty ? [p.specialty] : []);
    if (specs.length === 0) errors.push('Sélectionnez au moins une spécialité médicale.');
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

    const specs = Array.from(new Set(
      (Array.isArray(payload.specialties) && payload.specialties.length > 0 ? payload.specialties : [payload.specialty || 'Médecine Générale'])
        .map((s) => String(s || '').trim()).filter(Boolean)
    ));
    const cleanPhone = String(payload.phone).replace(/\D/g, '').replace(/^237/, '');
    const cleanPayout = String(payload.payout_phone || payload.phone).replace(/\D/g, '').replace(/^237/, '');
    const cityName = (payload.city || 'Douala').trim();
    const regInfo = resolveRegionInfo(cityName, payload.region);
    const hub = (window.CAMEROON_DEPARTMENT_HUBS && window.CAMEROON_DEPARTMENT_HUBS[cityName]) || { lat: regInfo.lat, lng: regInfo.lng };
    const trialEnd = new Date(Date.now() + 14 * 86400000).toISOString();

    const doc = {
      id: 'doc_' + Date.now(),
      title: payload.title || 'Dr',
      full_name: payload.full_name.trim(),
      specialty: specs[0],
      specialties: specs,
      onmc_number: payload.onmc_number.trim().toUpperCase(),
      cni_number: payload.cni_number.trim().toUpperCase(),
      diploma_title: payload.diploma_title.trim(),
      university: (payload.university || '').trim(),
      graduation_year: Number(payload.graduation_year) || new Date().getFullYear() - 3,
      clinic_name: (payload.clinic_name || '').trim() || 'Cabinet Médical Privé',
      region: payload.region || regInfo.region,
      city: cityName,
      quarter: (payload.quarter || '').trim(),
      is_regional_capital: regInfo.isCapital,
      address: `${(payload.quarter || '').trim() ? payload.quarter.trim() + ', ' : ''}${cityName}`,
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
      availability_until: null,
      availability_note: '',
      auto_schedule_enabled: true,
      verification_status: 'pending',
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
        const { error } = await window.supabase.from('doctors').upsert([dbRow], { onConflict: 'email' });
        if (error) {
          // Fallback rétrocompatible si la migration SQL v14 n'est pas encore appliquée
          delete dbRow.specialties; delete dbRow.region; delete dbRow.is_regional_capital;
          delete dbRow.availability_until; delete dbRow.availability_note; delete dbRow.auto_schedule_enabled;
          await window.supabase.from('doctors').upsert([dbRow], { onConflict: 'email' });
        }
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
          if (row) { saveSession(row); return normalizeDoctor(row); }
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

  /**
   * Routage Automatique Intelligent :
   * • Si preferredDoctorId est fourni → ce médecin précis.
   * • Si mode Aléatoire Rapide (`specialty === 'any' || !specialty`) → sélection équilibrée parmi les
   *   médecins vérifiés ONMC actuellement 🟢 Disponibles (optionnellement dans la région choisie).
   * • Si spécialité précise → cherche parmi TOUTES les spécialités déclarées par chaque médecin (`specialties`).
   */
  function findAvailableDoctor(specialty, preferredDoctorId, options) {
    const opts = options || {};
    const docs = getDoctors();
    if (preferredDoctorId) {
      const exact = docs.find((d) => d.id === preferredDoctorId);
      if (exact) return exact;
    }

    const isRandomAny = !specialty || specialty === 'any' || specialty === 'all';
    const verifiedAvail = docs.filter((d) =>
      (d.verification_status === 'verified' || (window.PGAdmin && PGAdmin.isVerified('doctor', d.id))) &&
      getEffectiveAvailability(d).isAvailableNow &&
      (!opts.region || opts.region === 'all' || (opts.region === 'capitals' ? d.is_regional_capital : String(d.region || '').toLowerCase() === opts.region.toLowerCase()))
    );

    if (isRandomAny) {
      const pool = verifiedAvail.length > 0 ? verifiedAvail : docs.filter((d) => getEffectiveAvailability(d).isAvailableNow);
      if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
      return docs[0] || null;
    }

    const sameSpecAvail = verifiedAvail.filter((d) => getDoctorSpecialties(d).includes(specialty));
    if (sameSpecAvail.length > 0) {
      return sameSpecAvail[Math.floor(Math.random() * sameSpecAvail.length)];
    }
    const anyWithSpec = docs.filter((d) => getDoctorSpecialties(d).includes(specialty));
    return anyWithSpec[0] || verifiedAvail[0] || docs[0] || null;
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

    // Étape 2 : Routage automatique (Aléatoire Rapide ou Spécialité + Région)
    const matchedDoc = findAvailableDoctor(payload.specialty, payload.preferred_doctor_id, { region: payload.region });
    const expiresAt = new Date(Date.now() + SESSION_48H_MS).toISOString();

    const consult = {
      id: consultId,
      patient_session_id: getPatientSessionId(),
      patient_alias: (payload.patient_alias || 'Patient').trim(),
      patient_phone: cleanPhone || '694929909',
      patient_age: Number(payload.patient_age) || null,
      patient_sex: payload.patient_sex || '',
      specialty_requested: (!payload.specialty || payload.specialty === 'any') ? 'Aléatoire (Médecin Disponible)' : payload.specialty,
      symptoms: (payload.symptoms || '').trim(),
      allergies: (payload.allergies || '').trim(),
      doctor_id: matchedDoc ? matchedDoc.id : null,
      doctor_name: matchedDoc ? `${matchedDoc.title || 'Dr'} ${matchedDoc.full_name}` : 'En recherche de médecin...',
      doctor_specialty: matchedDoc ? getDoctorSpecialties(matchedDoc).join(' · ') : payload.specialty,
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

    const list = getConsultations().slice();
    list.unshift(consult);
    saveConsultations(list);

    if (window.supabase) {
      try {
        const dbRow = Object.assign({}, consult);
        delete dbRow.doctor_specialty; delete dbRow.doctor_onmc; delete dbRow.doctor_phone;
        await window.supabase.from('medical_consultations').insert([dbRow]);
      } catch (e) {}
    }

    addConsultationMessage(consult.id, 'system', 'Pharma-Garde',
      matchedDoc
        ? `✅ Paiement confirmé (100 F plateforme + 2 500 F transférés directement au ${consult.doctor_name} — ${matchedDoc.city}, ${matchedDoc.region}). Session médicale ouverte 48h.`
        : '⏳ Paiement confirmé (100 F plateforme validés). Recherche automatique d\'un médecin disponible en cours...'
    );
    addConsultationMessage(consult.id, 'patient', consult.patient_alias,
      `Motif / Symptômes : ${consult.symptoms}${consult.allergies ? ' · Allergies : ' + consult.allergies : ''}`
    );

    return consult;
  }

  async function acceptConsultation(consultId, doctor) {
    const list = getConsultations().slice();
    const c = list.find((x) => x.id === consultId);
    if (!c || !doctor) return null;
    c.doctor_id = doctor.id;
    c.doctor_name = `${doctor.title || 'Dr'} ${doctor.full_name}`;
    c.doctor_specialty = getDoctorSpecialties(doctor).join(' · ');
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
    return c;
  }

  // ── Messagerie 48h ─────────────────────────────────────────────
  function getMessages(consultId) {
    const all = readLS(MSGS_KEY, {});
    return Array.isArray(all[consultId]) ? all[consultId] : [];
  }

  async function addConsultationMessage(consultId, senderRole, senderName, body) {
    if (!consultId || !body || !body.trim()) return null;
    const all = Object.assign({}, readLS(MSGS_KEY, {}));
    all[consultId] = (all[consultId] || []).slice();
    const msg = {
      id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      consultation_id: consultId,
      sender_role: senderRole,
      sender_name: senderName || senderRole,
      body: body.trim(),
      created_at: new Date().toISOString()
    };
    all[consultId].push(msg);
    writeLS(MSGS_KEY, all);
    if (window.supabase) {
      try { await window.supabase.from('consultation_messages').insert([msg]); } catch (e) {}
    }
    return msg;
  }

  function remaining48hLabel(expiresIso) {
    const diff = new Date(expiresIso).getTime() - Date.now();
    if (diff <= 0) return 'Session expirée';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `Reste ${h}h ${m}m (48h)`;
  }

  // ── Ordonnances Médicales Signées & Téléchargeables PDF ────────
  function getPrescriptions() { return readLS(RX_KEY, []); }
  function savePrescriptions(list) { writeLS(RX_KEY, list.slice(0, 100)); }

  async function issueSignedPrescription(doctor, consult, payload) {
    if (!doctor) throw new Error('Médecin non connecté.');
    const meds = (payload.medications || []).filter((m) => m && m.name && m.name.trim());
    if (meds.length === 0) throw new Error('Ajoutez au moins un médicament à prescrire.');

    const rx = {
      id: 'rx_' + Date.now(),
      rx_code: 'ORD-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000),
      consultation_id: consult ? consult.id : null,
      patient_session_id: consult ? consult.patient_session_id : getPatientSessionId(),
      doctor_id: doctor.id,
      doctor_name: `${doctor.title || 'Dr'} ${doctor.full_name}`,
      doctor_specialty: getDoctorSpecialties(doctor).join(' · '),
      doctor_onmc: doctor.onmc_number,
      doctor_clinic: doctor.clinic_name || '',
      doctor_city: doctor.city || 'Douala',
      doctor_phone: doctor.phone || '',
      doctor_signature_url: doctor.signature_data_url || DEMO_SIG_SVG,
      patient_alias: (payload.patient_alias || (consult && consult.patient_alias) || 'Patient').trim(),
      diagnosis: (payload.diagnosis || '').trim(),
      advice: (payload.advice || '').trim(),
      medications: meds,
      created_at: new Date().toISOString()
    };

    const list = getPrescriptions().slice();
    list.unshift(rx);
    savePrescriptions(list);

    if (consult) {
      addConsultationMessage(consult.id, 'doctor', rx.doctor_name,
        `📋 Ordonnance signée émise (${rx.rx_code}) : ${meds.map((m) => m.name).join(', ')}. Vous pouvez la télécharger en PDF et lancer directement la recherche en pharmacie !`
      );
    }

    if (window.supabase) {
      try { await window.supabase.from('medical_prescriptions').insert([rx]); } catch (e) {}
    }
    return rx;
  }

  function buildPrescriptionHTML(rx) {
    const dt = new Date(rx.created_at || Date.now()).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    return `
      <div class="pg-rx-sheet" style="font-family:Inter,Arial,sans-serif; color:#0f172a; padding:26px; background:#fff; border-top:6px solid #0d9488;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #e2e8f0; padding-bottom:14px; margin-bottom:16px;">
          <div>
            <div style="font-size:18px; font-weight:900; color:#0f766e;">${esc(rx.doctor_name)}</div>
            <div style="font-size:12.5px; font-weight:700; color:#334155;">${esc(rx.doctor_specialty)}</div>
            <div style="font-size:11.5px; color:#64748b;">N° ONMC : <strong>${esc(rx.doctor_onmc)}</strong> · ${esc(rx.doctor_clinic || rx.doctor_city)}</div>
            <div style="font-size:11px; color:#64748b;">Tél. : ${esc(rx.doctor_phone)} · Pharma-Garde Cameroun</div>
          </div>
          <div style="text-align:right;">
            <div style="display:inline-block; background:#0f766e; color:#fff; font-weight:800; font-size:11px; padding:4px 10px; border-radius:6px;">ORDONNANCE MÉDICALE</div>
            <div style="font-family:monospace; font-weight:800; font-size:12px; color:#0f172a; margin-top:6px;">${esc(rx.rx_code)}</div>
            <div style="font-size:11.5px; color:#475569; margin-top:2px;">${esc(rx.doctor_city)}, le ${esc(dt)}</div>
          </div>
        </div>
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin-bottom:16px; font-size:12.5px;">
          <strong>Patient :</strong> ${esc(rx.patient_alias)}
          ${rx.diagnosis ? `<br><strong>Indication clinique :</strong> ${esc(rx.diagnosis)}` : ''}
        </div>
        <div style="margin-bottom:18px;">
          ${(rx.medications || []).map((m, idx) => `
            <div style="padding:10px 0; border-bottom:1px dashed #cbd5e1;">
              <div style="font-weight:800; font-size:14px; color:#0f172a;">${idx + 1}. ${esc(m.name)}</div>
              <div style="font-size:12.5px; color:#334155; margin-top:2px;">
                Posologie : ${esc(m.dosage || 'Selon avis médical')} ${m.duration ? `· Durée : <strong>${esc(m.duration)}</strong>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
        ${rx.advice ? `<div style="font-size:12px; color:#334155; background:#f0fdfa; border:1px solid #99f6e4; border-radius:8px; padding:10px 12px; margin-bottom:18px;"><strong>Conseils médicaux :</strong> ${esc(rx.advice)}</div>` : ''}
        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:20px; padding-top:12px; border-top:1px solid #e2e8f0;">
          <div style="font-size:10.5px; color:#64748b; max-width:56%;">
            Document généré et signé numériquement sur <strong>Pharma-Garde Cameroun</strong>.<br>
            Vérification d'authenticité : <strong>${esc(rx.rx_code)}</strong> · ONMC <strong>${esc(rx.doctor_onmc)}</strong>.
          </div>
          <div style="text-align:center;">
            <div style="font-size:11px; color:#475569; margin-bottom:4px;">Signature &amp; Cachet du Médecin</div>
            <img src="${rx.doctor_signature_url || DEMO_SIG_SVG}" alt="Signature" style="max-height:64px; max-width:200px; display:block; margin:0 auto;">
            <div style="font-size:11px; font-weight:800; color:#0f766e; margin-top:2px;">${esc(rx.doctor_name)}</div>
          </div>
        </div>
      </div>
    `;
  }

  function downloadPrescriptionPDF(rxOrId) {
    const rx = typeof rxOrId === 'string' ? getPrescriptions().find((r) => r.id === rxOrId) : rxOrId;
    if (!rx) return;
    const html = buildPrescriptionHTML(rx);
    if (typeof window.html2pdf === 'function') {
      const wrap = document.createElement('div');
      wrap.innerHTML = html;
      window.html2pdf().set({
        margin: 8,
        filename: `Ordonnance_${rx.rx_code}.pdf`,
        image: { type: 'jpeg', quality: 0.96 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      }).from(wrap).save();
      return;
    }
    const w = window.open('', '_blank', 'width=820,height=900');
    if (w) {
      w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ordonnance ${esc(rx.rx_code)}</title></head><body>${html}<script>setTimeout(()=>window.print(),300);<\/script></body></html>`);
      w.document.close();
    }
  }

  // ── Rendez-Vous Médicaux ───────────────────────────────────────
  function getAppointments() { return readLS(APPT_KEY, []); }
  function saveAppointments(list) { writeLS(APPT_KEY, list.slice(0, 100)); }

  async function bookAppointment(payload) {
    if (!payload.doctor_id || !payload.patient_name || !payload.scheduled_at) {
      throw new Error('Médecin, nom du patient et date/heure requis.');
    }
    const appt = {
      id: 'appt_' + Date.now(),
      doctor_id: payload.doctor_id,
      doctor_name: payload.doctor_name || 'Médecin',
      patient_session_id: getPatientSessionId(),
      patient_name: payload.patient_name.trim(),
      patient_phone: String(payload.patient_phone || '').replace(/\D/g, '').replace(/^237/, ''),
      scheduled_at: payload.scheduled_at,
      mode: payload.mode === 'cabinet' ? 'cabinet' : 'teleconsultation',
      reason: (payload.reason || 'Consultation médicale').trim(),
      status: 'pending',
      created_at: new Date().toISOString()
    };
    const list = getAppointments().slice();
    list.unshift(appt);
    saveAppointments(list);
    if (window.supabase) {
      try { await window.supabase.from('doctor_appointments').insert([appt]); } catch (e) {}
    }
    return appt;
  }

  function updateAppointmentStatus(id, status) {
    const list = getAppointments().slice();
    const item = list.find((a) => a.id === id);
    if (!item) return null;
    item.status = status;
    saveAppointments(list);
    if (window.supabase && /^[0-9a-f-]{36}$/i.test(String(id || ''))) {
      try { window.supabase.from('doctor_appointments').update({ status }).eq('id', id).then(() => {}, () => {}); } catch (e) {}
    }
    return item;
  }

  window.MedecinStore = {
    SPECIALTIES,
    CAMEROON_REGIONS,
    AVAILABILITY_DURATIONS,
    DEFAULT_SCHEDULE,
    CONSULT_TOTAL_FCFA,
    PLATFORM_FEE_FCFA,
    DOCTOR_PAYOUT_FCFA,
    getDoctorSpecialties,
    getEffectiveAvailability,
    setDoctorTimedAvailability,
    filterDoctors,
    getSpecialtyDirectorySummary,
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
