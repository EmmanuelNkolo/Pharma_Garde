"""
Comprehensive fix for delegue.js - Fixes all critical bugs found during audit:

1. CRITICAL: handleLogout was corrupted by getRoute injection (lines 108-109, 314-315, 332-333)
   - `handleLogout,\n    getRoute` is invalid JS syntax - these are separate functions
2. getRoute function is missing entirely from the IIFE
3. getRoute is not exposed in DelegateApp public API
4. Stats uses wrong field names (p.med_name → p.product_name, p.laboratory → p.lab_name)
5. Report select placeholder text should say "Sélectionner un laboratoire"
6. Extra closing </div> in pharmacy card rendering causes broken layout
"""
import re

content = open('js/delegue.js', 'r', encoding='utf-8').read()

# ============================================================
# FIX 1: Repair corrupted handleLogout binding in bindEvents()
# The line `bindClick('btn-logout', handleLogout,\n    getRoute);`
# should be `bindClick('btn-logout', handleLogout);`
# ============================================================
content = content.replace(
    "bindClick('btn-logout', handleLogout,\n    getRoute);",
    "bindClick('btn-logout', handleLogout);"
)

# ============================================================
# FIX 2: Repair corrupted handleLogout function definition
# `function handleLogout,\n    getRoute()` → `function handleLogout()`
# ============================================================
content = content.replace(
    "function handleLogout,\n    getRoute() {",
    "function handleLogout() {"
)

# ============================================================
# FIX 3: Repair corrupted handleLogout call in handleDeleteAccount
# `handleLogout,\n    getRoute();` → `handleLogout();`
# ============================================================
content = content.replace(
    "handleLogout,\n    getRoute();",
    "handleLogout();"
)

# ============================================================
# FIX 4: Add missing getRoute function before UTILITIES section
# ============================================================
getRoute_func = """
  function getRoute(lat, lng) {
    if (!userLat || !userLng) {
      return showToast('Veuillez d\\'abord détecter votre position.', 'error');
    }
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${lat},${lng}&travelmode=driving`, '_blank');
  }

  // ═══════════════════════════════════════════════════════
  //  UTILITIES"""

content = content.replace(
    "  // ═══════════════════════════════════════════════════════\n  //  UTILITIES",
    getRoute_func
)

# ============================================================
# FIX 5: Fix stats field names - p.med_name → p.product_name
# ============================================================
content = content.replace("p.med_name", "p.product_name")

# ============================================================
# FIX 6: Fix stats field names - p.laboratory → p.lab_name
# ============================================================
content = content.replace(
    "if (!labStats[p.laboratory]) labStats[p.laboratory]",
    "if (!labStats[p.lab_name]) labStats[p.lab_name]"
)
content = content.replace(
    "labStats[p.laboratory].sent",
    "labStats[p.lab_name].sent"
)
content = content.replace(
    "labStats[p.laboratory].interested",
    "labStats[p.lab_name].interested"
)

# ============================================================
# FIX 7: Fix report-lab select placeholder
# ============================================================
content = content.replace(
    "select.innerHTML = '<option value=\"\">— Sélectionner —</option>';",
    "select.innerHTML = '<option value=\"\">— Sélectionner un laboratoire —</option>';"
)

# ============================================================
# FIX 8: Expose getRoute in DelegateApp public API
# ============================================================
content = content.replace(
    "window.DelegateApp = {\n    openSendPromo,\n    openVisitRequest,\n  };",
    "window.DelegateApp = {\n    openSendPromo,\n    openVisitRequest,\n    getRoute,\n  };"
)

# ============================================================
# FIX 9: Fix the extra closing </div> in pharmacy card template
# The template has an extra </div> that breaks layout
# ============================================================
content = content.replace(
    "          </div>\n        </div>\n        </div>",
    "          </div>\n        </div>"
)

# ============================================================
# FIX 10: Ensure settings-save handler is bound (was missing)
# ============================================================
if "bindClick('settings-save'" not in content:
    content = content.replace(
        "bindClick('settings-close', () => $('settings-panel').classList.remove('open'));",
        "bindClick('settings-close', () => $('settings-panel').classList.remove('open'));\n    bindClick('settings-save', handleSaveSettings);"
    )

# ============================================================
# FIX 11: Add handleSaveSettings if missing
# ============================================================
if "function handleSaveSettings" not in content:
    save_settings = """
  async function handleSaveSettings() {
    if (!currentDelegate) return;
    const firstName = ($('settings-firstname') || {}).value?.trim();
    const lastName = ($('settings-lastname') || {}).value?.trim();
    const phone = ($('settings-phone') || {}).value?.trim();

    if (!firstName || !lastName) return showToast('Nom et prénom obligatoires.', 'error');

    try {
      const { error } = await supabase.from('delegates').update({
        first_name: firstName,
        last_name: lastName,
        phone: phone || null,
      }).eq('id', currentDelegate.id);
      if (error) throw error;

      currentDelegate.first_name = firstName;
      currentDelegate.last_name = lastName;
      currentDelegate.phone = phone;
      saveSession(currentDelegate, sessionLabs);

      showToast('✅ Profil mis à jour !', 'success');
      $('settings-panel').classList.remove('open');
    } catch (err) {
      showToast('❌ Erreur: ' + (err.message || ''), 'error');
    }
  }

"""
    content = content.replace(
        "  function getRoute(lat, lng) {",
        save_settings + "  function getRoute(lat, lng) {"
    )

open('js/delegue.js', 'w', encoding='utf-8').write(content)
print("OK - delegue.js patched successfully")
