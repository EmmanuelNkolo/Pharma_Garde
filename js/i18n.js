/**
 * Pharma-Garde — Internationalization (i18n) v2.0
 * Complete bilingual support: Français / English
 */
const I18n = (() => {
  let currentLang = localStorage.getItem('pharmagarde_lang') || 'fr';

  const translations = {
    fr: {
      // General
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

      // Footer
      footer_line1: 'Application de santé publique — Cameroun',
      footer_line2: 'Recherche de médicaments · Pharmacies de garde · Délégués médicaux',

      // Welcome
      welcome_title: 'Bienvenue sur',
      welcome_subtitle: 'Trouvez vos médicaments dans les pharmacies proches de vous',
      btn_client: 'Espace Client',
      btn_client_desc: 'Rechercher des médicaments',
      btn_pharmacy: 'Espace Pharmacie',
      btn_pharmacy_desc: 'Gérer votre officine',
      btn_delegate: 'Espace Délégué Médical',
      btn_delegate_desc: 'Promouvoir vos produits',

      // Location
      location_title: 'Votre Position',
      location_desc: 'Pour trouver les pharmacies proches, nous avons besoin de votre position. Vos données restent privées.',
      btn_detect: 'Détecter ma position',
      detecting: 'Détection en cours...',
      city_label: 'Ville',
      radius_label: 'Rayon',

      // Client Space
      btn_medicines: 'Médicaments',
      btn_ordonnance: 'Ordonnance',
      btn_guard_short: 'Garde',
      search_medicine: 'Rechercher un médicament',
      search_placeholder: 'Nom du médicament...',
      guard_pharmacies: 'Pharmacies de garde',
      nearby_pharmacies: 'Pharmacies proches',
      no_pharmacies: 'Aucune pharmacie trouvée dans ce rayon',
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

      // Pharmacy Space
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

      // Delegate Space
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

      // Stats
      stat_sent: 'Envoyées',
      stat_read: 'Lues',
      stat_interested: 'Intéressées',
      stat_stocked: 'En stock',
      stat_rate: 'Taux',
      stat_total_promos: 'Total promotions',
      stat_total_visits: 'Total visites',
      stat_pharmacies_reached: 'Pharmacies atteintes',
      stat_response_rate: 'Taux de réponse',

      // Visit Status
      visit_pending: 'En attente',
      visit_confirmed: 'Confirmée',
      visit_rescheduled: 'Reportée',
      visit_cancelled: 'Refusée',
      visit_completed: 'Réalisée',

      // Time
      time_ago_min: 'Il y a {n} min',
      time_ago_hour: 'Il y a {n}h',
      time_ago_day: 'Il y a {n} jour(s)',
      time_now: "À l'instant",

      // Delete Account
      delete_title: 'Supprimer mon compte',
      delete_warning: 'Cette action est irréversible. Toutes vos données seront supprimées.',
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

      footer_line1: 'Public Health Application — Cameroon',
      footer_line2: 'Medicine search · On-duty pharmacies · Medical delegates',

      welcome_title: 'Welcome to',
      welcome_subtitle: 'Find your medicines at nearby pharmacies',
      btn_client: 'Client Area',
      btn_client_desc: 'Search for medicines',
      btn_pharmacy: 'Pharmacy Area',
      btn_pharmacy_desc: 'Manage your pharmacy',
      btn_delegate: 'Medical Delegate Area',
      btn_delegate_desc: 'Promote your products',

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
      pharm_code_valid: 'Code verified! Product delivered to patient.',
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
      visit_cancelled: 'Cancelled',
      visit_completed: 'Completed',

      time_ago_min: '{n} min ago',
      time_ago_hour: '{n}h ago',
      time_ago_day: '{n} day(s) ago',
      time_now: 'Just now',

      delete_title: 'Delete my account',
      delete_warning: 'This action is irreversible. All your data will be deleted.',
    }
  };

  function t(key, params) {
    let text = (translations[currentLang] && translations[currentLang][key]) || 
               (translations['fr'] && translations['fr'][key]) || key;
    if (params) {
      Object.keys(params).forEach(k => {
        text = text.replace('{' + k + '}', params[k]);
      });
    }
    return text;
  }

  function setLang(lang) {
    currentLang = lang;
    localStorage.setItem('pharmagarde_lang', lang);
    document.documentElement.lang = lang;
    // Update all data-i18n elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (el.placeholder) el.placeholder = t(key);
      } else {
        el.textContent = t(key);
      }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    // Update lang switch buttons
    document.querySelectorAll('.lang-switch__btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === currentLang);
    });
    // Dispatch event for custom updates
    document.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: currentLang } }));
  }

  function getLang() { return currentLang; }

  function init() {
    document.documentElement.lang = currentLang;
    // Bind lang switch buttons
    document.querySelectorAll('.lang-switch__btn').forEach(btn => {
      btn.addEventListener('click', () => setLang(btn.dataset.lang));
    });
    // Apply initial translations
    setLang(currentLang);
  }

  return { t, setLang, getLang, init };
})();

window.I18n = I18n;
window.t = I18n.t;
