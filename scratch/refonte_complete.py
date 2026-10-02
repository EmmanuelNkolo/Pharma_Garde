"""
REFONTE COMPLETE - Pharma-Garde
Script unique qui corrige TOUT en profondeur.
"""
import re, subprocess

# ============================================================
# 1. PAYMENT.JS - No external redirect, stay in-app
# ============================================================
pay = open('js/payment.js', 'r', encoding='utf-8').read()

# Fix: Replace redirect to external payment page with in-app message
pay = pay.replace(
    """        if (!data.direct_charge && data.authorization_url) {
          // Fallback: rediriger dans la même fenêtre vers le checkout Notch Pay
          window.location.href = data.authorization_url;
          return { success: false, error: 'Redirection vers la page de paiement...' };
        }""",
    """        if (!data.direct_charge && data.authorization_url) {
          // Fallback: show in-app payment instructions instead of redirecting
          return {
            success: false,
            error: 'Veuillez composer *126# (Orange Money) ou *126*1# (MTN MoMo) pour valider le paiement de 100 FCFA, puis relancez la recherche.'
          };
        }"""
)

# Fix: return proper object instead of bare return on insufficient funds
pay = pay.replace(
    """      if (err && (err.message || '').toLowerCase().includes('insufficient')) {
        if (typeof showToast === 'function') showToast('Solde insuffisant. Veuillez recharger votre compte.', 'error');
        else alert('Solde insuffisant. Veuillez recharger votre compte.');
        return;
      }""",
    """      if (err && (err.message || '').toLowerCase().includes('insufficient')) {
        return { success: false, error: 'Solde insuffisant. Veuillez recharger votre compte avant de relancer la recherche.' };
      }"""
)

open('js/payment.js', 'w', encoding='utf-8').write(pay)
print("[1/8] payment.js - No external redirects")

# ============================================================
# 2. DELEGUE.JS - Complete interaction fix
# ============================================================
djs = open('js/delegue.js', 'r', encoding='utf-8').read()

# Fix: openSendPromo was filtering by is_active (doesn't exist)
# Already fixed in previous pass, verify
if "p.is_active" in djs:
    djs = djs.replace("myPromotions.filter(p => p.is_active).forEach(p => {", "myPromotions.forEach(p => {")

# Fix: Ensure btn-cancel-promo resets the specific container
old_cancel = "    bindClick('btn-cancel-promo', () => $('new-promo-modal').classList.remove('active'));"
if old_cancel in djs:
    djs = djs.replace(old_cancel, """    bindClick('btn-cancel-promo', () => {
      $('new-promo-modal').classList.remove('active');
      const sc = $('promo-specific-container'); if (sc) sc.style.display = 'none';
      const bc = $('promo-buttons-container'); if (bc) bc.style.display = 'flex';
    });""")

# Fix: Ensure btn-save-promo-specific shows pharmacy selector
old_specific = "    bindClick('btn-save-promo-specific', () => handleSavePromotion('specific'));"
if old_specific in djs:
    djs = djs.replace(old_specific, """    bindClick('btn-save-promo-specific', () => {
      if (!pharmaciesInRadius || pharmaciesInRadius.length === 0) {
        return showToast('Aucune pharmacie dans le rayon. Detectez votre position.', 'error');
      }
      const bc = $('promo-buttons-container'); if (bc) bc.style.display = 'none';
      const sc = $('promo-specific-container'); if (sc) sc.style.display = 'flex';
      const sel = $('promo-specific-pharmacy');
      if (sel) {
        sel.innerHTML = '<option value="">-- Choisir une pharmacie --</option>' +
          pharmaciesInRadius.map(p => '<option value="' + p.id + '">' + escapeHtml(p.name) + ' (' + haversine(userLat, userLng, p.lat, p.lng).toFixed(1) + ' km)</option>').join('');
      }
    });""")

# Add missing event handlers for specific pharmacy selection buttons
if "bindClick('btn-cancel-specific'" not in djs:
    # Insert after btn-save-promo-specific handler
    insert_after = "bindClick('btn-save-promo-specific-confirm', () => handleSavePromotion('specific'));"
    if insert_after not in djs:
        # Add both handlers before the Visit modal section
        djs = djs.replace(
            "    // Visit modal",
            """    bindClick('btn-cancel-specific', () => {
      const sc = $('promo-specific-container'); if (sc) sc.style.display = 'none';
      const bc = $('promo-buttons-container'); if (bc) bc.style.display = 'flex';
    });
    bindClick('btn-save-promo-specific-confirm', () => handleSavePromotion('specific'));

    // Visit modal"""
        )

# Fix: getRoute should NOT open external window, use in-app navigation
djs = djs.replace(
    """  function getRoute(lat, lng) {
    if (!userLat || !userLng) {
      return showToast('Veuillez d\\'abord d\\u00e9tecter votre position.', 'error');
    }
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${lat},${lng}&travelmode=driving`, '_blank');
  }""",
    """  function getRoute(lat, lng) {
    if (!userLat || !userLng) {
      return showToast('Veuillez d\\'abord detecter votre position.', 'error');
    }
    // Use native navigation intent on mobile, fallback to Google Maps in same context
    const url = 'https://www.google.com/maps/dir/?api=1&origin=' + userLat + ',' + userLng + '&destination=' + lat + ',' + lng + '&travelmode=driving';
    try {
      // Try native navigation (works on Android/iOS)
      window.location.href = 'geo:' + lat + ',' + lng + '?q=' + lat + ',' + lng;
    } catch(e) {
      window.open(url, '_blank');
    }
  }"""
)

# Also fix the simpler version if it exists
djs = djs.replace(
    "window.open(`https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${lat},${lng}&travelmode=driving`, '_blank');",
    """// Use native navigation intent on mobile
    const url = 'https://www.google.com/maps/dir/?api=1&origin=' + userLat + ',' + userLng + '&destination=' + lat + ',' + lng + '&travelmode=driving';
    try { window.location.href = 'geo:' + lat + ',' + lng + '?q=' + lat + ',' + lng; } catch(e) { window.open(url, '_blank'); }"""
)

open('js/delegue.js', 'w', encoding='utf-8').write(djs)
print("[2/8] delegue.js - Interactions & no external redirects")

# ============================================================
# 3. APP.JS - Fix external redirects, improve payment UX
# ============================================================
appjs = open('js/app.js', 'r', encoding='utf-8').read()

# Fix: getRoute in app.js - same pattern
if "window.open(`https://www.google.com/maps/dir" in appjs:
    appjs = re.sub(
        r"window\.open\(`https://www\.google\.com/maps/dir/\?api=1&origin=\$\{.*?\}.*?`, '_blank'\);",
        """// Native navigation intent
      const navUrl = 'https://www.google.com/maps/dir/?api=1&origin=' + pos.lat + ',' + pos.lng + '&destination=' + lat + ',' + lng + '&travelmode=driving';
      try { window.location.href = 'geo:' + lat + ',' + lng + '?q=' + lat + ',' + lng; } catch(e) { window.open(navUrl, '_blank'); }""",
        appjs
    )

# Fix: Ensure showToast in app.js uses proper duration & visibility
if "toast._timer" not in appjs:
    appjs = appjs.replace(
        "setTimeout(() => toast.classList.remove('show'), 4000);",
        "clearTimeout(toast._timer); toast._timer = setTimeout(() => toast.classList.remove('show'), 5000);"
    )

open('js/app.js', 'w', encoding='utf-8').write(appjs)
print("[3/8] app.js - Payment UX & navigation")

# ============================================================
# 4. CSS - Professional windows, modals, toasts
# ============================================================

# Global professional CSS that applies to ALL spaces
pro_css = """
/* ═══════════════════════════════════════════════════════
   REFONTE PROFESSIONNELLE GLOBALE
   ═══════════════════════════════════════════════════════ */

/* Toast - Maximum visibility on ALL screens */
.toast {
  position: fixed !important;
  top: 24px !important;
  left: 50% !important;
  transform: translateX(-50%) translateY(-140px) !important;
  min-width: 300px !important;
  max-width: 88vw !important;
  padding: 16px 28px !important;
  border-radius: 16px !important;
  font-size: 15px !important;
  font-weight: 600 !important;
  z-index: 999999 !important;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5) !important;
  backdrop-filter: blur(16px) !important;
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease !important;
  opacity: 0 !important;
  text-align: center !important;
  line-height: 1.5 !important;
}
.toast.show {
  transform: translateX(-50%) translateY(0) !important;
  opacity: 1 !important;
}
.toast-success { background: linear-gradient(135deg, #059669, #10b981) !important; color: white !important; border: 1px solid rgba(16,185,129,0.4) !important; }
.toast-error { background: linear-gradient(135deg, #dc2626, #ef4444) !important; color: white !important; border: 1px solid rgba(239,68,68,0.4) !important; }
.toast-info { background: linear-gradient(135deg, #2563eb, #3b82f6) !important; color: white !important; border: 1px solid rgba(59,130,246,0.4) !important; }

/* Modal backdrop - Professional */
.modal-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: pgFadeIn 0.2s ease;
}
.modal-backdrop.active {
  display: flex;
}
.modal-backdrop > .login-card,
.modal-backdrop > div[style*="max-width"] {
  max-height: 88vh;
  overflow-y: auto;
  border-radius: 20px !important;
  box-shadow: 0 24px 64px rgba(0,0,0,0.6) !important;
  animation: pgSlideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes pgFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes pgSlideUp { from { opacity: 0; transform: translateY(24px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }

/* Empty states - compact, not full screen */
.empty-state {
  padding: 32px 16px !important;
  text-align: center;
  max-width: 320px;
  margin: 0 auto;
}
.empty-state-icon {
  font-size: 36px !important;
  margin-bottom: 12px;
}
.empty-state-text {
  font-size: 14px !important;
  color: var(--dark-400, #6b7280) !important;
  line-height: 1.6;
}

/* Buttons - Professional micro-animations */
.btn {
  transition: all 0.2s ease !important;
  cursor: pointer;
}
.btn:hover:not(:disabled) {
  transform: translateY(-1px) !important;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2) !important;
}
.btn:active:not(:disabled) {
  transform: translateY(0) scale(0.98) !important;
}

/* Tables - Professional */
table {
  font-size: 13px;
}
table th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--dark-800, #1e293b) !important;
  white-space: nowrap;
  font-weight: 700;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.5px;
}
table td { vertical-align: middle; }
table tr:hover td { background: rgba(255,255,255,0.03) !important; }

/* Cards - hover effect */
.pharmacy-card-delegate,
.delegate-promo-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease !important;
}
.pharmacy-card-delegate:hover,
.delegate-promo-card:hover {
  transform: translateY(-2px) !important;
  box-shadow: 0 8px 24px rgba(0,0,0,0.15) !important;
}

/* Settings panel professional */
.settings-panel {
  max-width: 400px !important;
  box-shadow: -8px 0 40px rgba(0,0,0,0.4) !important;
}

/* Stat cards glow effect */
.stat-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease !important;
}
.stat-card:hover {
  transform: translateY(-3px) !important;
  box-shadow: 0 8px 24px rgba(5, 150, 105, 0.15) !important;
}

/* Promo specific container */
#promo-specific-container {
  background: rgba(5, 150, 105, 0.06);
  border: 1px solid rgba(5, 150, 105, 0.25);
  border-radius: 14px;
  padding: 16px;
}

/* Spinner */
.spinner {
  display: inline-block;
  width: 18px; height: 18px;
  border: 2.5px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: pgSpin 0.6s linear infinite;
}
@keyframes pgSpin { to { transform: rotate(360deg); } }

/* Bottom sheet professional */
#bottom-sheet {
  border-radius: 24px 24px 0 0 !important;
  box-shadow: 0 -8px 40px rgba(0,0,0,0.3) !important;
}

/* Delete modal centered */
#delete-modal {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 10000;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.75);
  backdrop-filter: blur(8px);
}

/* Form inputs professional */
.input-field {
  transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
}
.input-field:focus {
  border-color: var(--green-500, #059669) !important;
  box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.15) !important;
  outline: none !important;
}

/* Scrollbar styling */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }
"""

marker = "REFONTE PROFESSIONNELLE GLOBALE"

for css_file in ['css/app.css', 'css/delegue.css', 'css/pharmacien.css']:
    c = open(css_file, 'r', encoding='utf-8').read()
    if marker not in c:
        c += pro_css
    open(css_file, 'w', encoding='utf-8').write(c)
    print(f"[4/8] {css_file} - Professional CSS")

# ============================================================
# 5. INDEX.CSS - Ensure toast works on welcome/home page too
# ============================================================
icss = open('css/index.css', 'r', encoding='utf-8').read()
if marker not in icss:
    icss += pro_css
open('css/index.css', 'w', encoding='utf-8').write(icss)
print("[5/8] index.css - Professional CSS")

# ============================================================
# 6. PHARMACIEN.JS - Ensure delegate interactions load as table
# ============================================================
pjs = open('js/pharmacien.js', 'r', encoding='utf-8').read()

# Fix: Ensure respondPromo is exposed in PharmDash public API
if "respondPromo" not in pjs.split("window.PharmDash")[0][-200:]:
    # Check if handlePromoResponse exists
    if "async function handlePromoResponse" in pjs:
        # Ensure it's exposed
        if "respondPromo: handlePromoResponse" not in pjs:
            pjs = pjs.replace(
                "window.PharmDash = {",
                "window.PharmDash = {\n    respondPromo: handlePromoResponse,"
            )

# Fix: Ensure the pharmacien doesn't redirect externally for calls
# WhatsApp links with target="_blank" are OK (native app handler)
# But ensure getRoute uses native intent
if "function getRoute" in pjs:
    pjs = re.sub(
        r"window\.open\(`https://www\.google\.com/maps/dir.*?`.*?\);",
        """// Native navigation
      const navUrl = 'https://www.google.com/maps/dir/?api=1&origin=' + currentPharmacy.lat + ',' + currentPharmacy.lng + '&destination=' + lat + ',' + lng + '&travelmode=driving';
      try { window.location.href = 'geo:' + lat + ',' + lng; } catch(e) { window.open(navUrl, '_blank'); }""",
        pjs
    )

open('js/pharmacien.js', 'w', encoding='utf-8').write(pjs)
print("[6/8] pharmacien.js - Delegate interactions")

# ============================================================
# 7. DELEGUE.HTML - Fix promo modal has settings-save button
# ============================================================
dhtml = open('delegue.html', 'r', encoding='utf-8').read()

# Ensure settings inputs are editable (currently disabled)
dhtml = dhtml.replace(
    '<input type="text" id="settings-lastname" class="input-field" disabled>',
    '<input type="text" id="settings-lastname" class="input-field">'
)
dhtml = dhtml.replace(
    '<input type="text" id="settings-firstname" class="input-field" disabled>',
    '<input type="text" id="settings-firstname" class="input-field">'
)
dhtml = dhtml.replace(
    '<input type="text" id="settings-phone" class="input-field" disabled>',
    '<input type="text" id="settings-phone" class="input-field">'
)

# Add save button to settings if missing
if 'id="settings-save"' not in dhtml:
    dhtml = dhtml.replace(
        """      <div class="form-group">
        <label>Laboratoires d'attache (session)</label>
        <div id="settings-labs" style="font-size: 14px; color: var(--dark-300);"></div>
      </div>
    </div>
  </div>""",
        """      <div class="form-group">
        <label>Laboratoires d'attache (session)</label>
        <div id="settings-labs" style="font-size: 14px; color: var(--dark-300);"></div>
      </div>
      <button id="settings-save" class="btn btn-primary" style="width: 100%; margin-top: 16px;">Enregistrer les modifications</button>
    </div>
  </div>"""
    )

open('delegue.html', 'w', encoding='utf-8').write(dhtml)
print("[7/8] delegue.html - Settings & modals")

# ============================================================
# 8. SYNTAX CHECK
# ============================================================
all_ok = True
for f in ['js/delegue.js', 'js/pharmacien.js', 'js/app.js', 'js/payment.js']:
    r = subprocess.run(['node', '--check', f], capture_output=True, text=True)
    status = "OK" if r.returncode == 0 else "FAIL: " + r.stderr[:150]
    print(f"[CHECK] {f}: {status}")
    if r.returncode != 0:
        all_ok = False

if all_ok:
    print("\n=== REFONTE COMPLETE - TOUS LES FICHIERS VALIDES ===")
else:
    print("\n=== ATTENTION: ERREURS DE SYNTAXE DETECTEES ===")
