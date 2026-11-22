/**
 * Pharma-Garde — Moteur d'Internationalisation Intégral (i18n) v3.0
 * ──────────────────────────────────────────────────────────────────
 * Couverture bilingue 100 % Français ↔ English sur les 4 espaces
 * (Client, Pharmacie, Délégué Médical, Grossiste B2B & Console Admin) :
 *   1. Clés explicites `data-i18n`, `data-i18n-placeholder`, `data-i18n-title`
 *   2. Traduction automatique & réversible de tout nœud texte, option, optgroup,
 *      placeholder et title (les originaux FR sont conservés en WeakMap).
 *   3. MutationObserver temps réel pour traduire tout contenu injecté en JS
 *      (modales, cartes, tableaux, toasts, popups Leaflet, console Admin).
 */
const I18n = (() => {
  'use strict';

  let currentLang = localStorage.getItem('pharmagarde_lang') || 'fr';
  let initialized = false;
  let observer = null;
  let isApplying = false;
  let rafPending = false;
  const dirtyRoots = new Set();

  // Stockage réversible des textes français d'origine
  const origNodeText = new WeakMap();
  const lastEnNodeText = new WeakMap();
  const origAttrMap = new WeakMap();
  const lastEnAttrMap = new WeakMap();

  // ════════════════════════════════════════════════════════════════
  // 1. DICTIONNAIRE DES CLÉS EXPLICITES (data-i18n / I18n.t)
  // ════════════════════════════════════════════════════════════════
  const translations = {
    fr: {
      app_name: 'Pharma-Garde',
      app_tagline: 'Votre santé, notre priorité',
      loading: 'Chargement...',
      close: 'Fermer',
      cancel: 'Annuler',
      confirm: 'Confirmer',
      save: 'Enregistrer',
      delete_btn: 'Supprimer',
      send: 'Envoyer',
      search: 'Rechercher',
      back: 'Retour',
      next: 'Suivant',
      yes: 'Oui',
      no: 'Non',
      error: 'Erreur',
      success: 'Succès',
      required: 'Requis',
      login_btn: 'Connexion',
      register_btn: "S'inscrire",
      email_placeholder: 'pharmacie@email.com',
      password_placeholder: '••••••••',
      ph_lastname: 'Ex: Ndi',
      ph_firstname: 'Ex: Jean Paul',
      ph_procard: 'Ex: DP-2023-4589',
      ph_cni: 'Ex: 1122334455',
      ph_email_del: 'jean.paul@labo.com',
      ph_phone: 'Ex: 699887766',
      ph_pwd_create: 'Créez un mot de passe sécurisé',
      ph_pwd_confirm: 'Retapez le mot de passe',

      footer_line1: 'Application de santé publique — Cameroun',
      footer_line2: 'Recherche de médicaments · Pharmacies de garde · Délégués médicaux · Grossistes-répartiteurs',

      welcome_title: 'Bienvenue sur',
      welcome_subtitle: 'Trouvez vos médicaments dans les pharmacies proches de vous',
      btn_client: 'Espace Client',
      btn_client_desc: 'Rechercher des médicaments',
      btn_pharmacy: 'Espace Pharmacie',
      btn_pharmacy_desc: 'Gérer votre officine',
      btn_delegate: 'Espace Délégué Médical',
      btn_delegate_desc: 'Promouvoir vos produits',
      btn_wholesaler: 'Espace Grossiste-Répartiteur',
      btn_wholesaler_desc: 'Catalogue B2B, commandes & arrivages',

      location_title: 'Votre Position',
      location_desc: 'Pour trouver les pharmacies proches, nous avons besoin de votre position. Vos données restent privées.',
      btn_detect: 'Détecter ma position',
      detecting: 'Détection en cours...',
      city_label: 'Ville',
      radius_label: 'Rayon',

      btn_medicines: 'Médicaments',
      btn_ordonnance: 'Ordonnance',
      btn_guard_short: 'Garde',
      search_medicine: 'Rechercher un médicament',
      search_placeholder: 'Nom du médicament...',
      guard_pharmacies: 'Pharmacies de garde',
      nearby_pharmacies: 'Pharmacies proches',
      no_pharmacies: 'Aucune pharmacie trouvée dans ce rayon',
      'map.open_count': '{n} pharmacie(s) ouverte(s)',
      'map.guard_count': '{n} de garde',
      'map.empty': "Aucune pharmacie trouvée dans un rayon de {r} km. Essayez d'élargir le rayon de recherche.",
      pharmacy_open: 'Ouverte',
      pharmacy_guard: 'De garde',
      pharmacy_closed: 'Fermée',
      call: 'Appeler',
      whatsapp: 'WhatsApp',
      directions: 'Y aller',
      reserve: 'Réserver',
      reserved: 'Réservé',
      reservation_code_label: 'Code de retrait',
      reservation_code_hint: 'Présentez ce code à la pharmacie',
      session_active: 'Session active',
      session_remaining: 'restantes',
      payment_title: 'Paiement',
      payment_amount: 'Montant',
      payment_phone: 'Numéro de téléphone',
      payment_confirm: 'Confirmer le paiement',
      payment_free: 'GRATUIT (session active)',
      payment_insufficient: 'Solde insuffisant. Veuillez recharger votre compte.',
      payment_processing: 'Traitement en cours...',
      payment_success: 'Paiement confirmé !',
      payment_failed: 'Le paiement a échoué.',
      responses_waiting: 'En attente des réponses...',
      pharmacies_notified: 'pharmacie(s) notifiée(s)',

      pharm_login_title: 'Connexion Pharmacie',
      pharm_register_title: 'Inscription Pharmacie',
      pharm_name: 'Nom de la pharmacie',
      pharm_address: 'Adresse',
      pharm_city: 'Ville',
      pharm_quarter: 'Quartier',
      pharm_phone: 'Téléphone',
      pharm_email: 'Email',
      pharm_password: 'Mot de passe',
      pharm_status_open: 'Ouverte',
      pharm_status_guard: 'Garde',
      pharm_status_closed: 'Fermée',
      pharm_requests: 'Demandes',
      pharm_requests_active: 'Demandes actives',
      pharm_no_requests: 'Aucune demande en cours',
      pharm_respond: 'Répondre',
      pharm_history: 'Historique',
      pharm_stats: 'Statistiques',
      pharm_delegates: 'Délégués',
      pharm_promos: 'Promotions',
      pharm_settings: 'Paramètres',
      pharm_logout: 'Déconnexion',
      pharm_verify_code: 'Vérifier un code',
      pharm_verify_code_desc: 'Entrez le code PG-XXXX du patient',
      pharm_code_valid: 'Code vérifié ! Produit remis au patient.',
      pharm_code_invalid: 'Code invalide ou déjà utilisé.',
      pharm_stock_alert: 'Alerte rupture',
      pharm_stock_alert_title: 'Alerte Rupture de Stock',
      pharm_stock_alert_desc: 'Signalez une rupture aux délégués médicaux de votre zone.',
      pharm_stock_product: 'Nom du produit en rupture',
      pharm_stock_urgency: 'Urgence',
      pharm_stock_urgency_normal: 'Normale',
      pharm_stock_urgency_urgent: 'Urgente',
      pharm_stock_urgency_critical: 'Critique',
      pharm_stock_radius: 'Rayon de diffusion',
      pharm_stock_message: 'Message complémentaire',
      pharm_stock_send: "Envoyer l'alerte",
      pharm_stock_sent: 'Alerte envoyée aux délégués !',

      del_login_title: 'Connexion Délégué',
      del_register_title: 'Inscription Délégué Médical',
      del_lastname: 'Nom',
      del_firstname: 'Prénom',
      del_pro_card: 'N° Carte professionnelle',
      del_cni: 'N° CNI',
      del_labs: 'Laboratoires',
      del_add_lab: 'Ajouter un laboratoire',
      del_pharmacies: 'Pharmacies',
      del_promotions: 'Promotions',
      del_wholesalers: 'Grossistes',
      del_stats: 'Statistiques',
      del_alerts: 'Alertes',
      del_visits: 'Visites',
      del_new_promo: 'Nouvelle Promotion',
      del_promo_lab: 'Laboratoire',
      del_promo_product: 'Nom du produit',
      del_promo_type: 'Type de produit',
      del_promo_desc: 'Description de la campagne',
      del_promo_doc: 'Lien document',
      del_broadcast_all: 'Diffuser à toutes les pharmacies',
      del_choose_pharmacy: 'Choisir une pharmacie',
      del_visit_request: 'Demander une visite',
      del_visit_date: 'Date et heure proposées',
      del_visit_purpose: 'Objet de la visite',
      del_visit_history: 'Historique des visites',
      del_promo_tracking: 'Suivi des promotions',
      del_stock_alerts: 'Alertes Rupture de Stock',
      del_stock_alerts_desc: 'Les pharmacies de votre zone signalent leurs ruptures ici.',
      del_no_alerts: 'Aucune alerte dans votre zone.',
      del_report: 'Rapport',
      del_settings: 'Paramètres',
      del_logout: 'Déconnexion',

      stat_sent: 'Envoyées',
      stat_read: 'Lues',
      stat_interested: 'Intéressées',
      stat_stocked: 'En stock',
      stat_rate: 'Taux',
      stat_total_promos: 'Total promotions',
      stat_total_visits: 'Total visites',
      stat_pharmacies_reached: 'Pharmacies atteintes',
      stat_response_rate: 'Taux de réponse',

      visit_pending: 'En attente',
      visit_confirmed: 'Confirmée',
      visit_rescheduled: 'Reportée',
      visit_cancelled: 'Refusée',
      visit_completed: 'Réalisée',

      time_ago_min: 'Il y a {n} min',
      time_ago_hour: 'Il y a {n}h',
      time_ago_day: 'Il y a {n} jour(s)',
      time_now: "À l'instant",

      delete_title: 'Supprimer mon compte',
      delete_warning: 'Cette action est irréversible. Toutes vos données seront supprimées.',
      admin_access: 'Accès Administrateur',
      admin_mode_active: 'MODE ADMINISTRATEUR PLATEFORME'
    },

    en: {
      app_name: 'Pharma-Garde',
      app_tagline: 'Your health, our priority',
      loading: 'Loading...',
      close: 'Close',
      cancel: 'Cancel',
      confirm: 'Confirm',
      save: 'Save',
      delete_btn: 'Delete',
      send: 'Send',
      search: 'Search',
      back: 'Back',
      next: 'Next',
      yes: 'Yes',
      no: 'No',
      error: 'Error',
      success: 'Success',
      required: 'Required',
      login_btn: 'Login',
      register_btn: 'Sign Up',
      email_placeholder: 'pharmacy@email.com',
      password_placeholder: '••••••••',
      ph_lastname: 'Ex: Smith',
      ph_firstname: 'Ex: John',
      ph_procard: 'Ex: DP-2023-4589',
      ph_cni: 'Ex: 1122334455',
      ph_email_del: 'john.smith@lab.com',
      ph_phone: 'Ex: 699887766',
      ph_pwd_create: 'Create a secure password',
      ph_pwd_confirm: 'Retype your password',

      footer_line1: 'Public Health Application — Cameroon',
      footer_line2: 'Medicine search · On-duty pharmacies · Medical delegates · Pharmaceutical wholesalers',

      welcome_title: 'Welcome to',
      welcome_subtitle: 'Find your medicines at nearby pharmacies',
      btn_client: 'Client Area',
      btn_client_desc: 'Search for medicines',
      btn_pharmacy: 'Pharmacy Area',
      btn_pharmacy_desc: 'Manage your pharmacy',
      btn_delegate: 'Medical Delegate Area',
      btn_delegate_desc: 'Promote your products',
      btn_wholesaler: 'Wholesaler-Distributor Area',
      btn_wholesaler_desc: 'B2B catalog, orders & arrivals',

      location_title: 'Your Location',
      location_desc: 'To find nearby pharmacies, we need your location. Your data stays private.',
      btn_detect: 'Detect my location',
      detecting: 'Detecting...',
      city_label: 'City',
      radius_label: 'Radius',

      btn_medicines: 'Medicines',
      btn_ordonnance: 'Prescription',
      btn_guard_short: 'On duty',
      search_medicine: 'Search for a medicine',
      search_placeholder: 'Medicine name...',
      guard_pharmacies: 'On-duty pharmacies',
      nearby_pharmacies: 'Nearby pharmacies',
      no_pharmacies: 'No pharmacy found in this radius',
      'map.open_count': '{n} open pharmacy(ies)',
      'map.guard_count': '{n} on duty',
      'map.empty': 'No pharmacy found within {r} km. Try expanding the search radius.',
      pharmacy_open: 'Open',
      pharmacy_guard: 'On duty',
      pharmacy_closed: 'Closed',
      call: 'Call',
      whatsapp: 'WhatsApp',
      directions: 'Go there',
      reserve: 'Reserve',
      reserved: 'Reserved',
      reservation_code_label: 'Pickup code',
      reservation_code_hint: 'Show this code at the pharmacy',
      session_active: 'Active session',
      session_remaining: 'remaining',
      payment_title: 'Payment',
      payment_amount: 'Amount',
      payment_phone: 'Phone number',
      payment_confirm: 'Confirm payment',
      payment_free: 'FREE (active session)',
      payment_insufficient: 'Insufficient balance. Please top up your account.',
      payment_processing: 'Processing...',
      payment_success: 'Payment confirmed!',
      payment_failed: 'Payment failed.',
      responses_waiting: 'Waiting for responses...',
      pharmacies_notified: 'pharmacy(ies) notified',

      pharm_login_title: 'Pharmacy Login',
      pharm_register_title: 'Register Pharmacy',
      pharm_name: 'Pharmacy name',
      pharm_address: 'Address',
      pharm_city: 'City',
      pharm_quarter: 'District',
      pharm_phone: 'Phone',
      pharm_email: 'Email',
      pharm_password: 'Password',
      pharm_status_open: 'Open',
      pharm_status_guard: 'On Duty',
      pharm_status_closed: 'Closed',
      pharm_requests: 'Requests',
      pharm_requests_active: 'Active requests',
      pharm_no_requests: 'No active requests',
      pharm_respond: 'Respond',
      pharm_history: 'History',
      pharm_stats: 'Statistics',
      pharm_delegates: 'Delegates',
      pharm_promos: 'Promotions',
      pharm_settings: 'Settings',
      pharm_logout: 'Logout',
      pharm_verify_code: 'Verify a code',
      pharm_verify_code_desc: 'Enter the PG-XXXX code from the patient',
      pharm_code_valid: 'Code verified! Product handed over to patient.',
      pharm_code_invalid: 'Invalid or already used code.',
      pharm_stock_alert: 'Stock alert',
      pharm_stock_alert_title: 'Out of Stock Alert',
      pharm_stock_alert_desc: 'Notify medical delegates in your area about stock shortages.',
      pharm_stock_product: 'Out of stock product name',
      pharm_stock_urgency: 'Urgency',
      pharm_stock_urgency_normal: 'Normal',
      pharm_stock_urgency_urgent: 'Urgent',
      pharm_stock_urgency_critical: 'Critical',
      pharm_stock_radius: 'Broadcast radius',
      pharm_stock_message: 'Additional message',
      pharm_stock_send: 'Send alert',
      pharm_stock_sent: 'Alert sent to delegates!',

      del_login_title: 'Delegate Login',
      del_register_title: 'Medical Delegate Registration',
      del_lastname: 'Last name',
      del_firstname: 'First name',
      del_pro_card: 'Professional card no.',
      del_cni: 'ID card no.',
      del_labs: 'Laboratories',
      del_add_lab: 'Add laboratory',
      del_pharmacies: 'Pharmacies',
      del_promotions: 'Promotions',
      del_wholesalers: 'Wholesalers',
      del_stats: 'Statistics',
      del_alerts: 'Alerts',
      del_visits: 'Visits',
      del_new_promo: 'New Promotion',
      del_promo_lab: 'Laboratory',
      del_promo_product: 'Product name',
      del_promo_type: 'Product type',
      del_promo_desc: 'Campaign description',
      del_promo_doc: 'Document link',
      del_broadcast_all: 'Broadcast to all pharmacies',
      del_choose_pharmacy: 'Choose a pharmacy',
      del_visit_request: 'Request a visit',
      del_visit_date: 'Proposed date and time',
      del_visit_purpose: 'Purpose of visit',
      del_visit_history: 'Visit history',
      del_promo_tracking: 'Promotion tracking',
      del_stock_alerts: 'Out of Stock Alerts',
      del_stock_alerts_desc: 'Pharmacies in your area report stock shortages here.',
      del_no_alerts: 'No alerts in your area.',
      del_report: 'Report',
      del_settings: 'Settings',
      del_logout: 'Logout',

      stat_sent: 'Sent',
      stat_read: 'Read',
      stat_interested: 'Interested',
      stat_stocked: 'In stock',
      stat_rate: 'Rate',
      stat_total_promos: 'Total promotions',
      stat_total_visits: 'Total visits',
      stat_pharmacies_reached: 'Pharmacies reached',
      stat_response_rate: 'Response rate',

      visit_pending: 'Pending',
      visit_confirmed: 'Confirmed',
      visit_rescheduled: 'Rescheduled',
      visit_cancelled: 'Declined',
      visit_completed: 'Completed',

      time_ago_min: '{n} min ago',
      time_ago_hour: '{n}h ago',
      time_ago_day: '{n} day(s) ago',
      time_now: 'Just now',

      delete_title: 'Delete my account',
      delete_warning: 'This action is irreversible. All your data will be deleted.',
      admin_access: 'Administrator Access',
      admin_mode_active: 'PLATFORM ADMINISTRATOR MODE'
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 2. DICTIONNAIRE EXHAUSTIF FR → EN (Textes statiques & dynamiques)
  // ════════════════════════════════════════════════════════════════
  const PHRASES_FR_EN = {
    // Page d'accueil & 4 espaces
    'ESPACE PATIENT': 'PATIENT AREA',
    'ESPACE PHARMACIE': 'PHARMACY AREA',
    'ESPACE DÉLÉGUÉS MÉDICAUX': 'MEDICAL DELEGATES AREA',
    'ESPACE DÉLÉGUÉ MÉDICAL': 'MEDICAL DELEGATE AREA',
    'ESPACE GROSSISTES-RÉPARTITEURS': 'WHOLESALERS-DISTRIBUTORS AREA',
    'Espace Grossiste B2B': 'B2B Wholesaler Area',
    'Espace Client': 'Client Area',
    'Espace Pharmacie': 'Pharmacy Area',
    'Visiteur et Patient': 'Visitor & Patient',
    'Officine certifiée ONCP': 'ONPC Certified Pharmacy',
    'Officine certifiée ONPC': 'ONPC Certified Pharmacy',
    'Visiteur et Laboratoire': 'Medical Rep & Laboratory',
    'Distributeurs pharmaceutiques B2B': 'B2B Pharmaceutical Distributors',
    'Recherche de médicaments · Scan Ordonnance · Pharmacies Ouvertes & de Garde · Itinéraire GPS': 'Medicine Search · Prescription Scan · Open & On-Duty Pharmacies · GPS Directions',
    'Demandes Patients en direct · Réservations 60 min · Délégués Médicaux & Commandes Grossistes B2B': 'Live Patient Requests · 60-Min Reservations · Medical Delegates & B2B Wholesaler Orders',
    'Campagnes & Molécules · Alertes Ruptures Officines · Suivi des Stocks Grossistes & Rapports Pro': 'Campaigns & Molecules · Pharmacy Shortage Alerts · Wholesaler Stock Tracking & Pro Reports',
    'Catalogue & Tarifs Cession HT · Commandes Officines · Arrivages & Radar GPS des 58 Départements': 'Catalog & Wholesale Pricing · Pharmacy Orders · Arrivals & 58-Department GPS Radar',
    'Partager à un ami': 'Share with a friend',
    'Scanner le QR Code': 'Scan QR Code',
    "Installer l'app (sur l'écran)": 'Install App (Home Screen)',
    'Application de santé publique — Cameroun': 'Public Health Application — Cameroon',
    'Pharma-Garde — Votre santé, notre priorité': 'Pharma-Garde — Your health, our priority',
    'Pharma-Garde — Espace Pharmacie': 'Pharma-Garde — Pharmacy Area',
    'Pharma-Garde — Espace Délégué Médical': 'Pharma-Garde — Medical Delegate Area',
    'Pharma-Garde — Espace Grossiste-Répartiteur B2B': 'Pharma-Garde — B2B Wholesaler-Distributor Area',

    // Client / Recherche / OCR / Paiement / Itinéraire
    'Médicaments': 'Medicines',
    'Ordonnance': 'Prescription',
    'Pharmacies de garde': 'On-duty pharmacies',
    'Recherche active en direct': 'Live active search',
    'Pass 24h actif · Réponses des officines': '24h Pass active · Pharmacy responses',
    '+ Ajouter': '+ Add',
    '+ Autre produit': '+ Another product',
    'Fermer': 'Close',
    'Assurance (optionnel)': 'Insurance (optional)',
    '— Sans assurance —': '— No insurance —',
    'Autres...': 'Other...',
    'Autre…': 'Other…',
    'Veuillez préciser votre assurance...': 'Please specify your insurance...',
    'Montant': 'Amount',
    'Valable pour 24h de recherches illimitées': 'Valid for 24h of unlimited searches',
    '100 FCFA pour 24h de recherche illimitée': '100 FCFA for 24h unlimited search',
    'GRATUIT (Pass 24h actif)': 'FREE (Active 24h Pass)',
    'GRATUIT (Accès Administrateur)': 'FREE (Admin Access)',
    'Suivant': 'Next',
    'Retour': 'Back',
    'Retour à la recherche': 'Back to search',
    'Retour à l\'accueil': 'Back to home',
    '← Retour à la connexion': '← Back to login',
    'Paiement': 'Payment',
    'Numéro de téléphone': 'Phone number',
    'Confirmer le paiement': 'Confirm payment',
    'En attente des réponses...': 'Waiting for responses...',
    'pharmacie(s) notifiée(s)': 'pharmacy(ies) notified',
    'Confirmer les réservations': 'Confirm reservations',
    'Scanner une Ordonnance': 'Scan a Prescription',
    'Choisissez la source de votre ordonnance.': 'Choose the source of your prescription.',
    'Prendre une photo': 'Take a photo',
    'Importer un fichier': 'Import a file',
    'Appeler': 'Call',
    'Y aller': 'Directions',
    'Identité & GPS': 'Identity & GPS',
    'OUVERT': 'OPEN',
    'OUVERTE': 'OPEN',
    'DE GARDE': 'ON DUTY',
    'FERMÉ': 'CLOSED',
    'FERMÉE': 'CLOSED',
    'Ouvert': 'Open',
    'Ouverte': 'Open',
    'Ouvertes': 'Open',
    'De Garde': 'On Duty',
    'De garde': 'On duty',
    'Garde': 'On duty',
    'Fermé': 'Closed',
    'Fermée': 'Closed',
    'Réserver': 'Reserve',
    'Réservé': 'Reserved',
    'En stock': 'In stock',
    'En Stock': 'In Stock',
    'En stock assuré': 'In stock (insured)',
    'En stock non assuré': 'In stock (uninsured)',
    'En rupture': 'Out of stock',
    'En Rupture': 'Out of Stock',
    'Rupture': 'Out of stock',
    'Stock tendu': 'Low stock',
    'Stock faible / Seuil': 'Low stock / Threshold',
    'Adresse inconnue': 'Unknown address',
    'Adresse non renseignée': 'Address not provided',
    'Position détectée': 'Location detected',
    'Vous êtes ici': 'You are here',
    'Guidage GPS (Google Maps)': 'GPS Navigation (Google Maps)',
    'Effacer': 'Clear',
    'Fiche Officine': 'Pharmacy Details',
    'Détails de la pharmacie': 'Pharmacy Details',
    'Statut': 'Status',
    'Horaires': 'Hours',
    'Distance': 'Distance',
    'Note': 'Rating',

    // Navigation & Auth communes
    'Accueil': 'Home',
    'Plein Écran': 'Fullscreen',
    'Plein écran': 'Fullscreen',
    'Recentrer': 'Recenter',
    'Paramètres': 'Settings',
    'Déconnexion': 'Logout',
    'Connexion': 'Login',
    'Se connecter': 'Sign in',
    "S'inscrire": 'Sign up',
    'Créer un compte': 'Create an account',
    'Mot de passe': 'Password',
    'Mot de passe oublié': 'Forgot password',
    'Mot de passe oublié ?': 'Forgot password?',
    'Confirmer le mot de passe': 'Confirm password',
    'Confirmer le mot de passe *': 'Confirm password *',
    'Email professionnel': 'Business email',
    'Envoyer le lien': 'Send reset link',
    'Réinitialiser le mot de passe': 'Reset password',
    'Enregistrer': 'Save',
    'Annuler': 'Cancel',
    'Confirmer': 'Confirm',
    'Supprimer': 'Delete',
    'Supprimer mon compte': 'Delete my account',
    'Cette action est irréversible.': 'This action is irreversible.',
    '8 caractères min.': '8 chars min.',
    '1 majuscule': '1 uppercase',
    '1 majuscule (A-Z)': '1 uppercase (A-Z)',
    '1 minuscule': '1 lowercase',
    '1 minuscule (a-z)': '1 lowercase (a-z)',
    '1 chiffre': '1 digit',
    '1 chiffre (0-9)': '1 digit (0-9)',
    'Déjà un compte ?': 'Already have an account?',
    'Déjà inscrit ?': 'Already registered?',
    'Nouvelle officine ?': 'New pharmacy?',
    'Nouveau distributeur agréé ?': 'New certified distributor?',
    'Inscrire ma pharmacie': 'Register my pharmacy',
    'Inscrire mon établissement →': 'Register my company →',
    'Sécurité du compte': 'Account security',
    'Contacts': 'Contacts',
    'Contacts & Identifiants': 'Contacts & Credentials',
    'Profil': 'Profile',
    'Mon Profil & Paramètres': 'My Profile & Settings',
    'Partager l\'application & QR Code': 'Share App & QR Code',
    'Assistance Développeur (+237 694 929 909)': 'Developer Support (+237 694 929 909)',
    'Accès Administrateur': 'Administrator Access',
    'Accès Privilégié Administrateur': 'Privileged Administrator Access',

    // Espace Pharmacie (4 Pôles + Auth + Connecteur + Modales)
    'Accédez à l\'espace professionnel de votre officine.': 'Access your pharmacy professional workspace.',
    'Créez l\'espace professionnel de votre officine. Les champs marqués': 'Create your pharmacy workspace. Fields marked',
    'sont obligatoires.': 'are required.',
    'Identité de l\'officine': 'Pharmacy Identity',
    'Nom de la pharmacie': 'Pharmacy name',
    'Nom de l\'officine': 'Pharmacy name',
    'Pharmacien titulaire': 'Lead Pharmacist',
    'Pharmacien Responsable': 'Chief Pharmacist',
    'Pharmacien Responsable / Directeur': 'Chief Pharmacist / Director',
    'N° d\'autorisation / Ordre (ONPC)': 'License / ONPC Order No.',
    'Numéro d\'inscription à l\'Ordre ou d\'autorisation d\'ouverture. Il sert à vérifier votre officine.': 'Order registration or opening license number used to verify your pharmacy.',
    'Localisation exacte': 'Exact Location',
    'Ville': 'City',
    'Nom de la ville': 'City name',
    'Quartier': 'District / Neighborhood',
    'Repère / adresse précise': 'Landmark / exact address',
    'Aide les patients à vous trouver facilement.': 'Helps patients locate you easily.',
    'Position GPS non capturée': 'GPS position not captured',
    'Capturer la position': 'Capture location',
    'depuis l\'intérieur de votre pharmacie': 'from inside your pharmacy',
    'pour enregistrer ses coordonnées exactes.': 'to save its exact coordinates.',
    'Téléphone de l\'officine': 'Pharmacy phone',
    'Même numéro que le téléphone': 'Same as phone number',
    'Servira d\'identifiant de connexion.': 'Will be used as your login ID.',
    'Horaires & services': 'Opening hours & services',
    'Ouverture': 'Opening',
    'Fermeture': 'Closing',
    'Services proposés': 'Available services',
    'Garde de nuit': 'Night duty',
    'Livraison': 'Delivery',
    'Conseil': 'Consultation',
    'Assurances': 'Insurances',
    'Je certifie être habilité(e) à représenter cette officine et j\'accepte les conditions d\'utilisation de Pharma-Garde.': 'I certify I am authorized to represent this pharmacy and accept the Pharma-Garde terms of use.',
    'Saisissez l\'email de votre pharmacie : nous vous enverrons un lien de réinitialisation.': 'Enter your pharmacy email: we will send you a password reset link.',
    'Centre d\'Alertes Pharmacie': 'Pharmacy Alert Center',
    'Alertes & Notifications': 'Alerts & Notifications',
    'Tout marquer lu': 'Mark all read',
    'Paramètres de l\'officine': 'Pharmacy Settings',
    'Espace Patients & Clients': 'Patients & Clients Hub',
    'Demandes, Réponses & Retraits': 'Requests, Replies & Pickups',
    'Espace Délégués Médicaux': 'Medical Delegates Hub',
    'Visites, Promos & Ruptures': 'Visits, Promos & Shortages',
    'Espace Gestion & Pilotage': 'Management & Analytics Hub',
    'Stats, Stocks & Automatisation': 'Stats, Stock & Automation',
    'Espace Grossistes & B2B': 'Wholesalers & B2B Hub',
    'Catalogues, Commandes & Arrivages': 'Catalogs, Orders & Arrivals',
    'Relation Patients & Ordonnances': 'Patient Relations & Prescriptions',
    'Traitement des demandes en direct, réservations 60 min, et vérification des codes de retrait patient.': 'Live request handling, 60-min reservations, and patient pickup code verification.',
    'Vérifier Code Patient (PG-XXXX)': 'Verify Patient Code (PG-XXXX)',
    'Vérifier Matricule Délégué (DM-XXXX)': 'Verify Delegate ID (DM-XXXX)',
    'Mode Réponse Automatisée (Connecteur Officine Actif)': 'Automated Response Mode (Pharmacy Connector Active)',
    'Connecteur Synchronisé (1h)': 'Connector Synced (1h)',
    'Passer En Stock': 'Mark In Stock',
    'Marquer Rupture': 'Mark Out of Stock',
    'Alerter Délégués': 'Alert Delegates',
    'Commander Grossiste': 'Order Wholesaler',
    '+ Ajouter un Médicament': '+ Add Medicine',
    '+ Ajouter Produit': '+ Add Product',
    'Médicament': 'Medicine',
    'Statut Stock': 'Stock Status',
    'Action Rapide': 'Quick Action',
    'Alerte Réappro': 'Restock Alert',
    'Conventions d\'Assurances Agréées par l\'Officine': 'Approved Pharmacy Insurance Conventions',
    'Sauvegarder les Conventions': 'Save Conventions',
    'Liaison Universelle avec le Serveur & Base de Données d\'Officine': 'Universal Pharmacy Server & Database Link',
    'Connectez Pharma-Garde à n\'importe quel ordinateur ou serveur hébergeant votre logiciel de gestion ou votre base de données.': 'Connect Pharma-Garde to any computer or server hosting your pharmacy management software or database.',
    'Tester la Connexion': 'Test Connection',
    'Enregistrer la Liaison': 'Save Connection',
    'Mode de Connexion': 'Connection Mode',
    'Adresse IP / URL de la Machine ou du Serveur': 'Machine or Server IP / URL',
    'Moteur de Base de Données / Logiciel Cible': 'Target Database Engine / Software',
    'Clé d\'Authentification / Token (Optionnel)': 'Authentication Key / Token (Optional)',
    'Cliquez sur « Tester la Connexion » pour vérifier l\'accès au serveur ou à la base de données de cette machine.': 'Click "Test Connection" to verify access to this machine\'s server or database.',
    'Journal d\'Activité en Direct (Daemon)': 'Live Activity Log (Daemon)',
    'Synchroniser Stock': 'Sync Stock',
    'Fréquence': 'Frequency',
    'Toutes les 1h': 'Every 1h',
    'Prochaine Synchro': 'Next Sync',
    'Réponses Auto': 'Auto Replies',
    'Import Direct Fichier Stock (CSV / Excel / JSON)': 'Direct Stock File Import (CSV / Excel / JSON)',
    'Sélectionner Fichier Stock (.CSV ou .JSON)': 'Select Stock File (.CSV or .JSON)',
    'Modèle CSV': 'CSV Template',
    'Pack Serveur & Machine Locale': 'Local Server & Machine Pack',
    'Lanceur Windows (.bat)': 'Windows Launcher (.bat)',
    'Pôle Grossistes-Répartiteurs & Commandes B2B': 'Wholesalers & B2B Orders Hub',
    'Consultez les stocks grossistes en temps réel (UBIPHARM, LABOREX, DPDC, CAMEG…), passez vos commandes B2B en 1 clic et suivez vos livraisons.': 'Check real-time wholesaler stock (UBIPHARM, LABOREX, DPDC, CAMEG…), place 1-click B2B orders and track deliveries.',
    'Commander Toutes Mes Ruptures en 1 Clic (Auto B2B)': 'Order All Out-of-Stock Items in 1 Click (Auto B2B)',
    'Actualiser Catalogues & Commandes': 'Refresh Catalogs & Orders',
    'Catalogue B2B & Réappro 1-Clic': 'B2B Catalog & 1-Click Restock',
    'Suivi de mes Commandes B2B': 'Track My B2B Orders',
    'Arrivages & Promotions Grossistes': 'Wholesaler Arrivals & Promotions',
    'Tous les grossistes': 'All wholesalers',
    'Tous les statuts': 'All statuses',
    'Gestion de Stock & Alerte Rupture': 'Stock Management & Shortage Alert',
    'Consultez votre inventaire ou diffusez une alerte aux délégués médicaux.': 'Review your inventory or broadcast an alert to medical delegates.',
    'Inventaire Produits en Stock': 'Product Stock Inventory',
    'Lancer Alerte Rupture vers Délégués': 'Broadcast Shortage Alert to Delegates',
    'Signalez instantanément une rupture de stock aux délégués médicaux de votre zone géographique.': 'Instantly report a stock shortage to medical delegates in your area.',
    'NOM DU PRODUIT EN RUPTURE *': 'OUT-OF-STOCK PRODUCT NAME *',
    'URGENCE': 'URGENCY',
    'Normale': 'Normal',
    'Urgente': 'Urgent',
    'Critique': 'Critical',
    'RAYON DE DIFFUSION': 'BROADCAST RADIUS',
    'MESSAGE COMPLÉMENTAIRE': 'ADDITIONAL MESSAGE',
    'Vérification Universelle': 'Universal Verification',
    'Vérifier': 'Verify',
    'Modifier Date & Heure de Visite': 'Reschedule Visit Date & Time',
    'Nouvelle Date Proposée *': 'New Proposed Date *',
    'Nouvelle Heure Proposée *': 'New Proposed Time *',
    'Confirmer la Réponse au Patient': 'Confirm Patient Response',
    'Vérifiez le statut de chaque médicament avant l\'envoi immédiat :': 'Verify each medicine status before sending:',
    'Confirmer & Envoyer': 'Confirm & Send',
    'Corriger': 'Edit',
    'Commande B2B Grossiste': 'B2B Wholesaler Order',
    'Quantité à commander (boîtes) *': 'Quantity to order (boxes) *',
    'Total HT estimé :': 'Estimated Excl. Tax Total:',
    'Instructions de livraison / Urgence': 'Delivery instructions / Urgency',
    'Envoyer Commande': 'Send Order',
    'Valider Retrait': 'Confirm Pickup',
    'Demandes Reçues': 'Received Requests',
    'Réponses Positives': 'Positive Replies',
    'Achats Concrêts / Honorés': 'Completed Purchases',
    'Taux de Succès': 'Success Rate',
    'Jour': 'Day',
    'Semaine': 'Week',
    'Mois': 'Month',
    'Année': 'Year',
    'Aujourd\'hui': 'Today',
    'Cette Semaine': 'This Week',
    'Ce Mois': 'This Month',
    'Cette Année': 'This Year',
    'Tout': 'All',
    'Toutes': 'All',

    // Espace Délégué Médical
    'Pharmacies': 'Pharmacies',
    'Promotions': 'Promotions',
    'Grossistes': 'Wholesalers',
    'Stats': 'Stats',
    'Alertes': 'Alerts',
    'Grossistes-Répartiteurs & Disponibilité Gammes': 'Wholesalers & Product Line Availability',
    'Mes Campagnes & Promotions': 'My Campaigns & Promotions',
    'Nouvelle Promotion': 'New Promotion',
    'Créer une Promotion': 'Create Promotion',
    'Envoyer une Promotion': 'Send Promotion',
    'Sélectionner une promotion': 'Select a promotion',
    'Sélectionnez la pharmacie :': 'Select pharmacy:',
    'Choisir une pharmacie': 'Choose a pharmacy',
    'Diffuser à toutes les pharmacies': 'Broadcast to all pharmacies',
    'Laboratoire': 'Laboratory',
    'Laboratoires': 'Laboratories',
    'Laboratoire(s) *': 'Laboratory(ies) *',
    'Ajouter un autre laboratoire': 'Add another laboratory',
    'Nom du produit *': 'Product name *',
    'Type de produit': 'Product type',
    'Description': 'Description',
    'Lien document': 'Document link',
    'Demander une Visite': 'Request a Visit',
    'Date de la visite *': 'Visit date *',
    'Date de visite': 'Visit date',
    'Heure de visite': 'Visit time',
    'Heure et minutes (faire défiler) *': 'Hours & minutes (scroll) *',
    'Heures': 'Hours',
    'Minutes': 'Minutes',
    'Objet de la visite': 'Purpose of visit',
    'Envoyer la demande': 'Send request',
    'Historique des visites': 'Visit history',
    'Suivi des promotions': 'Promotion tracking',
    'Total promotions': 'Total promotions',
    'Total visites': 'Total visits',
    'Taux de réponse': 'Response rate',
    'Pharmacies en attente': 'Pending pharmacies',
    'Pharmacies en Attente de Réponse': 'Pharmacies Awaiting Reply',
    'Tableau des Promotions Diffusées': 'Broadcast Promotions Table',
    'Tableau des Visites & Rendez-vous': 'Visits & Appointments Table',
    'Taux de Réponse & Retours Pharmacies': 'Response Rate & Pharmacy Feedback',
    'Structure de l\'attente': 'Pending breakdown',
    'Ratio & avis labo': 'Ratio & lab feedback',
    'Structure des attentes': 'Pending breakdown',
    'Voir tableau détaillé': 'View detailed table',
    'Cliquez sur un indicateur pour voir les détails': 'Click an indicator to view details',
    '1. Promotion': '1. Promotion',
    '2. Nb Atteintes': '2. Reached',
    '5. Sans avis (En attente)': '5. No reply (Pending)',
    'Pharmacies atteintes (1 par ligne)': 'Reached pharmacies (1 per line)',
    'Date de la demande': 'Request date',
    'Rapport PDF': 'PDF Report',
    'Export CSV': 'CSV Export',
    'Mon Abonnement Pro (Mobile Money)': 'My Pro Subscription (Mobile Money)',
    'Prendre photo': 'Take photo',
    'Galerie': 'Gallery',
    'Supprimer la photo': 'Remove photo',
    'Complément alimentaire': 'Dietary supplement',
    'Cosmétique': 'Cosmetics',
    'Matériel médical': 'Medical equipment',
    'Matériel Médical': 'Medical Equipment',

    // Espace Grossiste-Répartiteur B2B
    'Connexion Grossiste-Répartiteur': 'Wholesaler-Distributor Login',
    'Accédez à votre portail B2B de distribution pharmaceutique (Officines & Laboratoires).': 'Access your B2B pharmaceutical distribution portal (Pharmacies & Laboratories).',
    'Se connecter à l\'Espace Grossiste': 'Sign in to Wholesaler Area',
    '⚡ Accès Rapide Distributeurs Agréés (Démo / Test)': '⚡ Quick Access Certified Distributors (Demo / Test)',
    'Inscription Grossiste-Répartiteur': 'Wholesaler-Distributor Registration',
    'Enregistrez votre société de distribution pharmaceutique (14 jours d\'essai Pro inclus).': 'Register your pharmaceutical distribution company (14-day Free Pro Trial included).',
    'Identité & Agrément DPML / ONPC': 'Identity & DPML / ONPC License',
    'Raison sociale du Grossiste': 'Wholesaler Company Name',
    'Raison Sociale': 'Company Name',
    'N° Agrément DPML / ONPC': 'DPML / ONPC License No.',
    'N° RCCM': 'RCCM / Trade Reg. No.',
    'Siège Logistique & Zones de Livraison': 'Logistic HQ & Delivery Zones',
    'Ville du dépôt principal (Chef-lieu de département)': 'Main Depot City (Department Capital)',
    'Quartier / Zone Industrielle': 'District / Industrial Zone',
    'Minimum de commande (FCFA)': 'Minimum order (FCFA)',
    'Minimum de Commande Franco (FCFA)': 'Free-Delivery Minimum Order (FCFA)',
    'Délai moyen de livraison (heures)': 'Average delivery lead time (hours)',
    'Villes desservies par votre flotte': 'Cities served by your fleet',
    'Téléphone Standard / Commandes': 'Orders / Main Phone',
    'Téléphone Commandes': 'Orders Phone',
    'WhatsApp Commercial B2B': 'Commercial B2B WhatsApp',
    'Créer mon Espace Grossiste B2B': 'Create my B2B Wholesaler Area',
    'Livraisons Actives': 'Active Deliveries',
    'Urgences / Garde': 'Urgencies / On Duty',
    'Paramètres du Grossiste': 'Wholesaler Settings',
    'Paramètres Grossiste': 'Wholesaler Settings',
    'Catalogue & Stocks': 'Catalog & Stocks',
    'Tarifs Cession & CSV': 'Wholesale Pricing & CSV',
    'Commandes Officines': 'Pharmacy Orders',
    'Traitement & BL PDF': 'Processing & Delivery PDF',
    'Arrivages & Ruptures': 'Arrivals & Shortages',
    'Promos & Alertes Officines': 'Promos & Pharmacy Alerts',
    'Réseau B2B & Carte': 'B2B Network & Map',
    'Pharmacies & Délégués': 'Pharmacies & Delegates',
    'Stats Pro & Rapports': 'Pro Stats & Reports',
    'Graphiques, PDF & CSV': 'Charts, PDF & CSV',
    'Catalogue des Références & Tarifs de Cession B2B': 'B2B Product Catalog & Wholesale Pricing',
    'Nouvelle Référence Catalogue B2B': 'New B2B Catalog Item',
    'Code CIP / SKU': 'CIP / SKU Code',
    'Nom commercial & Dosage *': 'Brand Name & Dosage *',
    'Laboratoire Fabricant': 'Manufacturing Lab',
    'Laboratoire & Classe': 'Lab & Therapeutic Class',
    'Classe Thérapeutique': 'Therapeutic Class',
    'Référence & DCI': 'Reference & INN',
    'Prix Cession Grossiste HT (FCFA) *': 'Wholesale Price Excl. Tax (FCFA) *',
    'Prix Cession HT': 'Wholesale Price',
    'Prix Cession Unitaire HT (FCFA)': 'Unit Wholesale Price (FCFA)',
    'Prix Public Officine (FCFA)': 'Retail Pharmacy Price (FCFA)',
    'Prix Officine': 'Retail Price',
    'Stock Disponible': 'Available Stock',
    'État du Stock': 'Stock Status',
    'Seuil Alerte': 'Alert Threshold',
    'Qté Min. Cmd': 'Min. Order Qty',
    'Quantité minimale': 'Minimum quantity',
    'Offre Promotionnelle / Gratuités (optionnel)': 'Promotional Offer / Free Units (optional)',
    'Condition / Promo B2B': 'B2B Terms / Promo',
    'Commandes de Réapprovisionnement des Officines': 'Pharmacy Restock Orders',
    'En attente': 'Pending',
    'Confirmées': 'Confirmed',
    'En livraison': 'Out for delivery',
    'Livrées': 'Delivered',
    'Diffusion d\'Arrivages B2B & Alertes Ruptures Officines': 'B2B Arrivals Broadcast & Pharmacy Shortage Alerts',
    'Diffuser un Arrivage ou Offre B2B': 'Broadcast Arrival or B2B Offer',
    'Titre de l\'annonce *': 'Announcement title *',
    'Type d\'offre': 'Offer type',
    'Nouvel Arrivage': 'New Arrival',
    'Remise Quantitative': 'Volume Discount',
    'Unités Gratuites (ex: 10+2)': 'Free Units (e.g., 10+2)',
    'Stock d\'Urgence Anti-Rupture': 'Emergency Anti-Shortage Stock',
    'Destinataires': 'Recipients',
    'Pharmacies & Délégués': 'Pharmacies & Delegates',
    'Pharmacies uniquement': 'Pharmacies only',
    'Délégués Médicaux uniquement': 'Medical Delegates only',
    'Produit(s) vedette(s) *': 'Featured product(s) *',
    'Détails & Conditions de livraison': 'Details & Delivery terms',
    'Alertes & Ruptures Officines en temps réel': 'Real-Time Pharmacy Shortage Alerts',
    'Radar Géolocalisé des Pharmacies par Rayon & Réseau Délégués': 'Geolocated Pharmacy Radius Radar & Delegate Network',
    'Carte Logistique Interactive & Cercle de Rayon': 'Interactive Logistics Map & Radius Circle',
    'Rayon de Couverture :': 'Coverage Radius:',
    'Pharmacies dans le Rayon Sélectionné': 'Pharmacies in Selected Radius',
    'Délégués Médicaux & Laboratoires Partenaires': 'Partner Medical Delegates & Laboratories',
    'Tous statuts': 'All statuses',
    'En stock uniquement': 'In stock only',
    'En promotion B2B': 'On B2B promo',
    'En rupture (0)': 'Out of stock (0)',
    'Pilotage B2B, Indicateurs de Performance & Rapports Certifiés': 'B2B Analytics, KPIs & Certified Reports',
    'Tableau de bord & Indicateurs': 'Dashboard & Indicators',
    'Chiffre d\'Affaires B2B HT': 'B2B Revenue (Excl. Tax)',
    'Taux de Service Livraison': 'Delivery Service Rate',
    'Références Disponibles': 'Available SKUs',
    'Évolution Hebdomadaire du CA B2B & Volume Commandes': 'Weekly B2B Revenue & Order Volume Trend',
    'Répartition des Commandes par Statut': 'Orders Breakdown by Status',
    'Top Références les Plus Commandées par les Officines': 'Top Most Ordered Products by Pharmacies',
    'AUTOMATISATION B2B': 'B2B AUTOMATION',
    'Hub : Siège / GPS Actuel': 'Hub: HQ / Current GPS',

    // Classes thérapeutiques & sélecteurs
    'Antalgique / Antipyrétique': 'Analgesic / Antipyretic',
    'Antibiotique': 'Antibiotic',
    'Antipaludéen': 'Antimalarial',
    'Cardiologie': 'Cardiology',
    'Diabétologie': 'Diabetology',
    'Gastro-entérologie': 'Gastroenterology',
    'Pneumologie': 'Pulmonology',
    '— Choisir —': '— Choose —',
    '— Sélectionner —': '— Select —',
    'Choisir…': 'Choose…',
    'Actions Rapides': 'Quick Actions',
    'Produit': 'Product',
    'Nom du Produit': 'Product Name',
    'Statut Actuel': 'Current Status',
    'Action Stock': 'Stock Action',
    'Alerte Délégué': 'Delegate Alert',
    'Pharmacie': 'Pharmacy',
    'Adresse': 'Address',
    'Téléphone': 'Phone',
    'Nom': 'Last name',
    'Prénom': 'First name',
    'N° Carte pro': 'Pro Card No.',
    'N° CNI': 'National ID No.',
    'Minimum 8 caractères': 'Minimum 8 characters',
    'Votre mot de passe': 'Your password',
    'Nom du médicament...': 'Medicine name...',
    'Rechercher par nom, DCI, code CIP ou laboratoire...': 'Search by name, INN, CIP code or lab...',
    'Rechercher un médicament dans l\'inventaire...': 'Search a medicine in inventory...',
    'Rechercher un produit dans la base...': 'Search a product in database...',
    'Rechercher un produit, DCI, laboratoire ou code CIP...': 'Search product, INN, lab or CIP code...',
    'Nom, quartier, titulaire...': 'Name, district, pharmacist...',
    'Laisser vide si aucun mot de passe': 'Leave blank if no password',
    'Ouvrir le calendrier': 'Open calendar',
    'Télécharger un modèle CSV': 'Download CSV template',
    'Votre position': 'Your location',
    'Votre session de 24h est active': 'Your 24h session is active',
    'Avantages, posologie, offre...': 'Benefits, dosage, offer...',
    'Cliquez pour afficher le ratio et détail des réponses': 'Click to view response ratio & details',
    'Cliquez pour afficher le tableau des promotions': 'Click to view promotions table',
    'Cliquez pour afficher le tableau des visites': 'Click to view visits table',
    'Cliquez pour voir les pharmacies en attente': 'Click to view pending pharmacies',
    'Adresse email invalide.': 'Invalid email address.',
    'Indiquez le nom de la pharmacie.': 'Enter the pharmacy name.',
    'Indiquez le nom de la ville.': 'Enter the city name.',
    'Indiquez le nom du pharmacien titulaire.': 'Enter the lead pharmacist name.',
    'Indiquez le quartier.': 'Enter the district.',
    'Indiquez votre numéro d\'autorisation.': 'Enter your license number.',
    'Numéro WhatsApp invalide.': 'Invalid WhatsApp number.',
    'Numéro camerounais invalide (9 chiffres, commençant par 2 ou 6).': 'Invalid Cameroon number (9 digits starting with 2 or 6).',
    'Agent Connecteur Local (Machine / Réseau Officine)': 'Local Connector Agent (Pharmacy PC / Network)',
    'Serveur API REST d\'Officine (URL Dédiée)': 'Pharmacy REST API Server (Dedicated URL)',
    'Base Cloud Supabase (Temps Réel)': 'Supabase Cloud Database (Real-Time)',
    'SQLite / Fichier Local d\'Officine': 'SQLite / Local Pharmacy File',
    'API Webhook / Serveur Interne': 'API Webhook / Internal Server',
    'Connecteur Universel Pharma-Garde initialisé.': 'Pharma-Garde Universal Connector initialized.',
    'Liaison configurée pour interrogation directe de base ou serveur local.': 'Link configured for direct local server or database querying.',
    'Scrutation horaire et détection des ruptures actives.': 'Hourly polling and shortage detection active.',
    'Console Super-Admin': 'Super-Admin Console',
    'Verrouiller Admin': 'Lock Admin'
  };

  // Motifs dynamiques (compteurs, dates, durées, départements, abonnements)
  const REGEX_FR_EN = [
    [/^(\d+)\s*pharmacie\(s\)\s*ouverte\(s\)$/i, '$1 open pharmacy(ies)'],
    [/^(\d+)\s*ouverte\(s\)$/i, '$1 open'],
    [/^(\d+)\s*de garde$/i, '$1 on duty'],
    [/^(\d+)\s*active\(s\)$/i, '$1 active'],
    [/^(\d+)\s*en attente$/i, '$1 pending'],
    [/^(\d+)\s*transmise\(s\)$/i, '$1 sent'],
    [/^(\d+)\s*recherches actives$/i, '$1 active searches'],
    [/^(\d+)\s*jours?\s*restants?$/i, '$1 day(s) left'],
    [/^(\d+)\s*min\s*restantes(?:\s*\(max\s*60\s*min\))?$/i, '$1 min left (max 60 min)'],
    [/^Il y a (\d+)\s*min$/i, '$1 min ago'],
    [/^Il y a (\d+)h$/i, '$1h ago'],
    [/^Il y a (\d+)\s*jour\(s\)$/i, '$1 day(s) ago'],
    [/^Région\s*:\s*(.+?)\s*\((\d+)\s*dép\.\)$/i, 'Region: $1 ($2 depts.)'],
    [/^Hub\s*:\s*(.+?)\s*—\s*Dép\.\s*(.+)$/i, 'Hub: $1 — Dept. $2'],
    [/^Essai Pro Gratuit\s*\((\d+)j\)$/i, 'Free Pro Trial ($1d)'],
    [/^Essai\s*:\s*(\d+)j\s*restant\(s\)$/i, 'Trial: $1d left'],
    [/^Pro Actif\s*·\s*(\d+)j$/i, 'Pro Active · $1d'],
    [/^Abonnement expiré$/i, 'Subscription expired'],
    [/^Pass 24h\s*:\s*(.+)\s*restantes?$/i, '24h Pass: $1 left'],
    [/^ID Session\s*:\s*(.+)$/i, 'Session ID: $1'],
    [/^(\d+)\s*boîtes?$/i, '$1 box(es)'],
    [/^Min\.\s*(\d+)\s*boîtes?$/i, 'Min. $1 box(es)'],
    [/^Livraison\s*:\s*(\d+)h$/i, 'Delivery: $1h'],
    [/^Dans un rayon de (\d+)\s*km$/i, 'Within a $1 km radius'],
    [/^Aucune pharmacie trouvée dans un rayon de (\d+)\s*km\..*$/i, 'No pharmacy found within $1 km. Try expanding your radius.'],
    [/^Aucune pharmacie dans ce rayon\.?/i, 'No pharmacy within this radius.'],
    [/^Essayez un rayon plus large\.?/i, 'Try a wider radius.'],
    [/^Position détectée\s*(\(.*\))?$/i, 'Location detected $1'],
    [/^Calcul de l'itinéraire\.\.\.$/i, 'Calculating route...'],
    [/^Itinéraire tracé\s*:\s*(.+)$/i, 'Route plotted: $1'],
    [/^Chargement\.\.\.$/i, 'Loading...'],
    [/^Chargement de l'historique\.\.\.$/i, 'Loading history...'],
    [/^Envoi en cours\.\.\.$/i, 'Sending...'],
    [/^Enregistrement\.\.\.$/i, 'Saving...'],
    [/^Inscription en cours\.\.\.$/i, 'Registering...'],
    [/^Détection en cours\.\.\.$/i, 'Detecting...'],
    [/^Analyse de l'ordonnance en cours\.\.\.$/i, 'Analyzing prescription...'],
    [/^Analyse en cours\.\.\.\s*(\d+)%$/i, 'Analyzing... $1%'],
    [/^Bienvenue,\s*(.+)$/i, 'Welcome, $1'],
    [/^Connecté à\s*(.+)$/i, 'Signed in to $1'],
    [/^Statut mis à jour$/i, 'Status updated'],
    [/^Grossiste Ouvert\s*—\s*Livraisons Actives$/i, 'Wholesaler Open — Active Deliveries'],
    [/^Service Garde & Urgences Officines$/i, 'On-Duty & Emergency Pharmacy Service'],
    [/^Grossiste Fermé$/i, 'Wholesaler Closed'],
    [/^Paramètres du grossiste sauvegardés\.?$/i, 'Wholesaler settings saved.'],
    [/^Profil mis à jour avec succès$/i, 'Profile updated successfully'],
    [/^Paramètres enregistrés localement$/i, 'Settings saved locally'],
    [/^Réservation annulée avec succès$/i, 'Reservation cancelled successfully'],
    [/^Identifiants incorrects.*$/i, 'Invalid credentials or account not found.'],
    [/^Veuillez remplir tous les champs obligatoires.*$/i, 'Please fill in all required fields (*).'],
    [/^\+\s*(\d+)\s*autres officines\s*—.*$/i, '+ $1 more pharmacies — reduce radius to refine.'],
    [/^Choisir un grossiste$/i, 'Choose a wholesaler'],
    [/^Nouveau produit ajouté au stock.*$/i, 'New product added to stock.'],
    [/^Produit "(.+)" ajouté avec succès au stock\s*!?$/i, 'Product "$1" added to stock!'],
    [/^Statut de "(.+)" mis à jour\s*:\s*Rupture$/i, 'Status of "$1" updated: Out of stock'],
    [/^Statut de "(.+)" mis à jour\s*:\s*En stock$/i, 'Status of "$1" updated: In stock'],
    [/^(\d+)\s*officine\(s\)\s*trouvée\(s\)$/i, '$1 pharmacy(ies) found'],
    [/^(\d+)\s*délégué\(s\)$/i, '$1 delegate(s)'],
    [/^(\d+)\s*commande\(s\)$/i, '$1 order(s)'],
    [/^(\d+)\s*référence\(s\)$/i, '$1 SKU(s)']
  ];

  // Index insensible à la casse & aux espaces multiples pour recherche O(1)
  const PHRASE_INDEX = new Map();
  Object.keys(PHRASES_FR_EN).forEach((k) => {
    const norm = k.replace(/\s+/g, ' ').trim();
    PHRASE_INDEX.set(norm, PHRASES_FR_EN[k]);
    PHRASE_INDEX.set(norm.toLowerCase(), PHRASES_FR_EN[k]);
  });

  // Expression de séparation des emojis/symboles en préfixe pour préserver les icônes
  const LEADING_SYMBOL_RE = /^([\s\u2600-\u27BF\u2B00-\u2BFF\u{1F300}-\u{1FAFF}\uFE0F\u200D•·—\-→←⚡✅❌⚠️📍📞💬🏥💼🏭📦🛒📢📊📈📉📅📆🗓️🔍📷🌙🛡️🛟⚙️🔄💾📁📄🖥️🔌🌐🚀🚚🚢🎁🏷️🎯🏆👥🤝📏🤖👑🔒🔓🔑🧪💊⏱️📋🔔✨🎉]+)(.*)$/u;

  function translateText(raw) {
    if (currentLang !== 'en' || !raw || typeof raw !== 'string') return raw;
    const leadWs = raw.match(/^\s*/)[0];
    const trailWs = raw.match(/\s*$/)[0];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length < 2) return raw;

    // 1. Correspondance directe exacte (avec emojis inclus)
    const clean = trimmed.replace(/\s+/g, ' ');
    if (PHRASE_INDEX.has(clean)) return leadWs + PHRASE_INDEX.get(clean) + trailWs;
    if (PHRASE_INDEX.has(clean.toLowerCase())) return leadWs + PHRASE_INDEX.get(clean.toLowerCase()) + trailWs;

    // 2. Séparer un éventuel préfixe emoji/symbole et traduire le texte
    let prefix = '';
    let core = clean;
    const m = clean.match(LEADING_SYMBOL_RE);
    if (m && m[2] && m[2].trim().length >= 2) {
      prefix = m[1];
      core = m[2].trim();
      if (PHRASE_INDEX.has(core)) return leadWs + prefix + PHRASE_INDEX.get(core) + trailWs;
      if (PHRASE_INDEX.has(core.toLowerCase())) return leadWs + prefix + PHRASE_INDEX.get(core.toLowerCase()) + trailWs;
    }

    // 3. Motifs regex dynamiques (compteurs, durées, départements, statuts)
    for (let i = 0; i < REGEX_FR_EN.length; i++) {
      const [re, rep] = REGEX_FR_EN[i];
      if (re.test(core)) {
        return leadWs + prefix + core.replace(re, rep).trim() + trailWs;
      }
    }

    // 4. Segments séparés par " · " ou " — " ou " | "
    if (/[·|]/.test(core)) {
      const sep = core.includes(' · ') ? ' · ' : (core.includes(' | ') ? ' | ' : null);
      if (sep) {
        const parts = core.split(sep);
        let changed = false;
        const trParts = parts.map((p) => {
          const tp = translateText(p);
          if (tp !== p) changed = true;
          return tp;
        });
        if (changed) return leadWs + prefix + trParts.join(sep) + trailWs;
      }
    }

    // 5. Fallback terminologique doux sur les mots-clés isolés courants
    if (/^(Ex\s*:\s*)/i.test(core)) {
      const rest = core.replace(/^Ex\s*:\s*/i, '');
      const trRest = translateText(rest);
      if (trRest !== rest) return leadWs + prefix + 'Ex: ' + trRest + trailWs;
    }

    return raw;
  }

  function t(key, params) {
    let text = (translations[currentLang] && translations[currentLang][key]) ||
               (translations.fr && translations.fr[key]) || key;
    if (params) {
      Object.keys(params).forEach((k) => {
        text = text.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
      });
    }
    return text;
  }

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'SVG', 'PATH', 'TEXTAREA']);

  function isSkippedNode(el) {
    if (!el || el.nodeType !== 1) return false;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.hasAttribute('data-no-i18n') || el.closest && el.closest('[data-no-i18n="true"]')) return true;
    return false;
  }

  function applyAttributes(el) {
    if (isSkippedNode(el)) return;
    const attrs = ['placeholder', 'title', 'aria-label', 'label'];
    let orig = origAttrMap.get(el);
    let lastEn = lastEnAttrMap.get(el);
    if (!orig) { orig = {}; origAttrMap.set(el, orig); }
    if (!lastEn) { lastEn = {}; lastEnAttrMap.set(el, lastEn); }

    attrs.forEach((attr) => {
      if (attr === 'label' && el.tagName !== 'OPTGROUP') return;
      if (!el.hasAttribute(attr)) return;
      const cur = el.getAttribute(attr);
      if (cur === null) return;
      // data-i18n-placeholder a la priorité
      if (attr === 'placeholder' && el.hasAttribute('data-i18n-placeholder')) {
        el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
        return;
      }
      if (currentLang === 'en') {
        if (orig[attr] === undefined || (cur !== lastEn[attr] && cur !== orig[attr])) {
          orig[attr] = cur;
        }
        const tr = translateText(orig[attr]);
        if (tr !== cur) {
          el.setAttribute(attr, tr);
          lastEn[attr] = tr;
        }
      } else if (orig[attr] !== undefined && cur === lastEn[attr]) {
        el.setAttribute(attr, orig[attr]);
      }
    });
  }

  function applySubtree(root) {
    if (!root || isApplying) return;
    isApplying = true;
    try {
      const target = root.nodeType === 9 ? root.body : root;
      if (!target) return;

      // A. Éléments explicites [data-i18n] et [data-i18n-placeholder]
      if (target.querySelectorAll) {
        target.querySelectorAll('[data-i18n]').forEach((el) => {
          const key = el.getAttribute('data-i18n');
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            if (el.placeholder) el.placeholder = t(key);
          } else {
            const val = t(key);
            if (el.textContent !== val) el.textContent = val;
          }
        });
        target.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
          const val = t(el.getAttribute('data-i18n-placeholder'));
          if (el.placeholder !== val) el.placeholder = val;
        });
        target.querySelectorAll('[placeholder], [title], [aria-label], optgroup[label]').forEach(applyAttributes);
      }
      if (target.nodeType === 1) applyAttributes(target);

      // B. Parcours de tous les nœuds texte (hors éléments déjà gérés par data-i18n)
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || isSkippedNode(parent)) return NodeFilter.FILTER_REJECT;
          if (parent.hasAttribute('data-i18n')) return NodeFilter.FILTER_REJECT;
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_SKIP;
          return NodeFilter.FILTER_ACCEPT;
        }
      });

      let node;
      while ((node = walker.nextNode())) {
        const cur = node.nodeValue;
        if (currentLang === 'en') {
          const prevEn = lastEnNodeText.get(node);
          if (!origNodeText.has(node) || (cur !== prevEn && cur !== origNodeText.get(node))) {
            origNodeText.set(node, cur);
          }
          const src = origNodeText.get(node);
          const tr = translateText(src);
          if (tr !== cur) {
            node.nodeValue = tr;
            lastEnNodeText.set(node, tr);
          }
        } else {
          if (origNodeText.has(node) && cur === lastEnNodeText.get(node)) {
            node.nodeValue = origNodeText.get(node);
          }
        }
      }

      // C. Titre de l'onglet navigateur
      if (root === document || root === document.body) {
        if (!document._pgOrigTitle) document._pgOrigTitle = document.title;
        document.title = currentLang === 'en' ? translateText(document._pgOrigTitle) : document._pgOrigTitle;
      }
    } finally {
      isApplying = false;
    }
  }

  function scheduleSubtree(node) {
    if (!node || currentLang !== 'en') return;
    dirtyRoots.add(node.nodeType === 3 ? node.parentElement : node);
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      const list = Array.from(dirtyRoots);
      dirtyRoots.clear();
      list.forEach((n) => {
        if (n && document.contains(n)) applySubtree(n);
      });
    });
  }

  function startObserver() {
    if (observer || typeof MutationObserver === 'undefined' || !document.body) return;
    observer = new MutationObserver((mutations) => {
      if (isApplying || currentLang !== 'en') return;
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type === 'characterData') {
          scheduleSubtree(m.target);
        } else if (m.type === 'childList' && m.addedNodes.length > 0) {
          scheduleSubtree(m.target);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function setLang(lang) {
    currentLang = lang === 'en' ? 'en' : 'fr';
    try { localStorage.setItem('pharmagarde_lang', currentLang); } catch (e) {}
    document.documentElement.lang = currentLang;

    // Mettre à jour tous les sélecteurs FR/EN de la page
    document.querySelectorAll('.lang-switch__btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.lang === currentLang);
    });

    applySubtree(document);

    // Notifier les modules métier (cartes, graphiques, compteurs)
    document.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: currentLang } }));
  }

  function getLang() { return currentLang; }

  function init() {
    if (initialized) {
      // Ré-applique simplement la langue courante si rappelé tardivement
      setLang(currentLang);
      return;
    }
    initialized = true;
    document.documentElement.lang = currentLang;

    // Délégation globale sur les boutons de langue (fonctionne même pour les headers dynamiques)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.lang-switch__btn');
      if (btn && btn.dataset.lang) {
        e.preventDefault();
        setLang(btn.dataset.lang);
      }
    });

    startObserver();
    setLang(currentLang);
  }

  return { t, setLang, getLang, init, translateText, applySubtree };
})();

window.I18n = I18n;
window.t = I18n.t;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', I18n.init);
} else {
  I18n.init();
}
