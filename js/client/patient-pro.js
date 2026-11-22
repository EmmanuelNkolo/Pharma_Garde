/**
 * Pharma-Garde v11.0 — Espace Patient Pro
 * ─────────────────────────────────────────────────────────────────
 * 1. Comparateur automatique des réponses officines (score global :
 *    disponibilité complète, assurance acceptée, prix estimé, distance GPS)
 * 2. Historique d'ordonnances & rappels de prise (100 % local / privé)
 * 3. Bouton 🚨 SOS Urgence / SAMU / Pharmacie de garde la plus proche en 1 clic
 *
 * Expose : window.PGPatientPro
 */
(function (window) {
  'use strict';

  const RX_HISTORY_KEY = 'pharmagarde_patient_rx_history_v11';
  const REMINDERS_KEY = 'pharmagarde_patient_reminders_v11';
  let currentSortMode = 'best'; // best | availability | insurance | distance | price
  let reminderLoop = null;
  let lastNotifiedMin = '';

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function notify(msg, type) {
    if (window.App && typeof window.App.showToast === 'function') {
      window.App.showToast(msg, type || 'info');
    } else if (window.PG && typeof window.PG.toast === 'function') {
      window.PG.toast(msg, type || 'info');
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 1. COMPARATEUR AUTOMATIQUE DES RÉPONSES OFFICINES
  // ════════════════════════════════════════════════════════════════
  function scoreResponse(resp, userPos, findPharmacyFn) {
    const entries = Object.entries(resp.medicines_status || {});
    const totalMeds = entries.length || 1;
    let inStockCount = 0;
    let insuredCount = 0;
    entries.forEach(([, st]) => {
      const s = String(st || '');
      if (s.startsWith('en_stock')) inStockCount++;
      if (s === 'en_stock_assure') insuredCount++;
    });

    const availabilityPct = Math.round((inStockCount / totalMeds) * 100);
    const insuredPct = Math.round((insuredCount / totalMeds) * 100);

    let distanceKm = 99;
    const p = typeof findPharmacyFn === 'function' ? findPharmacyFn(resp.pharmacy_id) : null;
    if (userPos && p && p.lat && p.lng && window.Geolocation && typeof Geolocation.haversine === 'function') {
      distanceKm = parseFloat(Geolocation.haversine(userPos.lat, userPos.lng, p.lat, p.lng).toFixed(1));
    }

    // Prix estimé (fourni par l'officine ou estimation indicative FCFA)
    const estimatedPrice = Number(resp.estimated_price || resp.total_price || (inStockCount * 2200));

    // Score global sur 100 : 50% disponibilité, 20% assurance, 20% proximité, 10% prix
    const distScore = Math.max(0, 100 - Math.min(distanceKm, 20) * 5);
    const priceScore = Math.max(0, 100 - Math.min(estimatedPrice / 500, 100));
    const globalScore = Math.round(
      availabilityPct * 0.50 +
      insuredPct * 0.20 +
      distScore * 0.20 +
      priceScore * 0.10
    );

    return {
      availabilityPct,
      insuredPct,
      inStockCount,
      totalMeds,
      distanceKm,
      estimatedPrice,
      globalScore
    };
  }

  function sortResponses(responses, userPos, findPharmacyFn) {
    const decorated = (responses || []).map((r) => ({
      resp: r,
      meta: scoreResponse(r, userPos, findPharmacyFn)
    }));

    decorated.sort((a, b) => {
      if (currentSortMode === 'availability') {
        if (b.meta.availabilityPct !== a.meta.availabilityPct) return b.meta.availabilityPct - a.meta.availabilityPct;
        return a.meta.distanceKm - b.meta.distanceKm;
      }
      if (currentSortMode === 'insurance') {
        if (b.meta.insuredPct !== a.meta.insuredPct) return b.meta.insuredPct - a.meta.insuredPct;
        return b.meta.globalScore - a.meta.globalScore;
      }
      if (currentSortMode === 'distance') {
        return a.meta.distanceKm - b.meta.distanceKm;
      }
      if (currentSortMode === 'price') {
        return a.meta.estimatedPrice - b.meta.estimatedPrice;
      }
      // best : score global
      if (b.meta.globalScore !== a.meta.globalScore) return b.meta.globalScore - a.meta.globalScore;
      return a.meta.distanceKm - b.meta.distanceKm;
    });

    return decorated;
  }

  function renderComparatorBar(count) {
    const btns = [
      { id: 'best', label: '🏆 Meilleur Score' },
      { id: 'availability', label: '✅ 100% Dispo' },
      { id: 'insurance', label: '🛡️ Assurance' },
      { id: 'distance', label: '📍 Plus proche' },
      { id: 'price', label: '💰 Prix estimé' }
    ];
    return `
      <div class="pg-comparator-bar" style="background:rgba(15,23,42,0.82); border:1px solid rgba(52,211,153,0.35); border-radius:12px; padding:10px 12px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:11.5px; font-weight:800; color:#fbbf24; text-transform:uppercase;">⚖️ Comparateur Automatique (${count})</span>
          <span style="font-size:10.5px; color:#94a3b8;">Tri intelligent multi-critères</span>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${btns.map((b) => `
            <button type="button" onclick="PGPatientPro.setSortMode('${b.id}')" style="padding:5px 9px; border-radius:999px; font-size:11px; font-weight:700; cursor:pointer; border:1px solid ${currentSortMode === b.id ? '#34d399' : 'rgba(148,163,184,0.25)'}; background:${currentSortMode === b.id ? 'rgba(16,185,129,0.22)' : 'rgba(255,255,255,0.04)'}; color:${currentSortMode === b.id ? '#34d399' : '#cbd5e1'};">
              ${b.label}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderScoreBadge(meta) {
    const color = meta.globalScore >= 80 ? '#34d399' : (meta.globalScore >= 55 ? '#fbbf24' : '#f87171');
    const bg = meta.globalScore >= 80 ? 'rgba(16,185,129,0.16)' : (meta.globalScore >= 55 ? 'rgba(251,191,36,0.15)' : 'rgba(239,68,68,0.15)');
    const tags = [
      `Score ${meta.globalScore}%`,
      `${meta.availabilityPct}% dispo`,
      meta.insuredPct > 0 ? 'Assuré' : null,
      `~${meta.estimatedPrice.toLocaleString('fr-FR')} F`
    ].filter(Boolean).join(' · ');
    return `<div style="display:inline-flex; align-items:center; gap:6px; margin-top:4px; padding:3px 9px; border-radius:999px; background:${bg}; border:1px solid ${color}; color:${color}; font-size:10.5px; font-weight:800;">⚖️ ${esc(tags)}</div>`;
  }

  function setSortMode(mode) {
    currentSortMode = mode || 'best';
    if (window.App && typeof window.App.renderPatientResponses === 'function') {
      window.App.renderPatientResponses();
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 2. HISTORIQUE D'ORDONNANCES & RAPPELS DE PRISE (100 % LOCAL)
  // ════════════════════════════════════════════════════════════════
  function getRxHistory() {
    try { return JSON.parse(localStorage.getItem(RX_HISTORY_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveRxHistory(list) {
    try { localStorage.setItem(RX_HISTORY_KEY, JSON.stringify(list.slice(0, 60))); } catch (e) {}
  }
  function recordPrescriptionSearch(medicines, insuranceName) {
    if (!Array.isArray(medicines) || !medicines.length) return;
    const list = getRxHistory();
    list.unshift({
      id: 'rx_' + Date.now(),
      date: new Date().toISOString(),
      medicines: medicines.slice(),
      insurance: insuranceName || '',
      note: ''
    });
    saveRxHistory(list);
  }

  function getReminders() {
    try { return JSON.parse(localStorage.getItem(REMINDERS_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveReminders(list) {
    try { localStorage.setItem(REMINDERS_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function startReminderWatcher() {
    if (reminderLoop) return;
    reminderLoop = setInterval(() => {
      const now = new Date();
      const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      const key = todayStr() + '_' + hhmm;
      if (key === lastNotifiedMin) return;
      const list = getReminders().filter((r) => r.active !== false);
      const due = list.filter((r) => (r.times || []).includes(hhmm));
      if (due.length > 0) {
        lastNotifiedMin = key;
        const names = due.map((d) => `${d.medicine} (${d.dosage || '1 prise'})`).join(', ');
        notify(`⏰ Rappel médicament (${hhmm}) : ${names}`, 'info');
        if (window.PG && typeof PG.sound === 'function') PG.sound();
        if ('Notification' in window && Notification.permission === 'granted') {
          try { new Notification('Pharma-Garde — Rappel de prise', { body: names, icon: 'icon-192.png' }); } catch (e) {}
        }
      }
    }, 20000);
  }

  let activeCarnetTab = 'reminders';

  function openCarnetModal(tab) {
    activeCarnetTab = tab || 'reminders';
    let modal = document.getElementById('patient-carnet-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'patient-carnet-modal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-content" style="max-width:560px;">
          <div class="modal-header">
            <div>
              <h3 style="margin:0; font-size:16.5px; font-weight:800; color:#34d399;">📋 Carnet Ordonnances &amp; Rappels de Prise</h3>
              <div style="font-size:11px; color:#94a3b8; margin-top:2px;">🔒 Stockage 100 % local &amp; privé sur votre appareil</div>
            </div>
            <button type="button" class="btn btn--icon" onclick="document.getElementById('patient-carnet-modal').classList.remove('active')">✕</button>
          </div>
          <div style="display:flex; gap:8px; padding:10px 18px; border-bottom:1px solid var(--border-default); background:rgba(0,0,0,0.2);">
            <button type="button" class="time-pill-btn active" id="carnet-tab-reminders" onclick="PGPatientPro.switchCarnetTab('reminders')">⏰ Rappels de Prise</button>
            <button type="button" class="time-pill-btn" id="carnet-tab-history" onclick="PGPatientPro.switchCarnetTab('history')">📜 Historique Ordonnances</button>
          </div>
          <div class="modal-body" id="patient-carnet-body" style="padding:16px 18px;"></div>
        </div>
      `;
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
      document.body.appendChild(modal);
    }
    modal.classList.add('active');
    renderCarnetBody();
  }

  function switchCarnetTab(tab) {
    activeCarnetTab = tab;
    const b1 = document.getElementById('carnet-tab-reminders');
    const b2 = document.getElementById('carnet-tab-history');
    if (b1) b1.classList.toggle('active', tab === 'reminders');
    if (b2) b2.classList.toggle('active', tab === 'history');
    renderCarnetBody();
  }

  function renderCarnetBody() {
    const body = document.getElementById('patient-carnet-body');
    if (!body) return;

    if (activeCarnetTab === 'reminders') {
      const reminders = getReminders();
      const today = todayStr();
      body.innerHTML = `
        <div style="background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.28); border-radius:12px; padding:12px; margin-bottom:14px;">
          <div style="font-size:12px; font-weight:800; color:#34d399; margin-bottom:8px;">➕ Nouveau Rappel de Prise</div>
          <div class="pa-grid-2" style="margin-bottom:8px;">
            <input type="text" id="rem-med-name" class="form-input" placeholder="Médicament (ex: Coartem)">
            <input type="text" id="rem-dosage" class="form-input" placeholder="Posologie (ex: 1 cp matin/soir)">
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <input type="time" id="rem-time-1" class="form-input" value="08:00" style="flex:1; min-width:105px;">
            <input type="time" id="rem-time-2" class="form-input" value="20:00" style="flex:1; min-width:105px;">
            <button type="button" class="btn btn--primary btn--sm" onclick="PGPatientPro.addReminder()">+ Programmer</button>
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${reminders.length === 0 ? '<div style="text-align:center; padding:20px; color:#94a3b8; font-size:13px;">Aucun rappel programmé. Ajoutez votre traitement ci-dessus.</div>' : reminders.map((r) => {
            const takenToday = (r.takenDates || []).includes(today);
            return `
              <div style="background:rgba(30,41,59,0.6); border:1px solid ${takenToday ? 'rgba(16,185,129,0.5)' : 'rgba(148,163,184,0.18)'}; border-radius:12px; padding:12px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                <div>
                  <div style="font-weight:800; font-size:14px; color:#fff;">💊 ${esc(r.medicine)} <span style="font-size:12px; color:#94a3b8; font-weight:600;">· ${esc(r.dosage || '1 prise')}</span></div>
                  <div style="font-size:12px; color:#fbbf24; margin-top:3px;">⏰ ${(r.times || []).map(esc).join(' · ')}</div>
                </div>
                <div style="display:flex; gap:6px;">
                  <button type="button" class="btn btn--sm" onclick="PGPatientPro.toggleTakenToday('${esc(r.id)}')" style="background:${takenToday ? '#10b981' : 'rgba(16,185,129,0.15)'}; color:${takenToday ? '#0f172a' : '#34d399'}; border:1px solid rgba(16,185,129,0.4); font-weight:800;">
                    ${takenToday ? '✅ Pris aujourd\'hui' : 'Marquer pris'}
                  </button>
                  <button type="button" class="btn btn--sm" onclick="PGPatientPro.deleteReminder('${esc(r.id)}')" style="background:rgba(239,68,68,0.12); color:#f87171; border:1px solid rgba(239,68,68,0.3);">🗑️</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      const history = getRxHistory();
      body.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <span style="font-size:12.5px; color:#94a3b8;">${history.length} ordonnance(s) enregistrée(s) localement</span>
          ${history.length > 0 ? '<button type="button" class="btn btn--sm btn--secondary" onclick="PGPatientPro.clearRxHistory()" style="color:#f87171; border-color:rgba(239,68,68,0.35);">Effacer historique</button>' : ''}
        </div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${history.length === 0 ? '<div style="text-align:center; padding:24px; color:#94a3b8; font-size:13px;">Vos recherches et scans d\'ordonnances apparaîtront ici automatiquement.</div>' : history.map((h) => `
            <div style="background:rgba(30,41,59,0.55); border:1px solid rgba(148,163,184,0.18); border-radius:12px; padding:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span style="font-size:12px; font-weight:700; color:#fbbf24;">📅 ${esc(new Date(h.date).toLocaleString('fr-FR'))}</span>
                ${h.insurance ? `<span style="font-size:11px; color:#60a5fa; font-weight:700;">🛡️ ${esc(h.insurance)}</span>` : ''}
              </div>
              <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
                ${(h.medicines || []).map((m) => `<span style="padding:3px 9px; border-radius:999px; background:rgba(16,185,129,0.14); color:#34d399; font-size:11.5px; font-weight:700;">💊 ${esc(m)}</span>`).join('')}
              </div>
              <button type="button" class="btn btn--sm btn--secondary" data-meds="${esc(JSON.stringify(h.medicines || []))}" onclick="PGPatientPro.relaunchedRx(this)">
                🔄 Relancer cette recherche
              </button>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  function addReminder() {
    const med = (document.getElementById('rem-med-name')?.value || '').trim();
    const dosage = (document.getElementById('rem-dosage')?.value || '').trim();
    const t1 = document.getElementById('rem-time-1')?.value || '';
    const t2 = document.getElementById('rem-time-2')?.value || '';
    if (!med) { notify('⚠️ Indiquez le nom du médicament.', 'error'); return; }
    const times = [t1, t2].filter(Boolean);
    if (!times.length) times.push('08:00');
    const list = getReminders();
    list.unshift({ id: 'rem_' + Date.now(), medicine: med, dosage: dosage || '1 prise', times, active: true, takenDates: [] });
    saveReminders(list);
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    notify(`⏰ Rappel programmé pour ${med} (${times.join(', ')})`, 'success');
    renderCarnetBody();
  }

  function toggleTakenToday(id) {
    const today = todayStr();
    const list = getReminders();
    const item = list.find((r) => r.id === id);
    if (!item) return;
    item.takenDates = item.takenDates || [];
    const idx = item.takenDates.indexOf(today);
    if (idx >= 0) item.takenDates.splice(idx, 1);
    else item.takenDates.push(today);
    saveReminders(list);
    renderCarnetBody();
  }

  function deleteReminder(id) {
    saveReminders(getReminders().filter((r) => r.id !== id));
    renderCarnetBody();
  }

  function clearRxHistory() {
    saveRxHistory([]);
    renderCarnetBody();
    notify('Historique local effacé.', 'info');
  }

  function relaunchedRx(btn) {
    try {
      const meds = JSON.parse(btn.dataset.meds || '[]');
      const modal = document.getElementById('patient-carnet-modal');
      if (modal) modal.classList.remove('active');
      const searchBtn = document.getElementById('search-btn');
      if (searchBtn) searchBtn.click();
      if (window.App && typeof App.addMedicine === 'function') {
        meds.forEach((m) => App.addMedicine(m));
      }
    } catch (e) {}
  }

  // ════════════════════════════════════════════════════════════════
  // 3. SOS URGENCE / SAMU / PHARMACIE DE GARDE LA PLUS PROCHE (1 CLIC)
  // ════════════════════════════════════════════════════════════════
  async function findNearestGuardPharmacy() {
    const pos = window.Geolocation && Geolocation.getPosition ? Geolocation.getPosition() : null;
    if (!pos) {
      notify('📍 Activez d\'abord votre position GPS.', 'error');
      return null;
    }
    let list = [];
    if (window.PGPharmacyService && typeof PGPharmacyService.load === 'function') {
      list = await PGPharmacyService.load(pos);
    }
    const guards = list.filter((p) => p.isOnDuty).sort((a, b) => a.distance - b.distance);
    if (guards.length > 0) return guards[0];
    const open = list.filter((p) => p.isOpen).sort((a, b) => a.distance - b.distance);
    return open[0] || list[0] || null;
  }

  async function triggerNearestGuardRoute() {
    const modal = document.getElementById('patient-sos-modal');
    if (modal) modal.classList.remove('active');
    notify('🚨 Recherche de la pharmacie de garde la plus proche...', 'info');
    const nearest = await findNearestGuardPharmacy();
    if (!nearest) {
      notify('❌ Aucune officine géolocalisée trouvée à proximité.', 'error');
      return;
    }
    if (window.App && typeof App.getRoute === 'function') {
      App.getRoute(nearest.lat, nearest.lng, `${nearest.name} (${nearest.isOnDuty ? 'DE GARDE' : 'OUVERTE'})`);
    }
  }

  function shareMyEmergencyGPS() {
    const pos = window.Geolocation && Geolocation.getPosition ? Geolocation.getPosition() : null;
    if (!pos) { notify('Position GPS non détectée.', 'error'); return; }
    const mapsUrl = `https://www.google.com/maps?q=${pos.lat},${pos.lng}`;
    const txt = `🚨 URGENCE SANTÉ (Pharma-Garde) — Voici ma position GPS exacte : ${mapsUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');
  }

  function openSosModal() {
    let modal = document.getElementById('patient-sos-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'patient-sos-modal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-content" style="max-width:440px; border:1.5px solid rgba(239,68,68,0.6);">
          <div class="modal-header" style="background:rgba(239,68,68,0.12);">
            <h3 style="margin:0; font-size:17px; font-weight:900; color:#f87171;">🚨 SOS Urgence Santé — Cameroun</h3>
            <button type="button" class="btn btn--icon" onclick="document.getElementById('patient-sos-modal').classList.remove('active')">✕</button>
          </div>
          <div class="modal-body" style="padding:18px; display:flex; flex-direction:column; gap:12px;">
            <button type="button" class="btn btn--primary btn--block" onclick="PGPatientPro.triggerNearestGuardRoute()" style="background:linear-gradient(135deg,#f59e0b,#d97706)!important; color:#0f172a!important; border:none!important; font-weight:900; min-height:50px;">
              🌙 Pharmacie de Garde la Plus Proche (Itinéraire 1 Clic)
            </button>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              <a href="tel:119" class="btn btn--secondary" style="border-color:#ef4444!important; color:#f87171!important; text-decoration:none;">🚑 SAMU (119)</a>
              <a href="tel:118" class="btn btn--secondary" style="border-color:#f97316!important; color:#fb923c!important; text-decoration:none;">🚒 Pompiers (118)</a>
              <a href="tel:1510" class="btn btn--secondary" style="border-color:#10b981!important; color:#34d399!important; text-decoration:none;">☎️ Santé / Urgence (1510)</a>
              <a href="tel:117" class="btn btn--secondary" style="border-color:#60a5fa!important; color:#93c5fd!important; text-decoration:none;">🚓 Police (117)</a>
            </div>
            <button type="button" class="btn btn--secondary btn--block" onclick="PGPatientPro.shareMyEmergencyGPS()">
              📍 Partager ma position GPS d'urgence (WhatsApp)
            </button>
          </div>
        </div>
      `;
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
      document.body.appendChild(modal);
    }
    modal.classList.add('active');
  }

  // Injection discrète des 2 boutons pro (Carnet Santé + SOS Urgence) sous #main-actions
  function mountPatientTools() {
    const actions = document.getElementById('main-actions');
    if (!actions || document.getElementById('patient-pro-strip')) return;
    const strip = document.createElement('div');
    strip.id = 'patient-pro-strip';
    strip.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:-6px; margin-bottom:14px;';
    strip.innerHTML = `
      <button type="button" id="btn-patient-carnet" class="btn btn--sm" onclick="PGPatientPro.openCarnetModal('reminders')" style="background:rgba(59,130,246,0.12); color:#93c5fd; border:1px solid rgba(59,130,246,0.35); border-radius:10px; font-size:12px; font-weight:700; min-height:38px;">
        📋 Carnet &amp; Rappels
      </button>
      <button type="button" id="btn-sos-urgence" class="btn btn--sm" onclick="PGPatientPro.openSosModal()" style="background:rgba(239,68,68,0.14); color:#f87171; border:1px solid rgba(239,68,68,0.42); border-radius:10px; font-size:12px; font-weight:800; min-height:38px;">
        🚨 SOS Urgence
      </button>
    `;
    actions.insertAdjacentElement('afterend', strip);
    startReminderWatcher();
  }

  window.PGPatientPro = {
    sortResponses,
    renderComparatorBar,
    renderScoreBadge,
    setSortMode,
    recordPrescriptionSearch,
    openCarnetModal,
    switchCarnetTab,
    addReminder,
    toggleTakenToday,
    deleteReminder,
    clearRxHistory,
    relaunchedRx,
    openSosModal,
    triggerNearestGuardRoute,
    shareMyEmergencyGPS
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountPatientTools);
  } else {
    mountPatientTools();
  }
})(window);

