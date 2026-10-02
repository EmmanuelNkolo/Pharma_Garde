"""
IMPLEMENTATION v5 — Codes de reservation + Alertes rupture de stock
"""
import re

# ============================================================
# 1. APP.JS — Code de reservation pour le client
# ============================================================
appjs = open('js/app.js', 'r', encoding='utf-8').read()

# Find where reservations are handled and add code generation
if 'reservation_code' not in appjs:
    # Add reservation code generator function
    gen_code = """
  // ── Reservation Code Generator ──────────────────────────
  function generateReservationCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'PG-';
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
  }

"""
    appjs = appjs.replace("  // Payment error handler", gen_code + "  // Payment error handler")

    # Find the reservation/response handling and add code
    # Look for where the client reserves medicine
    if 'reservedMedicines' in appjs:
        # Find the function that handles reservation
        # Add reservation code to the response when reserving
        old_reserve = "async function reserveMedicines("
        if old_reserve in appjs:
            pass  # Will handle below
        
        # Look for the reserve button handler
        reserve_patterns = [
            "function reserveMedicine",
            "function handleReserve",
            "reservedMedicines[",
        ]

# Add to PharmApp exports
if 'generateReservationCode' not in appjs:
    appjs = appjs.replace(
        "window.PharmApp = {",
        "window.PharmApp = {\n    generateCode: generateReservationCode,"
    )

open('js/app.js', 'w', encoding='utf-8').write(appjs)
print("[1/4] app.js - Reservation code generator")

# ============================================================
# 2. PHARMACIEN.JS — Stock alert to delegates + reservation code display
# ============================================================
pjs = open('js/pharmacien.js', 'r', encoding='utf-8').read()

if 'async function sendStockAlert' not in pjs:
    stock_alert_code = """
  // ═══════════════════════════════════════════════════════
  //  STOCK ALERTS TO DELEGATES
  // ═══════════════════════════════════════════════════════
  async function sendStockAlert() {
    const productName = ($('#stock-alert-product') || {}).value?.trim();
    const urgency = ($('#stock-alert-urgency') || {}).value || 'normal';
    const message = ($('#stock-alert-message') || {}).value?.trim();
    const radius = parseInt(($('#stock-alert-radius') || {}).value) || 5;

    if (!productName) return showToast('Veuillez saisir le nom du produit en rupture.', 'error');
    if (!currentPharmacy) return showToast('Erreur: pharmacie non connectee.', 'error');

    const btn = $('#btn-send-stock-alert');
    if (btn) { btn.disabled = true; btn.textContent = 'Envoi en cours...'; }

    try {
      const { error } = await supabase.from('stock_alerts').insert([{
        pharmacy_id: currentPharmacy.id,
        product_name: productName,
        urgency: urgency,
        message: message || null,
        radius: radius,
        pharmacy_lat: currentPharmacy.lat,
        pharmacy_lng: currentPharmacy.lng,
      }]);
      if (error) throw error;

      showToast('Alerte de rupture envoyee a tous les delegues du rayon de ' + radius + 'km !', 'success');
      // Clear form
      if ($('#stock-alert-product')) $('#stock-alert-product').value = '';
      if ($('#stock-alert-message')) $('#stock-alert-message').value = '';
      if ($('#stock-alert-modal')) $('#stock-alert-modal').classList.remove('active');
    } catch (err) {
      showToast('Erreur: ' + (err.message || 'Impossible d envoyer l alerte.'), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Envoyer l alerte'; }
    }
  }

  // ═══════════════════════════════════════════════════════
  //  RESERVATION CODE VERIFICATION
  // ═══════════════════════════════════════════════════════
  async function verifyReservationCode(code) {
    if (!code || !currentPharmacy) return;
    try {
      const { data, error } = await supabase
        .from('responses')
        .select('*, request:request_id(medicines, user_phone)')
        .eq('pharmacy_id', currentPharmacy.id)
        .eq('reservation_code', code.toUpperCase().trim())
        .eq('is_reserved', true)
        .is('collected_at', null)
        .single();

      if (error || !data) {
        showToast('Code invalide ou deja utilise.', 'error');
        return null;
      }

      // Mark as collected
      await supabase.from('responses').update({
        collected_at: new Date().toISOString()
      }).eq('id', data.id);

      showToast('Code verifie ! Produit remis au patient.', 'success');
      return data;
    } catch (err) {
      showToast('Erreur de verification.', 'error');
      return null;
    }
  }

"""
    # Insert before SETTINGS section or before escapeHtml
    insert_point = pjs.rfind("  // ═══════════════════════════════════════════════════════\n  //  PHARMACY STATUS TOGGLE")
    if insert_point == -1:
        insert_point = pjs.rfind("function escapeHtml")
    if insert_point > 0:
        pjs = pjs[:insert_point] + stock_alert_code + pjs[insert_point:]

# Expose in PharmDash
if 'sendStockAlert' not in pjs.split("window.PharmDash")[1][:500] if "window.PharmDash" in pjs else '':
    pjs = pjs.replace(
        "window.PharmDash = {",
        "window.PharmDash = {\n    sendStockAlert: sendStockAlert,\n    verifyCode: verifyReservationCode,"
    )

open('js/pharmacien.js', 'w', encoding='utf-8').write(pjs)
print("[2/4] pharmacien.js - Stock alerts + Reservation code verification")

# ============================================================
# 3. PHARMACIEN.HTML — Stock alert modal + code verification UI
# ============================================================
phtml = open('pharmacien.html', 'r', encoding='utf-8').read()

if 'stock-alert-modal' not in phtml:
    stock_modal = """
  <!-- Stock Alert Modal -->
  <div id="stock-alert-modal" class="modal-backdrop">
    <div class="login-card" style="max-width: 480px; padding: 24px;">
      <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px; color: #f59e0b; display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 24px;">&#x26A0;&#xFE0F;</span> Alerte Rupture de Stock
      </h3>
      <p style="font-size: 13px; color: var(--dark-400); margin-bottom: 16px; line-height: 1.6;">
        Signalez une rupture de stock aux delegues medicaux de votre zone pour qu'ils puissent vous reapprovisionner rapidement.
      </p>
      <div class="form-group">
        <label>Nom du produit en rupture *</label>
        <input type="text" id="stock-alert-product" class="input-field" placeholder="Ex: Doliprane 1000mg, Amoxicilline...">
      </div>
      <div class="form-group">
        <label>Urgence</label>
        <select id="stock-alert-urgency" class="input-field">
          <option value="normal">Normale</option>
          <option value="urgent">Urgente</option>
          <option value="critical">Critique</option>
        </select>
      </div>
      <div class="form-group">
        <label>Rayon de diffusion</label>
        <select id="stock-alert-radius" class="input-field">
          <option value="2">2 km</option>
          <option value="5" selected>5 km</option>
          <option value="10">10 km</option>
          <option value="15">15 km</option>
          <option value="20">20 km</option>
        </select>
      </div>
      <div class="form-group">
        <label>Message complementaire</label>
        <textarea id="stock-alert-message" class="input-field" rows="2" placeholder="Quantite souhaitee, specifications..."></textarea>
      </div>
      <div style="display: flex; gap: 12px; margin-top: 20px;">
        <button class="btn btn-outline" style="flex: 1;" onclick="document.getElementById('stock-alert-modal').classList.remove('active')">Annuler</button>
        <button id="btn-send-stock-alert" class="btn btn-primary" style="flex: 1; background: linear-gradient(135deg, #f59e0b, #d97706);" onclick="PharmDash.sendStockAlert()">Envoyer l'alerte</button>
      </div>
    </div>
  </div>

  <!-- Reservation Code Verification -->
  <div id="code-verify-modal" class="modal-backdrop">
    <div class="login-card" style="max-width: 400px; padding: 24px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 12px;">&#x1F50D;</div>
      <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px; color: var(--green-500);">Verifier un Code de Reservation</h3>
      <p style="font-size: 13px; color: var(--dark-400); margin-bottom: 16px;">Entrez le code PG-XXXX presente par le patient.</p>
      <div class="form-group">
        <input type="text" id="verify-code-input" class="input-field" placeholder="PG-XXXX" style="text-align: center; font-size: 22px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase;" maxlength="7">
      </div>
      <div style="display: flex; gap: 12px; margin-top: 16px;">
        <button class="btn btn-outline" style="flex: 1;" onclick="document.getElementById('code-verify-modal').classList.remove('active')">Fermer</button>
        <button class="btn btn-primary" style="flex: 1;" onclick="PharmDash.verifyCode(document.getElementById('verify-code-input').value)">Verifier</button>
      </div>
    </div>
  </div>
"""
    # Insert before the toast element
    phtml = phtml.replace('<!-- Toast -->', stock_modal + '\n  <!-- Toast -->')

# Add buttons for stock alert and code verification in dashboard
if 'btn-open-stock-alert' not in phtml:
    # Find dashboard area to add quick action buttons
    quick_actions = """
      <!-- Quick Action Buttons -->
      <div style="display: flex; gap: 8px; padding: 8px 16px; flex-wrap: wrap;">
        <button id="btn-open-stock-alert" class="btn btn-sm" style="flex: 1; min-width: 140px; background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); border-radius: 12px; font-size: 12px; padding: 10px 12px;" onclick="document.getElementById('stock-alert-modal').classList.add('active')">
          &#x26A0;&#xFE0F; Alerte Rupture
        </button>
        <button id="btn-open-verify-code" class="btn btn-sm" style="flex: 1; min-width: 140px; background: rgba(5,150,105,0.15); color: #10b981; border: 1px solid rgba(5,150,105,0.3); border-radius: 12px; font-size: 12px; padding: 10px 12px;" onclick="document.getElementById('code-verify-modal').classList.add('active')">
          &#x1F50D; Verifier Code
        </button>
      </div>
"""
    phtml = phtml.replace(
        '<div id="pharmacy-status-toggle"',
        quick_actions + '      <div id="pharmacy-status-toggle"'
    )

open('pharmacien.html', 'w', encoding='utf-8').write(phtml)
print("[3/4] pharmacien.html - Stock alert + Code verification modals")

# ============================================================
# 4. DELEGUE.JS — Receive stock alerts from pharmacies
# ============================================================
djs = open('js/delegue.js', 'r', encoding='utf-8').read()

if 'async function loadStockAlerts' not in djs:
    stock_alerts_code = """
  // ═══════════════════════════════════════════════════════
  //  STOCK ALERTS FROM PHARMACIES
  // ═══════════════════════════════════════════════════════
  async function loadStockAlerts() {
    const container = $('stock-alerts-list');
    if (!container || !userLat || !userLng) return;
    
    try {
      const { data: alerts, error } = await supabase
        .from('stock_alerts')
        .select('*, pharmacy:pharmacy_id(name, phone, address)')
        .eq('is_resolved', false)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;

      // Filter by distance
      const nearbyAlerts = (alerts || []).filter(a => {
        if (!a.pharmacy_lat || !a.pharmacy_lng) return true;
        const dist = haversine(userLat, userLng, a.pharmacy_lat, a.pharmacy_lng);
        return dist <= (a.radius || 5);
      });

      // Update badge
      const badge = $('alerts-badge');
      if (badge) {
        badge.textContent = nearbyAlerts.length;
        badge.style.display = nearbyAlerts.length > 0 ? 'flex' : 'none';
      }

      if (nearbyAlerts.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--dark-400);font-size:14px;">Aucune alerte de rupture dans votre zone.</div>';
        return;
      }

      const urgencyColors = { normal: '#3b82f6', urgent: '#f59e0b', critical: '#ef4444' };
      const urgencyLabels = { normal: 'Normale', urgent: 'Urgente', critical: 'Critique' };

      container.innerHTML = nearbyAlerts.map(a => {
        const pharma = a.pharmacy || {};
        const color = urgencyColors[a.urgency] || '#888';
        const label = urgencyLabels[a.urgency] || a.urgency;
        const timeAgo = getTimeAgo(a.created_at);
        const dist = a.pharmacy_lat ? haversine(userLat, userLng, a.pharmacy_lat, a.pharmacy_lng).toFixed(1) : '?';

        return '<div style="background:var(--dark-800);border:1px solid ' + color + '33;border-radius:14px;padding:16px;margin-bottom:10px;border-left:4px solid ' + color + ';">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<strong style="color:var(--dark-100);font-size:15px;">' + escapeHtml(a.product_name) + '</strong>' +
            '<span style="background:' + color + '22;color:' + color + ';padding:3px 10px;border-radius:10px;font-size:11px;font-weight:700;">' + label + '</span>' +
          '</div>' +
          '<div style="font-size:13px;color:var(--dark-300);margin-bottom:6px;">' + escapeHtml(pharma.name || 'Pharmacie') + ' — ' + dist + ' km</div>' +
          (a.message ? '<div style="font-size:13px;color:var(--dark-400);margin-bottom:8px;font-style:italic;">' + escapeHtml(a.message) + '</div>' : '') +
          '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<span style="font-size:11px;color:var(--dark-500);">' + timeAgo + '</span>' +
            (pharma.phone ? '<a href="tel:' + pharma.phone + '" class="btn btn-sm btn-outline" style="font-size:11px;padding:4px 12px;">Appeler</a>' : '') +
          '</div>' +
        '</div>';
      }).join('');
    } catch (err) {
      console.error('Stock alerts error:', err);
    }
  }

  function getTimeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return 'Il y a ' + mins + ' min';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return 'Il y a ' + hrs + 'h';
    return 'Il y a ' + Math.floor(hrs / 24) + ' jour(s)';
  }

"""
    # Insert before the PANEL SWITCHING section
    djs = djs.replace(
        "  // ═══════════════════════════════════════════════════════\n  //  PANEL SWITCHING",
        stock_alerts_code + "  // ═══════════════════════════════════════════════════════\n  //  PANEL SWITCHING"
    )

    # Add 'alerts' to panel switching
    djs = djs.replace(
        "    ['pharmacies', 'promotions', 'stats'].forEach(p => {",
        "    ['pharmacies', 'promotions', 'stats', 'alerts'].forEach(p => {"
    )

    # Call loadStockAlerts when switching to alerts panel
    old_switch_end = """    // Fullscreen for Stats
    const sheet = $('bottom-sheet');"""
    new_switch_end = """    // Load alerts when switching
    if (panel === 'alerts') loadStockAlerts();

    // Fullscreen for Stats
    const sheet = $('bottom-sheet');"""
    djs = djs.replace(old_switch_end, new_switch_end)

    # Add alerts button binding
    djs = djs.replace(
        "    bindClick('btn-stats', () => switchPanel('stats'));",
        "    bindClick('btn-stats', () => switchPanel('stats'));\n    bindClick('btn-alerts', () => switchPanel('alerts'));"
    )

    # Also load stock alerts when map initializes
    djs = djs.replace(
        "    loadPharmacies();\n    loadPromotions();\n    loadStats();\n  }",
        "    loadPharmacies();\n    loadPromotions();\n    loadStats();\n    loadStockAlerts();\n  }",
        1  # Only first occurrence
    )

open('js/delegue.js', 'w', encoding='utf-8').write(djs)
print("[4/4] delegue.js - Stock alerts reception")

# ============================================================
# 5. DELEGUE.HTML — Alerts panel + button
# ============================================================
dhtml = open('delegue.html', 'r', encoding='utf-8').read()

if 'panel-alerts' not in dhtml:
    # Find the stats action button and add alerts button after it
    if 'btn-stats' in dhtml:
        dhtml = dhtml.replace(
            'id="btn-stats"',
            'id="btn-stats"'
        )
    
    # Add alerts button in the action bar
    alerts_btn = """            <button class="action-btn" id="btn-alerts" style="position: relative;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              <span>Alertes</span>
              <span id="alerts-badge" style="display:none;position:absolute;top:-4px;right:-4px;background:#ef4444;color:white;font-size:10px;font-weight:700;width:18px;height:18px;border-radius:50%;align-items:center;justify-content:center;">0</span>
            </button>
"""
    # Insert after btn-stats
    dhtml = dhtml.replace(
        '</button>\n          </div>\n        </div>',
        '</button>\n' + alerts_btn + '          </div>\n        </div>',
        1
    )

    # Add the alerts panel content
    alerts_panel = """
        <!-- Alerts Panel -->
        <div id="panel-alerts" style="display: none;">
          <h3 style="font-size: 16px; font-weight: 700; color: var(--dark-200); margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;">&#x1F514;</span> Alertes Rupture de Stock
          </h3>
          <p style="font-size: 13px; color: var(--dark-400); margin-bottom: 16px; line-height: 1.5;">Les pharmacies de votre zone signalent leurs ruptures de stock ici. Contactez-les pour les reapprovisionner.</p>
          <div id="stock-alerts-list"></div>
        </div>
"""
    # Insert after the last existing panel
    if 'id="panel-stats"' in dhtml:
        # Find end of panel-stats and insert after
        idx = dhtml.find('id="panel-stats"')
        # Find the closing div of that panel section
        next_section = dhtml.find('</div>\n\n', idx)
        if next_section > 0:
            dhtml = dhtml[:next_section+7] + alerts_panel + dhtml[next_section+7:]

open('delegue.html', 'w', encoding='utf-8').write(dhtml)
print("[5/5] delegue.html - Alerts panel + badge")

# ============================================================
# SYNTAX CHECK
# ============================================================
import subprocess
all_ok = True
for f in ['js/delegue.js', 'js/pharmacien.js', 'js/app.js']:
    r = subprocess.run(['node', '--check', f], capture_output=True, text=True)
    if r.returncode != 0:
        print(f"[FAIL] {f}: {r.stderr[:200]}")
        all_ok = False
    else:
        print(f"[OK] {f}")

print("\n=== IMPLEMENTATION v5 " + ("COMPLETE" if all_ok else "AVEC ERREURS") + " ===")
