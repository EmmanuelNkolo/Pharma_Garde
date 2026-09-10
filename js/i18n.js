/**
 * Pharma-Garde — Internationalization Module (i18n)
 * Supports French (default) and English
 */

const I18N = (() => {
  const STORAGE_KEY = 'pharmagarde_lang';
  let currentLang = 'fr';

  const translations = {
    fr: {
      // Navigation
      'nav.home': 'Accueil',
      'nav.back': 'Retour',
      'nav.settings': 'Paramètres',
      
      // Splash
      'splash.title': 'Pharma-Garde',
      'splash.subtitle': 'Trouvez vos médicaments en un clic',
      
      // Location
      'location.title': 'Bienvenue sur Pharma-Garde',
      'location.subtitle': 'Pour trouver les pharmacies près de vous, nous avons besoin de votre position.',
      'location.btn': 'Détecter ma position',
      'location.manual': 'Ou choisissez votre ville :',
      
      // Map
      'map.open_count': '{n} pharmacie(s) ouverte(s)',
      'map.guard_count': '{n} de garde',
      'map.search': 'Rechercher',
      'map.demo': 'Mode Démo',
      'map.camera': 'Ordonnance',
      
      // Search
      'search.title': 'Rechercher un médicament',
      'search.placeholder': 'Nom du médicament...',
      'search.add': 'Ajouter',
      'search.proceed': 'Continuer',
      'search.cost': 'Coût : {cost} FCFA',
      'search.cost_free': 'GRATUIT (session active)',
      'search.info': '{n} pharmacie(s) dans un rayon de {r} km',
      'search.sending': 'Envoi aux pharmacies...',
      'search.searching': 'Recherche de « {med} » dans {n} pharmacies',
      'search.results': 'Résultats',
      'search.results_subtitle': 'pharmacie(s) ont répondu',
      'search.new': 'Nouvelle recherche',
      'search.reserve': 'Réserver',
      'search.reserved': 'Réservé',
      'search.confirm_title': 'Confirmation de réservation',
      'search.confirm_send': 'Confirmer les réservations',
      
      // Insurance
      'insurance.title': 'Avez-vous une assurance santé ?',
      'insurance.yes': 'Oui',
      'insurance.no': 'Non',
      'insurance.name': 'Nom de votre assurance',
      'insurance.confirm': 'Confirmer',
      
      // Medicine status
      'status.in_stock': 'En stock',
      'status.in_stock_insured': 'En stock assuré',
      'status.in_stock_not_insured': 'En stock non assuré',
      'status.out_of_stock': 'Rupture',
      'status.ignored': 'Ignorée',
      
      // Payment
      'payment.title': 'Paiement Mobile Money',
      'payment.amount': 'Montant : {amount} FCFA',
      'payment.phone': 'Numéro de téléphone',
      'payment.confirm': 'Confirmer le paiement',
      'payment.processing': 'Traitement en cours...',
      
      // Detail
      'detail.call': 'Appeler',
      'detail.whatsapp': 'WhatsApp',
      'detail.route': 'Y aller',
      'detail.hours': 'Horaires',
      'detail.rating': 'Note',
      'detail.distance': 'Distance',
      
      // Pharmacy status
      'pharmacy.open': 'Ouvert',
      'pharmacy.closed': 'Fermé',
      'pharmacy.on_duty': 'De garde',
      
      // Settings
      'settings.title': 'Paramètres',
      'settings.location': 'Localisation',
      'settings.radius': 'Rayon par défaut',
      'settings.radius_desc': 'Distance maximale de recherche',
      'settings.city': 'Ville',
      'settings.city_desc': 'Changer de ville',
      'settings.display': 'Affichage',
      'settings.show_closed': 'Pharmacies fermées',
      'settings.show_closed_desc': 'Afficher les pharmacies fermées',
      'settings.notifications': 'Notifications',
      'settings.notifications_desc': 'Alertes pharmacies de garde',
      'settings.language': 'Langue / Language',
      'settings.about': 'À propos',
      'settings.about_desc': 'Trouvez une pharmacie de garde et vos médicaments en un clic, partout au Cameroun.',
      'settings.pharmacist': 'Espace Pharmacien →',
      
      // Pharmacist
      'pharm.title': 'Espace Pharmacie',
      'pharm.subtitle': 'Gérez vos demandes patients en temps réel',
      'pharm.login': 'Connexion',
      'pharm.register': 'Inscription',
      'pharm.reset': 'Mot de passe oublié',
      'pharm.login_btn': 'Se connecter',
      'pharm.register_btn': 'Inscrire ma pharmacie',
      'pharm.reset_btn': 'Réinitialiser le mot de passe',
      'pharm.email': 'Email',
      'pharm.password': 'Mot de passe',
      'pharm.name': 'Nom de la pharmacie',
      'pharm.city': 'Ville',
      'pharm.quarter': 'Quartier',
      'pharm.phone': 'Numéro de téléphone',
      'pharm.whatsapp': 'WhatsApp (optionnel)',
      'pharm.hours': "Horaires d'ouverture",
      'pharm.services': 'Services spéciaux',
      'pharm.service_guard': 'Garde de nuit (24h)',
      'pharm.service_delivery': 'Livraison à domicile',
      'pharm.service_insurance': 'Accepte les assurances',
      'pharm.service_advice': 'Conseil pharmaceutique',
      'pharm.forgot': 'Mot de passe oublié ?',
      'pharm.logout': 'Déconnexion',
      'pharm.delete_account': 'Supprimer mon compte',
      'pharm.delete_confirm': 'Cette action est irréversible. Toutes vos données seront définitivement supprimées.',
      'pharm.gps_title': 'Position GPS de votre pharmacie',
      'pharm.gps_desc': 'Activez le GPS pour fixer la position exacte de votre pharmacie sur la carte.',
      'pharm.gps_btn': 'Détecter la position',
      
      // Dashboard
      'dash.realtime': 'Tableau de bord en temps réel',
      'dash.status_open': 'Statut : Ouvert',
      'dash.status_guard': 'Statut : De garde 🌙',
      'dash.status_closed': 'Statut : Fermé',
      'dash.requests': 'Demandes',
      'dash.responded': 'Répondues',
      'dash.pending': 'En attente',
      'dash.reservations': 'Réservations',
      'dash.tab_requests': 'Demandes',
      'dash.tab_history': 'Historique',
      'dash.tab_stats': 'Statistiques',
      'dash.empty_requests': 'Aucune demande en cours. Les demandes de patients apparaîtront ici en temps réel.',
      'dash.empty_history': 'Aucun historique. Vos réponses aux demandes s\'afficheront ici.',
      'dash.empty_reservations': 'Aucune réservation active.',
      'dash.filter_today': "Aujourd'hui",
      'dash.filter_week': 'Semaine',
      'dash.filter_month': 'Mois',
      'dash.filter_year': 'Année',
      'dash.download_pdf': 'Télécharger PDF',
      'dash.send_response': 'Envoyer la réponse',
      'dash.confirm_response': 'Confirmer et envoyer',
      'dash.confirm_title': 'Récapitulatif de votre réponse',
      'dash.time_remaining': 'Temps restant',
      'dash.expired': 'Expiré',
      'dash.top_meds': 'Top Médicaments demandés',
      'dash.response_rate': 'Taux de réponse',
      'dash.avg_time': 'Temps de réponse moyen',
      'dash.total_requests': 'Total demandes',
      'dash.total_responses': 'Total réponses',
      'dash.ignored_count': 'Ignorées',
      
      // Reservation confirmation (patient side)
      'reserve.title': 'Vos réservations',
      'reserve.pharmacy': 'Pharmacie',
      'reserve.medicines': 'Médicaments réservés',
      'reserve.distance': 'Distance',
      'reserve.call': 'Appeler',
      'reserve.whatsapp': 'WhatsApp',
      'reserve.go': 'Y aller',
      'reserve.expires': 'Expire dans',
      'reserve.close': 'Fermer',

      // Toast messages
      'toast.gps_detected': '📍 Position détectée : {city}',
      'toast.gps_fallback': '⚠️ GPS indisponible — Position par défaut : {city}',
      'toast.login_success': '✅ Bienvenue, {name} !',
      'toast.register_success': '✅ Pharmacie inscrite avec succès !',
      'toast.response_sent': '✅ Réponse envoyée au patient',
      'toast.reservation_received': '🔔 Nouvelle réservation !',
      'toast.new_request': '🔔 Nouvelle demande de patient !',
      'toast.logout': 'Déconnexion réussie',
      'toast.account_deleted': '✅ Compte supprimé définitivement',
    },
    en: {
      // Navigation
      'nav.home': 'Home',
      'nav.back': 'Back',
      'nav.settings': 'Settings',
      
      // Splash
      'splash.title': 'Pharma-Garde',
      'splash.subtitle': 'Find your medicines in one click',
      
      // Location
      'location.title': 'Welcome to Pharma-Garde',
      'location.subtitle': 'To find pharmacies near you, we need your location.',
      'location.btn': 'Detect my position',
      'location.manual': 'Or choose your city:',
      
      // Map
      'map.open_count': '{n} open pharmacy(ies)',
      'map.guard_count': '{n} on duty',
      'map.search': 'Search',
      'map.demo': 'Demo Mode',
      'map.camera': 'Prescription',
      
      // Search
      'search.title': 'Search for a medicine',
      'search.placeholder': 'Medicine name...',
      'search.add': 'Add',
      'search.proceed': 'Continue',
      'search.cost': 'Cost: {cost} FCFA',
      'search.cost_free': 'FREE (active session)',
      'search.info': '{n} pharmacy(ies) within {r} km',
      'search.sending': 'Sending to pharmacies...',
      'search.searching': 'Searching "{med}" in {n} pharmacies',
      'search.results': 'Results',
      'search.results_subtitle': 'pharmacy(ies) responded',
      'search.new': 'New search',
      'search.reserve': 'Reserve',
      'search.reserved': 'Reserved',
      'search.confirm_title': 'Reservation Confirmation',
      'search.confirm_send': 'Confirm reservations',
      
      // Insurance
      'insurance.title': 'Do you have health insurance?',
      'insurance.yes': 'Yes',
      'insurance.no': 'No',
      'insurance.name': 'Insurance name',
      'insurance.confirm': 'Confirm',
      
      // Medicine status
      'status.in_stock': 'In stock',
      'status.in_stock_insured': 'In stock (insured)',
      'status.in_stock_not_insured': 'In stock (not insured)',
      'status.out_of_stock': 'Out of stock',
      'status.ignored': 'Ignored',
      
      // Payment
      'payment.title': 'Mobile Money Payment',
      'payment.amount': 'Amount: {amount} FCFA',
      'payment.phone': 'Phone number',
      'payment.confirm': 'Confirm payment',
      'payment.processing': 'Processing...',
      
      // Detail
      'detail.call': 'Call',
      'detail.whatsapp': 'WhatsApp',
      'detail.route': 'Go there',
      'detail.hours': 'Hours',
      'detail.rating': 'Rating',
      'detail.distance': 'Distance',
      
      // Pharmacy status
      'pharmacy.open': 'Open',
      'pharmacy.closed': 'Closed',
      'pharmacy.on_duty': 'On duty',
      
      // Settings
      'settings.title': 'Settings',
      'settings.location': 'Location',
      'settings.radius': 'Default radius',
      'settings.radius_desc': 'Maximum search distance',
      'settings.city': 'City',
      'settings.city_desc': 'Change city',
      'settings.display': 'Display',
      'settings.show_closed': 'Closed pharmacies',
      'settings.show_closed_desc': 'Show closed pharmacies',
      'settings.notifications': 'Notifications',
      'settings.notifications_desc': 'On-duty pharmacy alerts',
      'settings.language': 'Language / Langue',
      'settings.about': 'About',
      'settings.about_desc': 'Find an on-duty pharmacy and your medicines in one click, anywhere in Cameroon.',
      'settings.pharmacist': 'Pharmacist Space →',
      
      // Pharmacist
      'pharm.title': 'Pharmacy Space',
      'pharm.subtitle': 'Manage patient requests in real-time',
      'pharm.login': 'Login',
      'pharm.register': 'Register',
      'pharm.reset': 'Forgot password',
      'pharm.login_btn': 'Log in',
      'pharm.register_btn': 'Register my pharmacy',
      'pharm.reset_btn': 'Reset password',
      'pharm.email': 'Email',
      'pharm.password': 'Password',
      'pharm.name': 'Pharmacy name',
      'pharm.city': 'City',
      'pharm.quarter': 'Area/Quarter',
      'pharm.phone': 'Phone number',
      'pharm.whatsapp': 'WhatsApp (optional)',
      'pharm.hours': 'Opening hours',
      'pharm.services': 'Special services',
      'pharm.service_guard': 'Night duty (24h)',
      'pharm.service_delivery': 'Home delivery',
      'pharm.service_insurance': 'Accepts insurance',
      'pharm.service_advice': 'Pharmaceutical advice',
      'pharm.forgot': 'Forgot password?',
      'pharm.logout': 'Log out',
      'pharm.delete_account': 'Delete my account',
      'pharm.delete_confirm': 'This action is irreversible. All your data will be permanently deleted.',
      'pharm.gps_title': 'GPS Location of your pharmacy',
      'pharm.gps_desc': 'Enable GPS to fix the exact position of your pharmacy on the map.',
      'pharm.gps_btn': 'Detect position',
      
      // Dashboard
      'dash.realtime': 'Real-time dashboard',
      'dash.status_open': 'Status: Open',
      'dash.status_guard': 'Status: On duty 🌙',
      'dash.status_closed': 'Status: Closed',
      'dash.requests': 'Requests',
      'dash.responded': 'Responded',
      'dash.pending': 'Pending',
      'dash.reservations': 'Reservations',
      'dash.tab_requests': 'Requests',
      'dash.tab_history': 'History',
      'dash.tab_stats': 'Statistics',
      'dash.empty_requests': 'No current requests. Patient requests will appear here in real-time.',
      'dash.empty_history': 'No history. Your responses will appear here.',
      'dash.empty_reservations': 'No active reservations.',
      'dash.filter_today': 'Today',
      'dash.filter_week': 'Week',
      'dash.filter_month': 'Month',
      'dash.filter_year': 'Year',
      'dash.download_pdf': 'Download PDF',
      'dash.send_response': 'Send response',
      'dash.confirm_response': 'Confirm and send',
      'dash.confirm_title': 'Response summary',
      'dash.time_remaining': 'Time remaining',
      'dash.expired': 'Expired',
      'dash.top_meds': 'Top Requested Medicines',
      'dash.response_rate': 'Response rate',
      'dash.avg_time': 'Average response time',
      'dash.total_requests': 'Total requests',
      'dash.total_responses': 'Total responses',
      'dash.ignored_count': 'Ignored',
      
      // Reservation confirmation (patient side)
      'reserve.title': 'Your reservations',
      'reserve.pharmacy': 'Pharmacy',
      'reserve.medicines': 'Reserved medicines',
      'reserve.distance': 'Distance',
      'reserve.call': 'Call',
      'reserve.whatsapp': 'WhatsApp',
      'reserve.go': 'Go there',
      'reserve.expires': 'Expires in',
      'reserve.close': 'Close',

      // Toast messages
      'toast.gps_detected': '📍 Position detected: {city}',
      'toast.gps_fallback': '⚠️ GPS unavailable — Default position: {city}',
      'toast.login_success': '✅ Welcome, {name}!',
      'toast.register_success': '✅ Pharmacy registered successfully!',
      'toast.response_sent': '✅ Response sent to patient',
      'toast.reservation_received': '🔔 New reservation!',
      'toast.new_request': '🔔 New patient request!',
      'toast.logout': 'Logged out successfully',
      'toast.account_deleted': '✅ Account permanently deleted',
    }
  };

  function init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && translations[saved]) {
      currentLang = saved;
    } else {
      // Auto-detect from browser
      const browserLang = (navigator.language || 'fr').slice(0, 2);
      currentLang = translations[browserLang] ? browserLang : 'fr';
    }
    applyTranslations();
  }

  function setLanguage(lang) {
    if (!translations[lang]) return;
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    applyTranslations();
  }

  function t(key, params) {
    let text = (translations[currentLang] && translations[currentLang][key]) || 
               (translations['fr'] && translations['fr'][key]) || key;
    if (params) {
      Object.keys(params).forEach(k => {
        text = text.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
      });
    }
    return text;
  }

  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translated = t(key);
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = translated;
      } else {
        el.textContent = translated;
      }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
  }

  function getLang() {
    return currentLang;
  }

  return { init, setLanguage, t, getLang, applyTranslations };
})();

window.I18N = I18N;
