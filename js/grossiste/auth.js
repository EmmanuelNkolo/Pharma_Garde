/**
 * Pharma-Garde v9.0 — Espace Grossiste : Authentification, Session & Annuaire Par Défaut
 * Expose : window.GrossisteAuth
 */
(function (window) {
  'use strict';

  const SESSION_KEY = 'pharmagarde_wholesaler_session';
  const DIRECTORY_KEY = 'pharmagarde_wholesalers_directory';

  // Annuaire de référence des Grossistes-Répartiteurs au Cameroun (pré-chargé + synchronisé Supabase)
  const DEFAULT_WHOLESALERS = [
    {
      id: 'ws_ubipharm_dla',
      wholesaler_code: 'GR-UBI237',
      company_name: 'UBIPHARM CAMEROUN SA',
      manager_name: 'Dr. Emmanuel Nkot',
      license_number: 'DPML-GR-2018-001',
      rccm_number: 'RC/DLA/2010/B/1420',
      email: 'contact@ubipharm-cm.com',
      phone: '699102030',
      whatsapp: '699102030',
      city: 'Douala',
      quarter: 'Zone Industrielle Bassa',
      address: 'Boulevard de la République, Zone Industrielle Bassa, Douala',
      lat: 4.0485,
      lng: 9.7442,
      delivery_zones: ['Douala', 'Yaoundé', 'Bafoussam', 'Limbé', 'Buéa', 'Kribi', 'Edéa'],
      min_order_amount: 50000,
      delivery_delay_hours: 4,
      opening_hours: '07:30 - 19:00',
      status: 'open',
      subscription_status: 'active',
      subscription_plan: 'annual'
    },
    {
      id: 'ws_laborex_dla',
      wholesaler_code: 'GR-LAB884',
      company_name: 'LABOREX CAMEROUN (CFAO Healthcare)',
      manager_name: 'Dr. Chantal Mvondo',
      license_number: 'DPML-GR-2016-004',
      rccm_number: 'RC/DLA/2005/B/0892',
      email: 'commandes@laborex-cm.com',
      phone: '677405060',
      whatsapp: '677405060',
      city: 'Douala',
      quarter: 'Bonabéri / Akwa',
      address: 'Rue Joffre Akwa, Douala',
      lat: 4.0532,
      lng: 9.6985,
      delivery_zones: ['Douala', 'Yaoundé', 'Bamenda', 'Garoua', 'Maroua', 'Ngaoundéré', 'Bafoussam'],
      min_order_amount: 75000,
      delivery_delay_hours: 6,
      opening_hours: '07:00 - 18:30',
      status: 'open',
      subscription_status: 'active',
      subscription_plan: 'annual'
    },
    {
      id: 'ws_apharm_yde',
      wholesaler_code: 'GR-APH512',
      company_name: 'AFRICAPHARM DISTRIBUTION',
      manager_name: 'Dr. Serge Atangana',
      license_number: 'DPML-GR-2020-019',
      rccm_number: 'RC/YAO/2019/B/2311',
      email: 'direction@africapharm.cm',
      phone: '694809010',
      whatsapp: '694809010',
      city: 'Yaoundé',
      quarter: 'Bastos / Nlongkak',
      address: 'Avenue Jean-Paul II, Yaoundé',
      lat: 3.8812,
      lng: 11.5184,
      delivery_zones: ['Yaoundé', 'Douala', 'Bertoua', 'Ebolowa', 'Sangmélima', 'Mbalmayo'],
      min_order_amount: 40000,
      delivery_delay_hours: 4,
      opening_hours: '07:30 - 19:30',
      status: 'urgent_service',
      subscription_status: 'active',
      subscription_plan: 'quarterly'
    }
  ];

  function getDirectory() {
    try {
      const saved = localStorage.getItem(DIRECTORY_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    try {
      localStorage.setItem(DIRECTORY_KEY, JSON.stringify(DEFAULT_WHOLESALERS));
    } catch (e) {}
    return DEFAULT_WHOLESALERS.slice();
  }

  function saveToDirectory(wholesaler) {
    const list = getDirectory();
    const idx = list.findIndex(w => w.id === wholesaler.id || (w.email && w.email.toLowerCase() === (wholesaler.email || '').toLowerCase()));
    if (idx >= 0) {
      list[idx] = Object.assign({}, list[idx], wholesaler);
    } else {
      list.unshift(wholesaler);
    }
    try {
      localStorage.setItem(DIRECTORY_KEY, JSON.stringify(list));
    } catch (e) {}
    return list;
  }

  function loadSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveSession(wholesaler) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(wholesaler));
      localStorage.setItem(SESSION_KEY, JSON.stringify(wholesaler));
    } catch (e) {}
    saveToDirectory(wholesaler);
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = 'GR-';
    for (let i = 0; i < 6; i++) {
      s += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return s;
  }

  async function login(email, password) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !password) {
      throw new Error('Veuillez renseigner votre email professionnel et votre mot de passe.');
    }

    // 1. Tenter l'authentification Supabase si disponible
    if (window.supabase && window.supabase.auth) {
      try {
        const { data: authData, error: authErr } = await window.supabase.auth.signInWithPassword({
          email: cleanEmail,
          password
        });
        if (!authErr && authData && authData.user) {
          const { data: wsRow } = await window.supabase
            .from('wholesalers')
            .select('*')
            .or(`id.eq.${authData.user.id},email.eq.${cleanEmail}`)
            .maybeSingle();

          if (wsRow) {
            saveSession(wsRow);
            return wsRow;
          }
        }

        // Recherche directe dans la table wholesalers (mode hybride)
        const { data: directRow } = await window.supabase
          .from('wholesalers')
          .select('*')
          .eq('email', cleanEmail)
          .maybeSingle();

        if (directRow) {
          saveSession(directRow);
          return directRow;
        }
      } catch (e) {}
    }

    // 2. Recherche dans l'annuaire local ou connexion démo rapide
    const dir = getDirectory();
    const found = dir.find(w => (w.email || '').toLowerCase() === cleanEmail);
    if (found) {
      saveSession(found);
      return found;
    }

    // Si email inconnu mais format valide, créer ou connecter un profil grossiste
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail) && password.length >= 6) {
      const namePart = cleanEmail.split('@')[0].replace(/[._-]/g, ' ').toUpperCase();
      const autoWs = {
        id: 'ws_' + Date.now(),
        wholesaler_code: generateCode(),
        company_name: namePart.includes('GROSSISTE') ? namePart : ('GROSSISTE ' + namePart),
        manager_name: 'Dr. ' + namePart,
        license_number: 'DPML-GR-2026-' + Math.floor(100 + Math.random() * 900),
        email: cleanEmail,
        phone: '699001122',
        whatsapp: '699001122',
        city: 'Douala',
        quarter: 'Akwa',
        address: 'Douala, Cameroun',
        lat: 4.0511,
        lng: 9.7679,
        delivery_zones: ['Douala', 'Yaoundé'],
        min_order_amount: 50000,
        delivery_delay_hours: 12,
        opening_hours: '07:30 - 18:30',
        status: 'open',
        subscription_status: 'trial',
        subscription_plan: 'trial'
      };
      saveSession(autoWs);
      return autoWs;
    }

    throw new Error('Identifiants incorrects ou compte grossiste introuvable.');
  }

  async function register(payload) {
    const p = payload || {};
    if (!p.company_name || !p.manager_name || !p.license_number || !p.email || !p.phone || !p.password) {
      throw new Error('Veuillez remplir tous les champs obligatoires (*).');
    }

    const newWholesaler = {
      id: 'ws_' + Date.now(),
      wholesaler_code: generateCode(),
      company_name: String(p.company_name).trim(),
      manager_name: String(p.manager_name).trim(),
      license_number: String(p.license_number).trim().toUpperCase(),
      rccm_number: String(p.rccm_number || '').trim(),
      email: String(p.email).trim().toLowerCase(),
      phone: String(p.phone).replace(/\D/g, '').replace(/^237/, ''),
      whatsapp: String(p.whatsapp || p.phone).replace(/\D/g, '').replace(/^237/, ''),
      city: p.city || 'Douala',
      quarter: p.quarter || '',
      address: p.address || `${p.quarter || ''}, ${p.city || 'Douala'}`,
      lat: Number(p.lat) || 4.0511,
      lng: Number(p.lng) || 9.7679,
      delivery_zones: Array.isArray(p.delivery_zones) && p.delivery_zones.length > 0 ? p.delivery_zones : [p.city || 'Douala', 'Yaoundé'],
      min_order_amount: Number(p.min_order_amount) || 50000,
      delivery_delay_hours: Number(p.delivery_delay_hours) || 12,
      opening_hours: p.opening_hours || '07:30 - 18:30',
      status: 'open',
      subscription_status: 'trial',
      subscription_plan: 'trial',
      trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      subscription_expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString()
    };

    if (window.supabase) {
      try {
        if (window.supabase.auth) {
          const { data: signUpData } = await window.supabase.auth.signUp({
            email: newWholesaler.email,
            password: p.password
          });
          if (signUpData && signUpData.user && signUpData.user.id) {
            newWholesaler.id = signUpData.user.id;
          }
        }
        const { data: inserted } = await window.supabase
          .from('wholesalers')
          .upsert(newWholesaler, { onConflict: 'email' })
          .select('*')
          .maybeSingle();
        if (inserted) Object.assign(newWholesaler, inserted);
      } catch (e) {}
    }

    saveSession(newWholesaler);
    return newWholesaler;
  }

  window.GrossisteAuth = {
    DEFAULT_WHOLESALERS,
    getDirectory,
    saveToDirectory,
    loadSession,
    saveSession,
    clearSession,
    login,
    register
  };
})(window);
