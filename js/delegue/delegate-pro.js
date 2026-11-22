/**
 * Pharma-Garde v11.0 — Espace Délégué Médical Pro
 * ─────────────────────────────────────────────────────────────────
 * 1. Planificateur de tournée géographique optimisée (2 à 10 officines)
 *    avec algorithme Plus Proche Voisin + 2-Opt & lien Google Maps Multi-Étapes
 * 2. Compte-rendu de visite vocal (Web Speech API) / rapide exportable PDF & CSV
 * 3. Échantillonnage & traçabilité des remises de boîtes aux officines/médecins
 *
 * Expose : window.PGDelegatePro
 */
(function (window) {
  'use strict';

  const TOURS_KEY = 'pharmagarde_delegate_tours_v11';
  const REPORTS_KEY = 'pharmagarde_delegate_visit_reports_v11';
  const SAMPLES_KEY = 'pharmagarde_delegate_samples_v11';

  let selectedIds = new Set();
  let lastOptimizedRoute = [];
  let recognition = null;
  let activeSubTab = 'tour'; // tour | reports | samples

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function notify(msg, type) {
    if (window.PG && typeof PG.toast === 'function') PG.toast(msg, type || 'info');
  }

  function haversine(a, b) {
    const R = 6371, toR = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toR, dLon = (b.lng - a.lng) * toR;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function getCandidatePharmacies() {
    if (window.PGProGeo && typeof PGProGeo.getAllPharmacies === 'function') {
      return PGProGeo.getAllPharmacies().filter((p) => p && isFinite(p.lat) && isFinite(p.lng)).slice(0, 40);
    }
    if (typeof LOCAL_PHARMACIES !== 'undefined') return LOCAL_PHARMACIES.slice(0, 40);
    return [];
  }

  function getStartOrigin() {
    if (window.Geolocation && Geolocation.getPosition && Geolocation.getPosition()) {
      return Geolocation.getPosition();
    }
    return { lat: 4.0511, lng: 9.7085 }; // Douala par défaut
  }

  // Algorithme TSP : Plus Proche Voisin + amélioration 2-Opt
  function optimizeOrder(origin, points) {
    if (points.length <= 1) return points.slice();
    const unvisited = points.slice();
    const route = [];
    let cur = origin;
    while (unvisited.length > 0) {
      let bestIdx = 0, bestD = Infinity;
      for (let i = 0; i < unvisited.length; i++) {
        const d = haversine(cur, unvisited[i]);
        if (d < bestD) { bestD = d; bestIdx = i; }
      }
      cur = unvisited.splice(bestIdx, 1)[0];
      route.push(cur);
    }
    // 2-Opt swap
    const pathLen = (arr) => {
      let sum = haversine(origin, arr[0]);
      for (let i = 0; i < arr.length - 1; i++) sum += haversine(arr[i], arr[i + 1]);
      return sum;
    };
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < route.length - 1; i++) {
        for (let k = i + 1; k < route.length; k++) {
          const cand = route.slice(0, i).concat(route.slice(i, k + 1).reverse(), route.slice(k + 1));
          if (pathLen(cand) + 0.01 < pathLen(route)) {
            route.splice(0, route.length, ...cand);
            improved = true;
          }
        }
      }
    }
    return route;
  }

  function loadReports() { try { return JSON.parse(localStorage.getItem(REPORTS_KEY) || '[]'); } catch (e) { return []; } }
  function saveReports(l) { try { localStorage.setItem(REPORTS_KEY, JSON.stringify(l)); } catch (e) {} }
  function loadSamples() { try { return JSON.parse(localStorage.getItem(SAMPLES_KEY) || '[]'); } catch (e) { return []; } }
  function saveSamples(l) { try { localStorage.setItem(SAMPLES_KEY, JSON.stringify(l)); } catch (e) {} }

  function openProModal(tab) {
    activeSubTab = tab || 'tour';
    let modal = document.getElementById('delegate-pro-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'delegate-pro-modal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-content" style="max-width:760px;">
          <div class="modal-header">
            <div>
              <h3 style="margin:0; font-size:17px; font-weight:900; color:#fbbf24;">🗺️ Tournée Optimisée, Compte-Rendu Vocal &amp; Échantillons</h3>
              <div style="font-size:11.5px; color:#94a3b8; margin-top:2px;">Outils terrain avancés pour Délégués Médicaux &amp; Laboratoires</div>
            </div>
            <button type="button" class="btn btn--icon" onclick="document.getElementById('delegate-pro-modal').classList.remove('active')">✕</button>
          </div>
          <div style="display:flex; gap:8px; padding:10px 18px; border-bottom:1px solid var(--border-default); background:rgba(0,0,0,0.2); flex-wrap:wrap;">
            <button type="button" class="time-pill-btn active" id="dpro-tab-tour" onclick="PGDelegatePro.switchTab('tour')">🗺️ Planificateur Tournée (5–10 Officines)</button>
            <button type="button" class="time-pill-btn" id="dpro-tab-reports" onclick="PGDelegatePro.switchTab('reports')">🎙️ Compte-Rendu Vocal / Rapide</button>
            <button type="button" class="time-pill-btn" id="dpro-tab-samples" onclick="PGDelegatePro.switchTab('samples')">🧪 Échantillons &amp; Traçabilité</button>
          </div>
          <div class="modal-body" id="delegate-pro-body" style="padding:16px 18px;"></div>
        </div>
      `;
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
      document.body.appendChild(modal);
    }
    modal.classList.add('active');
    switchTab(activeSubTab);
  }

  function switchTab(tab) {
    activeSubTab = tab;
    ['tour', 'reports', 'samples'].forEach((t) => {
      const b = document.getElementById('dpro-tab-' + t);
      if (b) b.classList.toggle('active', t === tab);
    });
    renderBody();
  }

  function togglePharmacyPick(id) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else {
      if (selectedIds.size >= 10) { notify('⚠️ Maximum 10 officines par tournée optimisée.', 'info'); return; }
      selectedIds.add(id);
    }
    renderBody();
  }

  function computeOptimizedTour() {
    const all = getCandidatePharmacies();
    const chosen = all.filter((p) => selectedIds.has(String(p.id)));
    if (chosen.length < 2) {
      notify('⚠️ Sélectionnez entre 2 et 10 officines pour calculer l\'itinéraire optimal.', 'error');
      return;
    }
    const origin = getStartOrigin();
    lastOptimizedRoute = optimizeOrder(origin, chosen);
    try { localStorage.setItem(TOURS_KEY, JSON.stringify({ created_at: new Date().toISOString(), stops: lastOptimizedRoute })); } catch (e) {}
    notify(`✅ Tournée optimisée calculée (${lastOptimizedRoute.length} officines) !`, 'success');
    renderBody();
  }

  function openGoogleMapsTour() {
    if (!lastOptimizedRoute.length) return;
    const origin = getStartOrigin();
    const dest = lastOptimizedRoute[lastOptimizedRoute.length - 1];
    const waypoints = lastOptimizedRoute.slice(0, -1).map((p) => `${p.lat},${p.lng}`).join('|');
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}${waypoints ? '&waypoints=' + encodeURIComponent(waypoints) : ''}&travelmode=driving`;
    window.open(url, '_blank', 'noopener');
  }

  function startVoiceDictation() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const area = document.getElementById('dpro-report-text');
    if (!SR) {
      notify('ℹ️ Dictée vocale non supportée sur ce navigateur — saisissez directement au clavier.', 'info');
      return;
    }
    if (recognition) { try { recognition.stop(); } catch (e) {} recognition = null; }
    recognition = new SR();
    recognition.lang = (window.I18n && I18n.getLang() === 'en') ? 'en-US' : 'fr-FR';
    recognition.interimResults = false;
    recognition.onresult = (e) => {
      const txt = e.results[0][0].transcript;
      if (area) area.value = (area.value ? area.value + ' ' : '') + txt;
      notify('🎙️ Dictée ajoutée au compte-rendu.', 'success');
    };
    recognition.onerror = () => notify('⚠️ Micro indisponible ou autorisation refusée.', 'error');
    recognition.start();
    notify('🎙️ Parlez maintenant...', 'info');
  }

  function addQuickTag(tag) {
    const area = document.getElementById('dpro-report-text');
    if (area) area.value = (area.value ? area.value + ' · ' : '') + tag;
  }

  function saveVisitReport() {
    const pharm = (document.getElementById('dpro-report-pharm')?.value || '').trim();
    const lab = (document.getElementById('dpro-report-lab')?.value || '').trim();
    const text = (document.getElementById('dpro-report-text')?.value || '').trim();
    if (!pharm || !text) { notify('⚠️ Officine et compte-rendu requis.', 'error'); return; }
    const list = loadReports();
    list.unshift({ id: 'cr_' + Date.now(), date: new Date().toISOString(), pharmacy: pharm, lab: lab || 'Laboratoire', summary: text });
    saveReports(list);
    notify('✅ Compte-rendu de visite enregistré !', 'success');
    renderBody();
  }

  function exportReportsCSV() {
    const list = loadReports();
    if (window.PG && PG.exportCSV) {
      PG.exportCSV('comptes_rendus_visites_labo.csv', ['Date', 'Officine', 'Laboratoire', 'Compte_Rendu'],
        list.map((r) => [r.date, r.pharmacy, r.lab, r.summary]));
    }
  }

  function exportReportsPDF() {
    const list = loadReports();
    if (window.PG && PG.exportPDF && PG.reportShell && PG.reportTable) {
      const tbl = PG.reportTable(['Date', 'Officine', 'Laboratoire', 'Compte-rendu'],
        list.map((r) => [new Date(r.date).toLocaleString('fr-FR'), r.pharmacy, r.lab, r.summary]));
      PG.exportPDF(PG.reportShell('Comptes-Rendus de Visites Terrain', `${list.length} visite(s) documentée(s)`, tbl), 'rapport_visites_delegue.pdf');
    }
  }

  async function addSampleEntry() {
    const product = (document.getElementById('smp-product')?.value || '').trim();
    const lab = (document.getElementById('smp-lab')?.value || '').trim() || 'Laboratoire';
    const batch = (document.getElementById('smp-batch')?.value || '').trim() || ('LOT-' + Date.now().toString().slice(-4));
    const recipient = (document.getElementById('smp-recipient')?.value || '').trim();
    const rType = document.getElementById('smp-type')?.value || 'Pharmacie';
    const qty = Number(document.getElementById('smp-qty')?.value) || 1;
    if (!product || !recipient) { notify('⚠️ Produit et destinataire requis.', 'error'); return; }
    const entry = {
      id: 'smp_' + Date.now(),
      date: new Date().toISOString(),
      lab,
      product,
      batch_no: batch,
      recipient_name: recipient,
      recipient_type: rType,
      qty,
      receipt_code: 'ECH-' + Math.random().toString(36).slice(2, 7).toUpperCase()
    };
    const list = loadSamples();
    list.unshift(entry);
    saveSamples(list);
    if (window.supabase) {
      try { await supabase.from('delegate_samples').insert([entry]); } catch (e) {}
    }
    notify(`🧪 Remise enregistrée (${qty} boîte(s) · Code ${entry.receipt_code})`, 'success');
    renderBody();
  }

  function exportSamplesCSV() {
    const list = loadSamples();
    if (window.PG && PG.exportCSV) {
      PG.exportCSV('tracabilite_echantillons_medicaux.csv', ['Date', 'Code', 'Laboratoire', 'Produit', 'Lot', 'Type', 'Destinataire', 'Qte'],
        list.map((s) => [s.date, s.receipt_code, s.lab, s.product, s.batch_no, s.recipient_type, s.recipient_name, s.qty]));
    }
  }

  function renderBody() {
    const body = document.getElementById('delegate-pro-body');
    if (!body) return;

    if (activeSubTab === 'tour') {
      const all = getCandidatePharmacies();
      const origin = getStartOrigin();
      let totalKm = 0;
      if (lastOptimizedRoute.length) {
        totalKm = haversine(origin, lastOptimizedRoute[0]);
        for (let i = 0; i < lastOptimizedRoute.length - 1; i++) {
          totalKm += haversine(lastOptimizedRoute[i], lastOptimizedRoute[i + 1]);
        }
      }
      body.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          <span style="font-size:12.5px; color:#cbd5e1;">Sélectionnez <strong>2 à 10 officines</strong> (${selectedIds.size}/10 sélectionnées) :</span>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn btn--primary btn--sm" onclick="PGDelegatePro.computeOptimizedTour()">⚡ Optimiser l'Ordre de Visite</button>
            ${lastOptimizedRoute.length ? '<button type="button" class="btn btn--secondary btn--sm" onclick="PGDelegatePro.openGoogleMapsTour()" style="color:#60a5fa; border-color:rgba(96,165,250,0.4);">🧭 Lancer Google Maps Multi-Étapes</button>' : ''}
          </div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(210px, 1fr)); gap:8px; max-height:210px; overflow-y:auto; padding:4px; margin-bottom:14px;">
          ${all.map((p) => {
            const picked = selectedIds.has(String(p.id));
            return `
              <button type="button" onclick="PGDelegatePro.togglePharmacyPick('${esc(p.id)}')" style="text-align:left; padding:9px 11px; border-radius:10px; cursor:pointer; background:${picked ? 'rgba(16,185,129,0.18)' : 'rgba(30,41,59,0.55)'}; border:1px solid ${picked ? '#34d399' : 'rgba(148,163,184,0.2)'}; color:#f8fafc;">
                <div style="font-weight:800; font-size:12.5px;">${picked ? '✅ ' : '○ '}${esc(p.name)}</div>
                <div style="font-size:11px; color:#94a3b8; margin-top:2px;">📍 ${esc(p.quarter || p.city || 'Cameroun')}</div>
              </button>
            `;
          }).join('')}
        </div>
        ${lastOptimizedRoute.length ? `
          <div style="background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.35); border-radius:12px; padding:12px;">
            <div style="font-weight:800; color:#34d399; font-size:13px; margin-bottom:8px;">🏁 Ordre Optimal Calculé · Distance totale : ${totalKm.toFixed(1)} km (~${Math.max(10, Math.round(totalKm * 3))} min)</div>
            <ol style="margin:0; padding-left:18px; display:flex; flex-direction:column; gap:5px; font-size:12.5px; color:#e2e8f0;">
              ${lastOptimizedRoute.map((p) => `<li><strong>${esc(p.name)}</strong> — <span style="color:#94a3b8;">${esc(p.address || p.quarter || p.city || '')}</span></li>`).join('')}
            </ol>
          </div>
        ` : ''}
      `;
    } else if (activeSubTab === 'reports') {
      const list = loadReports();
      body.innerHTML = `
        <div style="background:rgba(30,41,59,0.55); border:1px solid rgba(148,163,184,0.18); border-radius:12px; padding:12px; margin-bottom:14px;">
          <div class="pa-grid-2" style="margin-bottom:8px;">
            <input type="text" id="dpro-report-pharm" class="form-input" placeholder="Nom de l'officine / Médecin visité *">
            <input type="text" id="dpro-report-lab" class="form-input" placeholder="Laboratoire concerné (ex: Sanofi)">
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
            <button type="button" class="btn btn--sm btn--secondary" onclick="PGDelegatePro.startVoiceDictation()" style="color:#fbbf24; border-color:rgba(251,191,36,0.45);">🎙️ Dictée Vocale</button>
            <button type="button" class="btn btn--sm btn--secondary" onclick="PGDelegatePro.addQuickTag('Stock vérifié OK')">+ Stock OK</button>
            <button type="button" class="btn btn--sm btn--secondary" onclick="PGDelegatePro.addQuickTag('Commande grossiste passée')">+ Commande</button>
            <button type="button" class="btn btn--sm btn--secondary" onclick="PGDelegatePro.addQuickTag('Échantillons remis')">+ Échantillons</button>
            <button type="button" class="btn btn--sm btn--secondary" onclick="PGDelegatePro.addQuickTag('Rupture signalée')">+ Rupture</button>
          </div>
          <textarea id="dpro-report-text" class="form-input" rows="3" placeholder="Dictez ou saisissez votre compte-rendu de visite..." style="min-height:76px; margin-bottom:10px;"></textarea>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="btn btn--primary btn--sm" onclick="PGDelegatePro.saveVisitReport()">💾 Enregistrer Compte-Rendu</button>
            <button type="button" class="btn btn--secondary btn--sm" onclick="PGDelegatePro.exportReportsPDF()">📄 Export PDF Labo</button>
            <button type="button" class="btn btn--secondary btn--sm" onclick="PGDelegatePro.exportReportsCSV()">📥 Export CSV</button>
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${list.length === 0 ? '<div style="text-align:center; padding:18px; color:#94a3b8; font-size:13px;">Aucun compte-rendu enregistré.</div>' : list.map((r) => `
            <div style="padding:10px 12px; border-radius:10px; background:rgba(15,23,42,0.65); border:1px solid rgba(148,163,184,0.16);">
              <div style="display:flex; justify-content:space-between; font-size:11.5px; color:#fbbf24; font-weight:700;">
                <span>🏥 ${esc(r.pharmacy)} · 🔬 ${esc(r.lab)}</span>
                <span style="color:#94a3b8;">${esc(new Date(r.date).toLocaleString('fr-FR'))}</span>
              </div>
              <div style="font-size:12.5px; color:#e2e8f0; margin-top:5px; line-height:1.45;">${esc(r.summary)}</div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      const samples = loadSamples();
      const totalBoxes = samples.reduce((s, x) => s + Number(x.qty || 0), 0);
      body.innerHTML = `
        <div style="background:rgba(30,41,59,0.55); border:1px solid rgba(148,163,184,0.18); border-radius:12px; padding:12px; margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span style="font-size:13px; font-weight:800; color:#34d399;">🧪 Nouvelle Remise d'Échantillons Médicaux</span>
            <span style="font-size:12px; color:#fbbf24; font-weight:800;">Total remis : ${totalBoxes} boîte(s)</span>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:8px; margin-bottom:10px;">
            <input type="text" id="smp-product" class="form-input" placeholder="Produit / Molécule *">
            <input type="text" id="smp-lab" class="form-input" placeholder="Laboratoire (ex: GSK)">
            <input type="text" id="smp-batch" class="form-input" placeholder="N° de lot">
            <select id="smp-type" class="form-input form-select"><option value="Pharmacie">🏥 Officine</option><option value="Médecin">👨‍⚕️ Médecin Prescripteur</option></select>
            <input type="text" id="smp-recipient" class="form-input" placeholder="Nom Officine ou Médecin *">
            <input type="number" id="smp-qty" class="form-input" value="3" min="1" placeholder="Boîtes">
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn btn--primary btn--sm" onclick="PGDelegatePro.addSampleEntry()">✅ Enregistrer Remise Traçable</button>
            <button type="button" class="btn btn--secondary btn--sm" onclick="PGDelegatePro.exportSamplesCSV()">📥 Export CSV Traçabilité</button>
          </div>
        </div>
        <div style="overflow-x:auto;">
          <table class="pg-admin-table">
            <thead><tr><th>Code</th><th>Produit &amp; Lot</th><th>Destinataire</th><th>Qté</th><th>Date</th></tr></thead>
            <tbody>
              ${samples.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">Aucune remise enregistrée</td></tr>' : samples.map((s) => `
                <tr>
                  <td><strong style="color:#fbbf24; font-family:monospace;">${esc(s.receipt_code)}</strong></td>
                  <td><strong>${esc(s.product)}</strong><div style="font-size:11px;color:#94a3b8;">${esc(s.lab)} · ${esc(s.batch_no)}</div></td>
                  <td>${esc(s.recipient_type)} : <strong>${esc(s.recipient_name)}</strong></td>
                  <td><strong style="color:#34d399;">${s.qty}</strong></td>
                  <td style="font-size:11px;color:#94a3b8;">${esc(new Date(s.date).toLocaleDateString('fr-FR'))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  }

  function mountDelegatePro() {
    const btnGuardTour = document.querySelector('button[onclick*="autoScheduleGuardVisits"]');
    if (btnGuardTour && !document.getElementById('btn-delegate-pro-suite')) {
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'btn-delegate-pro-suite';
      b.className = 'btn btn--secondary btn--sm';
      b.style.cssText = 'border-color:rgba(52,211,153,0.5); color:#34d399; font-weight:800; padding:6px 10px;';
      b.innerHTML = '🗺️ Tournée &amp; Échantillons';
      b.onclick = () => openProModal('tour');
      btnGuardTour.insertAdjacentElement('afterend', b);
    }
  }

  window.PGDelegatePro = {
    openProModal,
    switchTab,
    togglePharmacyPick,
    computeOptimizedTour,
    openGoogleMapsTour,
    startVoiceDictation,
    addQuickTag,
    saveVisitReport,
    exportReportsCSV,
    exportReportsPDF,
    addSampleEntry,
    exportSamplesCSV
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountDelegatePro);
  } else {
    mountDelegatePro();
  }
})(window);

