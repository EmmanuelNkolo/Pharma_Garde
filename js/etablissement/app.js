/**
 * Pharma-Garde v12.0 — Contrôleur Principal Espace Laboratoires, Hôpitaux & Cliniques
 * Expose : window.FacilityApp
 */
(function (window) {
  'use strict';

  let currentFacility = null;
  let activeTab = 'services';

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function toast(msg, type) {
    const t = document.getElementById('toast'), m = document.getElementById('toast-message');
    if (!t || !m) return;
    t.className = 'toast toast--' + (type || 'success');
    m.textContent = (window.I18n && I18n.translateText) ? I18n.translateText(String(msg || '')) : msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 3600);
  }

  function init() {
    document.querySelectorAll('[data-fac-view]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.preventDefault();
        const v = b.getAttribute('data-fac-view');
        ['login', 'register'].forEach((k) => document.getElementById('fac-' + k + '-form')?.classList.toggle('hidden', k !== v));
      });
    });

    document.querySelectorAll('[data-demo-fac]').forEach((b) => {
      b.addEventListener('click', () => {
        const list = FacilityStore.getFacilities();
        const found = list.find((f) => f.id === b.getAttribute('data-demo-fac')) || list[0];
        if (found) {
          FacilityStore.saveSession(found);
          currentFacility = found;
          showDashboard();
          toast(`✅ Connecté à ${found.name}`, 'success');
        }
      });
    });

    document.getElementById('btn-fac-login')?.addEventListener('click', async () => {
      try {
        currentFacility = await FacilityStore.loginFacility(
          document.getElementById('fac-login-email').value,
          document.getElementById('fac-login-password').value
        );
        showDashboard();
        toast(`✅ Bienvenue, ${currentFacility.name}`, 'success');
      } catch (err) { toast('❌ ' + err.message, 'error'); }
    });

    document.getElementById('btn-fac-gps')?.addEventListener('click', async () => {
      if (!window.PG || !PG.locate) return;
      toast('📡 Capture GPS haute précision...', 'info');
      try {
        const fix = await PG.locate({ desired: 30, maxWait: 15000 });
        document.getElementById('fac-reg-lat').value = fix.lat.toFixed(6);
        document.getElementById('fac-reg-lng').value = fix.lng.toFixed(6);
        toast(`📍 Position GPS capturée (±${fix.accuracy} m)`, 'success');
      } catch (e) { toast('⚠️ GPS indisponible : les coordonnées de la ville seront utilisées.', 'info'); }
    });

    document.getElementById('btn-fac-register')?.addEventListener('click', async () => {
      try {
        currentFacility = await FacilityStore.registerFacility({
          facility_type: document.getElementById('fac-reg-type').value,
          name: document.getElementById('fac-reg-name').value,
          director_name: document.getElementById('fac-reg-director').value,
          license_number: document.getElementById('fac-reg-license').value,
          city: document.getElementById('fac-reg-city').value,
          quarter: document.getElementById('fac-reg-quarter').value,
          lat: document.getElementById('fac-reg-lat').value,
          lng: document.getElementById('fac-reg-lng').value,
          phone: document.getElementById('fac-reg-phone').value,
          email: document.getElementById('fac-reg-email').value,
          password: document.getElementById('fac-reg-password').value,
          opening_hours: document.getElementById('fac-reg-hours').value,
          emergency_24_7: document.getElementById('fac-reg-emerg').checked,
          home_sampling: document.getElementById('fac-reg-home').checked
        });
        showDashboard();
        toast('🎉 Établissement enregistré (14j d\'essai gratuit · Visible par les patients) !', 'success');
      } catch (err) { toast('❌ ' + err.message, 'error'); }
    });

    document.getElementById('btn-fac-logout')?.addEventListener('click', () => {
      FacilityStore.clearSession();
      window.location.reload();
    });

    const saved = FacilityStore.loadSession();
    if (saved) { currentFacility = saved; showDashboard(); }
  }

  function showDashboard() {
    document.getElementById('fac-login-screen')?.classList.add('hidden');
    document.getElementById('fac-dashboard')?.classList.remove('hidden');
    const nm = document.getElementById('fac-header-name');
    if (nm) nm.textContent = currentFacility.name;
    const typeLabels = { laboratory: '🔬 Laboratoire d\'Analyses', hospital: '🏥 Hôpital', clinic: '🏨 Clinique', imaging: '🩻 Imagerie' };
    const meta = document.getElementById('fac-header-meta');
    if (meta) meta.textContent = `${typeLabels[currentFacility.facility_type] || 'Établissement'} · ${currentFacility.city}`;
    if (window.PGSubscription) {
      PGSubscription.renderHeaderBadge('fac-sub-badge-slot', currentFacility, 'facility');
      PGSubscription.checkAndShowReminders(currentFacility, 'facility', 'fac-reminder-banner');
    }
    switchTab('analyses');
  }

  function switchTab(tab) {
    activeTab = tab;
    ['analyses', 'connector', 'services', 'promos', 'bookings', 'profile'].forEach((t) => {
      document.getElementById('ftab-' + t)?.classList.toggle('active', t === tab);
      const p = document.getElementById('fpanel-' + t);
      if (p) p.style.display = (t === tab) ? 'block' : 'none';
    });
    if (tab === 'analyses' && window.PGLabManager) PGLabManager.renderAnalysesPanel(document.getElementById('fpanel-analyses'), currentFacility);
    else if (tab === 'connector' && window.PGLabManager) PGLabManager.renderConnectorPanel(document.getElementById('fpanel-connector'), currentFacility);
    else if (tab === 'services') renderServicesPanel();
    else if (tab === 'promos') renderPromosPanel();
    else if (tab === 'bookings') renderBookingsPanel();
    else renderProfilePanel();
  }

  function openPatientDmp() {
    if (!currentFacility || !window.PGPatientDMP) return;
    PGPatientDMP.openProfessionalDmpViewer(currentFacility.facility_type || 'laboratory', currentFacility.name);
  }

  function persistFacility() {
    if (!currentFacility) return;
    FacilityStore.saveSession(currentFacility);
    if (window.supabase && !String(currentFacility.id).startsWith('fac_cpc')) {
      try {
        window.supabase.from('health_facilities').update({
          services: currentFacility.services,
          promotions: currentFacility.promotions,
          opening_hours: currentFacility.opening_hours,
          emergency_24_7: currentFacility.emergency_24_7,
          home_sampling: currentFacility.home_sampling
        }).eq('id', currentFacility.id);
      } catch (e) {}
    }
  }

  function renderServicesPanel() {
    const host = document.getElementById('fpanel-services');
    if (!host || !currentFacility) return;
    const list = currentFacility.services || [];
    host.innerHTML = `
      <div class="pharm-card" style="margin-bottom:14px;">
        <h3 style="margin:0 0 10px; font-size:15px; font-weight:800; color:#c4b5fd;">➕ Ajouter un Examen / Service Médical Visible par les Patients</h3>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:8px; margin-bottom:10px;">
          <input type="text" id="fsvc-name" class="form-input" placeholder="Nom examen / service * (ex: NFS, Écho)">
          <input type="text" id="fsvc-cat" class="form-input" placeholder="Catégorie (ex: Biochimie, Urgences)">
          <input type="number" id="fsvc-price" class="form-input" placeholder="Tarif (FCFA)" value="5000">
          <input type="text" id="fsvc-delay" class="form-input" placeholder="Délai résultat (ex: 2h, Immédiat)">
        </div>
        <button type="button" class="btn btn--primary btn--sm" onclick="FacilityApp.addService()">+ Publier ce Service</button>
      </div>
      <div class="pharm-card">
        <h3 style="margin:0 0 12px; font-size:15px; font-weight:800; color:#34d399;">🔬 Catalogue de vos Services &amp; Examens (${list.length})</h3>
        <div class="pharm-table-wrap">
          <table class="pharm-table">
            <thead><tr><th>Service / Examen</th><th>Catégorie</th><th>Tarif</th><th>Délai</th><th>Action</th></tr></thead>
            <tbody>
              ${list.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">Ajoutez vos examens et spécialités ci-dessus.</td></tr>' : list.map((s) => `
                <tr>
                  <td><strong>${esc(s.name)}</strong></td>
                  <td>${esc(s.category || 'Général')}</td>
                  <td><strong style="color:#fbbf24;">${Number(s.price || 0).toLocaleString('fr-FR')} FCFA</strong></td>
                  <td>${esc(s.delay || '—')}</td>
                  <td><button type="button" class="btn btn--sm" onclick="FacilityApp.removeService('${esc(s.id)}')" style="background:rgba(239,68,68,0.14);color:#f87171;border:1px solid rgba(239,68,68,0.3);">Supprimer</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function addService() {
    const name = (document.getElementById('fsvc-name')?.value || '').trim();
    if (!name) { toast('⚠️ Nom du service ou examen requis.', 'error'); return; }
    currentFacility.services = currentFacility.services || [];
    currentFacility.services.unshift({
      id: 'svc_' + Date.now(),
      name,
      category: (document.getElementById('fsvc-cat')?.value || '').trim() || 'Analyses / Soins',
      price: Number(document.getElementById('fsvc-price')?.value) || 0,
      delay: (document.getElementById('fsvc-delay')?.value || '').trim() || '2h'
    });
    persistFacility();
    toast('✅ Service publié et visible immédiatement sur la carte patient !', 'success');
    renderServicesPanel();
  }

  function removeService(id) {
    currentFacility.services = (currentFacility.services || []).filter((s) => s.id !== id);
    persistFacility();
    renderServicesPanel();
  }

  function renderPromosPanel() {
    const host = document.getElementById('fpanel-promos');
    if (!host || !currentFacility) return;
    const promos = currentFacility.promotions || [];
    host.innerHTML = `
      <div class="pharm-card" style="margin-bottom:14px;">
        <h3 style="margin:0 0 10px; font-size:15px; font-weight:800; color:#fbbf24;">📢 Promouvoir un Bilan de Santé ou Service Spécial</h3>
        <div class="pa-grid-2" style="margin-bottom:8px;">
          <input type="text" id="fpro-title" class="form-input" placeholder="Titre (ex: Bilan Santé Complet -20%) *">
          <div style="display:flex; gap:8px;">
            <input type="number" id="fpro-price" class="form-input" placeholder="Tarif Promo (FCFA)" value="20000">
            <input type="text" id="fpro-badge" class="form-input" placeholder="Badge (-20%)" value="-20%" style="max-width:110px;">
          </div>
        </div>
        <textarea id="fpro-desc" class="form-input" rows="2" placeholder="Détails de l'offre (examens inclus, horaires, prélèvement à domicile...) *" style="margin-bottom:10px;"></textarea>
        <button type="button" class="btn btn--primary btn--sm" onclick="FacilityApp.addPromo()">📢 Diffuser la Promotion aux Patients</button>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(290px, 1fr)); gap:12px;">
        ${promos.length === 0 ? '<div class="pharm-card" style="color:#94a3b8;">Aucune promotion active.</div>' : promos.map((p) => `
          <div class="pharm-card" style="border-color:rgba(251,191,36,0.45);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="padding:3px 9px; border-radius:999px; background:rgba(251,191,36,0.18); color:#fbbf24; font-size:11px; font-weight:900;">${esc(p.badge || 'PROMO')}</span>
              <strong style="color:#34d399;">${Number(p.price || 0).toLocaleString('fr-FR')} FCFA</strong>
            </div>
            <div style="font-weight:800; color:#fff; font-size:14.5px; margin-bottom:4px;">${esc(p.title)}</div>
            <div style="font-size:12px; color:#cbd5e1; margin-bottom:10px;">${esc(p.desc)}</div>
            <button type="button" class="btn btn--sm" onclick="FacilityApp.removePromo('${esc(p.id)}')" style="background:rgba(239,68,68,0.14);color:#f87171;border:1px solid rgba(239,68,68,0.3);">Supprimer</button>
          </div>
        `).join('')}
      </div>
    `;
  }

  function addPromo() {
    const title = (document.getElementById('fpro-title')?.value || '').trim();
    const desc = (document.getElementById('fpro-desc')?.value || '').trim();
    if (!title) { toast('⚠️ Titre de la promotion requis.', 'error'); return; }
    currentFacility.promotions = currentFacility.promotions || [];
    currentFacility.promotions.unshift({
      id: 'fp_' + Date.now(),
      title,
      desc,
      price: Number(document.getElementById('fpro-price')?.value) || 0,
      badge: (document.getElementById('fpro-badge')?.value || '').trim() || 'PROMO'
    });
    persistFacility();
    toast('📢 Promotion diffusée auprès des patients de votre rayon !', 'success');
    renderPromosPanel();
  }

  function removePromo(id) {
    currentFacility.promotions = (currentFacility.promotions || []).filter((p) => p.id !== id);
    persistFacility();
    renderPromosPanel();
  }

  function renderBookingsPanel() {
    const host = document.getElementById('fpanel-bookings');
    if (!host || !currentFacility) return;
    const all = FacilityStore.getBookings().filter((b) => b.facility_id === currentFacility.id || (window.PGAdmin && PGAdmin.isAdmin()));
    host.innerHTML = `
      <div class="pharm-card">
        <h3 style="margin:0 0 12px; font-size:15px; font-weight:800; color:#38bdf8;">📅 Demandes de Rendez-Vous Examens &amp; Prélèvements (${all.length})</h3>
        ${all.length === 0 ? '<div style="text-align:center; padding:26px; color:#94a3b8;">Aucune demande de rendez-vous reçue pour le moment.</div>' : all.map((b) => `
          <div style="padding:12px; border-radius:12px; background:rgba(15,23,42,0.65); border:1px solid rgba(148,163,184,0.2); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
              <div style="font-weight:800; color:#fff;">👤 ${esc(b.patient_name)} · 📞 ${esc(b.patient_phone || '—')}</div>
              <div style="font-size:12px; color:#2dd4bf;">🔬 ${esc(b.service_name)} · 📅 ${esc(b.preferred_date)} ${b.home_sampling ? '· 🏠 Prélèvement à domicile' : ''}</div>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button type="button" class="btn btn--primary btn--sm" onclick="FacilityApp.setBookingStatus('${esc(b.id)}','confirmed')">✅ Confirmer</button>
              <button type="button" class="btn btn--secondary btn--sm" onclick="PGLabManager && PGLabManager.prefillFromBooking('${esc(b.patient_name).replace(/'/g, "\\'")}','${esc(b.patient_phone || '')}','${esc(b.service_name).replace(/'/g, "\\'")}')" style="color:#c4b5fd; border-color:rgba(167,139,250,0.45);">🧪 Créer Analyse</button>
              <button type="button" class="btn btn--secondary btn--sm" onclick="FacilityApp.setBookingStatus('${esc(b.id)}','completed')">🏁 Réalisé</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function setBookingStatus(id, status) {
    const list = FacilityStore.getBookings();
    const item = list.find((b) => b.id === id);
    if (item) { item.status = status; FacilityStore.saveBookings(list); toast('✅ Rendez-vous mis à jour.', 'success'); renderBookingsPanel(); }
  }

  function renderProfilePanel() {
    const host = document.getElementById('fpanel-profile');
    if (!host || !currentFacility) return;
    host.innerHTML = `
      <div class="pharm-card" style="max-width:640px; margin:0 auto;">
        <h3 style="margin:0 0 12px; font-size:15px; font-weight:800; color:#fbbf24;">🗺️ Coordonnées GPS, Services Clés &amp; Abonnement</h3>
        <p style="font-size:12.5px; color:#cbd5e1; margin-bottom:12px;">
          📍 GPS exact : <strong>${Number(currentFacility.lat).toFixed(5)}, ${Number(currentFacility.lng).toFixed(5)}</strong> (${esc(currentFacility.address || currentFacility.city)})<br>
          🪪 Agrément MINSANTE : <strong>${esc(currentFacility.license_number)}</strong>
        </p>
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label">Horaires d'ouverture</label>
          <input type="text" id="fprof-hours" class="form-input" value="${esc(currentFacility.opening_hours || '')}">
        </div>
        <div style="display:flex; gap:14px; flex-wrap:wrap; margin-bottom:14px;">
          <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="checkbox" id="fprof-emerg" ${currentFacility.emergency_24_7 ? 'checked' : ''}> 🚨 Urgences 24h/24</label>
          <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="checkbox" id="fprof-home" ${currentFacility.home_sampling ? 'checked' : ''}> 🏠 Prélèvement à domicile</label>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn btn--primary btn--sm" onclick="FacilityApp.saveProfile()">💾 Sauvegarder</button>
          <button type="button" class="btn btn--secondary btn--sm" onclick="PGSubscription && PGSubscription.openPaywallModal(FacilityApp.getCurrentFacility(), 'facility')">💳 Gérer l'Abonnement Pro</button>
        </div>
      </div>
    `;
  }

  function saveProfile() {
    currentFacility.opening_hours = document.getElementById('fprof-hours')?.value || currentFacility.opening_hours;
    currentFacility.emergency_24_7 = !!document.getElementById('fprof-emerg')?.checked;
    currentFacility.home_sampling = !!document.getElementById('fprof-home')?.checked;
    persistFacility();
    toast('✅ Profil établissement mis à jour !', 'success');
  }

  async function adminEnter() {
    const list = FacilityStore.getFacilities();
    currentFacility = Object.assign({}, list[0], { _isAdminPreview: true });
    FacilityStore.saveSession(currentFacility);
    showDashboard();
  }

  document.addEventListener('DOMContentLoaded', init);

  window.FacilityApp = {
    switchTab,
    addService,
    removeService,
    addPromo,
    removePromo,
    setBookingStatus,
    saveProfile,
    openPatientDmp,
    adminEnter,
    getCurrentFacility: () => currentFacility
  };
})(window);

