/**
 * Pharma-Garde v11.0 — Espace Officine Pro
 * ─────────────────────────────────────────────────────────────────
 * 1. Planning automatisé des tours de garde (calendrier mensuel +
 *    auto-bascule automatique du statut 🌙 Garde aux dates/heures prévues)
 * 2. Gestion des péremptions (lots à date courte) & Bourse d'échanges
 *    inter-officines (Dépannage confraternel)
 *
 * Expose : window.PGPharmacyPro
 */
(function (window) {
  'use strict';

  const GUARD_KEY = 'pharmagarde_guard_schedule_v11';
  const EXPIRY_KEY = 'pharmagarde_expiry_batches_v11';
  const PEER_KEY = 'pharmagarde_peer_exchanges_v11';
  let autoGuardTimer = null;
  let lastAutoState = null;

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function notify(msg, type) {
    if (window.PG && typeof PG.toast === 'function') PG.toast(msg, type || 'info');
  }

  function currentPharm() {
    return (window.PharmDash && typeof PharmDash.getCurrentPharmacy === 'function')
      ? PharmDash.getCurrentPharmacy()
      : null;
  }

  // ════════════════════════════════════════════════════════════════
  // 1. PLANNING AUTOMATISÉ DES TOURS DE GARDE
  // ════════════════════════════════════════════════════════════════
  function loadGuardSchedules() {
    try { return JSON.parse(localStorage.getItem(GUARD_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveGuardSchedules(list) {
    try { localStorage.setItem(GUARD_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function isSlotActiveNow(slot) {
    const now = Date.now();
    const s = new Date(slot.start_at).getTime();
    const e = new Date(slot.end_at).getTime();
    return !isNaN(s) && !isNaN(e) && now >= s && now <= e;
  }

  function checkAutoGuardSwitch() {
    const p = currentPharm();
    if (!p) return;
    const slots = loadGuardSchedules();
    const activeSlot = slots.find(isSlotActiveNow);
    if (activeSlot && lastAutoState !== 'guard') {
      lastAutoState = 'guard';
      if (window.PharmDash && typeof PharmDash.toggleStatus === 'function') {
        PharmDash.toggleStatus('guard');
        notify(`🌙 Tour de garde activé automatiquement (${activeSlot.note || 'Planning mensuel'})`, 'success');
      }
    } else if (!activeSlot && lastAutoState === 'guard') {
      lastAutoState = 'open';
      if (window.PharmDash && typeof PharmDash.toggleStatus === 'function') {
        PharmDash.toggleStatus('open');
        notify('🟢 Fin du tour de garde : retour automatique au statut Ouverte.', 'info');
      }
    }
  }

  function startAutoGuardEngine() {
    if (autoGuardTimer) return;
    autoGuardTimer = setInterval(checkAutoGuardSwitch, 60000);
    setTimeout(checkAutoGuardSwitch, 3000);
  }

  async function addGuardSlot() {
    const dStart = document.getElementById('guard-start-date')?.value;
    const tStart = document.getElementById('guard-start-time')?.value || '19:00';
    const dEnd = document.getElementById('guard-end-date')?.value || dStart;
    const tEnd = document.getElementById('guard-end-time')?.value || '08:00';
    const note = (document.getElementById('guard-slot-note')?.value || '').trim() || 'Tour de garde officiel';
    if (!dStart) { notify('⚠️ Choisissez une date de début de garde.', 'error'); return; }

    const startIso = new Date(`${dStart}T${tStart}:00`).toISOString();
    let endDateObj = new Date(`${dEnd}T${tEnd}:00`);
    if (endDateObj.getTime() <= new Date(startIso).getTime()) {
      endDateObj = new Date(endDateObj.getTime() + 24 * 3600 * 1000);
    }

    const p = currentPharm();
    const slot = {
      id: 'grd_' + Date.now(),
      pharmacy_id: p ? p.id : 'local',
      start_at: startIso,
      end_at: endDateObj.toISOString(),
      note,
      auto_switch: true
    };

    const list = loadGuardSchedules();
    list.push(slot);
    list.sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
    saveGuardSchedules(list);

    if (window.supabase && p && p.id && !String(p.id).startsWith('admin_')) {
      try { await supabase.from('pharmacy_guard_schedules').insert([slot]); } catch (e) {}
    }

    notify('✅ Tour de garde programmé ! Bascule automatique activée.', 'success');
    renderGuardPanel();
    checkAutoGuardSwitch();
  }

  async function deleteGuardSlot(id) {
    saveGuardSchedules(loadGuardSchedules().filter((s) => s.id !== id));
    if (window.supabase) {
      try { await supabase.from('pharmacy_guard_schedules').delete().eq('id', id); } catch (e) {}
    }
    renderGuardPanel();
  }

  function exportGuardCSV() {
    const slots = loadGuardSchedules();
    if (window.PG && typeof PG.exportCSV === 'function') {
      PG.exportCSV('planning_tours_de_garde.csv', ['Debut', 'Fin', 'Note', 'Bascule_Auto'],
        slots.map((s) => [s.start_at, s.end_at, s.note, 'OUI']));
    }
  }

  function renderGuardPanel() {
    const host = document.getElementById('subpanel-mgmt-guard-plan');
    if (!host) return;
    const slots = loadGuardSchedules();
    const today = new Date().toISOString().slice(0, 10);
    const activeNow = slots.find(isSlotActiveNow);

    host.innerHTML = `
      <div class="pharm-card" style="margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          <div>
            <h4 style="margin:0; font-size:15px; font-weight:800; color:#fbbf24;">🌙 Planning Automatisé des Tours de Garde</h4>
            <p style="font-size:12px; color:var(--text-muted); margin-top:3px;">
              Programmez vos dates de garde du mois : Pharma-Garde bascule automatiquement votre officine en statut <strong>🌙 Garde</strong> sans intervention manuelle.
            </p>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <span style="padding:5px 10px; border-radius:999px; font-size:11px; font-weight:800; background:${activeNow ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.14)'}; color:${activeNow ? '#fbbf24' : '#34d399'}; border:1px solid ${activeNow ? '#f59e0b' : 'rgba(16,185,129,0.35)'};">
              ${activeNow ? '🌙 GARDE EN COURS (AUTO)' : '🤖 Moteur Auto-Garde Actif'}
            </span>
            <button type="button" class="btn btn--secondary btn--sm" onclick="PGPharmacyPro.exportGuardCSV()">📥 Export CSV</button>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; margin-bottom:12px;">
          <div class="form-group"><label class="form-label">Date début</label><input type="date" id="guard-start-date" class="form-input" value="${today}"></div>
          <div class="form-group"><label class="form-label">Heure début</label><input type="time" id="guard-start-time" class="form-input" value="19:00"></div>
          <div class="form-group"><label class="form-label">Date fin</label><input type="date" id="guard-end-date" class="form-input" value="${today}"></div>
          <div class="form-group"><label class="form-label">Heure fin</label><input type="time" id="guard-end-time" class="form-input" value="08:00"></div>
          <div class="form-group"><label class="form-label">Libellé / Secteur</label><input type="text" id="guard-slot-note" class="form-input" placeholder="Ex: Garde Nuit Secteur Akwa"></div>
        </div>
        <button type="button" class="btn btn--primary btn--sm" onclick="PGPharmacyPro.addGuardSlot()">➕ Programmer ce Tour de Garde</button>
      </div>

      <div class="pharm-card">
        <h4 style="margin:0 0 12px; font-size:14px; font-weight:800; color:#34d399;">📅 Tours de Garde Programmés (${slots.length})</h4>
        ${slots.length === 0 ? '<div style="text-align:center; padding:22px; color:#94a3b8; font-size:13px;">Aucun tour de garde programmé. Ajoutez vos dates ci-dessus.</div>' : `
          <div class="pharm-table-wrap">
            <table class="pharm-table">
              <thead><tr><th>Début</th><th>Fin</th><th>Libellé</th><th>État</th><th>Action</th></tr></thead>
              <tbody>
                ${slots.map((s) => {
                  const active = isSlotActiveNow(s);
                  const past = new Date(s.end_at).getTime() < Date.now();
                  const badge = active
                    ? '<span class="chip chip--gold">🌙 Actif maintenant</span>'
                    : (past ? '<span class="chip chip--gray">Terminé</span>' : '<span class="chip chip--green">Programmé</span>');
                  return `<tr>
                    <td>${esc(new Date(s.start_at).toLocaleString('fr-FR'))}</td>
                    <td>${esc(new Date(s.end_at).toLocaleString('fr-FR'))}</td>
                    <td><strong>${esc(s.note)}</strong></td>
                    <td>${badge}</td>
                    <td><button type="button" class="btn btn--sm" onclick="PGPharmacyPro.deleteGuardSlot('${esc(s.id)}')" style="background:rgba(239,68,68,0.14); color:#f87171; border:1px solid rgba(239,68,68,0.35);">Supprimer</button></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  }

  // ════════════════════════════════════════════════════════════════
  // 2. GESTION DES PÉREMPTIONS & ÉCHANGES INTER-OFFICINES
  // ════════════════════════════════════════════════════════════════
  function loadExpiryBatches() {
    try {
      const list = JSON.parse(localStorage.getItem(EXPIRY_KEY) || 'null');
      if (Array.isArray(list)) return list;
    } catch (e) {}
    const d20 = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    const d65 = new Date(Date.now() + 65 * 86400000).toISOString().slice(0, 10);
    return [
      { id: 'exp_1', product: 'Augmentin 1g Adulte', batch_no: 'LOT-24A8', expiry_date: d20, qty: 18, unit_price: 4200, shared: false },
      { id: 'exp_2', product: 'Coartem 20/120mg', batch_no: 'LOT-24C2', expiry_date: d65, qty: 35, unit_price: 2100, shared: false }
    ];
  }
  function saveExpiryBatches(list) {
    try { localStorage.setItem(EXPIRY_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function loadPeerExchanges() {
    try {
      const list = JSON.parse(localStorage.getItem(PEER_KEY) || 'null');
      if (Array.isArray(list)) return list;
    } catch (e) {}
    return [
      {
        id: 'peer_demo_1',
        type: 'offer_short_expiry',
        pharmacy_name: 'Pharmacie du Centre (Akwa)',
        phone: '699112233',
        city: 'Douala',
        product: 'Ceftriaxone 1g Injectable',
        qty: 25,
        expiry_date: new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10),
        unit_price: 1800,
        status: 'open',
        created_at: new Date().toISOString()
      },
      {
        id: 'peer_demo_2',
        type: 'urgent_need',
        pharmacy_name: 'Pharmacie de Bonapriso',
        phone: '677554433',
        city: 'Douala',
        product: 'Insuline Rapide Actrapid',
        qty: 5,
        expiry_date: '',
        unit_price: 0,
        status: 'open',
        created_at: new Date().toISOString()
      }
    ];
  }
  function savePeerExchanges(list) {
    try { localStorage.setItem(PEER_KEY, JSON.stringify(list)); } catch (e) {}
  }

  let peerRtChannel = null;

  async function syncFromSupabase() {
    if (!window.supabase) return;
    const p = currentPharm();
    const pid = p && p.id && !String(p.id).startsWith('admin_') ? String(p.id) : null;
    try {
      if (pid) {
        const [{ data: gRows }, { data: eRows }] = await Promise.all([
          window.supabase.from('pharmacy_guard_schedules').select('*').eq('pharmacy_id', pid).order('start_at', { ascending: true }),
          window.supabase.from('pharmacy_expiry_batches').select('*').eq('pharmacy_id', pid).order('expiry_date', { ascending: true })
        ]);
        if (Array.isArray(gRows) && gRows.length > 0) saveGuardSchedules(gRows);
        if (Array.isArray(eRows) && eRows.length > 0) saveExpiryBatches(eRows);
      }
      const { data: peerRows } = await window.supabase
        .from('pharmacy_peer_exchanges')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(60);
      if (Array.isArray(peerRows) && peerRows.length > 0) {
        const map = new Map();
        peerRows.forEach((r) => map.set(r.id, r));
        loadPeerExchanges().forEach((r) => { if (!map.has(r.id) && !String(r.id).startsWith('peer_demo_')) map.set(r.id, r); });
        savePeerExchanges(Array.from(map.values()).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)));
      }
    } catch (e) {}

    if (!peerRtChannel && typeof window.supabase.channel === 'function') {
      try {
        peerRtChannel = window.supabase
          .channel('pg_peer_exchanges_live')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'pharmacy_peer_exchanges' }, async () => {
            await syncFromSupabase();
            const host = document.getElementById('subpanel-mgmt-expiry');
            if (host && host.style.display !== 'none') renderExpiryPeerPanel();
          })
          .subscribe();
      } catch (e) {}
    }
  }

  async function addExpiryBatch() {
    const product = (document.getElementById('exp-product')?.value || '').trim();
    const batch = (document.getElementById('exp-batch')?.value || '').trim() || ('LOT-' + Date.now().toString().slice(-4));
    const expiry = document.getElementById('exp-date')?.value;
    const qty = Number(document.getElementById('exp-qty')?.value) || 1;
    const price = Number(document.getElementById('exp-price')?.value) || 0;
    if (!product || !expiry) { notify('⚠️ Produit et date de péremption requis.', 'error'); return; }
    const p = currentPharm();
    const row = {
      id: 'exp_' + Date.now(),
      pharmacy_id: (p && p.id) ? String(p.id) : 'local',
      product,
      batch_no: batch,
      expiry_date: expiry,
      qty,
      unit_price: price,
      shared: false
    };
    const list = loadExpiryBatches();
    list.unshift(row);
    saveExpiryBatches(list);
    if (window.supabase && p && p.id && !String(p.id).startsWith('admin_')) {
      try { await window.supabase.from('pharmacy_expiry_batches').upsert([row], { onConflict: 'id' }); } catch (e) {}
    }
    notify(`✅ Lot ${product} ajouté au suivi des péremptions.`, 'success');
    renderExpiryPeerPanel();
  }

  async function publishBatchToPeers(batchId) {
    const batches = loadExpiryBatches();
    const b = batches.find((x) => x.id === batchId);
    if (!b) return;
    b.shared = true;
    saveExpiryBatches(batches);
    const p = currentPharm();
    if (window.supabase && p && p.id && !String(p.id).startsWith('admin_')) {
      try { await window.supabase.from('pharmacy_expiry_batches').update({ shared: true }).eq('id', batchId); } catch (e) {}
    }
    const item = {
      id: 'peer_' + Date.now(),
      type: 'offer_short_expiry',
      pharmacy_id: p ? p.id : 'local',
      pharmacy_name: (p && p.name) || 'Mon Officine',
      phone: (p && p.phone) || '694929909',
      city: (p && p.city) || 'Douala',
      product: `${b.product} (${b.batch_no})`,
      qty: b.qty,
      expiry_date: b.expiry_date,
      unit_price: b.unit_price,
      status: 'open',
      created_at: new Date().toISOString()
    };
    const peers = loadPeerExchanges();
    peers.unshift(item);
    savePeerExchanges(peers);
    if (window.supabase && p && p.id && !String(p.id).startsWith('admin_')) {
      try { await supabase.from('pharmacy_peer_exchanges').insert([item]); } catch (e) {}
    }
    notify('🤝 Lot publié sur la Bourse de Dépannage Confraternel !', 'success');
    renderExpiryPeerPanel();
  }

  async function publishUrgentNeed() {
    const product = (document.getElementById('peer-need-product')?.value || '').trim();
    const qty = Number(document.getElementById('peer-need-qty')?.value) || 5;
    if (!product) { notify('⚠️ Indiquez le médicament recherché en dépannage.', 'error'); return; }
    const p = currentPharm();
    const item = {
      id: 'peer_' + Date.now(),
      type: 'urgent_need',
      pharmacy_id: p ? p.id : 'local',
      pharmacy_name: (p && p.name) || 'Mon Officine',
      phone: (p && p.phone) || '694929909',
      city: (p && p.city) || 'Douala',
      product,
      qty,
      expiry_date: '',
      unit_price: 0,
      status: 'open',
      created_at: new Date().toISOString()
    };
    const peers = loadPeerExchanges();
    peers.unshift(item);
    savePeerExchanges(peers);
    if (window.supabase && p && p.id && !String(p.id).startsWith('admin_')) {
      try { await supabase.from('pharmacy_peer_exchanges').insert([item]); } catch (e) {}
    }
    notify(`🆘 Demande de dépannage confraternel diffusée pour ${product} !`, 'success');
    renderExpiryPeerPanel();
  }

  function renderExpiryPeerPanel() {
    const host = document.getElementById('subpanel-mgmt-expiry');
    if (!host) return;
    const batches = loadExpiryBatches();
    const peers = loadPeerExchanges();
    const now = Date.now();

    host.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;" class="pg-two-col">
        <!-- Colonne 1 : Suivi des Péremptions -->
        <div class="pharm-card">
          <h4 style="margin:0 0 8px; font-size:14.5px; font-weight:800; color:#fbbf24;">⏳ Suivi des Péremptions (Lots à Date Courte)</h4>
          <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">Anticipez les pertes et proposez en 1 clic vos lots à date courte aux officines voisines.</p>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
            <input type="text" id="exp-product" class="form-input" placeholder="Médicament (ex: Doliprane)">
            <input type="text" id="exp-batch" class="form-input" placeholder="N° Lot (ex: LOT-24B)">
            <input type="date" id="exp-date" class="form-input">
            <div style="display:flex; gap:6px;">
              <input type="number" id="exp-qty" class="form-input" placeholder="Qté" value="10" min="1">
              <input type="number" id="exp-price" class="form-input" placeholder="Prix F" value="2500" min="0">
            </div>
          </div>
          <button type="button" class="btn btn--primary btn--sm btn--block" onclick="PGPharmacyPro.addExpiryBatch()" style="margin-bottom:14px;">➕ Ajouter au Suivi Péremptions</button>

          <div style="display:flex; flex-direction:column; gap:8px;">
            ${batches.map((b) => {
              const daysLeft = Math.ceil((new Date(b.expiry_date).getTime() - now) / 86400000);
              const badgeColor = daysLeft <= 30 ? '#f87171' : (daysLeft <= 90 ? '#fbbf24' : '#34d399');
              const label = daysLeft <= 0 ? 'EXPIRÉ' : `J-${daysLeft}`;
              return `
                <div style="padding:10px 12px; border-radius:10px; background:rgba(15,23,42,0.65); border:1px solid ${badgeColor}; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                  <div>
                    <div style="font-weight:800; color:#fff; font-size:13px;">💊 ${esc(b.product)} <span style="font-size:11px; color:#94a3b8;">(${esc(b.batch_no)})</span></div>
                    <div style="font-size:11.5px; color:${badgeColor}; font-weight:700;">⏳ Exp. ${esc(b.expiry_date)} (${label}) · ${b.qty} boîtes · ${Number(b.unit_price || 0).toLocaleString('fr-FR')} F</div>
                  </div>
                  <button type="button" class="btn btn--sm" onclick="PGPharmacyPro.publishBatchToPeers('${esc(b.id)}')" style="background:rgba(251,191,36,0.16); color:#fbbf24; border:1px solid rgba(251,191,36,0.45); font-size:11px; font-weight:800;">
                    ${b.shared ? '✅ Publié Confrères' : '🤝 Proposer Confrères'}
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Colonne 2 : Bourse de Dépannage Confraternel -->
        <div class="pharm-card">
          <h4 style="margin:0 0 8px; font-size:14.5px; font-weight:800; color:#34d399;">🤝 Échanges Inter-Officines (Dépannage Confraternel)</h4>
          <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">Signalez un besoin urgent de dépannage ou contactez une officine consoeur directement.</p>
          <div style="display:flex; gap:8px; margin-bottom:14px;">
            <input type="text" id="peer-need-product" class="form-input" placeholder="Produit urgent recherché..." style="flex:1;">
            <input type="number" id="peer-need-qty" class="form-input" value="5" min="1" style="width:76px;">
            <button type="button" class="btn btn--primary btn--sm" onclick="PGPharmacyPro.publishUrgentNeed()">🆘 Demander</button>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${peers.map((pr) => {
              const isNeed = pr.type === 'urgent_need';
              const cleanPh = String(pr.phone || '').replace(/\D/g, '').replace(/^237/, '');
              const waMsg = encodeURIComponent(`Bonjour Confrère (${pr.pharmacy_name}), je vous contacte via Pharma-Garde au sujet de : ${pr.product} (${pr.qty} boîtes).`);
              return `
                <div style="padding:10px 12px; border-radius:10px; background:rgba(15,23,42,0.65); border:1px solid ${isNeed ? 'rgba(239,68,68,0.45)' : 'rgba(16,185,129,0.4)'};">
                  <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:4px;">
                    <span style="font-size:11px; font-weight:900; color:${isNeed ? '#f87171' : '#34d399'};">${isNeed ? '🆘 BESOIN DÉPANNAGE' : '📦 LOT DATE COURTE DISPONIBLE'}</span>
                    <span style="font-size:11px; color:#94a3b8;">📍 ${esc(pr.city || 'Cameroun')}</span>
                  </div>
                  <div style="font-weight:800; color:#fff; font-size:13.5px;">${esc(pr.product)} · <span style="color:#fbbf24;">${pr.qty} boîtes</span></div>
                  <div style="font-size:11.5px; color:#cbd5e1; margin:3px 0 8px;">🏥 ${esc(pr.pharmacy_name)} ${pr.expiry_date ? `· Exp. ${esc(pr.expiry_date)}` : ''} ${pr.unit_price ? `· ${Number(pr.unit_price).toLocaleString('fr-FR')} F/u` : ''}</div>
                  ${cleanPh ? `<a href="https://wa.me/237${cleanPh}?text=${waMsg}" target="_blank" rel="noopener" class="btn btn--sm btn--secondary" style="text-decoration:none; font-size:11.5px;">💬 Contacter Confrère (WhatsApp)</a>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // Montage des 2 nouveaux sous-onglets dans #space-management
  function mountPharmacyPro() {
    const subtabs = document.querySelector('#space-management .pharm-subtabs');
    const spaceMgmt = document.getElementById('space-management');
    if (!subtabs || !spaceMgmt || document.getElementById('subtab-mgmt-guard-plan')) return;

    const btnGuard = document.createElement('button');
    btnGuard.type = 'button';
    btnGuard.className = 'pharm-subtab-btn';
    btnGuard.id = 'subtab-mgmt-guard-plan';
    btnGuard.innerHTML = '<span>🌙</span> Planning Tours de Garde';
    btnGuard.onclick = () => switchMgmtProTab('guard-plan');

    const btnExpiry = document.createElement('button');
    btnExpiry.type = 'button';
    btnExpiry.className = 'pharm-subtab-btn';
    btnExpiry.id = 'subtab-mgmt-expiry';
    btnExpiry.innerHTML = '<span>⏳</span> Péremptions &amp; Dépannage';
    btnExpiry.onclick = () => switchMgmtProTab('expiry');

    subtabs.appendChild(btnGuard);
    subtabs.appendChild(btnExpiry);

    const pGuard = document.createElement('div');
    pGuard.id = 'subpanel-mgmt-guard-plan';
    pGuard.style.display = 'none';
    const pExpiry = document.createElement('div');
    pExpiry.id = 'subpanel-mgmt-expiry';
    pExpiry.style.display = 'none';
    spaceMgmt.appendChild(pGuard);
    spaceMgmt.appendChild(pExpiry);

    // Enveloppe PharmDash.switchManagementSubtab pour masquer nos panneaux quand un onglet d'origine est choisi
    if (window.PharmDash && typeof window.PharmDash.switchManagementSubtab === 'function') {
      const orig = window.PharmDash.switchManagementSubtab;
      window.PharmDash.switchManagementSubtab = function (tab) {
        pGuard.style.display = 'none';
        pExpiry.style.display = 'none';
        btnGuard.classList.remove('active');
        btnExpiry.classList.remove('active');
        return orig.apply(this, arguments);
      };
    }

    startAutoGuardEngine();
  }

  function switchMgmtProTab(tab) {
    ['stats', 'stock', 'insurance', 'connector', 'guard-plan', 'expiry'].forEach((t) => {
      const b = document.getElementById('subtab-mgmt-' + t);
      const p = document.getElementById('subpanel-mgmt-' + t);
      if (b) b.classList.toggle('active', t === tab);
      if (p) p.style.display = (t === tab) ? 'block' : 'none';
    });
    if (tab === 'guard-plan') {
      renderGuardPanel();
      syncFromSupabase().then(() => renderGuardPanel()).catch(() => {});
    }
    if (tab === 'expiry') {
      renderExpiryPeerPanel();
      syncFromSupabase().then(() => renderExpiryPeerPanel()).catch(() => {});
    }
  }

  window.PGPharmacyPro = {
    switchMgmtProTab,
    syncFromSupabase,
    addGuardSlot,
    deleteGuardSlot,
    exportGuardCSV,
    addExpiryBatch,
    publishBatchToPeers,
    publishUrgentNeed,
    checkAutoGuardSwitch
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountPharmacyPro);
  } else {
    mountPharmacyPro();
  }
})(window);

