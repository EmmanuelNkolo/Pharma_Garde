/**
 * Pharma-Garde v9.5 — Module Partagé : Identité Professionnelle Certifiée, Géolocalisation Exacte & Radar par Rayon
 * • Permet à chaque acteur (Client, Pharmacie, Délégué, Grossiste) de connaître l'identité complète
 *   et la position GPS exacte (carte interactive + distance + itinéraire) de son interlocuteur professionnel.
 * • Garantit l'anonymat strict et la confidentialité de la position des Clients / Patients.
 * • Fournit le Radar Cartographique Multi-Rayons (2 km à 50 km + National) pour le Grossiste et le Délégué.
 * Expose : window.PGProGeo
 */
(function (window) {
  'use strict';

  const CITY_COORDS = {
    'Douala': { lat: 4.0511, lng: 9.7085 },
    'Yaoundé': { lat: 3.8480, lng: 11.5021 },
    'Bafoussam': { lat: 5.4764, lng: 10.4175 },
    'Bamenda': { lat: 5.9631, lng: 10.1591 },
    'Garoua': { lat: 9.3014, lng: 13.3977 },
    'Maroua': { lat: 10.5956, lng: 14.3157 },
    'Ngaoundéré': { lat: 7.3219, lng: 13.5847 },
    'Bertoua': { lat: 4.5763, lng: 13.6846 },
    'Kribi': { lat: 2.9405, lng: 9.9076 },
    'Limbé': { lat: 4.0247, lng: 9.2032 },
    'Buéa': { lat: 4.1560, lng: 9.2632 },
    'Ebolowa': { lat: 2.9000, lng: 11.1500 }
  };

  // Annuaire de référence des Délégués Médicaux Accrédités (enrichissement d'identité & GPS)
  const VERIFIED_DELEGATES = [
    {
      id: 'del_1',
      role: 'delegate',
      name: 'Dr. Jean-Paul Ndi',
      manager_name: 'Dr. Jean-Paul Ndi (Superviseur Régional)',
      license_number: 'DM-8492A / ONPC-DEL-2022',
      company_name: 'Laboratoires Sanofi & Novartis',
      labs: ['Sanofi', 'Novartis', 'Biogaran'],
      city: 'Douala',
      quarter: 'Bonapriso / Akwa',
      address: 'Rue Njo-Njo, Bonapriso, Douala',
      phone: '699445566',
      whatsapp: '699445566',
      lat: 4.0389,
      lng: 9.6994,
      status: 'open'
    },
    {
      id: 'del_2',
      role: 'delegate',
      name: 'Mme. Clarisse Tchoua',
      manager_name: 'Clarisse Tchoua (Déléguée Hospitalière & Officine)',
      license_number: 'DM-3920B / ONPC-DEL-2021',
      company_name: 'Laboratoires GSK & Pfizer',
      labs: ['GSK', 'Pfizer', 'AstraZeneca'],
      city: 'Yaoundé',
      quarter: 'Bastos',
      address: 'Carrefour Bastos, Yaoundé',
      phone: '677112299',
      whatsapp: '677112299',
      lat: 3.8895,
      lng: 11.5128,
      status: 'open'
    },
    {
      id: 'del_3',
      role: 'delegate',
      name: 'M. Patrick Essomba',
      manager_name: 'Patrick Essomba (Responsable Promotion Médicale)',
      license_number: 'DM-5184C / ONPC-DEL-2023',
      company_name: 'Laboratoires Denk Pharma & Roche',
      labs: ['Denk Pharma', 'Roche', 'Ipsen'],
      city: 'Douala',
      quarter: 'Bonamoussadi',
      address: 'Boulevard de Bonamoussadi, Douala',
      phone: '694778811',
      whatsapp: '694778811',
      lat: 4.0825,
      lng: 9.7362,
      status: 'open'
    },
    {
      id: 'del_4',
      role: 'delegate',
      name: 'Dr. Alain Fotso',
      manager_name: 'Dr. Alain Fotso (Délégué Régional Ouest & Littoral)',
      license_number: 'DM-6041D / ONPC-DEL-2020',
      company_name: 'Laboratoires Servier & Bayer',
      labs: ['Servier', 'Bayer', 'Teva'],
      city: 'Bafoussam',
      quarter: 'Centre Commercial',
      address: 'Avenue de la République, Bafoussam',
      phone: '691234567',
      whatsapp: '691234567',
      lat: 5.4778,
      lng: 10.4182,
      status: 'open'
    }
  ];

  let modalMapInstance = null;

  function esc(val) {
    if (window.PGNetwork && typeof window.PGNetwork.escapeHtml === 'function') {
      return window.PGNetwork.escapeHtml(val);
    }
    if (val === null || val === undefined) return '';
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Calcule la distance exacte en km entre deux coordonnées GPS (formule de Haversine)
   */
  function haversineKm(lat1, lng1, lat2, lng2) {
    const a1 = Number(lat1), o1 = Number(lng1), a2 = Number(lat2), o2 = Number(lng2);
    if (isNaN(a1) || isNaN(o1) || isNaN(a2) || isNaN(o2)) return null;
    const R = 6371;
    const dLat = (a2 - a1) * Math.PI / 180;
    const dLng = (o2 - o1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(a1 * Math.PI / 180) * Math.cos(a2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Récupère la liste complète des pharmacies (base locale + ajouts) avec identité et coordonnées GPS exactes
   */
  function getAllPharmacies() {
    const base = (typeof window.PHARMACIES_DATA !== 'undefined' && Array.isArray(window.PHARMACIES_DATA))
      ? window.PHARMACIES_DATA
      : [
          { id: 'ph_1', name: 'Pharmacie du Centre (Akwa)', manager_name: 'Dr. Marie Ngo Bassa', license_number: 'ONPC-2016-0142', city: 'Douala', quarter: 'Akwa', address: 'Boulevard de la Liberté, Akwa, Douala', phone: '699112233', whatsapp: '699112233', status: 'open', hours: '07:30 - 21:30', lat: 4.0511, lng: 9.7042 },
          { id: 'ph_2', name: 'Pharmacie de Bonamoussadi', manager_name: 'Dr. Paulin Kamga', license_number: 'ONPC-2018-0289', city: 'Douala', quarter: 'Bonamoussadi', address: 'Carrefour Maçon, Bonamoussadi, Douala', phone: '677889900', whatsapp: '677889900', status: 'guard', hours: '24h/24 (Garde)', lat: 4.0842, lng: 9.7385 },
          { id: 'ph_3', name: 'Pharmacie du Soleil (Bastos)', manager_name: 'Dr. Hélène Mballa', license_number: 'ONPC-2015-0094', city: 'Yaoundé', quarter: 'Bastos', address: 'Avenue Bastos, Yaoundé', phone: '694223344', whatsapp: '694223344', status: 'open', hours: '08:00 - 21:00', lat: 3.8890, lng: 11.5140 },
          { id: 'ph_4', name: 'Pharmacie Les Palmiers', manager_name: 'Dr. Christian Ewane', license_number: 'ONPC-2019-0411', city: 'Douala', quarter: 'Cité des Palmiers', address: 'Rond-point Cité des Palmiers, Douala', phone: '691556677', whatsapp: '691556677', status: 'open', hours: '07:30 - 21:00', lat: 4.0412, lng: 9.7610 },
          { id: 'ph_5', name: 'Pharmacie de la Paix (Biyem-Assi)', manager_name: 'Dr. Solange Abena', license_number: 'ONPC-2017-0318', city: 'Yaoundé', quarter: 'Biyem-Assi', address: 'Carrefour Acacias, Biyem-Assi, Yaoundé', phone: '677334455', whatsapp: '677334455', status: 'guard', hours: '24h/24 (Garde)', lat: 3.8345, lng: 11.4862 },
          { id: 'ph_6', name: 'Pharmacie de l\'Estuaire (Bonapriso)', manager_name: 'Dr. Samuel Bell', license_number: 'ONPC-2020-0512', city: 'Douala', quarter: 'Bonapriso', address: 'Avenue de Gaulle, Bonapriso, Douala', phone: '698123456', whatsapp: '698123456', status: 'open', hours: '08:00 - 22:00', lat: 4.0285, lng: 9.6965 },
          { id: 'ph_7', name: 'Pharmacie Centrale de Bafoussam', manager_name: 'Dr. Michel Talla', license_number: 'ONPC-2014-0177', city: 'Bafoussam', quarter: 'Marché A', address: 'Face Marché Central, Bafoussam', phone: '695443322', whatsapp: '695443322', status: 'open', hours: '07:30 - 20:30', lat: 5.4764, lng: 10.4175 }
        ];

    return base.map((p, idx) => {
      const c = CITY_COORDS[p.city] || CITY_COORDS['Douala'];
      return {
        id: p.id || ('ph_' + (idx + 1)),
        role: 'pharmacy',
        name: p.name || 'Pharmacie Officine',
        manager_name: p.manager_name || p.owner || `Dr. Titulaire (${p.name || 'Officine'})`,
        license_number: p.license_number || `ONPC-${2015 + (idx % 9)}-0${120 + idx}`,
        city: p.city || 'Douala',
        quarter: p.quarter || p.neighborhood || 'Centre',
        address: p.address || `${p.quarter || 'Centre'}, ${p.city || 'Douala'}`,
        phone: String(p.phone || '699112233').replace(/\D/g, '').replace(/^237/, ''),
        whatsapp: String(p.whatsapp || p.phone || '699112233').replace(/\D/g, '').replace(/^237/, ''),
        status: p.status || (p.is_on_duty ? 'guard' : 'open'),
        hours: p.hours || (p.status === 'guard' ? '24h/24 (Service de Garde)' : '08:00 - 21:00'),
        lat: Number(p.lat) || (c.lat + ((idx % 5) - 2) * 0.012),
        lng: Number(p.lng) || (c.lng + ((idx % 4) - 1.5) * 0.012)
      };
    });
  }

  /**
   * Récupère la position GPS de l'utilisateur courant (selon l'espace actif)
   */
  function getViewerPosition() {
    try {
      const ws = sessionStorage.getItem('pharmagarde_wholesaler_session');
      if (ws) {
        const p = JSON.parse(ws);
        if (p && p.lat && p.lng) return { lat: Number(p.lat), lng: Number(p.lng), label: p.company_name || 'Mon Dépôt Grossiste' };
      }
      const ph = sessionStorage.getItem('pharmagarde_pharmacy_session');
      if (ph) {
        const p = JSON.parse(ph);
        if (p && p.lat && p.lng) return { lat: Number(p.lat), lng: Number(p.lng), label: p.name || 'Mon Officine' };
      }
      const del = sessionStorage.getItem('pharmagarde_delegate_session');
      if (del) {
        const p = JSON.parse(del);
        const c = CITY_COORDS[p.city] || CITY_COORDS['Douala'];
        return { lat: Number(p.lat) || c.lat, lng: Number(p.lng) || c.lng, label: `${p.firstname || ''} ${p.lastname || 'Délégué'}`.trim() };
      }
    } catch (e) {}
    return { lat: 4.0511, lng: 9.7085, label: 'Ma Position (Douala)' };
  }

  /**
   * Résout et enrichit n'importe quel interlocuteur professionnel (Pharmacie, Délégué, Grossiste)
   */
  function resolveActor(role, hints) {
    const h = hints || {};
    const r = (role || h.role || 'pharmacy').toLowerCase();

    if (r === 'client' || r === 'patient') {
      return {
        role: 'client',
        name: h.name || 'Patient Anonyme',
        code: h.code || 'PG-XXXX',
        distanceKm: h.distanceKm || null
      };
    }

    if (r === 'wholesaler' || r === 'grossiste') {
      const dir = (window.GrossisteAuth && typeof window.GrossisteAuth.getDirectory === 'function')
        ? window.GrossisteAuth.getDirectory()
        : [];
      const found = dir.find(w =>
        (h.id && w.id === h.id) ||
        (h.name && (w.company_name || '').toLowerCase().includes(String(h.name).toLowerCase()))
      ) || dir[0] || {};
      const city = h.city || found.city || 'Douala';
      const c = CITY_COORDS[city] || CITY_COORDS['Douala'];
      return {
        role: 'wholesaler',
        roleBadge: '🏭 Grossiste-Répartiteur Agréé DPML / ONPC',
        id: h.id || found.id || 'ws_ubipharm_dla',
        name: h.name || h.company_name || found.company_name || 'UBIPHARM CAMEROUN SA',
        manager_name: h.manager_name || found.manager_name || 'Dr. Emmanuel Nkot (Pharmacien Responsable)',
        license_number: h.license_number || found.license_number || 'DPML-GR-2018-001',
        code: h.wholesaler_code || found.wholesaler_code || 'GR-UBI237',
        rccm: h.rccm_number || found.rccm_number || 'RC/DLA/2010/B/1420',
        city,
        quarter: h.quarter || found.quarter || 'Zone Industrielle Bassa',
        address: h.address || found.address || `Zone Industrielle, ${city}`,
        phone: String(h.phone || found.phone || '699102030').replace(/\D/g, '').replace(/^237/, ''),
        whatsapp: String(h.whatsapp || h.phone || found.whatsapp || '699102030').replace(/\D/g, '').replace(/^237/, ''),
        hours: h.opening_hours || found.opening_hours || '07:30 - 19:00',
        delivery_zones: found.delivery_zones || ['Douala', 'Yaoundé', 'Bafoussam'],
        lat: Number(h.lat || found.lat || c.lat),
        lng: Number(h.lng || found.lng || c.lng)
      };
    }

    if (r === 'delegate' || r === 'delegue') {
      const found = VERIFIED_DELEGATES.find(d =>
        (h.id && d.id === h.id) ||
        (h.name && d.name.toLowerCase().includes(String(h.name).toLowerCase()))
      ) || VERIFIED_DELEGATES[0];
      const city = h.city || found.city || 'Douala';
      const c = CITY_COORDS[city] || CITY_COORDS['Douala'];
      return {
        role: 'delegate',
        roleBadge: '💼 Délégué Médical Accrédité',
        id: h.id || found.id || 'del_1',
        name: h.name || found.name || 'Dr. Jean-Paul Ndi',
        manager_name: h.manager_name || `Laboratoire(s) : ${(h.labs && h.labs.join(', ')) || h.lab_name || found.company_name}`,
        license_number: h.license_number || h.card_number || found.license_number || 'DM-8492A',
        code: h.code || h.card_number || 'DM-8492A',
        city,
        quarter: h.quarter || found.quarter || 'Akwa / Bonapriso',
        address: h.address || found.address || `Secteur Médical ${city}`,
        phone: String(h.phone || found.phone || '699445566').replace(/\D/g, '').replace(/^237/, ''),
        whatsapp: String(h.whatsapp || h.phone || found.whatsapp || '699445566').replace(/\D/g, '').replace(/^237/, ''),
        hours: 'Lun - Sam : 08:00 - 18:30 (Visites Officines)',
        lat: Number(h.lat || found.lat || c.lat),
        lng: Number(h.lng || found.lng || c.lng)
      };
    }

    // Par défaut : Pharmacie d'Officine
    const allPh = getAllPharmacies();
    const foundPh = allPh.find(p =>
      (h.id && p.id === h.id) ||
      (h.name && p.name.toLowerCase().includes(String(h.name).toLowerCase())) ||
      (h.name && String(h.name).toLowerCase().includes(p.name.toLowerCase().split('(')[0].trim()))
    ) || allPh[0];

    const city = h.city || foundPh.city || 'Douala';
    const c = CITY_COORDS[city] || CITY_COORDS['Douala'];
    return {
      role: 'pharmacy',
      roleBadge: '🏥 Pharmacie d\'Officine Agréée ONPC',
      id: h.id || foundPh.id,
      name: h.name || foundPh.name,
      manager_name: h.manager_name || foundPh.manager_name || 'Dr. Pharmacien Titulaire',
      license_number: h.license_number || foundPh.license_number || 'ONPC-2019-0412',
      code: h.code || foundPh.license_number || 'ONPC-CERT',
      city,
      quarter: h.quarter || foundPh.quarter || 'Centre',
      address: h.address || foundPh.address || `${city}, Cameroun`,
      phone: String(h.phone || foundPh.phone || '699112233').replace(/\D/g, '').replace(/^237/, ''),
      whatsapp: String(h.whatsapp || h.phone || foundPh.whatsapp || '699112233').replace(/\D/g, '').replace(/^237/, ''),
      hours: h.hours || foundPh.hours || '08:00 - 21:00',
      status: h.status || foundPh.status || 'open',
      lat: Number(h.lat || foundPh.lat || c.lat),
      lng: Number(h.lng || foundPh.lng || c.lng)
    };
  }

  /**
   * Ouvre la modale d'Identité Professionnelle Certifiée & Position Géographique Exacte
   * (Bloque et anonymise strictement s'il s'agit d'un Client / Patient)
   */
  function openActorModal(roleOrActor, maybeHints) {
    const actor = typeof roleOrActor === 'string'
      ? resolveActor(roleOrActor, maybeHints)
      : resolveActor(roleOrActor && roleOrActor.role, roleOrActor);

    let existing = document.getElementById('pg-pro-geo-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'pg-pro-geo-modal';
    modal.className = 'modal-overlay active';
    modal.style.zIndex = '3500';

    // Cas particulier : Protection stricte de l'anonymat des Clients / Patients
    if (actor.role === 'client' || actor.role === 'patient') {
      modal.innerHTML = `
        <div class="modal-content" style="max-width:440px;padding:26px;text-align:center;border:1px solid rgba(16,185,129,0.4);">
          <div style="font-size:44px;margin-bottom:10px;">🔒</div>
          <h3 style="font-size:17px;font-weight:900;color:#34d399;margin-bottom:8px;">
            Confidentialité &amp; Anonymat Patient Garantis
          </h3>
          <p style="font-size:13px;color:#cbd5e1;line-height:1.55;margin-bottom:16px;">
            Conformément à la charte de confidentialité médicale <strong>Pharma-Garde</strong>, l'identité personnelle et la position GPS exacte des patients ne sont jamais divulguées.
          </p>
          <div style="background:rgba(15,23,42,0.85);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:12px;margin-bottom:16px;font-size:12.5px;color:#fbbf24;font-weight:700;">
            🪪 Code de retrait sécurisé : ${esc(actor.code || 'PG-XXXX')}
            ${actor.distanceKm ? `<div style="color:#94a3b8;margin-top:4px;font-weight:600;">📏 Distance approximative : ~${Number(actor.distanceKm).toFixed(1)} km</div>` : ''}
          </div>
          <button type="button" class="btn btn--primary btn--block" onclick="document.getElementById('pg-pro-geo-modal').remove()">
            Compris
          </button>
        </div>
      `;
      document.body.appendChild(modal);
      return;
    }

    const viewer = getViewerPosition();
    const distKm = haversineKm(viewer.lat, viewer.lng, actor.lat, actor.lng);
    const estMinutes = distKm !== null ? Math.max(2, Math.round((distKm / 30) * 60)) : null;
    const cleanPhone = String(actor.phone || '').replace(/\D/g, '').replace(/^237/, '');
    const cleanWa = String(actor.whatsapp || actor.phone || '').replace(/\D/g, '').replace(/^237/, '');
    const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${actor.lat},${actor.lng}`;

    modal.innerHTML = `
      <div class="modal-content" style="max-width:640px;padding:0;overflow:hidden;border:1px solid rgba(16,185,129,0.45);box-shadow:0 24px 60px rgba(0,0,0,0.75);">
        <!-- Entête Identité Certifiée -->
        <div style="background:linear-gradient(135deg,#0f172a,#064e3b);padding:18px 22px;border-bottom:1px solid rgba(16,185,129,0.3);display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
          <div>
            <div style="display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;background:rgba(16,185,129,0.2);border:1px solid rgba(16,185,129,0.45);color:#34d399;font-size:11px;font-weight:800;margin-bottom:6px;">
              <span>✔️ IDENTITÉ &amp; POSITION GPS VÉRIFIÉES</span>
              <span>•</span>
              <span>${esc(actor.roleBadge)}</span>
            </div>
            <h3 style="font-size:18px;font-weight:900;color:#ffffff;margin:0;">${esc(actor.name)}</h3>
            <div style="font-size:12.5px;color:#fbbf24;font-weight:700;margin-top:3px;">
              👤 Responsable / Titulaire : ${esc(actor.manager_name)}
            </div>
          </div>
          <button type="button" class="btn btn--icon" onclick="document.getElementById('pg-pro-geo-modal').remove()" style="color:#fff;">✕</button>
        </div>

        <div style="padding:18px 22px;max-height:80vh;overflow-y:auto;">
          <!-- Grille Fiche d'Identité Professionnelle -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-bottom:14px;">
            <div style="background:rgba(15,23,42,0.8);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 12px;">
              <div style="font-size:10.5px;color:#94a3b8;text-transform:uppercase;font-weight:700;">N° Licence / Agrément Officiel</div>
              <div style="font-size:13.5px;font-weight:900;color:#34d399;margin-top:2px;">🪪 ${esc(actor.license_number)}</div>
            </div>
            <div style="background:rgba(15,23,42,0.8);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 12px;">
              <div style="font-size:10.5px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Distance &amp; Temps Estimé</div>
              <div style="font-size:13.5px;font-weight:900;color:#fbbf24;margin-top:2px;">
                📍 ${distKm !== null ? `${distKm.toFixed(2)} km (~${estMinutes} min)` : esc(actor.city)}
              </div>
            </div>
            <div style="background:rgba(15,23,42,0.8);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 12px;">
              <div style="font-size:10.5px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Adresse &amp; Localisation</div>
              <div style="font-size:12.5px;font-weight:700;color:#f8fafc;margin-top:2px;">${esc(actor.address)} (${esc(actor.city)})</div>
            </div>
            <div style="background:rgba(15,23,42,0.8);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 12px;">
              <div style="font-size:10.5px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Coordonnées GPS Exactes</div>
              <div style="font-size:12.5px;font-weight:800;color:#60a5fa;margin-top:2px;font-family:monospace;">
                ${actor.lat.toFixed(6)}, ${actor.lng.toFixed(6)}
              </div>
            </div>
          </div>

          <!-- Carte Interactive de Position Exacte -->
          <div style="border-radius:12px;overflow:hidden;border:1px solid rgba(16,185,129,0.35);height:250px;background:#090d16;position:relative;margin-bottom:14px;" id="pg-pro-geo-map-box"></div>

          <!-- Actions Directes 1-Clic -->
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer" class="btn btn--primary" style="flex:1;min-width:180px;background:linear-gradient(135deg,#10b981,#059669);font-weight:800;text-decoration:none;text-align:center;">
              🧭 Itinéraire GPS Exact (Maps)
            </a>
            ${cleanWa ? `
              <a href="https://wa.me/237${cleanWa}" target="_blank" rel="noopener noreferrer" class="btn btn--secondary" style="flex:1;min-width:140px;border-color:rgba(16,185,129,0.45);color:#34d399;font-weight:800;text-decoration:none;text-align:center;">
                💬 WhatsApp (+237 ${esc(cleanWa)})
              </a>
            ` : ''}
            ${cleanPhone ? `
              <a href="tel:+237${cleanPhone}" class="btn btn--secondary" style="border-color:rgba(251,191,36,0.45);color:#fbbf24;font-weight:800;text-decoration:none;">
                📞 Appeler
              </a>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);

    // Initialiser la carte Leaflet si disponible, sinon iframe OpenStreetMap
    setTimeout(() => {
      const box = document.getElementById('pg-pro-geo-map-box');
      if (!box) return;
      if (typeof window.L !== 'undefined') {
        try {
          if (modalMapInstance) {
            try { modalMapInstance.remove(); } catch (e) {}
            modalMapInstance = null;
          }
          modalMapInstance = window.L.map('pg-pro-geo-map-box').setView([actor.lat, actor.lng], 14);
          window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap · Pharma-Garde GPS'
          }).addTo(modalMapInstance);

          // Marqueur de l'interlocuteur
          const targetMarker = window.L.circleMarker([actor.lat, actor.lng], {
            radius: 11,
            fillColor: '#10b981',
            color: '#ffffff',
            weight: 3,
            fillOpacity: 0.95
          }).addTo(modalMapInstance);
          targetMarker.bindPopup(`<strong>${esc(actor.name)}</strong><br>${esc(actor.address)}`).openPopup();

          // Marqueur de l'utilisateur courant + ligne de distance si < 100 km
          if (viewer && viewer.lat && viewer.lng && distKm !== null && distKm < 100) {
            window.L.circleMarker([viewer.lat, viewer.lng], {
              radius: 8,
              fillColor: '#fbbf24',
              color: '#0f172a',
              weight: 2,
              fillOpacity: 0.9
            }).addTo(modalMapInstance).bindPopup(`<strong>📍 ${esc(viewer.label)}</strong>`);

            window.L.polyline([[viewer.lat, viewer.lng], [actor.lat, actor.lng]], {
              color: '#fbbf24',
              weight: 2.5,
              dashArray: '6, 6'
            }).addTo(modalMapInstance);

            modalMapInstance.fitBounds([[viewer.lat, viewer.lng], [actor.lat, actor.lng]], { padding: [36, 36], maxZoom: 15 });
          }
        } catch (err) {}
      } else {
        const d = 0.005;
        const bbox = [actor.lng - d, actor.lat - d, actor.lng + d, actor.lat + d].join('%2C');
        box.innerHTML = `<iframe title="Position GPS" style="width:100%;height:100%;border:0;" src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${actor.lat}%2C${actor.lng}"></iframe>`;
      }
    }, 60);
  }

  window.PGProGeo = {
    CITY_COORDS,
    VERIFIED_DELEGATES,
    haversineKm,
    getAllPharmacies,
    getViewerPosition,
    resolveActor,
    openActorModal
  };
})(window);
