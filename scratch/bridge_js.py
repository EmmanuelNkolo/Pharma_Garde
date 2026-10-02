"""
BRIDGE SCRIPT — Adapts existing JS files to work with new HTML structure
Maps old CSS selectors/IDs to new ones
"""
import re

# ============================================================
# 1. APP.JS — Adapt selectors for new index.html
# ============================================================
appjs = open('js/app.js', 'r', encoding='utf-8').read()

# Fix old Geolocation API calls to use new module
replacements = {
    'Geolocation.requestPosition()': 'Geolocation.getCurrentPosition()',
    'Geolocation.getCity()': '(await Geolocation.reverseGeocode(pos.lat, pos.lng)).city',
    'Geolocation.loadSavedCity()': "'Douala'",
    'Geolocation.setManualPosition(': 'Geolocation.setPosition(',
    'Geolocation.startWatching(': 'Geolocation.watchPosition(',
    'Geolocation.distanceTo(': 'Geolocation.haversine(pos.lat, pos.lng, ',
    'Geolocation.haversine(pos.lat, pos.lng, pos.lat, pos.lng, ': 'Geolocation.haversine(pos.lat, pos.lng, ',
    
    # Old HTML IDs to new ones
    "('#medicines-tags-container')": "('#medicine-tags')",
    "('#btn-add-medicine')": "('#add-medicine-btn')",
    "('#btn-proceed-payment')": "('#proceed-search-btn')",
    "('#search-close')": "('#close-search-modal')",
    "('#search-backdrop')": "('#search-modal')",
    "('#search-info')": "('#search-cost')",
    "('.badge-guard')": "('.badge--amber')",
    "('.badge-open')": "('.badge--emerald')",
    "('.badge-closed')": "('.badge--red')",
    "class=\"badge badge-guard\"": "class=\"badge badge--amber\"",
    "class=\"badge badge-open\"": "class=\"badge badge--emerald\"",
    "class=\"badge badge-closed\"": "class=\"badge badge--red\"",
    "class=\"empty-state-icon\"": "class=\"empty-state__icon\"",
    "class=\"empty-state-text\"": "class=\"empty-state__desc\"",
    
    # Fix PharmMap references — create inline map management
    "PharmMap.initMap('map',": "initLeafletMap('client-map',",
    "PharmMap.setUserMarker(": "setUserMarker(",
    "PharmMap.drawRadiusCircle(": "drawRadiusCircle(",
    "PharmMap.addPharmacyMarkers(": "addPharmacyMarkers(",
    "PharmMap.recenterOnUser()": "recenterOnUser()",
    "if (PharmMap && PharmMap.map)": "if (leafletMap)",
    "PharmMap.map.invalidateSize()": "leafletMap.invalidateSize()",
    
    # Fix old window.I18N to new I18n
    "window.I18N ? window.I18N.t(": "I18n ? I18n.t(",
    "window.I18N": "window.I18n",
    
    # Fix old class references
    "class=\"pharmacy-card ": "class=\"pharmacy-card card--interactive ",
    "class=\"card-header\"": "class=\"pharmacy-card\" style=\"cursor:pointer\"",
    "class=\"card-info\"": "",
    
    # Fix getCity calls
    "Geolocation.getCity()": "'Position détectée'",
}

for old, new in replacements.items():
    if old in appjs:
        appjs = appjs.replace(old, new)
        print(f"  [OK] Replaced: {old[:50]}...")

# Add Leaflet map management functions at the top of the IIFE
leaflet_code = """
  // ── Leaflet Map Management ─────────────────────────────
  let leafletMap = null;
  let userMarker = null;
  let radiusCircle = null;
  let pharmacyMarkers = [];

  function initLeafletMap(containerId, pos, zoom) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.style.display = 'block';
    
    // Show header + bottom sheet + map controls
    const header = $('#app-header');
    const sheet = $('#bottom-sheet');
    const controls = $('#map-controls');
    if (header) header.classList.remove('hidden');
    if (sheet) sheet.classList.remove('hidden');
    if (controls) controls.classList.remove('hidden');
    
    if (leafletMap) { leafletMap.remove(); leafletMap = null; }
    leafletMap = L.map(containerId, {
      center: [pos.lat, pos.lng],
      zoom: zoom || 13,
      zoomControl: false,
      attributionControl: true
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© CartoDB © OSM',
      maxZoom: 19
    }).addTo(leafletMap);

    // Zoom controls
    const zoomIn = $('#btn-zoom-in');
    const zoomOut = $('#btn-zoom-out');
    const recenter = $('#btn-recenter');
    if (zoomIn) zoomIn.onclick = () => leafletMap.zoomIn();
    if (zoomOut) zoomOut.onclick = () => leafletMap.zoomOut();
    if (recenter) recenter.onclick = () => recenterOnUser();
  }

  function setUserMarker(lat, lng) {
    if (!leafletMap) return;
    if (userMarker) leafletMap.removeLayer(userMarker);
    const icon = L.divIcon({
      className: 'user-marker',
      html: '<div style="width:16px;height:16px;background:#10b981;border:3px solid white;border-radius:50%;box-shadow:0 0 12px rgba(16,185,129,0.5);"></div>',
      iconSize: [16, 16], iconAnchor: [8, 8]
    });
    userMarker = L.marker([lat, lng], { icon: icon, zIndexOffset: 1000 }).addTo(leafletMap);
  }

  function drawRadiusCircle(pos, radiusKm) {
    if (!leafletMap) return;
    if (radiusCircle) leafletMap.removeLayer(radiusCircle);
    radiusCircle = L.circle([pos.lat, pos.lng], {
      radius: radiusKm * 1000,
      color: '#10b981', fillColor: '#10b981', fillOpacity: 0.06, weight: 1.5, dashArray: '5,5'
    }).addTo(leafletMap);
  }

  function addPharmacyMarkers(pharmacies, onClick) {
    pharmacyMarkers.forEach(m => leafletMap.removeLayer(m));
    pharmacyMarkers = [];
    pharmacies.forEach(p => {
      const color = p.isOnDuty ? '#fbbf24' : p.isOpen ? '#10b981' : '#64748b';
      const icon = L.divIcon({
        className: 'pharm-marker',
        html: '<div style="width:28px;height:28px;background:' + color + ';border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.3);">🏥</div>',
        iconSize: [28, 28], iconAnchor: [14, 14]
      });
      const marker = L.marker([p.lat, p.lng], { icon }).addTo(leafletMap);
      marker.bindPopup('<b>' + (p.name || 'Pharmacie') + '</b><br>' + (p.address || '') + '<br><b>' + (p.distance || '?') + ' km</b>');
      if (onClick) marker.on('click', () => onClick(p));
      pharmacyMarkers.push(marker);
    });
  }

  function recenterOnUser() {
    const pos = Geolocation.getPosition();
    if (pos && leafletMap) leafletMap.setView([pos.lat, pos.lng], 13);
  }

"""

# Insert leaflet code right after the escapeHtml function
appjs = appjs.replace(
    "  function getRouteToPharmacy(pharmacyId) {",
    leaflet_code + "  function getRouteToPharmacy(pharmacyId) {"
)

# Fix handleGPSRequest to use new Geolocation module
old_gps = """    try {
      const pos = await Geolocation.getCurrentPosition();
      hideLocationModal();
      
      // Force Landscape & Desktop Layout
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock('landscape');
        }
      } catch(e) { 
        console.log('Fullscreen/Orientation lock failed', e); 
      }
      
      // Force viewport to trigger tablet/desktop layout even in portrait
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.setAttribute('content', 'width=1024, user-scalable=no, viewport-fit=cover');
      }
      setTimeout(() => {
        if (leafletMap) leafletMap.invalidateSize();
      }, 500);

      setupMapWithPosition(pos);
      showToast(`📍 Position détectée : ${(await Geolocation.reverseGeocode(pos.lat, pos.lng)).city}`, 'success');
      
      // Start watching for position updates
      Geolocation.watchPosition((newPos) => {
        setUserMarker(newPos.lat, newPos.lng);
        updatePharmacies();
      });
    } catch (error) {
      console.error('GPS error:', error);
      // Fallback to last saved city or default
      const savedCity = 'Douala';
      const cityData = CITIES_AND_QUARTERS[savedCity] || CITIES_AND_QUARTERS['Douala'];
      Geolocation.setPosition(cityData.center.lat, cityData.center.lng);
      hideLocationModal();
      setupMapWithPosition(cityData.center);
      showToast(`⚠️ GPS indisponible — Position par défaut : ${savedCity}`, 'info');"""

new_gps = """    try {
      const pos = await Geolocation.getCurrentPosition();
      hideLocationModal();
      
      setupMapWithPosition(pos);
      
      // Update city name
      const geo = await Geolocation.reverseGeocode(pos.lat, pos.lng);
      const cityEl = document.getElementById('city-name');
      if (cityEl) cityEl.textContent = geo.city;
      showToast('📍 Position détectée : ' + geo.city, 'success');
      
      // Watch position
      Geolocation.watchPosition((newPos) => {
        setUserMarker(newPos.lat, newPos.lng);
        updatePharmacies();
      });
    } catch (error) {
      console.error('GPS error:', error);
      // Fallback Douala
      const fallbackPos = { lat: 4.0511, lng: 9.7679 };
      Geolocation.setPosition(fallbackPos.lat, fallbackPos.lng);
      hideLocationModal();
      setupMapWithPosition(fallbackPos);
      showToast('⚠️ GPS indisponible — Position par défaut : Douala', 'info');"""

if old_gps in appjs:
    appjs = appjs.replace(old_gps, new_gps)
    print("  [OK] Replaced GPS handler")

# Fix setupMapWithPosition
appjs = appjs.replace(
    """  function setupMapWithPosition(pos) {
    const app = $('#app');
    if (app) app.classList.add('active');

    // Initialize map
    initLeafletMap('client-map', pos, 13);
    setUserMarker(pos.lat, pos.lng);
    drawRadiusCircle(pos, currentRadius);

    // Update city badge
    const city = 'Position détectée';
    const cityDisplay = $('#city-name-display');
    if (cityDisplay) cityDisplay.textContent = city;

    // Update settings city dropdown
    const settingsCity = $('#settings-city');
    if (settingsCity) settingsCity.value = city;

    // Update pharmacies
    updatePharmacies();

    // Add to navigation
    pushNavigation('map');
  }""",
    """  function setupMapWithPosition(pos) {
    // Initialize map
    initLeafletMap('client-map', pos, 13);
    setUserMarker(pos.lat, pos.lng);
    drawRadiusCircle(pos, currentRadius);

    // Update pharmacies
    updatePharmacies();
  }"""
)

# Fix the openSearchModal to use new HTML
appjs = appjs.replace(
    "const modal = $('#search-modal');",
    "const modal = document.getElementById('search-modal');"
)

# Fix search step navigation
appjs = appjs.replace(
    """function showSearchStep(step) {
    for (let i = 1; i <= 4; i++) {
      const el = $(`#search-step-${i}`);
      if (el) el.style.display = i === step ? 'block' : 'none';
    }
  }""",
    """function showSearchStep(step) {
    for (let i = 1; i <= 4; i++) {
      const el = document.getElementById('search-step-' + i);
      if (el) {
        if (i === step) el.classList.remove('hidden');
        else el.classList.add('hidden');
      }
    }
  }"""
)

# Fix openSearchModal
old_open = "function openSearchModal() {"
if old_open in appjs:
    # Find and update the function
    idx = appjs.find(old_open)
    end_idx = appjs.find('\n  }', idx + 30)
    appjs = appjs[:idx] + """function openSearchModal() {
    const modal = document.getElementById('search-modal');
    if (modal) modal.classList.add('active');
    showSearchStep(1);
    selectedMedicines = [];
    renderMedicineTags();
  """ + appjs[end_idx:]

# Fix closeSearchModal
old_close = "function closeSearchModal() {"
if old_close in appjs:
    idx = appjs.find(old_close)
    end_idx = appjs.find('\n  }', idx + 30)
    appjs = appjs[:idx] + """function closeSearchModal() {
    const modal = document.getElementById('search-modal');
    if (modal) modal.classList.remove('active');
  """ + appjs[end_idx:]

# Fix close-search-modal button binding
appjs = appjs.replace(
    "const searchClose = $('#close-search-modal');",
    "const searchClose = document.getElementById('close-search-modal');"
)

# Fix add-medicine-btn binding
appjs = appjs.replace(
    "const btnAdd = $('#add-medicine-btn');",
    "const btnAdd = document.getElementById('add-medicine-btn');"
)

# Fix renderMedicineTags to use new container ID
appjs = appjs.replace(
    "const container = $('#medicine-tags');",
    "const container = document.getElementById('medicine-tags');"
)

# Fix proceed-search-btn binding
appjs = appjs.replace(
    "const btnProceed = $('#proceed-search-btn');",
    "const btnProceed = document.getElementById('proceed-search-btn');"
)

# Fix guard/garde button
if "btn-garde" not in appjs:
    # Add binding for garde button
    appjs = appjs.replace(
        "// Bottom sheet drag",
        """// Garde button
    const btnGarde = document.getElementById('btn-garde');
    if (btnGarde) btnGarde.addEventListener('click', () => {
      const pos = Geolocation.getPosition();
      if (!pos) return;
      const gardePharms = pharmaciesInRadius.filter(p => p.isOnDuty);
      if (gardePharms.length === 0) {
        showToast('Aucune pharmacie de garde dans ce rayon.', 'info');
        return;
      }
      renderPharmacyList(gardePharms);
      showToast('Pharmacies de garde: ' + gardePharms.length, 'info');
    });

    // Bottom sheet drag"""
    )

# Fix payment tab bindings
appjs = appjs.replace(
    """    $$('.payment-method').forEach(method => {
      method.addEventListener('click', () => {
        $$('.payment-method').forEach(m => m.classList.remove('selected'));
        method.classList.add('selected');
        selectedPaymentMethod = method.dataset.method;
      });
    });""",
    """    // Payment method tabs in search modal
    document.querySelectorAll('#search-step-2 .tab-bar__item').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#search-step-2 .tab-bar__item').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        selectedPaymentMethod = tab.dataset.method || 'momo';
      });
    });"""
)

# Fix confirm-reservations-bar
appjs = appjs.replace(
    "const btnConfirmRes = $('#btn-confirm-all-reservations');",
    "const btnConfirmRes = document.getElementById('btn-confirm-all-reservations');"
)

# Fix updatePharmacies to use new Geolocation
appjs = appjs.replace(
    "pCopy.distance = parseFloat(Geolocation.haversine(pos.lat, pos.lng, p.lat, p.lng).toFixed(1));",
    "pCopy.distance = parseFloat(Geolocation.haversine(pos.lat, pos.lng, p.lat, p.lng).toFixed(1));"
)

# Fix showToast
old_toast = "function showToast("
if old_toast in appjs:
    idx = appjs.find(old_toast)
    end_idx = appjs.find('\n  }', idx + 20)
    appjs = appjs[:idx] + """function showToast(message, type) {
    type = type || 'success';
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-message');
    if (!toast || !msgEl) return;
    
    // Remove old classes
    toast.className = 'toast toast--' + type;
    msgEl.textContent = message;
    toast.classList.add('show');
    
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3500);
  """ + appjs[end_idx:]

# Fix bottom sheet  
appjs = appjs.replace(
    """function setupBottomSheet() {
    const sheet = $('#bottom-sheet');""",
    """function setupBottomSheet() {
    const sheet = document.getElementById('bottom-sheet');"""
)

# Fix pharmacy card rendering to use new design system classes
old_render = "class=\"pharmacy-card card--interactive "
appjs = appjs.replace(old_render, "class=\"pharmacy-card ")

# Fix I18n init call
if "I18n.init()" not in appjs:
    appjs = appjs.replace(
        "document.addEventListener('DOMContentLoaded', init);",
        "document.addEventListener('DOMContentLoaded', () => { I18n.init(); init(); });"
    )

# Ensure Geolocation.haversine is used correctly in search 
appjs = appjs.replace(
    "const dist = Geolocation.haversine(pos.lat, pos.lng, pos.lat, pos.lng, p.lat, p.lng);",
    "const dist = Geolocation.haversine(pos.lat, pos.lng, p.lat, p.lng);"
)

open('js/app.js', 'w', encoding='utf-8').write(appjs)
print("[1/3] app.js - Adapted to new HTML structure")


# ============================================================
# 2. PHARMACIEN.JS — Adapt selectors for new pharmacien.html
# ============================================================
pjs = open('js/pharmacien.js', 'r', encoding='utf-8').read()

# Fix tab switching
if 'tab-requests' not in pjs:
    old_tab_code = """  // ═══════════════════════════════════════════════════════
  //  PHARMACY STATUS TOGGLE"""
    new_tab_code = """  // ═══════════════════════════════════════════════════════
  //  TAB SWITCHING
  // ═══════════════════════════════════════════════════════
  function setupTabs() {
    const tabs = {
      'tab-requests': 'panel-requests',
      'tab-history': 'panel-history',
      'tab-delegates': 'panel-delegates',
      'tab-stats': 'panel-stats-pharm',
    };
    Object.entries(tabs).forEach(([tabId, panelId]) => {
      const tab = $(tabId);
      if (tab) {
        tab.addEventListener('click', () => {
          // Deactivate all tabs
          Object.keys(tabs).forEach(t => {
            const el = $(t);
            if (el) el.classList.remove('active');
          });
          // Hide all panels
          Object.values(tabs).forEach(p => {
            const el = $(p);
            if (el) el.style.display = 'none';
          });
          // Activate clicked tab
          tab.classList.add('active');
          const panel = $(panelId);
          if (panel) panel.style.display = 'block';
          
          // Load data for specific panels
          if (panelId === 'panel-history') loadHistory('today');
          if (panelId === 'panel-delegates') loadDelegateInteractions();
        });
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  //  PHARMACY STATUS TOGGLE"""
    pjs = pjs.replace(old_tab_code, new_tab_code)

# Add setupTabs() call in showDashboard
if 'setupTabs()' not in pjs:
    pjs = pjs.replace(
        "    loadDelegateInteractions();\n    initSettings();\n    if (typeof updateStatusDisplay === 'function') updateStatusDisplay();",
        "    loadDelegateInteractions();\n    initSettings();\n    setupTabs();\n    if (typeof updateStatusDisplay === 'function') updateStatusDisplay();"
    )

# Fix $ function if needed
if "const $ = (id) =>" not in pjs:
    # Check if $ is already defined
    if "function $(id)" not in pjs and "const $ =" not in pjs:
        pjs = pjs.replace(
            "const PharmDash = (() => {",
            "const PharmDash = (() => {\n  const $ = (id) => document.getElementById(id);\n"
        )

# Fix showToast in pharmacien
old_pt = "function showToast("
if old_pt in pjs:
    idx = pjs.find(old_pt)
    end_idx = pjs.find('\n  }', idx + 20)
    pjs = pjs[:idx] + """function showToast(message, type) {
    type = type || 'success';
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-message');
    if (!toast || !msgEl) return;
    toast.className = 'toast toast--' + type;
    msgEl.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3500);
  """ + pjs[end_idx:]

# Add I18n.init() at DOMContentLoaded
if "I18n.init()" not in pjs:
    pjs = pjs.replace(
        "document.addEventListener('DOMContentLoaded',",
        "document.addEventListener('DOMContentLoaded', () => { if (typeof I18n !== 'undefined') I18n.init(); });\n  document.addEventListener('DOMContentLoaded',"
    )

# Fix settings panel
pjs = pjs.replace(
    "$('#settings-open')",
    "document.getElementById('settings-open')"
).replace(
    "$('#settings-close')",
    "document.getElementById('settings-close')"
).replace(
    "$('#settings-panel')",
    "document.getElementById('settings-panel')"
)

# Expose toggleStatus
if 'toggleStatus:' not in pjs:
    pjs = pjs.replace(
        "window.PharmDash = {",
        "window.PharmDash = {\n    toggleStatus: function(status) { if (typeof setPharmacyStatus === 'function') setPharmacyStatus(status); },"
    )

open('js/pharmacien.js', 'w', encoding='utf-8').write(pjs)
print("[2/3] pharmacien.js - Adapted to new HTML")


# ============================================================
# 3. DELEGUE.JS — Adapt selectors for new delegue.html
# ============================================================
djs = open('js/delegue.js', 'r', encoding='utf-8').read()

# Fix showToast if present
old_dt = "function showToast("
if old_dt in djs:
    idx = djs.find(old_dt)
    end_idx = djs.find('\n  }', idx + 20)
    djs = djs[:idx] + """function showToast(message, type) {
    type = type || 'success';
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-message');
    if (!toast || !msgEl) return;
    toast.className = 'toast toast--' + type;
    msgEl.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3500);
  """ + djs[end_idx:]

# Add I18n.init()
if "I18n.init()" not in djs:
    djs = djs.replace(
        "document.addEventListener('DOMContentLoaded',",
        "document.addEventListener('DOMContentLoaded', () => { if (typeof I18n !== 'undefined') I18n.init(); });\n  document.addEventListener('DOMContentLoaded',"
    )

open('js/delegue.js', 'w', encoding='utf-8').write(djs)
print("[3/3] delegue.js - Adapted to new HTML")


# ============================================================
# SYNTAX CHECK
# ============================================================
import subprocess
all_ok = True
for f in ['js/app.js', 'js/pharmacien.js', 'js/delegue.js', 'js/i18n.js', 'js/geolocation.js']:
    r = subprocess.run(['node', '--check', f], capture_output=True, text=True)
    if r.returncode != 0:
        print(f"[FAIL] {f}: {r.stderr[:300]}")
        all_ok = False
    else:
        print(f"[OK] {f}")

print(f"\n=== BRIDGE {'COMPLETE' if all_ok else 'AVEC ERREURS'} ===")
