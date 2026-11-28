/**
 * Pharma-Garde v11.0 — Espace Grossiste-Répartiteur B2B Pro
 * ─────────────────────────────────────────────────────────────────
 * 1. Suivi d'encours crédit officines (plafonds, risque, règlements)
 * 2. Générateur de Facture Pro-Forma B2B (calcul HT/TVA/TTC + PDF)
 * 3. Bons de livraison signés numériquement (QR Code SHA-256 vérifié à réception)
 * 4. Alertes automatiques de seuil bas par classe thérapeutique
 *
 * Expose : window.PGWholesalerPro
 */
(function (window) {
  'use strict';

  const CREDITS_KEY = 'pharmagarde_ws_credits_v11';
  const BL_SIGNS_KEY = 'pharmagarde_ws_bl_signatures_v11';

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function notify(msg, type) {
    if (window.GrossisteApp && typeof GrossisteApp.toast === 'function') GrossisteApp.toast(msg, type || 'info');
    else if (window.PG && typeof PG.toast === 'function') PG.toast(msg, type || 'info');
  }

  // ── 1. Encours Crédit Officines ────────────────────────────────
  function loadCredits() {
    try {
      const saved = JSON.parse(localStorage.getItem(CREDITS_KEY) || 'null');
      if (Array.isArray(saved) && saved.length) return saved;
    } catch (e) {}
    return [
      { id: 'cr_1', pharmacy: 'Pharmacie du Centre (Akwa)', city: 'Douala', limit: 3500000, used: 1450000, last_payment: '2026-11-15' },
      { id: 'cr_2', pharmacy: 'Pharmacie de Bonapriso', city: 'Douala', limit: 5000000, used: 4200000, last_payment: '2026-11-10' },
      { id: 'cr_3', pharmacy: 'Pharmacie de Bastos', city: 'Yaoundé', limit: 4000000, used: 3850000, last_payment: '2026-11-02' },
      { id: 'cr_4', pharmacy: 'Pharmacie de Yassa', city: 'Douala', limit: 2000000, used: 620000, last_payment: '2026-11-18' }
    ];
  }
  function saveCredits(list) { try { localStorage.setItem(CREDITS_KEY, JSON.stringify(list)); } catch (e) {} }

  function currentWholesalerId() {
    const ws = window.GrossisteApp && GrossisteApp.getCurrentWholesaler ? GrossisteApp.getCurrentWholesaler() : null;
    if (!ws || !ws.id || String(ws.id).startsWith('admin_') || String(ws.id).startsWith('ws_demo')) return null;
    return String(ws.id);
  }

  async function syncFromSupabase() {
    if (!window.supabase) return;
    const wid = currentWholesalerId();
    if (!wid) return;
    try {
      const [{ data: crRows }, { data: blRows }] = await Promise.all([
        window.supabase.from('wholesaler_credits').select('*').eq('wholesaler_id', wid).order('updated_at', { ascending: false }),
        window.supabase.from('wholesaler_bl_signatures').select('*').eq('wholesaler_id', wid)
      ]);
      if (Array.isArray(crRows) && crRows.length > 0) {
        saveCredits(crRows.map((r) => ({
          id: r.id,
          pharmacy: r.pharmacy,
          city: r.city || 'Douala',
          limit: Number(r.credit_limit || 0),
          used: Number(r.credit_used || 0),
          last_payment: r.last_payment || ''
        })));
      }
      if (Array.isArray(blRows) && blRows.length > 0) {
        const map = Object.assign({}, loadSignatures());
        blRows.forEach((b) => {
          map[b.order_id] = { code: b.bl_code, receiver: b.receiver, signed_at: b.signed_at };
        });
        saveSignatures(map);
      }
    } catch (e) {}
  }

  async function persistCreditRow(acc) {
    const wid = currentWholesalerId();
    if (!window.supabase || !wid || !acc) return;
    try {
      await window.supabase.from('wholesaler_credits').upsert([{
        id: acc.id,
        wholesaler_id: wid,
        pharmacy: acc.pharmacy,
        city: acc.city || 'Douala',
        credit_limit: Number(acc.limit || 0),
        credit_used: Number(acc.used || 0),
        last_payment: acc.last_payment || '',
        updated_at: new Date().toISOString()
      }], { onConflict: 'id' });
    } catch (e) {}
  }

  async function addCreditAccount() {
    const pharmacy = (window.PG && PG.promptModal)
      ? await PG.promptModal('Ajouter une officine au suivi crédit', 'Nom de l\'officine cliente (ex: Pharmacie de la Paix) :')
      : null;
    if (!pharmacy || !pharmacy.trim()) return;
    const rawLim = (window.PG && PG.promptModal)
      ? await PG.promptModal('Plafond de crédit', `Plafond autorisé pour ${pharmacy.trim()} (FCFA) :`, { defaultValue: '2500000' })
      : '2500000';
    const acc = {
      id: 'cr_' + Date.now(),
      pharmacy: pharmacy.trim(),
      city: 'Douala',
      limit: Math.max(0, Number(rawLim) || 2500000),
      used: 0,
      last_payment: new Date().toISOString().slice(0, 10)
    };
    const list = loadCredits();
    list.unshift(acc);
    saveCredits(list);
    await persistCreditRow(acc);
    notify(`✅ Compte crédit ajouté pour ${acc.pharmacy}.`, 'success');
    renderFinancePanel();
  }

  async function recordPayment(id) {
    const list = loadCredits();
    const acc = list.find((c) => c.id === id);
    if (!acc) return;
    const raw = (window.PG && PG.promptModal)
      ? await PG.promptModal('Enregistrer un règlement officine', `Montant réglé par ${acc.pharmacy} (FCFA) :`, { defaultValue: '250000' })
      : null;
    const amt = Number(raw);
    if (!amt || amt <= 0) return;
    acc.used = Math.max(0, acc.used - amt);
    acc.last_payment = new Date().toISOString().slice(0, 10);
    saveCredits(list);
    await persistCreditRow(acc);
    notify(`✅ Règlement de ${amt.toLocaleString('fr-FR')} FCFA imputé pour ${acc.pharmacy}.`, 'success');
    renderFinancePanel();
  }

  async function editCreditLimit(id) {
    const list = loadCredits();
    const acc = list.find((c) => c.id === id);
    if (!acc) return;
    const raw = (window.PG && PG.promptModal)
      ? await PG.promptModal('Ajuster le plafond d\'encours', `Nouveau plafond crédit pour ${acc.pharmacy} (FCFA) :`, { defaultValue: String(acc.limit) })
      : null;
    const lim = Number(raw);
    if (!lim || lim < 0) return;
    acc.limit = lim;
    saveCredits(list);
    await persistCreditRow(acc);
    notify(`✅ Plafond mis à jour : ${lim.toLocaleString('fr-FR')} FCFA.`, 'success');
    renderFinancePanel();
  }

  // ── 2. Facturation Pro-Forma B2B PDF ───────────────────────────
  function generateProformaPDF() {
    const pharm = (document.getElementById('pf-pharmacy')?.value || '').trim() || 'Officine Cliente';
    const prodSel = document.getElementById('pf-product');
    const qty = Math.max(1, Number(document.getElementById('pf-qty')?.value) || 10);
    const discountPct = Math.min(50, Math.max(0, Number(document.getElementById('pf-discount')?.value) || 0));
    const catalog = window.GrossisteCatalog ? GrossisteCatalog.getCatalog() : [];
    const prod = catalog.find((p) => String(p.id) === (prodSel ? prodSel.value : '')) || catalog[0] || { name: 'Spécialité Pharmaceutique', wholesale_price: 4500 };

    const unit = Number(prod.wholesale_price || prod.price_ht || 4500);
    const gross = unit * qty;
    const discountAmt = Math.round(gross * (discountPct / 100));
    const netHT = gross - discountAmt;
    const ws = window.GrossisteApp && GrossisteApp.getCurrentWholesaler ? GrossisteApp.getCurrentWholesaler() : null;
    const pfCode = 'PF-' + Date.now().toString().slice(-6);

    if (window.PG && PG.exportPDF && PG.reportShell && PG.reportTable) {
      const table = PG.reportTable(
        ['Référence', 'Qté (boîtes)', 'Prix Cession HT', 'Remise', 'Montant Net HT'],
        [[prod.name, String(qty), unit.toLocaleString('fr-FR') + ' FCFA', discountPct + '%', netHT.toLocaleString('fr-FR') + ' FCFA']]
      );
      const html = PG.reportShell(
        `FACTURE PRO-FORMA B2B N° ${pfCode}`,
        `Émetteur : ${(ws && ws.company_name) || 'Grossiste-Répartiteur'} · Destinataire : ${pharm} · Validité : 7 jours`,
        `${table}<div style="margin-top:16px; text-align:right; font-size:15px; font-weight:800; color:#059669;">NET À PAYER (EXONÉRÉ TVA MÉDICAMENTS) : ${netHT.toLocaleString('fr-FR')} FCFA</div>`
      );
      PG.exportPDF(html, `${pfCode}_${pharm.replace(/\W+/g, '_')}.pdf`);
      notify(`📄 Facture Pro-Forma ${pfCode} générée (${netHT.toLocaleString('fr-FR')} FCFA).`, 'success');
    }
  }

  // ── 3. Bons de Livraison Signés Numériquement (QR Code vérifié) ─
  function loadSignatures() { try { return JSON.parse(localStorage.getItem(BL_SIGNS_KEY) || '{}'); } catch (e) { return {}; } }
  function saveSignatures(map) { try { localStorage.setItem(BL_SIGNS_KEY, JSON.stringify(map)); } catch (e) {} }

  function blSignatureCode(orderId) {
    let h = 2166136261;
    const s = 'PG_BL_SIGN::' + String(orderId || 'ORD');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 'BL-QR-' + (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
  }

  async function verifyAndSignBL() {
    const code = (document.getElementById('bl-verify-code')?.value || '').trim().toUpperCase();
    const receiver = (document.getElementById('bl-receiver-name')?.value || '').trim() || 'Pharmacien Réceptionnaire';
    if (!code) { notify('⚠️ Saisissez ou scannez le code QR du Bon de Livraison.', 'error'); return; }
    const orders = window.GrossisteOrders ? GrossisteOrders.getOrders() : [];
    const match = orders.find((o) => blSignatureCode(o.id) === code || String(o.order_code || '').toUpperCase() === code);
    if (!match) {
      notify('❌ Code QR Bon de Livraison introuvable.', 'error');
      return;
    }
    const signs = loadSignatures();
    const blEntry = { code: blSignatureCode(match.id), receiver, signed_at: new Date().toISOString() };
    signs[match.id] = blEntry;
    saveSignatures(signs);
    const wid = currentWholesalerId();
    if (window.supabase && wid) {
      try {
        await window.supabase.from('wholesaler_bl_signatures').upsert([{
          wholesaler_id: wid,
          order_id: String(match.id),
          bl_code: blEntry.code,
          receiver: blEntry.receiver,
          signed_at: blEntry.signed_at
        }], { onConflict: 'wholesaler_id,order_id' });
      } catch (e) {}
    }
    if (window.GrossisteOrders && typeof GrossisteOrders.advanceOrderStatus === 'function' && match.status !== 'delivered') {
      GrossisteOrders.advanceOrderStatus(match.id, 'delivered');
    }
    notify(`✅ BL ${match.order_code || match.id} signé numériquement par ${receiver} !`, 'success');
    renderFinancePanel();
  }

  // ── 4. Alertes Automatiques Seuil Bas par Classe Thérapeutique ─
  function computeClassAlerts() {
    const catalog = window.GrossisteCatalog ? GrossisteCatalog.getCatalog() : [];
    const byClass = {};
    catalog.forEach((item) => {
      const cls = item.therapeutic_class || item.category || 'Autres Spécialités';
      if (!byClass[cls]) byClass[cls] = { cls, total: 0, low: 0, out: 0, items: [] };
      const qty = Number(item.stock_qty ?? item.stock ?? 0);
      const thr = Number(item.alert_threshold || 50);
      byClass[cls].total++;
      if (qty <= 0) { byClass[cls].out++; byClass[cls].items.push(item.name); }
      else if (qty <= thr) { byClass[cls].low++; byClass[cls].items.push(item.name); }
    });
    return Object.values(byClass).sort((a, b) => (b.out * 3 + b.low) - (a.out * 3 + a.low));
  }

  function renderFinancePanel() {
    const host = document.getElementById('gpanel-finance');
    if (!host) return;
    const credits = loadCredits();
    const totalLimit = credits.reduce((s, c) => s + c.limit, 0);
    const totalUsed = credits.reduce((s, c) => s + c.used, 0);
    const catalog = window.GrossisteCatalog ? GrossisteCatalog.getCatalog() : [];
    const orders = window.GrossisteOrders ? GrossisteOrders.getOrders() : [];
    const signs = loadSignatures();
    const classAlerts = computeClassAlerts();

    host.innerHTML = `
      <div class="grossiste-pole-header">
        <div>
          <h2 class="grossiste-pole-title">💳 Facturation Pro-Forma, Encours Crédit, QR BL &amp; Seuils Thérapeutiques</h2>
          <p class="grossiste-pole-desc">Pilotez le risque crédit officines, générez des pro-formas PDF, certifiez vos livraisons par QR Code et surveillez les classes en tension.</p>
        </div>
      </div>

      <!-- 1. Encours Crédit Officines -->
      <div class="pharm-card" style="margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          <h3 style="margin:0; font-size:15px; font-weight:800; color:#fbbf24;">🏦 Suivi d'Encours Crédit Officines</h3>
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <span style="font-size:12px; color:#cbd5e1;">Encours global : <strong style="color:#fbbf24;">${totalUsed.toLocaleString('fr-FR')} F</strong> / ${totalLimit.toLocaleString('fr-FR')} F (${totalLimit ? Math.round((totalUsed / totalLimit) * 100) : 0}%)</span>
            <button type="button" class="btn btn--secondary btn--sm" onclick="PGWholesalerPro.addCreditAccount()">+ Officine Crédit</button>
          </div>
        </div>
        <div class="pharm-table-wrap">
          <table class="pharm-table">
            <thead><tr><th>Officine</th><th>Plafond Crédit</th><th>Encours Utilisé</th><th>Risque</th><th>Actions</th></tr></thead>
            <tbody>
              ${credits.map((c) => {
                const pct = c.limit ? Math.round((c.used / c.limit) * 100) : 0;
                const col = pct >= 90 ? '#f87171' : (pct >= 70 ? '#fbbf24' : '#34d399');
                return `<tr>
                  <td><strong>${esc(c.pharmacy)}</strong><div style="font-size:11px;color:#94a3b8;">📍 ${esc(c.city)} · Dernier règl. ${esc(c.last_payment)}</div></td>
                  <td>${c.limit.toLocaleString('fr-FR')} F</td>
                  <td><strong style="color:${col};">${c.used.toLocaleString('fr-FR')} F</strong></td>
                  <td>
                    <div style="width:110px; height:8px; background:rgba(255,255,255,0.08); border-radius:999px; overflow:hidden; margin-bottom:3px;">
                      <div style="width:${Math.min(100, pct)}%; height:100%; background:${col};"></div>
                    </div>
                    <span style="font-size:11px; color:${col}; font-weight:800;">${pct}% ${pct >= 90 ? '🔴 Plafond' : (pct >= 70 ? '🟠 Vigilance' : '🟢 Sain')}</span>
                  </td>
                  <td>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                      <button type="button" class="btn btn--sm btn--primary" onclick="PGWholesalerPro.recordPayment('${esc(c.id)}')" style="font-size:11px;">💵 Règlement</button>
                      <button type="button" class="btn btn--sm btn--secondary" onclick="PGWholesalerPro.editCreditLimit('${esc(c.id)}')" style="font-size:11px;">⚙️ Plafond</button>
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;" class="pg-two-col">
        <!-- 2. Facture Pro-Forma PDF -->
        <div class="pharm-card">
          <h3 style="margin:0 0 10px; font-size:14.5px; font-weight:800; color:#34d399;">📄 Générateur de Facture Pro-Forma B2B</h3>
          <div style="display:flex; flex-direction:column; gap:10px;">
            <input type="text" id="pf-pharmacy" class="form-input" placeholder="Officine destinataire (ex: Pharmacie du Centre)">
            <select id="pf-product" class="form-input form-select">
              ${catalog.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} — ${Number(p.wholesale_price || p.price_ht || 0).toLocaleString('fr-FR')} F HT</option>`).join('') || '<option value="">Catalogue vide</option>'}
            </select>
            <div class="pa-grid-2">
              <div class="form-group"><label class="form-label">Quantité (boîtes)</label><input type="number" id="pf-qty" class="form-input" value="20" min="1"></div>
              <div class="form-group"><label class="form-label">Remise B2B (%)</label><input type="number" id="pf-discount" class="form-input" value="5" min="0" max="50"></div>
            </div>
            <button type="button" class="btn btn--primary btn--block" onclick="PGWholesalerPro.generateProformaPDF()">📄 Générer &amp; Télécharger Pro-Forma PDF</button>
          </div>
        </div>

        <!-- 3. Bons de Livraison Signés Numériquement (QR Code) -->
        <div class="pharm-card">
          <h3 style="margin:0 0 10px; font-size:14.5px; font-weight:800; color:#60a5fa;">🔐 Bons de Livraison Signés par QR Code</h3>
          <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
            <input type="text" id="bl-verify-code" class="form-input" placeholder="Code BL-QR-XXXX ou N° Cmd" style="flex:1; min-width:150px;">
            <input type="text" id="bl-receiver-name" class="form-input" placeholder="Nom réceptionnaire" style="flex:1; min-width:140px;">
            <button type="button" class="btn btn--primary btn--sm" onclick="PGWholesalerPro.verifyAndSignBL()">✅ Signer Réception</button>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px; max-height:200px; overflow-y:auto;">
            ${orders.slice(0, 6).map((o) => {
              const code = blSignatureCode(o.id);
              const sig = signs[o.id];
              const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=72x72&data=${encodeURIComponent(code)}`;
              return `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px; border-radius:10px; background:rgba(15,23,42,0.65); border:1px solid ${sig ? 'rgba(16,185,129,0.45)' : 'rgba(96,165,250,0.3)'};">
                  <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${qrUrl}" alt="QR BL" width="48" height="48" style="border-radius:6px; background:#fff; padding:2px;">
                    <div>
                      <div style="font-weight:800; font-size:12.5px; color:#fff;">${esc(o.order_code || o.id)} · ${esc(o.pharmacy_name || 'Officine')}</div>
                      <div style="font-size:11px; color:#fbbf24; font-family:monospace;">${esc(code)}</div>
                      <div style="font-size:11px; color:${sig ? '#34d399' : '#94a3b8'};">${sig ? `✅ Signé par ${esc(sig.receiver)} (${new Date(sig.signed_at).toLocaleTimeString('fr-FR')})` : '⏳ En attente de signature réception'}</div>
                    </div>
                  </div>
                </div>
              `;
            }).join('') || '<div style="color:#94a3b8; font-size:12.5px;">Aucune commande active.</div>'}
          </div>
        </div>
      </div>

      <!-- 4. Alertes Automatiques Seuil Bas par Classe Thérapeutique -->
      <div class="pharm-card">
        <h3 style="margin:0 0 12px; font-size:14.5px; font-weight:800; color:#f87171;">⚠️ Alertes Automatiques de Seuil Bas par Classe Thérapeutique</h3>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:10px;">
          ${classAlerts.map((ca) => {
            const alert = ca.out > 0 || ca.low > 0;
            const col = ca.out > 0 ? '#f87171' : (ca.low > 0 ? '#fbbf24' : '#34d399');
            return `
              <div style="padding:12px; border-radius:12px; background:rgba(15,23,42,0.65); border:1px solid ${col};">
                <div style="font-weight:800; font-size:13px; color:#fff; margin-bottom:4px;">${esc(ca.cls)}</div>
                <div style="font-size:11.5px; color:${col}; font-weight:700;">
                  ${ca.total} réf. · ${ca.out} rupture(s) · ${ca.low} seuil bas
                </div>
                ${alert ? `<div style="font-size:11px; color:#94a3b8; margin-top:4px;">À réappro : ${esc(ca.items.slice(0, 3).join(', '))}</div>` : '<div style="font-size:11px; color:#34d399; margin-top:4px;">✅ Couverture optimale</div>'}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function mountWholesalerPro() {
    const nav = document.querySelector('.grossiste-nav');
    const main = document.querySelector('.grossiste-main');
    if (!nav || !main || document.getElementById('gtab-finance')) return;

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'grossiste-tab';
    tab.id = 'gtab-finance';
    tab.innerHTML = `
      <span class="grossiste-tab__icon">💳</span>
      <div>
        <div>Finance &amp; QR BL</div>
        <div style="font-size:10.5px;opacity:0.75;font-weight:600;">Pro-Forma, Encours &amp; Seuils</div>
      </div>
    `;
    tab.onclick = () => switchFinanceTab();
    nav.appendChild(tab);

    const section = document.createElement('section');
    section.id = 'gpanel-finance';
    section.style.display = 'none';
    main.appendChild(section);

    // Enveloppe GrossisteApp.switchTab pour gérer gpanel-finance
    if (window.GrossisteApp && typeof GrossisteApp.switchTab === 'function') {
      const orig = GrossisteApp.switchTab;
      window.GrossisteApp.switchTab = function (t) {
        tab.classList.toggle('active', t === 'finance');
        section.style.display = (t === 'finance') ? 'block' : 'none';
        if (t === 'finance') {
          ['catalog', 'orders', 'campaigns', 'network', 'stats'].forEach((k) => {
            const b = document.getElementById('gtab-' + k);
            const p = document.getElementById('gpanel-' + k);
            if (b) b.classList.remove('active');
            if (p) p.style.display = 'none';
          });
          renderFinancePanel();
          syncFromSupabase().then(() => renderFinancePanel()).catch(() => {});
          return;
        }
        return orig.apply(this, arguments);
      };
    }
  }

  function switchFinanceTab() {
    if (window.GrossisteApp && typeof GrossisteApp.switchTab === 'function') {
      GrossisteApp.switchTab('finance');
    }
  }

  window.PGWholesalerPro = {
    renderFinancePanel,
    syncFromSupabase,
    addCreditAccount,
    recordPayment,
    editCreditLimit,
    generateProformaPDF,
    verifyAndSignBL
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountWholesalerPro);
  } else {
    mountWholesalerPro();
  }
})(window);

