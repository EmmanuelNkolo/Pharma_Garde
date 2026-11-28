/**
 * Pharma-Garde v12.0 — Hub Santé Intégral du Patient (Espace Client)
 * ──────────────────────────────────────────────────────────────────
 * Permet au patient, depuis UN SEUL ENDROIT, de choisir instantanément :
 *   1. 💊 Pharmacies & Médicaments (existant intégralement conservé)
 *   2. 🩺 Médecins (Téléconsultation 48h à 2 600 FCFA : 100 F NotchPay +
 *      2 500 F direct OM/MoMo au médecin · Ordonnance PDF signée →
 *      1-clic recherche directe en pharmacie · Prise de RDV)
 *   3. 🔬 Laboratoires d'Analyses (géolocalisés sur le rayon choisi + services + promos + RDV)
 *   4. 🏥 Hôpitaux & Cliniques (géolocalisés sur le rayon choisi + urgences 24/7 + services)
 *
 * Expose : window.PGPatientCare
 */
(function (window) {
  'use strict';

  let currentMode = 'pharmacies'; // pharmacies | doctors | labs | hospitals | dmp
  let activeConsultId = null;
  let facilityMapLayer = null;
  let docFilterSpecialty = 'all';
  let docFilterRegion = 'all';
  let docFilterAvailOnly = false;

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function notify(msg, type) {
    if (window.App && typeof App.showToast === 'function') App.showToast(msg, type || 'info');
    else if (window.PG && typeof PG.toast === 'function') PG.toast(msg, type || 'info');
  }

  function getRadiusKm() {
    const active = document.querySelector('.radius-pill.active');
    return active ? (parseInt(active.dataset.radius, 10) || 5) : 5;
  }

  function getUserPos() {
    return (window.Geolocation && Geolocation.getPosition && Geolocation.getPosition()) || { lat: 4.0511, lng: 9.7085 };
  }

  function haversine(a, b) {
    const R = 6371, toR = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toR, dLon = (b.lng - a.lng) * toR;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  // Affichage des marqueurs Laboratoires & Hôpitaux sur la carte Leaflet Client
  function updateFacilityMarkersOnMap() {
    const map = window.App && typeof App.getMap === 'function' ? App.getMap() : null;
    if (!map || typeof L === 'undefined' || !window.FacilityStore) return;
    if (!facilityMapLayer) facilityMapLayer = L.layerGroup().addTo(map);
    facilityMapLayer.clearLayers();

    const pos = getUserPos();
    const radius = getRadiusKm();
    const list = FacilityStore.getFacilities().map((f) => Object.assign({}, f, {
      distance: parseFloat(haversine(pos, f).toFixed(1))
    })).filter((f) => f.distance <= Math.max(radius, currentMode === 'pharmacies' ? radius : radius));

    list.forEach((f) => {
      if (currentMode === 'labs' && f.facility_type !== 'laboratory' && f.facility_type !== 'imaging') return;
      if (currentMode === 'hospitals' && f.facility_type !== 'hospital' && f.facility_type !== 'clinic') return;
      const isLab = f.facility_type === 'laboratory' || f.facility_type === 'imaging';
      const bg = isLab ? '#8b5cf6' : '#f43f5e';
      const emoji = isLab ? '🔬' : '🏥';
      const icon = L.divIcon({
        className: 'fac-marker',
        html: `<div style="width:26px;height:26px;background:${bg};border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 3px 10px rgba(0,0,0,0.4);">${emoji}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });
      L.marker([f.lat, f.lng], { icon }).addTo(facilityMapLayer).bindPopup(
        `<strong>${emoji} ${esc(f.name)}</strong><br>${esc(f.address || f.city)}<br><b>${f.distance} km</b> · ${esc(f.opening_hours || '')}`
      );
    });
  }

  function switchMode(mode) {
    currentMode = mode || 'pharmacies';
    document.querySelectorAll('.patient-hub-tab').forEach((b) => {
      b.classList.toggle('active', b.dataset.hubMode === currentMode);
    });

    const mainActions = document.getElementById('main-actions');
    const proStrip = document.getElementById('patient-pro-strip');
    const counts = document.getElementById('pharmacy-counts');
    const phList = document.getElementById('pharmacy-list');
    const careHost = document.getElementById('patient-care-panel');

    const isPharm = currentMode === 'pharmacies';
    if (mainActions) mainActions.style.display = isPharm ? '' : 'none';
    if (proStrip) proStrip.style.display = isPharm ? 'grid' : 'none';
    if (counts) counts.style.display = isPharm ? 'flex' : 'none';
    if (phList) phList.style.display = isPharm ? '' : 'none';
    if (careHost) careHost.style.display = isPharm ? 'none' : 'block';

    updateFacilityMarkersOnMap();
    if (!isPharm) renderCarePanel();
    if (currentMode === 'doctors' && window.MedecinStore) {
      Promise.allSettled([
        MedecinStore.syncConsultations ? MedecinStore.syncConsultations() : Promise.resolve(),
        MedecinStore.syncPrescriptions ? MedecinStore.syncPrescriptions() : Promise.resolve()
      ]).then(() => {
        if (activeConsultId && MedecinStore.syncMessages) {
          MedecinStore.syncMessages(activeConsultId).then(() => { if (currentMode === 'doctors') renderCarePanel(); });
        } else if (currentMode === 'doctors') {
          renderCarePanel();
        }
      });
      if (MedecinStore.subscribeRealtime) {
        MedecinStore.subscribeRealtime({
          getActiveConsultId: () => activeConsultId,
          onUpdate: () => { if (currentMode === 'doctors') renderCarePanel(); }
        });
      }
    }
  }

  function renderCarePanel() {
    const host = document.getElementById('patient-care-panel');
    if (!host) return;

    if (currentMode === 'doctors') {
      renderDoctorsView(host);
    } else if (currentMode === 'labs') {
      renderFacilitiesView(host, ['laboratory', 'imaging'], '🔬 Laboratoires d\'Analyses & Imagerie');
    } else if (currentMode === 'hospitals') {
      renderFacilitiesView(host, ['hospital', 'clinic'], '🏥 Hôpitaux & Cliniques');
    } else if (currentMode === 'dmp' && window.PGPatientDmpUI) {
      PGPatientDmpUI.renderDmpView(host);
    }
  }

  // ── VUE MÉDECINS (MODE ALÉATOIRE RAPIDE + MULTI-SPÉCIALITÉS + 10 RÉGIONS / CHEFS-LIEUX) ──
  function renderDoctorsView(host) {
    if (!window.MedecinStore) return;
    const allDocs = MedecinStore.getDoctors();
    const totalAvailNow = allDocs.filter((d) => MedecinStore.getEffectiveAvailability(d).isAvailableNow).length;
    const specSummary = MedecinStore.getSpecialtyDirectorySummary(docFilterRegion);
    const docs = MedecinStore.filterDoctors({
      specialty: docFilterSpecialty,
      region: docFilterRegion,
      onlyAvailable: docFilterAvailOnly
    });

    const mySid = MedecinStore.getPatientSessionId();
    const myConsults = MedecinStore.getConsultations().filter((c) => c.patient_session_id === mySid);
    const myRxs = MedecinStore.getPrescriptions().filter((r) => r.patient_session_id === mySid);
    const activeConsult = myConsults.find((c) => c.id === activeConsultId) || myConsults[0] || null;
    if (activeConsult) activeConsultId = activeConsult.id;

    host.innerHTML = `
      <!-- Mode Aléatoire Rapide + Couverture Nationale 10 Régions -->
      <div style="background:linear-gradient(135deg, rgba(14,165,233,0.18), rgba(16,185,129,0.14)); border:1px solid rgba(56,189,248,0.45); border-radius:14px; padding:13px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:5px;">
          <div style="font-weight:900; font-size:14.5px; color:#38bdf8;">🩺 Téléconsultation ONMC · Tout le Cameroun</div>
          <span style="padding:2px 9px; border-radius:999px; background:rgba(16,185,129,0.22); border:1px solid #10b981; color:#34d399; font-size:10.5px; font-weight:800;">🟢 ${totalAvailNow} médecin(s) dispo en direct</span>
        </div>
        <div style="font-size:11.5px; color:#cbd5e1; line-height:1.45; margin-bottom:10px;">
          <strong style="color:#fbbf24;">2 600 FCFA</strong> (2 500 F direct OM/MoMo médecin + 100 F NotchPay · <strong>Session 48h</strong>).<br>
          ⭐ Les plus grands spécialistes exercent dans les <strong>10 Chefs-lieux de Régions</strong> — consultables à distance depuis <strong>tout le Cameroun</strong> !
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <button type="button" class="btn btn--primary btn--sm btn--stacked" onclick="PGPatientCare.openTeleconsultModal('', 'any')" style="background:linear-gradient(135deg,#0ea5e9,#10b981)!important; color:#fff!important; border:none!important; font-weight:900; padding:10px 8px;">
            <span>🎲 Mode Aléatoire Rapide</span>
            <small style="font-weight:600; opacity:0.92;">1er Médecin Dispo (2 600 F)</small>
          </button>
          <button type="button" class="btn btn--secondary btn--sm btn--stacked" onclick="PGPatientCare.openTeleconsultModal('', '${esc(docFilterSpecialty === 'all' ? 'Médecine Générale' : docFilterSpecialty)}')" style="border-color:rgba(251,191,36,0.5)!important; color:#fbbf24!important; font-weight:800; padding:10px 8px;">
            <span>🎯 Choisir ma Spécialité</span>
            <small style="font-weight:600; color:#cbd5e1;">Spécialiste ONMC (2 600 F)</small>
          </button>
        </div>
      </div>

      ${myRxs.length > 0 ? `
        <div style="margin-bottom:12px;">
          <div style="font-size:11.5px; font-weight:800; color:#fbbf24; text-transform:uppercase; margin-bottom:6px;">📝 Mes Ordonnances Signées (${myRxs.length})</div>
          ${myRxs.map((rx) => `
            <div style="padding:11px; border-radius:12px; background:rgba(16,185,129,0.1); border:1px solid rgba(52,211,153,0.42); margin-bottom:8px;">
              <div style="display:flex; justify-content:space-between; font-size:11.5px; margin-bottom:4px;">
                <strong style="color:#fbbf24; font-family:monospace;">${esc(rx.rx_code)}</strong>
                <span style="color:#94a3b8;">${esc(rx.doctor_name)} (${esc(rx.doctor_onmc)})</span>
              </div>
              <div style="font-size:12px; color:#fff; font-weight:700; margin-bottom:8px;">💊 ${(rx.medications || []).map((m) => esc(m.name)).join(' · ')}</div>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button type="button" class="btn btn--primary btn--sm" data-rx-id="${esc(rx.id)}" onclick="PGPatientCare.searchRxInPharmacies(this.dataset.rxId)" style="flex:1; font-weight:800;">💊 Rechercher en Pharmacie (1 Clic)</button>
                <button type="button" class="btn btn--secondary btn--sm" onclick="MedecinStore.downloadPrescriptionPDF('${esc(rx.id)}')">📄 PDF Signé</button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${activeConsult ? `
        <div style="margin-bottom:12px; padding:11px; border-radius:14px; background:rgba(15,23,42,0.8); border:1px solid rgba(45,212,191,0.4);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
            <strong style="color:#2dd4bf; font-size:13px;">💬 Ma Session 48h — ${esc(activeConsult.doctor_name)}</strong>
            <span style="font-size:11px; font-weight:800; color:#fbbf24;">⏱️ ${esc(MedecinStore.remaining48hLabel(activeConsult.session_expires_at))}</span>
          </div>
          <div class="pg-consult-chat" id="pat-consult-chat" style="max-height:175px; margin-bottom:8px;">
            ${MedecinStore.getMessages(activeConsult.id).map((m) => `
              <div class="pg-chat-msg ${m.sender_role === 'patient' ? 'pg-chat-msg--patient' : 'pg-chat-msg--doctor'}">
                <div style="font-size:10px; opacity:0.75; font-weight:700;">${esc(m.sender_name)}</div>
                <div>${esc(m.body)}</div>
              </div>
            `).join('')}
          </div>
          <div style="display:flex; gap:6px;">
            <input type="text" id="pat-chat-input" class="form-input" placeholder="Écrire à votre médecin (48h inclus)..." style="flex:1; min-height:38px;">
            <button type="button" class="btn btn--primary btn--sm" onclick="PGPatientCare.sendPatientMessage('${esc(activeConsult.id)}')">Envoyer</button>
          </div>
        </div>
      ` : ''}

      <!-- Menus Déroulants Rapides : Spécialité · Région / Chefs-Lieux · Disponibilité -->
      <div style="background:rgba(15,23,42,0.75); border:1px solid rgba(45,212,191,0.28); border-radius:12px; padding:10px; margin-bottom:12px;">
        <div style="font-size:11.5px; font-weight:800; color:#2dd4bf; margin-bottom:7px;">🔍 Filtrer les Médecins &amp; Spécialistes (Menus Rapides)</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:7px; margin-bottom:7px;">
          <select id="pat-doc-spec-filter" class="form-input form-select" onchange="PGPatientCare.setDocFilter('specialty', this.value)" style="min-height:40px; font-size:12px;">
            <option value="all" ${docFilterSpecialty === 'all' ? 'selected' : ''}>🩺 Toutes Spécialités (${allDocs.length})</option>
            ${specSummary.map((s) => `<option value="${esc(s.specialty)}" ${docFilterSpecialty === s.specialty ? 'selected' : ''}>${esc(s.specialty)} (${s.total} · ${s.available} dispo)</option>`).join('')}
          </select>
          <select id="pat-doc-region-filter" class="form-input form-select" onchange="PGPatientCare.setDocFilter('region', this.value)" style="min-height:40px; font-size:12px;">
            <option value="all" ${docFilterRegion === 'all' ? 'selected' : ''}>🇨🇲 Tout le Cameroun (10 Régions)</option>
            <option value="capitals" ${docFilterRegion === 'capitals' ? 'selected' : ''}>⭐ Chefs-lieux de Régions (Grands Spécialistes)</option>
            ${MedecinStore.CAMEROON_REGIONS.map((r) => `<option value="${esc(r.region)}" ${docFilterRegion === r.region ? 'selected' : ''}>${esc(r.region)} — ${esc(r.capital)} ⭐</option>`).join('')}
          </select>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
          <label style="display:flex; align-items:center; gap:6px; font-size:11.5px; color:#cbd5e1; cursor:pointer;">
            <input type="checkbox" ${docFilterAvailOnly ? 'checked' : ''} onchange="PGPatientCare.setDocFilter('avail', this.checked)">
            <span>🟢 Disponibles maintenant uniquement</span>
          </label>
          <span style="font-size:11px; color:#94a3b8; font-weight:700;">${docs.length} praticien(s) affiché(s)</span>
        </div>
      </div>

      <!-- Liste des Médecins Multi-Spécialités & Disponibilité Live -->
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${docs.length === 0 ? `
          <div class="pharma-card" style="text-align:center; padding:20px; color:#94a3b8; font-size:12.5px;">
            Aucun médecin dans ce filtre exact. Essayez « 🇨🇲 Tout le Cameroun » ou cliquez sur <strong>🎲 Mode Aléatoire Rapide</strong> !
          </div>
        ` : docs.map((d) => {
          const eff = MedecinStore.getEffectiveAvailability(d);
          const specs = MedecinStore.getDoctorSpecialties(d);
          return `
            <div class="pharma-card">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:6px;">
                <div>
                  <div style="font-weight:800; font-size:15px; color:#fff;">
                    ${esc(d.title)} ${esc(d.full_name)} <span style="font-size:10.5px; color:#34d399;">✓ ONMC</span>
                    ${d.is_regional_capital ? '<span style="font-size:10px; color:#fbbf24; background:rgba(251,191,36,0.14); padding:1px 6px; border-radius:999px; margin-left:4px;">⭐ Chef-lieu</span>' : ''}
                  </div>
                  <div style="display:flex; flex-wrap:wrap; gap:4px; margin:5px 0;">
                    ${specs.map((sp) => `<span style="padding:2px 7px; border-radius:999px; background:rgba(56,189,248,0.15); border:1px solid rgba(56,189,248,0.38); color:#7dd3fc; font-size:10.5px; font-weight:700;">${esc(sp)}</span>`).join('')}
                  </div>
                  <div style="font-size:11.5px; color:#94a3b8;">🏥 ${esc(d.clinic_name || d.city)} · 📍 ${esc(d.city)} (${esc(d.region || 'Cameroun')})</div>
                  ${d.availability_note ? `<div style="font-size:11px; color:#cbd5e1; margin-top:3px;">💬 ${esc(d.availability_note)}</div>` : ''}
                </div>
                <span style="padding:3px 8px; border-radius:999px; font-size:10.5px; font-weight:800; background:${eff.bg}; color:${eff.badgeColor}; white-space:nowrap;">
                  ${esc(eff.shortLabel)}
                </span>
              </div>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button type="button" class="pharma-btn btn-call" onclick="PGPatientCare.openTeleconsultModal('${esc(d.id)}','${esc(specs[0])}')">⚡ Consulter (2 600 F)</button>
                <button type="button" class="pharma-btn btn-route" onclick="PGPatientCare.openBookApptModal('${esc(d.id)}','${esc(d.title + ' ' + d.full_name)}')">📅 Prendre RDV</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function setDocFilter(type, value) {
    if (type === 'specialty') docFilterSpecialty = value || 'all';
    else if (type === 'region') docFilterRegion = value || 'all';
    else if (type === 'avail') docFilterAvailOnly = !!value;
    renderCarePanel();
  }

  // ── VUE LABORATOIRES / HÔPITAUX / CLINIQUES ────────────────────
  function renderFacilitiesView(host, types, title) {
    if (!window.FacilityStore) return;
    const pos = getUserPos();
    const radius = getRadiusKm();
    const all = FacilityStore.getFacilities()
      .filter((f) => types.includes(f.facility_type))
      .map((f) => Object.assign({}, f, { distance: parseFloat(haversine(pos, f).toFixed(1)) }))
      .sort((a, b) => a.distance - b.distance);

    const inRadius = all.filter((f) => f.distance <= radius);
    const displayed = inRadius.length > 0 ? inRadius : all;

    host.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:6px;">
        <div style="font-weight:800; font-size:13.5px; color:#c4b5fd;">${title} (${displayed.length})</div>
        <span style="font-size:11px; color:#94a3b8;">${inRadius.length > 0 ? `Dans un rayon de ${radius} km` : `Élargi au Cameroun`}</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${displayed.map((f) => {
          const cleanPh = String(f.phone || '').replace(/\D/g, '').replace(/^237/, '');
          const promos = f.promotions || [];
          const svcs = f.services || [];
          return `
            <div class="pharma-card" style="border-color:${f.emergency_24_7 ? 'rgba(244,63,94,0.45)' : 'rgba(167,139,250,0.35)'};">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:8px;">
                <div>
                  <div style="font-weight:800; font-size:15px; color:#fff;">${esc(f.name)}</div>
                  <div style="font-size:12px; color:#94a3b8; margin-top:2px;">📍 ${esc(f.address || f.city)} · 🕒 ${esc(f.opening_hours || '')}</div>
                  <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
                    ${f.emergency_24_7 ? '<span style="padding:2px 8px;border-radius:999px;background:rgba(244,63,94,0.18);color:#fb7185;font-size:10.5px;font-weight:800;">🚨 Urgences 24/7</span>' : ''}
                    ${f.home_sampling ? '<span style="padding:2px 8px;border-radius:999px;background:rgba(45,212,191,0.16);color:#2dd4bf;font-size:10.5px;font-weight:800;">🏠 Prélèvement domicile</span>' : ''}
                    ${f.online_results ? '<span style="padding:2px 8px;border-radius:999px;background:rgba(56,189,248,0.16);color:#38bdf8;font-size:10.5px;font-weight:800;">📱 Résultats en ligne</span>' : ''}
                  </div>
                </div>
                <div style="text-align:right; flex-shrink:0;">
                  <div style="font-weight:800; font-size:16px; color:#34d399;">${f.distance}</div>
                  <div style="font-size:11px; color:#64748b;">km</div>
                </div>
              </div>

              ${promos.length > 0 ? promos.map((pr) => `
                <div style="padding:8px 10px; border-radius:10px; background:rgba(251,191,36,0.12); border:1px solid rgba(251,191,36,0.4); margin-bottom:8px; font-size:12px;">
                  <strong style="color:#fbbf24;">🎁 ${esc(pr.badge || 'PROMO')} · ${esc(pr.title)}</strong> — <span style="color:#34d399; font-weight:800;">${Number(pr.price || 0).toLocaleString('fr-FR')} F</span>
                  <div style="color:#cbd5e1; font-size:11px; margin-top:2px;">${esc(pr.desc)}</div>
                </div>
              `).join('') : ''}

              ${svcs.length > 0 ? `
                <div style="background:rgba(0,0,0,0.22); border-radius:10px; padding:8px 10px; margin-bottom:10px; font-size:12px;">
                  ${svcs.slice(0, 4).map((s) => `
                    <div style="display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px dashed rgba(255,255,255,0.06);">
                      <span style="color:#e2e8f0;">• ${esc(s.name)} <em style="color:#94a3b8;">(${esc(s.delay || '')})</em></span>
                      <strong style="color:#fbbf24;">${Number(s.price || 0).toLocaleString('fr-FR')} F</strong>
                    </div>
                  `).join('')}
                </div>
              ` : ''}

              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                ${cleanPh ? `<button type="button" class="pharma-btn btn-call" onclick="App.callPharmacy('${cleanPh}')">📞 Appeler</button>` : ''}
                ${cleanPh ? `<button type="button" class="pharma-btn btn-whatsapp" onclick="App.openWhatsApp('${cleanPh}')">💬 WhatsApp</button>` : ''}
                <button type="button" class="pharma-btn btn-route" onclick="App.getRoute(${Number(f.lat)}, ${Number(f.lng)}, '${esc(f.name).replace(/'/g, "\\'")}')">🧭 Y aller</button>
                <button type="button" class="pharma-btn" style="background:rgba(167,139,250,0.16); border:1px solid rgba(167,139,250,0.45); color:#c4b5fd;" onclick="PGPatientCare.openFacilityBookModal('${esc(f.id)}')">📅 RDV Examen</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // ── MODALE REQUÊTE TÉLÉCONSULTATION 2 600 FCFA (100 F + 2 500 F) ──
  function openTeleconsultModal(preferredDocId, specialty) {
    let modal = document.getElementById('patient-teleconsult-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'patient-teleconsult-modal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-content" style="max-width:480px;">
          <div class="modal-header">
            <h3 style="margin:0; font-size:16.5px; font-weight:900; color:#38bdf8;">🩺 Nouvelle Téléconsultation Médecin (48h)</h3>
            <button type="button" class="btn btn--icon" onclick="document.getElementById('patient-teleconsult-modal').classList.remove('active')">✕</button>
          </div>
          <div class="modal-body" style="padding:16px 20px;">
            <input type="hidden" id="tc-pref-doc">
            <div style="padding:10px 12px; border-radius:12px; background:rgba(16,185,129,0.1); border:1px solid rgba(52,211,153,0.35); margin-bottom:12px; font-size:12px; color:#cbd5e1;">
              💰 <strong style="color:#fbbf24;">Total : 2 600 FCFA</strong> · <strong>100 FCFA</strong> transférés vers NotchPay avant la recherche + <strong style="color:#34d399;">2 500 FCFA</strong> transférés directement au médecin disponible via OM/MoMo · <strong>Session ouverte 48h</strong>.
            </div>
            <div class="pa-grid-2" style="margin-bottom:10px;">
              <div class="form-group"><label class="form-label">Votre nom / prénom *</label><input type="text" id="tc-name" class="form-input" placeholder="Ex : Marie Ngo"></div>
              <div class="form-group"><label class="form-label">Âge</label><input type="number" id="tc-age" class="form-input" placeholder="Ex : 32"></div>
            </div>
            <div class="pa-grid-2" style="margin-bottom:10px;">
              <div class="form-group">
                <label class="form-label">Spécialité (ou Mode Aléatoire Rapide)</label>
                <select id="tc-specialty" class="form-input form-select">
                  <option value="any">🎲 Aléatoire — Premier Médecin Disponible (Instantané)</option>
                  ${(window.MedecinStore ? MedecinStore.SPECIALTIES : ['Médecine Générale']).map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Région / Couverture Cameroun</label>
                <select id="tc-region" class="form-input form-select">
                  <option value="all">🇨🇲 Tout le Cameroun (Auto)</option>
                  <option value="capitals">⭐ Chefs-lieux (Grands Spécialistes)</option>
                  ${(window.MedecinStore ? MedecinStore.CAMEROON_REGIONS : []).map((r) => `<option value="${esc(r.region)}">${esc(r.region)} (${esc(r.capital)})</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-group" style="margin-bottom:10px;">
              <label class="form-label">Décrivez vos symptômes *</label>
              <textarea id="tc-symptoms" class="form-input" rows="3" placeholder="Fièvre depuis 2 jours, maux de tête, frissons..."></textarea>
            </div>
            <div class="form-group" style="margin-bottom:10px;">
              <label class="form-label">Allergies / Traitements en cours (confidentiel)</label>
              <input type="text" id="tc-allergies" class="form-input" placeholder="Ex : Allergie pénicilline (ou Aucune)">
            </div>
            <div class="pa-grid-2" style="margin-bottom:14px;">
              <div class="form-group"><label class="form-label">Paiement Mobile Money *</label>
                <select id="tc-method" class="form-input form-select">
                  <option value="momo">MTN MoMo</option>
                  <option value="om">Orange Money</option>
                </select>
              </div>
              <div class="form-group"><label class="form-label">Votre N° OM / MoMo *</label><input type="tel" id="tc-phone" class="form-input" placeholder="6XX XXX XXX"></div>
            </div>
            <div id="tc-payment-feedback" style="display:none; padding:10px 12px; border-radius:10px; margin-bottom:12px; font-size:12px; line-height:1.45;"></div>
            <button type="button" id="btn-submit-teleconsult" class="btn btn--primary btn--block" onclick="PGPatientCare.submitTeleconsult()">
              ✅ Payer 2 600 FCFA &amp; Trouver un Médecin Disponible
            </button>
          </div>
        </div>
      `;
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
      document.body.appendChild(modal);
    }
    document.getElementById('tc-pref-doc').value = preferredDocId || '';
    if (specialty) document.getElementById('tc-specialty').value = specialty;
    const fb = document.getElementById('tc-payment-feedback');
    const btn = document.getElementById('btn-submit-teleconsult');
    const pending = window.MedecinStore && MedecinStore.getPendingConsultPayment && MedecinStore.getPendingConsultPayment();
    if (fb) {
      if (pending) {
        fb.style.display = 'block';
        fb.style.background = 'rgba(245,158,11,0.16)';
        fb.style.color = '#fde68a';
        fb.innerHTML = `⏳ Paiement 2 600 FCFA en attente (Réf. <code>${esc(pending.reference)}</code>). Validez votre PIN puis cliquez ci-dessous pour ouvrir la téléconsultation sans repayer.`;
      } else {
        fb.style.display = 'none';
        fb.innerHTML = '';
      }
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = pending
        ? '🔄 J\'ai payé — Vérifier & Ouvrir ma Téléconsultation'
        : '✅ Payer 2 600 FCFA & Trouver un Médecin Disponible';
    }
    modal.classList.add('active');
  }

  async function submitTeleconsult() {
    const btn = document.getElementById('btn-submit-teleconsult');
    const fb = document.getElementById('tc-payment-feedback');
    const setFb = (html, bg, color) => {
      if (!fb) return;
      fb.style.display = 'block';
      fb.style.background = bg || 'rgba(59,130,246,0.15)';
      fb.style.color = color || '#93c5fd';
      fb.innerHTML = html;
    };

    // 1. Si un paiement 2 600 FCFA est déjà en attente : vérifier sans jamais recréer de débit
    const pending = window.MedecinStore && MedecinStore.getPendingConsultPayment && MedecinStore.getPendingConsultPayment();
    if (pending) {
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Vérification NotchPay...'; }
      try {
        const res = await MedecinStore.verifyPendingConsultationPayment();
        if (res.confirmed && res.consultation) {
          activeConsultId = res.consultation.id;
          document.getElementById('patient-teleconsult-modal').classList.remove('active');
          notify(`✅ Paiement confirmé ! ${res.consultation.doctor_name} assigné (Session 48h ouverte).`, 'success');
          renderCarePanel();
          return;
        }
        if (res.failed) {
          setFb('❌ ' + esc(res.error), 'rgba(239,68,68,0.16)', '#fca5a5');
          if (btn) { btn.disabled = false; btn.textContent = '✅ Réessayer (2 600 FCFA via NotchPay)'; }
          return;
        }
        setFb(esc(res.error), 'rgba(245,158,11,0.16)', '#fde68a');
        if (btn) { btn.disabled = false; btn.textContent = '🔄 Revérifier mon paiement NotchPay'; }
      } catch (err) {
        setFb('❌ ' + esc(err.message), 'rgba(239,68,68,0.16)', '#fca5a5');
        if (btn) { btn.disabled = false; btn.textContent = '🔄 Revérifier mon paiement NotchPay'; }
      }
      return;
    }

    const symptoms = (document.getElementById('tc-symptoms')?.value || '').trim();
    const alias = (document.getElementById('tc-name')?.value || '').trim() || 'Patient';
    if (!symptoms) { notify('⚠️ Veuillez décrire vos symptômes.', 'error'); return; }

    if (btn) { btn.disabled = true; btn.textContent = '⏳ Connexion NotchPay (2 600 FCFA)...'; }
    try {
      const result = await MedecinStore.initiatePatientConsultation({
        patient_alias: alias,
        patient_age: document.getElementById('tc-age')?.value,
        specialty: document.getElementById('tc-specialty')?.value || 'any',
        region: document.getElementById('tc-region')?.value || 'all',
        preferred_doctor_id: document.getElementById('tc-pref-doc')?.value || null,
        symptoms,
        allergies: document.getElementById('tc-allergies')?.value,
        payment_method: document.getElementById('tc-method')?.value,
        patient_phone: document.getElementById('tc-phone')?.value
      }, {
        onStatus: (msg) => setFb(esc(msg), 'rgba(59,130,246,0.15)', '#93c5fd')
      });

      if (result && result.pending) {
        const checkoutLink = result.authorization_url
          ? `<a href="${esc(result.authorization_url)}" target="_blank" rel="noopener" class="btn btn--primary btn--sm btn--block" style="margin:8px 0; text-decoration:none;">🔐 Finaliser 2 600 FCFA sur NotchPay</a>`
          : '';
        setFb(`${esc(result.message)}${checkoutLink}`, 'rgba(245,158,11,0.16)', '#fde68a');
        if (btn) {
          btn.disabled = false;
          btn.textContent = '🔄 J\'ai payé — Vérifier & Ouvrir ma Téléconsultation';
        }
        if (result.redirect && result.authorization_url) {
          try { window.open(result.authorization_url, '_blank', 'noopener'); } catch (e) {}
        }
        return;
      }

      activeConsultId = result.id;
      document.getElementById('patient-teleconsult-modal').classList.remove('active');
      notify(`✅ ${result.doctor_name} assigné ! Session ouverte pendant 48h.`, 'success');
      renderCarePanel();
    } catch (err) {
      setFb('❌ ' + esc(err.message), 'rgba(239,68,68,0.16)', '#fca5a5');
      notify('❌ ' + err.message, 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = '✅ Payer 2 600 FCFA & Trouver un Médecin Disponible';
      }
    }
  }

  async function sendPatientMessage(consultId) {
    const inp = document.getElementById('pat-chat-input');
    if (!inp || !inp.value.trim()) return;
    await MedecinStore.addConsultationMessage(consultId, 'patient', 'Patient', inp.value.trim());
    inp.value = '';
    renderCarePanel();
  }

  // ── LIAISON DIRECTE 1-CLIC : ORDONNANCE MÉDECIN → RECHERCHE PHARMACIES ──
  function searchRxInPharmacies(rxId) {
    const rx = MedecinStore.getPrescriptions().find((r) => r.id === rxId);
    if (!rx || !rx.medications || !rx.medications.length) return;
    switchMode('pharmacies');
    const searchBtn = document.getElementById('search-btn');
    if (searchBtn) searchBtn.click();
    if (window.App && typeof App.addMedicine === 'function') {
      rx.medications.forEach((m) => App.addMedicine(m.name));
    }
    notify(`💊 ${rx.medications.length} médicament(s) de l'ordonnance ${rx.rx_code} chargés pour recherche en pharmacie !`, 'success');
  }

  async function openBookApptModal(docId, docName) {
    const patient = (window.PG && PG.promptModal) ? await PG.promptModal(`Rendez-vous avec ${docName}`, 'Votre nom et téléphone (ex: Marie Ngo - 699112233) :') : null;
    if (!patient) return;
    const when = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    await MedecinStore.bookAppointment({
      doctor_id: docId,
      doctor_name: docName,
      patient_name: patient,
      scheduled_at: when,
      mode: 'teleconsultation',
      reason: 'Rendez-vous patient Pharma-Garde'
    });
    notify(`📅 Demande de rendez-vous envoyée à ${docName} !`, 'success');
  }

  async function openFacilityBookModal(facId) {
    const fac = FacilityStore.getFacilities().find((f) => f.id === facId);
    if (!fac) return;
    const firstSvc = (fac.services && fac.services[0] && fac.services[0].name) || 'Bilan / Examen Médical';
    const patient = (window.PG && PG.promptModal)
      ? await PG.promptModal(`RDV — ${fac.name}`, `Indiquez votre nom et l'examen souhaité (ex: Jean Paul — ${firstSvc}) :`)
      : null;
    if (!patient) return;
    FacilityStore.bookFacilityService({
      facility_id: fac.id,
      facility_name: fac.name,
      patient_name: patient,
      service_name: firstSvc,
      home_sampling: !!fac.home_sampling
    });
    notify(`📅 Demande d'examen envoyée à ${fac.name} !`, 'success');
  }

  function mountPatientHub() {
    const content = document.querySelector('#bottom-sheet .bottom-sheet__content');
    const mainActions = document.getElementById('main-actions');
    if (!content || !mainActions || document.getElementById('patient-hub-tabs')) return;

    const tabs = document.createElement('div');
    tabs.id = 'patient-hub-tabs';
    tabs.className = 'patient-hub-tabs';
    tabs.innerHTML = `
      <button type="button" class="patient-hub-tab active" data-hub-mode="pharmacies" onclick="PGPatientCare.switchMode('pharmacies')"><span>💊</span><span>Pharmacies</span></button>
      <button type="button" class="patient-hub-tab" data-hub-mode="doctors" onclick="PGPatientCare.switchMode('doctors')"><span>🩺</span><span>Médecins</span></button>
      <button type="button" class="patient-hub-tab" data-hub-mode="labs" onclick="PGPatientCare.switchMode('labs')"><span>🔬</span><span>Labos</span></button>
      <button type="button" class="patient-hub-tab" data-hub-mode="hospitals" onclick="PGPatientCare.switchMode('hospitals')"><span>🏥</span><span>Hôpitaux</span></button>
      <button type="button" class="patient-hub-tab" data-hub-mode="dmp" onclick="PGPatientCare.switchMode('dmp')" style="position:relative;"><span>📁</span><span>Carnet</span><span id="patient-dmp-unread-badge" class="dmp-unread-pill" style="display:none;"></span></button>
    `;
    content.insertBefore(tabs, mainActions);
    if (window.PGPatientDmpUI) PGPatientDmpUI.updateUnreadBadge();

    const panel = document.createElement('div');
    panel.id = 'patient-care-panel';
    panel.style.display = 'none';
    content.appendChild(panel);

    // Mettre à jour les marqueurs labos/hôpitaux lors du changement de rayon
    document.querySelectorAll('.radius-pill').forEach((p) => {
      p.addEventListener('click', () => {
        setTimeout(() => {
          updateFacilityMarkersOnMap();
          if (currentMode !== 'pharmacies') renderCarePanel();
        }, 120);
      });
    });
  }

  window.PGPatientCare = {
    switchMode,
    getMode: () => currentMode,
    setDocFilter,
    openTeleconsultModal,
    submitTeleconsult,
    sendPatientMessage,
    searchRxInPharmacies,
    openBookApptModal,
    openFacilityBookModal,
    updateFacilityMarkersOnMap
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountPatientHub);
  else mountPatientHub();
})(window);

