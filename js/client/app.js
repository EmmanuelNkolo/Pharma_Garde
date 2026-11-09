/**
 * Pharma-Garde — Main Application Controller
 * Coordinates all modules: map, geolocation, search, payment
 */

const App = (() => {
  // ── State ──────────────────────────────────────────────
  let currentRadius = 5; // km
  let pharmaciesInRadius = [];
  let selectedMedicines = [];
  let selectedPaymentMethod = 'momo';
  let insuranceName = null;
  let navigationHistory = [];
  let navIndex = -1;
  let demoSlideIndex = 0;

  // Demo slides data
  const DEMO_SLIDES = [
    { icon: '📍', title: 'Localisez-vous', desc: 'Pharma-Garde détecte automatiquement votre position GPS pour trouver les pharmacies les plus proches dans un rayon de 2 à 20 km.' },
    { icon: '💊', title: 'Recherchez vos médicaments', desc: 'Entrez le nom du médicament recherché. Notre système interroge en temps réel toutes les pharmacies ouvertes autour de vous.' },
    { icon: '💰', title: 'Paiement Mobile Money', desc: 'Payez seulement 100 FCFA via Orange Money ou MTN MoMo. Une session de 24h vous permet des recherches illimitées.' },
    { icon: '🔔', title: 'Réponses en temps réel', desc: 'Les pharmacies reçoivent votre demande instantanément et vous répondent dans les minutes qui suivent. Aucune attente !' },
    { icon: '🗺️', title: 'Itinéraire GPS', desc: 'Obtenez l\'itinéraire exact vers la pharmacie qui a votre médicament. Appelez-la ou contactez-la par WhatsApp directement.' },
    { icon: '🏥', title: 'Espace Pharmacie', desc: 'Vous êtes pharmacien ? Inscrivez votre pharmacie pour recevoir des demandes de patients, gérer vos stocks et augmenter votre visibilité.' },
  ];

  // ── DOM References ─────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let reservationInterval = null;

  function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return unsafe.toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  }


  // ── Leaflet Map Management ─────────────────────────────
  let leafletMap = null;
  let userMarker = null;
  let radiusCircle = null;
  let mapMask = null;
  let routeLayer = null;
  let pharmacyMarkers = [];
  let filterGardeOnly = false;

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
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
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
      html: '<div style="width:18px;height:18px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 0 15px rgba(59,130,246,0.8);position:relative;"><div style="position:absolute;top:-10px;left:-10px;width:32px;height:32px;border-radius:50%;background:rgba(59,130,246,0.3);animation:pulse 2s infinite;"></div></div>',
      iconSize: [18, 18], iconAnchor: [9, 9]
    });
    userMarker = L.marker([lat, lng], { icon: icon, zIndexOffset: 1000 }).addTo(leafletMap);
    // Ré-applique l'étiquette « Vous êtes ici » (quartier) si elle est déjà connue
    if (lastLocationInfo && window.PGLocation) PGLocation.labelUserMarker(userMarker, lastLocationInfo, lastAccuracy);
  }

  // ── Localisation précise : quartier, zone, arrondissement ─────
  let lastLocationInfo = null;
  let lastAccuracy = null;
  let lastRevPos = null;

  async function refreshLocationLabels(pos, opts) {
    if (!window.PGLocation) return;
    const o = opts || {};
    // Évite les appels inutiles : nouveau géocodage seulement après 120 m de déplacement
    if (!o.force && lastRevPos && Geolocation.haversine(pos.lat, pos.lng, lastRevPos.lat, lastRevPos.lng) < 0.12) return;
    lastRevPos = { lat: pos.lat, lng: pos.lng };
    const info = await PGLocation.reverse(pos.lat, pos.lng);
    lastLocationInfo = info;
    const cityEl = $('#city-name');
    if (cityEl) {
      cityEl.textContent = info.short || info.city || 'Position détectée';
      const badge = $('#city-badge');
      if (badge) badge.title = info.full || info.display || '';
    }
    if (userMarker) PGLocation.labelUserMarker(userMarker, info, lastAccuracy);
  }

  function fitRadius() {
    if (leafletMap && radiusCircle) {
      try { leafletMap.fitBounds(radiusCircle.getBounds(), { padding: [16, 16], maxZoom: 16 }); } catch (e) { /* carte non prête */ }
    }
  }

  function drawRadiusCircle(pos, radiusKm) {
    if (!leafletMap) return;
    if (radiusCircle) leafletMap.removeLayer(radiusCircle);
    if (mapMask) leafletMap.removeLayer(mapMask);

    radiusCircle = L.circle([pos.lat, pos.lng], {
      radius: radiusKm * 1000,
      color: '#3b82f6', fillColor: '#bfdbfe', fillOpacity: 0.1, weight: 2, dashArray: ''
    }).addTo(leafletMap);

    const hole = [];
    const R = 6371;
    const lat1 = pos.lat * Math.PI / 180;
    const lon1 = pos.lng * Math.PI / 180;
    const d = radiusKm / R;
    for (let i = 0; i < 64; i++) {
      const brng = (i * 360 / 64) * Math.PI / 180;
      const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
      const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
      hole.push([lat2 * 180 / Math.PI, lon2 * 180 / Math.PI]);
    }

    const outerBounds = [
      [90, -360],
      [90, 360],
      [-90, 360],
      [-90, -360]
    ];

    mapMask = L.polygon([outerBounds, hole], {
      stroke: false,
      fillColor: '#0f172a',
      fillOpacity: 0.5
    }).addTo(leafletMap);
  }

  function addPharmacyMarkers(pharmacies, onClick) {
    pharmacyMarkers.forEach(m => leafletMap.removeLayer(m));
    pharmacyMarkers = [];
    pharmacies.forEach(p => {
      let bgColor = '#64748b';
      let emoji = '🛒';
      if (p.isOnDuty) { bgColor = '#f59e0b'; emoji = '🏥'; }
      else if (p.isOpen) { bgColor = '#10b981'; emoji = '💊'; }
      
      const icon = L.divIcon({
        className: 'pharm-marker',
        html: `<div style="width:24px;height:24px;background:${bgColor};border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${emoji}</div>`,
        iconSize: [24, 24], iconAnchor: [12, 12]
      });
      const marker = L.marker([p.lat, p.lng], { icon }).addTo(leafletMap);
      // Sécurité : les noms/adresses proviennent d'OSM ou de la base → échappement systématique
      marker.bindPopup('<b>' + escapeHtml(p.name || 'Pharmacie') + '</b><br>' + escapeHtml(p.address || '') + '<br><b>' + escapeHtml(p.distance != null ? p.distance : '?') + ' km</b>');
      if (onClick) marker.on('click', () => onClick(p));
      pharmacyMarkers.push(marker);
    });
  }

  function recenterOnUser() {
    const pos = Geolocation.getPosition();
    if (pos && leafletMap) {
      if (radiusCircle) fitRadius(); else leafletMap.setView([pos.lat, pos.lng], 14);
    }
  }

  function getRouteToPharmacy(pharmacyId) {
    var p = findPharmacy(pharmacyId);
    if (p) {
      getRoute(p.lat, p.lng, p.name);
    } else {
      const respMatch = (typeof realResponses !== 'undefined') ? realResponses.find(r => String(r.pharmacy_id) === String(pharmacyId)) : null;
      const match = (typeof pharmaciesInRadius !== 'undefined') ? pharmaciesInRadius.find(x => String(x.id) === String(pharmacyId)) : null;
      if (match && match.lat && match.lng) {
        getRoute(match.lat, match.lng, match.name || (respMatch && respMatch.pharmacy_name));
      } else {
        showToast('Position introuvable pour le calcul de l\'itinéraire.', 'error');
      }
    }
  }

  // ── Initialize ─────────────────────────────────────────
  function init() {
    // Splash screen timer (Low-Latency 350ms)
    setTimeout(() => {
      $('#splash-screen').classList.add('hidden');
      const welcomeScreen = $('#welcome-screen');
      if (welcomeScreen) {
        welcomeScreen.classList.remove('hidden');
      } else {
        showLocationModal();
      }
    }, 350);

    bindEvents();
    initDemoSlides();
    updateSessionUI();
    setInterval(updateSessionUI, 30000); // Synchronisation automatique du compte à rebours 24h
    
    document.addEventListener('languageChanged', () => {
      updatePharmacies();
      updateSessionUI();
    });
    
    // Load active requests for patient
    loadActiveRequests();
  }

  // ── Event Bindings ─────────────────────────────────────
  function bindEvents() {
    // Welcome screen Client choice
    const btnClient = $('#btn-espace-client');
    if (btnClient) {
      btnClient.addEventListener('click', () => {
        $('#welcome-screen').classList.add('hidden');
        showLocationModal();
        const pharmBtn = document.querySelector('.pharmacist-btn');
        if (pharmBtn) pharmBtn.style.display = 'none';
      });
    }

    // GPS Permission
    const btnGps = $('#btn-gps');
    if (btnGps) {
      btnGps.addEventListener('click', handleGPSRequest);
    }

    // Navigation buttons
    const navBack = $('#nav-back');
    const navForward = $('#nav-forward');
    const navHome = $('#nav-home');
    if (navBack) navBack.addEventListener('click', goBack);
    if (navForward) navForward.addEventListener('click', goForward);
    if (navHome) navHome.addEventListener('click', goHome);

    // Radius pills
    $$('.radius-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        $$('.radius-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        currentRadius = parseInt(pill.dataset.radius);
        const pos = Geolocation.getPosition();
        if (pos && leafletMap) {
          drawRadiusCircle(pos, currentRadius);
          fitRadius();
          if (window.PGLocation) PGLocation.showAreaLabels(leafletMap, pos, currentRadius);
        }
        updatePharmacies();
      });
    });

    // Search button
    const searchBtn = $('#search-btn');
    if (searchBtn) searchBtn.addEventListener('click', openSearchModal);

    // Camera/Ordonnance button
    const cameraBtn = document.getElementById('btn-ordonnance');
    if (cameraBtn) cameraBtn.addEventListener('click', openOCRModal);

    // Demo button
    const demoBtn = $('#demo-btn');
    if (demoBtn) demoBtn.addEventListener('click', openDemoModal);

    // Search modal
    const searchClose = document.getElementById('close-search-modal');
    const searchBackdrop = $('#search-modal');
    if (searchClose) searchClose.addEventListener('click', closeSearchModal);
    if (searchBackdrop) {
      searchBackdrop.addEventListener('click', (e) => {
        if (e.target === searchBackdrop) closeSearchModal();
      });
    }

    // Medicine input
    const medicineInput = $('#medicine-input');
    if (medicineInput) {
      medicineInput.addEventListener('input', handleMedicineInput);
      medicineInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addMedicine(medicineInput.value.trim());
        }
      });
    }

    // Add medicine button
    const btnAdd = document.getElementById('add-medicine-btn');
    if (btnAdd) {
      btnAdd.addEventListener('click', () => {
        addMedicine($('#medicine-input').value.trim());
      });
    }

    // Proceed to payment
    const btnProceed = document.getElementById('proceed-search-btn');
    const insuranceSelect = $('#insurance-select');
    const customInsuranceInput = $('#custom-insurance-input');

    if (insuranceSelect && customInsuranceInput) {
      insuranceSelect.addEventListener('change', (e) => {
        if (e.target.value === 'Autres') {
          customInsuranceInput.classList.remove('hidden');
        } else {
          customInsuranceInput.classList.add('hidden');
          customInsuranceInput.value = '';
        }
      });
    }

    if (btnProceed) {
      btnProceed.addEventListener('click', () => {
        if (selectedMedicines.length === 0) {
          showToast('⚠️ Ajoutez au moins un médicament', 'error');
          return;
        }
        if (insuranceSelect) {
          if (insuranceSelect.value === 'Autres') {
            insuranceName = customInsuranceInput.value.trim() || 'Autres';
          } else {
            insuranceName = insuranceSelect.value || null;
          }
        }
        proceedToPayment();
      });
    }


    // Payment methods
    // Payment method tabs in search modal
    document.querySelectorAll('#search-step-2 .tab-bar__item').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#search-step-2 .tab-bar__item').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        selectedPaymentMethod = tab.dataset.method || 'momo';
      });
    });

    // Confirm payment
    const btnConfirmPayment = $('#btn-confirm-payment');
    if (btnConfirmPayment) btnConfirmPayment.addEventListener('click', handlePayment);

    // Back to search from payment
    const btnBackSearch = $('#btn-back-search');
    if (btnBackSearch) btnBackSearch.addEventListener('click', () => showSearchStep(1));

    // New search button on live response banner
    const btnNewSearch = $('#btn-new-search');
    if (btnNewSearch) {
      btnNewSearch.addEventListener('click', () => {
        openNewSearchWithoutCancel();
      });
    }

    // Cancel / Quitter search
    const btnCancelSearch = $('#btn-cancel-search');
    if (btnCancelSearch) {
      btnCancelSearch.addEventListener('click', () => {
        activeRequestIds = [];
        localStorage.removeItem('pharma_active_requests');
        responseChannels.forEach(ch => supabase.removeChannel(ch));
        responseChannels = [];
        realResponses = [];
        
        const banner = $('#responses-banner');
        if (banner) banner.style.display = 'none';
        const actions = $('#main-actions');
        if (actions) actions.style.display = '';
        const list = $('#pharmacy-list');
        if (list) list.innerHTML = '';
        
        updatePharmacies();
      });
    }

    // Settings
    const settingsOpen = $('#settings-open');
    const settingsClose = $('#settings-close');
    const settingsBackdrop = $('#settings-backdrop');
    if (settingsOpen) settingsOpen.addEventListener('click', openSettings);
    if (settingsClose) settingsClose.addEventListener('click', closeSettings);
    if (settingsBackdrop) settingsBackdrop.addEventListener('click', closeSettings);

    // Settings: radius change
    const settingsRadius = $('#settings-radius');
    if (settingsRadius) {
      settingsRadius.addEventListener('change', (e) => {
        currentRadius = parseInt(e.target.value);
        $$('.radius-pill').forEach(p => {
          p.classList.toggle('active', parseInt(p.dataset.radius) === currentRadius);
        });
        updatePharmacies();
      });
    }

    // Settings: city change
    const settingsCity = $('#settings-city');
    if (settingsCity) {
      settingsCity.addEventListener('change', (e) => {
        const city = e.target.value;
        if (CITIES_AND_QUARTERS[city]) {
          const center = CITIES_AND_QUARTERS[city].center;
          Geolocation.setPosition(center.lat, center.lng);
          setupMapWithPosition(center);
          showToast(`📍 Position changée : ${city}`, 'success');
        }
      });
    }

    // Detail modal
    const detailBackdrop = $('#detail-backdrop');
    if (detailBackdrop) detailBackdrop.addEventListener('click', closeDetail);

    // Recenter button
    const btnRecenter = $('#btn-recenter');
    if (btnRecenter) btnRecenter.addEventListener('click', () => {
      recenterOnUser();
    });

    // Fullscreen button
    const btnFullscreen = $('#btn-fullscreen');
    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(err => {
            console.error(`Erreur plein écran: ${err.message} (${err.name})`);
          });
        } else {
          document.exitFullscreen();
        }
      });
    }

    // Toggle switches
    $$('.toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('active');
        if (toggle.id === 'toggle-closed') {
          updatePharmacies();
        }
      });
    });

    // Garde button
    const btnGarde = document.getElementById('btn-garde');
    if (btnGarde) btnGarde.addEventListener('click', () => {
      filterGardeOnly = !filterGardeOnly;
      btnGarde.classList.toggle('is-on', filterGardeOnly);
      btnGarde.setAttribute('aria-pressed', filterGardeOnly ? 'true' : 'false');
      updatePharmacies();
    });

    // Bottom sheet drag
    setupBottomSheet();

    // OCR modal
    setupOCRModal();

    // Insurance modal
    setupInsuranceModal();

    // Demo modal
    const demoClose = $('#demo-close');
    const demoBackdrop = $('#demo-backdrop');
    if (demoClose) demoClose.addEventListener('click', closeDemoModal);
    if (demoBackdrop) {
      demoBackdrop.addEventListener('click', (e) => {
        if (e.target === demoBackdrop) closeDemoModal();
      });
    }

    const demoPrev = $('#demo-prev');
    const demoNext = $('#demo-next');
    if (demoPrev) demoPrev.addEventListener('click', () => navigateDemo(-1));
    if (demoNext) demoNext.addEventListener('click', () => navigateDemo(1));
  }

  // ── Location Modal ─────────────────────────────────────
  function showLocationModal() {
    const modal = $('#location-modal');
    if (modal) {
      modal.classList.add('active');
    }
  }

  function hideLocationModal() {
    const modal = $('#location-modal');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  // ── GPS Request (affichage dès le 1er relevé, affinage en arrière-plan) ──
  let watchStarted = false;
  let gpsMapReady = false;

  function applyFix(fix) {
    if (!fix || !isFinite(fix.lat) || !isFinite(fix.lng)) return;
    const prev = Geolocation.getPosition();
    if (fix.accuracy) lastAccuracy = fix.accuracy;
    Geolocation.setPosition(fix.lat, fix.lng);
    try { localStorage.setItem('pg_last_fix', JSON.stringify({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy || null, ts: Date.now() })); } catch (e) { /* quota */ }
    if (!gpsMapReady) {
      gpsMapReady = true;
      hideLocationModal();
      setupMapWithPosition(fix);
      setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 400);
      return;
    }
    // Affinage : on ne redessine que si le déplacement est significatif (> 25 m)
    const moved = prev ? Geolocation.haversine(prev.lat, prev.lng, fix.lat, fix.lng) : 1;
    setUserMarker(fix.lat, fix.lng);
    if (moved > 0.025) {
      drawRadiusCircle(fix, currentRadius);
      refreshLocationLabels(fix);
      scheduleUpdatePharmacies();
    }
  }

  async function handleGPSRequest() {
    const btn = $('#btn-gps');
    if (btn) {
      btn.textContent = 'Détection en cours...';
      btn.disabled = true;
    }
    gpsMapReady = !!leafletMap;

    try {
      let best;
      if (window.PG && typeof PG.locate === 'function') {
        // Le premier relevé (souvent < 2 s) affiche immédiatement la carte,
        // les relevés suivants affinent la précision jusqu'à 25 m.
        best = await PG.locate({ desired: 25, maxWait: 20000, onProgress: applyFix });
      } else {
        best = await Geolocation.getCurrentPosition();
      }
      applyFix(best);
      const acc = best && best.accuracy ? ` (±${Math.round(best.accuracy)} m)` : '';
      showToast(`📍 Position détectée${acc}`, 'success');

      // Suivi continu (une seule fois), filtré par distance
      if (!watchStarted) {
        watchStarted = true;
        Geolocation.watchPosition((newPos) => applyFix(newPos));
      }
    } catch (error) {
      console.error('GPS error:', error);
      if (gpsMapReady) {
        // Une position approximative a déjà été obtenue : on la conserve
        showToast('📍 Position approximative conservée — activez le GPS haute précision pour l\'affiner.', 'info');
      } else {
        // Dernière position connue (< 24 h) puis ville par défaut
        let fallback = null;
        try {
          const last = JSON.parse(localStorage.getItem('pg_last_fix') || 'null');
          if (last && Date.now() - last.ts < 24 * 3600 * 1000) fallback = last;
        } catch (e) { /* ignore */ }
        const cityData = CITIES_AND_QUARTERS['Douala'];
        const center = fallback || cityData.center;
        Geolocation.setPosition(center.lat, center.lng);
        hideLocationModal();
        gpsMapReady = true;
        setupMapWithPosition(center);
        showToast(fallback ? '⚠️ GPS indisponible — dernière position connue utilisée' : '⚠️ GPS indisponible — Position par défaut : Douala', 'info');
      }
    } finally {
      if (btn) {
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Détecter ma position`;
        btn.disabled = false;
      }
    }
  }

  // ── Map Setup ──────────────────────────────────────────
  function setupMapWithPosition(pos) {
    initLeafletMap('client-map', pos, 13);
    setUserMarker(pos.lat, pos.lng);
    drawRadiusCircle(pos, currentRadius);
    fitRadius();

    // En parallèle (non bloquant) : liste des pharmacies, quartier exact, noms des zones
    updatePharmacies();
    refreshLocationLabels(pos, { force: true });
    if (window.PGLocation) PGLocation.showAreaLabels(leafletMap, pos, currentRadius);
  }

  // ── Pharmacy Data (service + rendu progressif) ─────────
  let updateGen = 0;
  let updateTimer = null;

  function scheduleUpdatePharmacies() {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(updatePharmacies, 350);
  }

  async function updatePharmacies() {
    const pos = Geolocation.getPosition();
    if (!pos) return;
    const gen = ++updateGen;

    if (!window.PGPharmacyService) {
      console.error('PGPharmacyService manquant');
      return;
    }
    // 1er rendu instantané (données locales + caches), puis rendu complet
    const all = await PGPharmacyService.load(pos, (partial) => {
      if (gen === updateGen) displayPharmacies(partial, pos);
    });
    if (gen !== updateGen) return; // résultat obsolète (rayon/position modifié entre-temps)
    displayPharmacies(all, pos);
  }

  function displayPharmacies(allPharmacies, pos) {
    // Filter by radius
    pharmaciesInRadius = allPharmacies.filter(p => p.distance <= currentRadius);

    // Show/hide closed pharmacies based on setting
    const toggleEl = $('#toggle-closed'); const showClosed = toggleEl ? toggleEl.classList.contains('active') : true;
    let displayList = showClosed
      ? pharmaciesInRadius
      : pharmaciesInRadius.filter(p => p.isOpen || p.isOnDuty);

    if (filterGardeOnly) {
      displayList = displayList.filter(p => p.isOnDuty);
    }

    // If an active search is ongoing, only show pharmacies that have responded
    if (activeRequestIds.length > 0) {
      const respondedPharmacyIds = new Set(realResponses.map(r => String(r.pharmacy_id)));
      displayList = displayList.filter(p => respondedPharmacyIds.has(String(p.id)));
    }

    // Sort: on-duty first, then open, then by distance
    displayList.sort((a, b) => {
      if (a.isOnDuty && !b.isOnDuty) return -1;
      if (!a.isOnDuty && b.isOnDuty) return 1;
      if (a.isOpen && !b.isOpen) return -1;
      if (!a.isOpen && b.isOpen) return 1;
      return a.distance - b.distance;
    });

    // Update map markers
    addPharmacyMarkers(displayList, (p) => openDetail(p));
    drawRadiusCircle(pos, currentRadius);

    // Update stats
    const openCount = displayList.filter(p => p.isOpen).length;
    const guardCount = displayList.filter(p => p.isOnDuty).length;
    const openCountEl = $('#open-count');
    const guardCountEl = $('#guard-count');
    if (openCountEl) {
      let txt = I18n ? I18n.t('map.open_count', { n: openCount }) : '';
      openCountEl.textContent = (!txt || txt === 'map.open_count') ? `${openCount} pharmacie(s) ouverte(s)` : txt;
    }
    if (guardCountEl) {
      let txt = I18n ? I18n.t('map.guard_count', { n: guardCount }) : '';
      guardCountEl.textContent = (!txt || txt === 'map.guard_count') ? `${guardCount} de garde` : txt;
    }

    // Render pharmacy list
    if (activeRequestIds.length === 0) {
      renderPharmacyList(displayList);
    }
  }

  // ── Pharmacy List Rendering (délégation d'événements, aucun code inline) ──
  const ICON_PIN = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  const ICON_CLOCK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  const ICON_MOON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  const ICON_CALL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  const ICON_WA = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d8b4e2" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  const ICON_ROUTE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>';
  const MAX_LIST = 80; // rendu limité pour rester fluide même avec des centaines d'officines

  function bindPharmacyListDelegation() {
    const list = $('#pharmacy-list');
    if (!list || list._pgDelegated) return;
    list._pgDelegated = true;
    list.addEventListener('click', (e) => {
      const card = e.target.closest('[data-pharma-id]');
      if (!card || !list.contains(card)) return;
      const p = findPharmacy(card.getAttribute('data-pharma-id'));
      if (!p) return;
      const actionEl = e.target.closest('[data-action]');
      const action = actionEl ? actionEl.getAttribute('data-action') : 'detail';
      e.stopPropagation();
      if (action === 'call') callPharmacy(p.phone);
      else if (action === 'whatsapp') openWhatsApp(p.whatsapp || p.phone);
      else if (action === 'route') getRoute(p.lat, p.lng, p.name);
      else if (action === 'identity') {
        if (window.PGProGeo) PGProGeo.openActorModal('pharmacy', { id: p.id, name: p.name, lat: Number(p.lat) || 4.0511, lng: Number(p.lng) || 9.7085, phone: p.phone || '', address: p.address || '' });
      } else openDetail(p);
    });
  }

  function renderPharmacyList(pharmacies) {
    const list = $('#pharmacy-list');
    if (!list) return;
    bindPharmacyListDelegation();

    if (pharmacies.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">🔍</div>
          <div class="empty-state__desc">${I18n ? I18n.t('map.empty', { r: currentRadius }) : `Aucune pharmacie trouvée dans un rayon de ${currentRadius} km. Essayez d'élargir le rayon de recherche.`}</div>
        </div>
      `;
      return;
    }

    list.innerHTML = pharmacies.slice(0, MAX_LIST).map(p => `
<div class="pharma-card ${p.isOnDuty ? 'pharma-card--guard' : ''}" data-pharma-id="${escapeHtml(p.id)}">
  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; gap:10px;">
    <div style="min-width:0;">
      <div style="font-weight:700; font-size:16px; color:#fff; margin-bottom:4px;">${escapeHtml(p.name)}</div>
      <div style="font-size:13px; color:#94a3b8; display:flex; align-items:center; gap:4px;">${ICON_PIN} ${escapeHtml(p.address || 'Adresse inconnue')}</div>
    </div>
    <div style="text-align:right; flex-shrink:0;">
      <div style="font-weight:700; font-size:16px; color:#10b981;">${escapeHtml(p.distance)}</div>
      <div style="font-size:12px; color:#64748b;">km</div>
    </div>
  </div>
  <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
    ${p.isOnDuty
      ? `<div style="background:rgba(217,119,6,0.15); border:1px solid #d97706; border-radius:12px; padding:4px 10px; font-size:11px; font-weight:700; color:#fbbf24; display:flex; align-items:center; gap:4px;">${ICON_MOON} DE GARDE</div>`
      : '<div style="background:rgba(16,185,129,0.15); border:1px solid #10b981; border-radius:12px; padding:4px 10px; font-size:11px; font-weight:700; color:#10b981; display:flex; align-items:center; gap:4px;">OUVERT</div>'}
    <div style="font-size:12px; color:#94a3b8; display:flex; align-items:center; gap:4px;">${ICON_CLOCK} ${escapeHtml(p.hours || '08h00 - 20h00')}</div>
  </div>
  <div style="display:flex; gap:8px; flex-wrap:wrap;">
    <button type="button" class="pharma-btn btn-call" data-action="call">${ICON_CALL} Appeler</button>
    <button type="button" class="pharma-btn btn-whatsapp" data-action="whatsapp">${ICON_WA} WhatsApp</button>
    <button type="button" class="pharma-btn btn-route" data-action="route">${ICON_ROUTE} Y aller</button>
    <button type="button" class="pharma-btn" data-action="identity" style="background:rgba(59,130,246,0.14); border:1px solid rgba(59,130,246,0.4); color:#93c5fd;">🪪 Identité &amp; GPS</button>
  </div>
</div>`).join('') + (pharmacies.length > MAX_LIST
      ? `<div style="text-align:center; font-size:12px; color:#94a3b8; padding:10px;">+ ${pharmacies.length - MAX_LIST} autres officines — réduisez le rayon pour affiner.</div>`
      : '');
  }

  // ── Search Modal ───────────────────────────────────────
  function openSearchModal() {
    const modal = document.getElementById('search-modal');
    if (modal) modal.classList.add('active');
    showSearchStep(1);
    selectedMedicines = [];
    renderMedicineTags();
    updateSessionUI();
  }

  function closeSearchModal() {
    const modal = document.getElementById('search-modal');
    if (modal) modal.classList.remove('active');
  
  }

  function showSearchStep(step) {
    ['1', '2', '3', '4'].forEach(s => {
      const el = $(`#search-step-${s}`);
      if (el) el.classList.add('hidden');
    });
    const stepEl = $(`#search-step-${step}`);
    if (stepEl) stepEl.classList.remove('hidden');
  }

  function showConfirmStep() {
    if (selectedMedicines.length === 0) {
      showToast('⚠️ Ajoutez au moins un médicament', 'error');
      return;
    }

    // Show confirmation
    const list = $('#confirm-products-list');
    if (list) {
      list.innerHTML = selectedMedicines.map((med, i) => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
          <span>💊 ${escapeHtml(med)}</span>
          <span style="color: var(--green-400);">✓</span>
        </div>
      `).join('');
    }

    showSearchStep('confirm');
  }

  // (Duplicate OCR code removed for clarity)

  // ── Medicine Input ─────────────────────────────────────
  function handleMedicineInput(e) {
    const value = e.target.value.trim();
    const autocompleteList = $('#autocomplete-list');
    if (!autocompleteList) return;

    if (value.length < 2) {
      autocompleteList.classList.remove('visible');
      return;
    }

    const medications = typeof COMMON_MEDICATIONS !== 'undefined' ? COMMON_MEDICATIONS : [];
    const matches = medications.filter(med => 
      med.toLowerCase().includes(value.toLowerCase())
    ).slice(0, 8);

    if (matches.length === 0) {
      autocompleteList.classList.remove('visible');
      return;
    }

    autocompleteList.innerHTML = matches.map(med => {
      const highlighted = med.replace(
        new RegExp(`(${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
        '<mark>$1</mark>'
      );
      return `<div class="autocomplete-item" onclick="App.addMedicine('${med.replace(/'/g, "\\'")}')">${highlighted}</div>`;
    }).join('');

    autocompleteList.classList.add('visible');
  }

  function addMedicine(name) {
    if (!name) return;
    if (selectedMedicines.includes(name)) {
      showToast('Ce médicament est déjà dans la liste', 'info');
      return;
    }

    selectedMedicines.push(name);
    renderMedicineTags();
    updateSessionUI();
    
    const input = $('#medicine-input');
    if (input) input.value = '';
    
    const autocompleteList = $('#autocomplete-list');
    if (autocompleteList) autocompleteList.classList.remove('visible');

    // Enable proceed button
    const btn = $('#proceed-search-btn');
    if (btn) btn.disabled = selectedMedicines.length === 0;

    // Show search info
    const info = $('#search-cost');
    if (info) info.classList.add('visible');
  }

  function removeMedicine(index) {
    selectedMedicines.splice(index, 1);
    renderMedicineTags();
    updateSessionUI();
    
    const btn = $('#proceed-search-btn');
    if (btn) btn.disabled = selectedMedicines.length === 0;

    if (selectedMedicines.length === 0) {
      const info = $('#search-cost');
      if (info) info.classList.remove('visible');
    }
  }

  function renderMedicineTags() {
    const container = document.getElementById('medicine-tags');
    if (!container) return;

    container.innerHTML = selectedMedicines.map((med, i) => `
      <span class="medicine-tag">
        ${med}
        <span class="remove-tag" onclick="App.removeMedicine(${i})">✕</span>
      </span>
    `).join('');
  }

  // ── Insurance Modal ────────────────────────────────────
  function setupInsuranceModal() {
    const btnYes = $('#ins-btn-yes');
    const btnNo = $('#ins-btn-no');
    const btnBack = $('#ins-btn-back');
    const btnConfirm = $('#ins-btn-confirm');
    const backdrop = $('#insurance-backdrop');

    if (btnYes) {
      btnYes.addEventListener('click', () => {
        $('#insurance-step-1').style.display = 'none';
        $('#insurance-step-2').style.display = 'flex';
      });
    }

    if (btnNo) {
      btnNo.addEventListener('click', () => {
        insuranceName = null;
        closeInsuranceModal();
        proceedToPayment();
      });
    }

    if (btnBack) {
      btnBack.addEventListener('click', () => {
        $('#insurance-step-2').style.display = 'none';
        $('#insurance-step-1').style.display = 'flex';
      });
    }

    if (btnConfirm) {
      btnConfirm.addEventListener('click', () => {
        const nameInput = $('#insurance-name-input');
        insuranceName = nameInput ? nameInput.value.trim() : null;
        closeInsuranceModal();
        proceedToPayment();
      });
    }

    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeInsuranceModal();
      });
    }
  }

  function showInsuranceModal() {
    const modal = $('#insurance-modal');
    if (modal) {
      modal.style.display = 'flex';
      $('#insurance-step-1').style.display = 'flex';
      $('#insurance-step-2').style.display = 'none';
    }
  }

  function closeInsuranceModal() {
    const modal = $('#insurance-modal');
    if (modal) modal.style.display = 'none';
  }

  // ── Session UI Synchronization ─────────────────────────
  function updateSessionUI() {
    if (typeof Payment === 'undefined') return;

    const hasSession = Payment.hasActiveSession();
    const sessionInfo = Payment.getSessionInfo();
    const costVal = $('#cost-value');
    const costSubtitle = $('#cost-subtitle');
    const proceedBtn = $('#proceed-search-btn');
    const sessionTimer = $('#session-timer');
    const phoneInput = $('#phone-input');

    // 1. Floating Session Timer Badge
    if (sessionTimer) {
      if (hasSession) {
        sessionTimer.classList.remove('hidden');
        sessionTimer.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #34d399; box-shadow: 0 0 10px #34d399; animation: pulse 2s infinite;"></span>
            <span>Pass 24h Actif · Recherches illimitées (${sessionInfo.formatted})</span>
          </div>
        `;
        sessionTimer.onclick = () => {
          showToast(`🟢 Pass 24h actif (${sessionInfo.formatted} restantes) : Toutes vos recherches de médicaments sont gratuites et illimitées.`, 'info');
        };
      } else {
        sessionTimer.classList.add('hidden');
        sessionTimer.innerHTML = '';
        sessionTimer.onclick = null;
      }
    }

    // 2. Pre-fill phone in payment step if available
    if (phoneInput && !phoneInput.value && sessionInfo.phone) {
      phoneInput.value = sessionInfo.phone;
    }

    // 3. Search Modal Cost & Button
    if (costVal) {
      if (hasSession) {
        costVal.innerHTML = `<span style="color: var(--emerald-400);">0 FCFA</span> <span style="display: inline-block; font-size: 11px; background: rgba(16,185,129,0.2); color: #6ee7b7; padding: 2px 8px; border-radius: 12px; margin-left: 6px; font-weight: 700; vertical-align: middle;">PASS 24H ACTIF</span>`;
        if (costSubtitle) {
          costSubtitle.innerHTML = `Inclus dans votre session active (${sessionInfo.formatted} restantes)`;
          costSubtitle.style.color = '#34d399';
        }
      } else {
        costVal.textContent = `${Payment.SEARCH_COST} FCFA`;
        if (costSubtitle) {
          costSubtitle.textContent = `Valable pour 24h de recherches illimitées`;
          costSubtitle.style.color = 'var(--text-secondary)';
        }
      }
    }

    if (proceedBtn) {
      const btnText = proceedBtn.querySelector('span[data-i18n]') || proceedBtn;
      if (hasSession) {
        btnText.innerHTML = `🚀 Lancer la recherche <small style="font-weight: 500; opacity: 0.9;">(Gratuit · Pass 24h)</small>`;
      } else {
        btnText.textContent = `Suivant`;
      }
    }
  }

  async function proceedToPayment() {
    const hasSession = Payment.hasActiveSession();

    if (hasSession) {
      // Session active, skip payment completely!
      const sessionInfo = Payment.getSessionInfo();
      showToast(`✅ Pass 24h actif (${sessionInfo.formatted} restantes) ! Recherche lancée sans frais.`, 'success');
      
      const phoneInput = $('#phone-input');
      if (phoneInput && !phoneInput.value && sessionInfo.phone) {
        phoneInput.value = sessionInfo.phone;
      }
      
      handleSearchRequest();
      return;
    }

    // Attempt remote auto-restore if phone was previously entered/saved
    const phoneInput = $('#phone-input');
    const savedPhone = (phoneInput && phoneInput.value.trim()) || localStorage.getItem('pharmagarde_client_phone') || '';
    if (savedPhone) {
      const restored = await Payment.verifyRemoteSession(savedPhone);
      if (restored) {
        updateSessionUI();
        const sessionInfo = Payment.getSessionInfo();
        showToast(`✅ Pass 24h restauré (${sessionInfo.formatted} restantes) ! Recherche lancée sans frais.`, 'success');
        if (phoneInput && !phoneInput.value) phoneInput.value = savedPhone;
        handleSearchRequest();
        return;
      }
    }

    // Show payment step (100 FCFA)
    const cost = Payment.getSearchCost();
    const amountEl = $('#payment-amount-val');
    if (amountEl) amountEl.textContent = cost;
    showSearchStep(2);
  }

  // ── Payment ────────────────────────────────────────────
  async function handlePayment() {
    const phoneInput = $('#phone-input');
    const phone = phoneInput ? phoneInput.value.trim() : '';
    
    if (!phone) {
      showToast('⚠️ Entrez votre numéro de téléphone', 'error');
      return;
    }

    const btn = $('#btn-confirm-payment');
    if (btn) {
      btn.textContent = 'Traitement en cours...';
      btn.disabled = true;
    }

    try {
      const result = await Payment.processPayment(phone, selectedPaymentMethod, Payment.SEARCH_COST);
      
      if (result.success) {
        // Explicitly create/refresh session and persist phone
        Payment.createSession(result.transactionId, phone);
        updateSessionUI();
        showToast(`🎉 ${result.message || 'Paiement confirmé ! Votre Pass 24h est activé.'}`, 'success');
        handleSearchRequest();
      } else {
        if (result.redirect) {
          // Si la popup a été bloquée par le navigateur, on propose le lien manuel
          const btn = $('#btn-confirm-payment');
          if (btn) {
            btn.outerHTML = `<a href="${result.authorization_url}" target="_blank" class="btn btn-primary" style="display:block; text-align:center; padding: 16px; font-weight: bold; background: #10b981;">Payer sur la page sécurisée</a>
                             <div style="text-align:center; margin-top: 10px; font-size: 13px; color: #a1a1aa;">Veuillez payer puis recommencer la recherche.</div>`;
          }
        } else {
          showToast(`❌ ${result.error}`, 'error');
        }
      }
    } catch (error) {
      showToast('❌ Erreur de paiement. Réessayez.', 'error');
    } finally {
      if (btn) {
        btn.textContent = '✅ Confirmer le paiement';
        btn.style.fontSize = '';
        btn.disabled = false;
      }
    }
  }

  // ── Search Request (REAL — Supabase) ────────────────────
  let activeRequestIds = [];
  let responseChannels = [];
  let realResponses = [];
  let reservedMedicines = {}; // { pharmacyId: { meds: [...], resp: respObj } }

  async function handleSearchRequest() {
    showSearchStep(3);
    realResponses = [];
    reservedMedicines = {};
    
    const pingMedName = $('#ping-medicine-name');
    const pingCount = $('#ping-pharmacy-count');
    const pingStatus = $('#ping-status');
    
    if (pingMedName) pingMedName.textContent = selectedMedicines.join(', ');

    // Count pharmacies in radius that are open/on-duty from Supabase
    let pharmacyCount = 0;
    try {
      const pos = Geolocation.getPosition();
      const { data: dbPharmacies } = await supabase
        .from('pharmacies')
        .select('id, name, phone, address, lat, lng, status, is_open, is_on_duty')
        .or('is_open.eq.true,is_on_duty.eq.true');

      if (dbPharmacies) {
        const inRadius = dbPharmacies.filter(p => {
          if (!pos) return true;
          const dist = Geolocation.haversine(pos.lat, pos.lng, p.lat, p.lng);
          return dist <= currentRadius;
        });
        pharmacyCount = inRadius.length;
      }
    } catch(e) {
      console.error('Pharmacy count error:', e);
    }

    const localOpen = pharmaciesInRadius.filter(p => p.isOpen || p.isOnDuty);
    pharmacyCount = Math.max(pharmacyCount, localOpen.length);
    if (pingCount) pingCount.textContent = pharmacyCount;
    if (pingStatus) pingStatus.textContent = 'Envoi de la demande...';

    try {
      const pos = Geolocation.getPosition();
      const phoneInput = $('#phone-input');
      // Request expires in 2 hours
      const expiresAt = new Date(Date.now() + 2 * 3600000).toISOString();
      
      // Session ID handling (9 chars)
      let sessionId = sessionStorage.getItem('pharma_session_id');
      if (!sessionId) {
        sessionId = Math.random().toString(36).substring(2, 11).toUpperCase();
        while(sessionId.length < 9) sessionId += Math.random().toString(36).substring(2, 3).toUpperCase();
        sessionId = sessionId.substring(0, 9);
        sessionStorage.setItem('pharma_session_id', sessionId);
      }
      
      // Robust client phone retrieval (from input OR session OR localStorage)
      const sessionInfo = (typeof Payment !== 'undefined' && Payment.getSessionInfo) ? Payment.getSessionInfo() : {};
      const clientPhone = (phoneInput && phoneInput.value.trim()) || sessionInfo.phone || localStorage.getItem('pharmagarde_client_phone') || null;

      const { data, error } = await supabase
        .from('requests')
        .insert([{
          medicines: selectedMedicines,
          user_lat: pos ? pos.lat : null,
          user_lng: pos ? pos.lng : null,
          radius: currentRadius,
          status: 'pending',
          session_id: sessionId,
          user_phone: clientPhone,
          insurance_name: insuranceName,
          expires_at: expiresAt,
          created_at: new Date().toISOString(),
        }])
        .select()
        .single();

      if (error) {
        console.error('Request insert error:', error);
        if (pingStatus) pingStatus.textContent = '⚠️ Erreur d\'envoi.';
        return;
      }

      // Store in localStorage
      let storedIds = JSON.parse(localStorage.getItem('pharma_active_requests') || '[]');
      storedIds.push(data.id);
      localStorage.setItem('pharma_active_requests', JSON.stringify(storedIds));
      activeRequestIds = storedIds;

      // Close modal, show waiting in bottom sheet
      const modal = document.getElementById('search-modal');
      if (modal) modal.classList.remove('active');
      
      const mainActions = $('#main-actions');
      const banner = $('#responses-banner');
      if (mainActions) mainActions.style.display = 'none';
      if (banner) banner.style.display = 'flex';
      
      const listEl = $('#pharmacy-list');
      if (listEl) {
        listEl.innerHTML = `
          <div style="padding: 30px 20px; text-align: center; color: var(--dark-400);">
            <div class="loading-dots" style="justify-content: center; margin-bottom: 16px;">
              <span style="background: var(--green-500)"></span>
              <span style="background: var(--green-500)"></span>
              <span style="background: var(--green-500)"></span>
            </div>
            <div style="font-weight: 500;">Recherche de pharmacies en cours...</div>
            <div style="font-size: 13px; margin-top: 8px;">Les réponses apparaîtront ici. Durée max: 2h.</div>
          </div>`;
      }

      subscribeToResponses();
      
      // Update map to hide non-responding pharmacies immediately
      updatePharmacies();

    } catch(e) {
      console.error('Search request error:', e);
      if (pingStatus) pingStatus.textContent = '❌ Erreur.';
    }
  }

  async function loadActiveRequests() {
    let storedIds = JSON.parse(localStorage.getItem('pharma_active_requests') || '[]');
    if (storedIds.length === 0) return;

    try {
      const { data } = await supabase.from('requests').select('*').in('id', storedIds).eq('status', 'pending');
      
      const validIds = [];
      const now = new Date();
      (data || []).forEach(req => {
        const created = new Date(req.created_at);
        const expiresAt = req.expires_at ? new Date(req.expires_at) : new Date(created.getTime() + 2 * 3600000);
        if (now < expiresAt) {
          validIds.push(req.id);
        }
      });

      if (validIds.length > 0) {
        activeRequestIds = validIds;
        localStorage.setItem('pharma_active_requests', JSON.stringify(validIds));
        
        const { data: existingResp } = await supabase.from('responses').select('*').in('request_id', validIds);
        realResponses = existingResp || [];
        
        const mainActions = $('#main-actions');
        const banner = $('#responses-banner');
        if (mainActions) mainActions.style.display = 'none';
        if (banner) banner.style.display = 'flex';
        
        const listEl = $('#pharmacy-list');
        if (listEl && realResponses.length === 0) {
          listEl.innerHTML = `
            <div style="padding: 30px 20px; text-align: center; color: var(--dark-400);">
              <div class="loading-dots" style="justify-content: center; margin-bottom: 16px;">
                <span style="background: var(--green-500)"></span>
                <span style="background: var(--green-500)"></span>
                <span style="background: var(--green-500)"></span>
              </div>
              <div style="font-weight: 500;">Recherche de pharmacies en cours...</div>
              <div style="font-size: 13px; margin-top: 8px;">Vos demandes précédentes sont toujours actives.</div>
            </div>`;
        } else {
          renderPatientResponses();
        }
        
        updatePharmacies(); // Refresh map based on loaded active requests
        
        subscribeToResponses();
      } else {
        localStorage.removeItem('pharma_active_requests');
      }
    } catch (e) {
      console.error('Error loading active requests:', e);
    }
  }

  function subscribeToResponses() {
    responseChannels.forEach(ch => supabase.removeChannel(ch));
    responseChannels = [];

    activeRequestIds.forEach(reqId => {
      const channel = supabase
        .channel(`responses_for_${reqId}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'responses',
          filter: `request_id=eq.${reqId}`
        }, (payload) => {
          const resp = payload.new;
          realResponses.push(resp);
          renderPatientResponses();
          updatePharmacies(); // Update map markers to show the new responder
          showToast('🔔 Nouvelle réponse d\'une pharmacie !', 'info');
        })
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'responses',
          filter: `request_id=eq.${reqId}`
        }, (payload) => {
          const updatedResp = payload.new;
          const idx = realResponses.findIndex(r => r.id === updatedResp.id);
          if (idx !== -1) {
            realResponses[idx] = updatedResp;
            renderPatientResponses();
            updatePharmacies();
            showToast('⚠️ Une pharmacie a mis à jour sa réponse.', 'warning');
          }
        })
        .subscribe();
      responseChannels.push(channel);
    });
  }

  // ── Render Patient Responses (Multi-Pharmacy Per-Medicine Reserve) ──
  function renderPatientResponses() {
    const listEl = $('#pharmacy-list');
    if (!listEl || realResponses.length === 0) return;

    // Add confirm reservations button at top
    let confirmBtnHtml = '<div id="confirm-reservations-bar" style="display:none; padding: 12px; background: rgba(16,185,129,0.15); border-radius: 12px; margin-bottom: 16px; text-align: center;">' +
      '<p style="font-size: 13px; color: var(--green-400); margin-bottom: 8px;">Médicaments sélectionnés de plusieurs pharmacies</p>' +
      '<button class="btn btn-primary btn-block" onclick="App.confirmAllReservations()">✅ Confirmer les réservations</button></div>';

    // Sort responses: newer requests first, then by creation date of the response
    const sortedResponses = [...realResponses].sort((a, b) => {
      const aReqIdx = activeRequestIds.indexOf(a.request_id);
      const bReqIdx = activeRequestIds.indexOf(b.request_id);
      if (aReqIdx !== bReqIdx) {
        return bReqIdx - aReqIdx; // Newer requests (higher index) first
      }
      return new Date(b.created_at) - new Date(a.created_at); // Newer responses first if same request
    });

    // Multi-request header bar if more than 1 search request active
    let multiReqBar = '';
    if (activeRequestIds.length > 1) {
      multiReqBar = `<div style="padding: 10px 14px; background: rgba(59,130,246,0.12); border: 1px solid rgba(59,130,246,0.25); border-radius: 10px; margin-bottom: 14px; font-size: 12px; color: #93c5fd; display: flex; justify-content: space-between; align-items: center;">
        <span>📋 <strong>${activeRequestIds.length}</strong> recherches actives</span>
        <button class="btn btn--sm btn--secondary" onclick="App.openNewSearchWithoutCancel()" style="padding: 4px 8px; font-size: 11px;">+ Autre produit</button>
      </div>`;
    }

    listEl.innerHTML = multiReqBar + confirmBtnHtml + sortedResponses.map(resp => {
      const pos = Geolocation.getPosition();
      let distance = '—';
      const p = findPharmacy(resp.pharmacy_id);
      if (pos && p) {
        distance = parseFloat(Geolocation.haversine(pos.lat, pos.lng, p.lat, p.lng).toFixed(1)) + ' km';
      }

      let medsHtml = '';
      if (resp.medicines_status) {
        medsHtml = Object.entries(resp.medicines_status).map(([med, status]) => {
          const isInStock = status.startsWith('en_stock');
          let badge = '';
          if (status === 'en_stock_assure') badge = '<span style="color:var(--green-500)">✅ En stock assuré</span>';
          else if (status === 'en_stock_non_assure') badge = '<span style="color:var(--gold-500)">⚠️ En stock non assuré</span>';
          else if (status === 'en_stock') badge = '<span style="color:var(--green-500)">✅ En stock</span>';
          else badge = '<span style="color:var(--red-500)">❌ Rupture</span>';
          const reserveBtn = isInStock
            ? `<button class="btn btn-sm reserve-med-btn" data-request-id="${escapeHtml(resp.request_id)}" data-pharmacy-id="${escapeHtml(resp.pharmacy_id)}" data-med="${escapeHtml(med)}" data-pharmacy-name="${escapeHtml(resp.pharmacy_name || '')}" data-pharmacy-phone="${escapeHtml(resp.pharmacy_phone || '')}" data-pharmacy-address="${escapeHtml(resp.pharmacy_address || '')}" onclick="App.toggleReserveMedicine(this)">Réserver</button>`
            : '';

          return `<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 13px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
            <span style="font-weight: 500; flex: 1;">💊 ${escapeHtml(med)}</span>
            ${badge}
            ${reserveBtn}
          </div>`;
        }).join('');
      }

      const sessionId = sessionStorage.getItem('pharma_session_id') || 'INCONNU';
      
      return `
        <div class="pharma-card" data-pharmacy-id="${escapeHtml(resp.pharmacy_id)}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; cursor:pointer;" data-pid="${escapeHtml(resp.pharmacy_id)}" onclick="App.openDetail(App.findPharmacy(this.dataset.pid))">
            <div>
              <div style="font-weight:700; font-size:16px; color:#fff; margin-bottom:4px;">${escapeHtml(resp.pharmacy_name || 'Pharmacie')}</div>
              <div style="font-size: 11px; color: #10b981; margin: 2px 0 4px; font-weight: 600;">ID Session : ${escapeHtml(sessionId)}</div>
              <div style="font-size:13px; color:#94a3b8; display:flex; align-items:center; gap:4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                ${escapeHtml(resp.pharmacy_address || 'Adresse inconnue')}
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-weight:700; font-size:16px; color:#10b981;">${distance.replace(' km', '')}</div>
              <div style="font-size:12px; color:#64748b;">km</div>
            </div>
          </div>
          
          <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
            ${medsHtml}
          </div>

          <div style="display:flex; gap:8px;">
            ${resp.pharmacy_phone ? `
              <button class="pharma-btn btn-call" data-phone="${escapeHtml(resp.pharmacy_phone)}" onclick="App.callPharmacy(this.dataset.phone)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> Appeler
              </button>
              <button class="pharma-btn btn-whatsapp" data-phone="${escapeHtml(resp.pharmacy_phone)}" onclick="App.openWhatsApp(this.dataset.phone)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#10b981"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.5.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg> WhatsApp
              </button>
            ` : ''}
            <button class="pharma-btn btn-route" data-pid="${escapeHtml(resp.pharmacy_id)}" onclick="App.getRouteToPharmacy(this.dataset.pid)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg> Y aller
            </button>
            <button class="pharma-btn" style="background:rgba(59,130,246,0.14); border:1px solid rgba(59,130,246,0.4); color:#93c5fd;" data-pid="${escapeHtml(resp.pharmacy_id || '')}" data-name="${escapeHtml(resp.pharmacy_name || 'Pharmacie')}" data-phone="${escapeHtml(resp.pharmacy_phone || '')}" data-address="${escapeHtml(resp.pharmacy_address || '')}" onclick="window.PGProGeo && PGProGeo.openActorModal('pharmacy', { id: this.dataset.pid, name: this.dataset.name, phone: this.dataset.phone, address: this.dataset.address })">
              🪪 Identité &amp; GPS
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  
  function generateReservationCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = 'PG-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  function openNewSearchWithoutCancel() {
    // Keep active requests and responses intact, open modal for additional search
    selectedMedicines = [];
    insuranceName = null;
    renderMedicineTags();
    showSearchStep(1);
    updateSessionUI();
    
    const btn = $('#proceed-search-btn');
    if (btn) btn.disabled = true;
    const input = $('#medicine-input');
    if (input) { input.value = ''; input.focus(); }
    
    const modal = document.getElementById('search-modal');
    if (modal) modal.classList.add('active');
  }

  function toggleReserveMedicine(btnEl) {
    var pharmacyId = btnEl.getAttribute('data-pharmacy-id');
    var reqId = btnEl.getAttribute('data-request-id');
    var med = btnEl.getAttribute('data-med');
    var pharmacyName = btnEl.getAttribute('data-pharmacy-name');
    var pharmacyPhone = btnEl.getAttribute('data-pharmacy-phone');
    var pharmacyAddress = btnEl.getAttribute('data-pharmacy-address');
    if (btnEl.classList.contains('reserved')) {
      btnEl.classList.remove('reserved');
      btnEl.textContent = 'Réserver';
      btnEl.style.background = '';
      if (reservedMedicines[pharmacyId]) {
        reservedMedicines[pharmacyId].meds = reservedMedicines[pharmacyId].meds.filter(function(m) { return m !== med; });
        if (reservedMedicines[pharmacyId].meds.length === 0) delete reservedMedicines[pharmacyId];
      }
    } else {
      btnEl.classList.add('reserved');
      btnEl.textContent = '✅ Réservé';
      btnEl.style.background = 'var(--green-600)';
      if (!reservedMedicines[pharmacyId]) {
        reservedMedicines[pharmacyId] = { meds: [], name: pharmacyName, phone: pharmacyPhone, address: pharmacyAddress, request_id: reqId };
      }
      reservedMedicines[pharmacyId].meds.push(med);
    }
    var confirmBar = $('#confirm-reservations-bar');
    var totalReserved = Object.values(reservedMedicines).reduce(function(sum, p) { return sum + p.meds.length; }, 0);
    if (confirmBar) confirmBar.style.display = totalReserved > 0 ? 'block' : 'none';
  }

  async function confirmAllReservations() {
    if (Object.keys(reservedMedicines).length === 0) { showToast('⚠️ Sélectionnez au moins un médicament', 'error'); return; }
    var phoneInput = $('#phone-input');
    var patientPhone = (phoneInput && phoneInput.value) ? phoneInput.value : null;
    var entries = Object.entries(reservedMedicines);

    // Generate unique reservation code for each pharmacy
    entries.forEach(function(entry) {
      entry[1].code = generateReservationCode();
    });

    var insertPromises = entries.map(function(entry) {
      return supabase.from('reservations').insert([{
        request_id: entry[1].request_id, pharmacy_id: entry[0], patient_phone: patientPhone,
        medicines: entry[1].meds, status: 'active', created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      }]);
    });

    // Also update response with reservation code
    var codePromises = entries.map(function(entry) {
      return supabase.from('responses').update({
        reservation_code: entry[1].code,
        is_reserved: true,
        reserved_at: new Date().toISOString()
      }).eq('pharmacy_id', entry[0]).eq('request_id', entry[1].request_id);
    });

    try { await Promise.all([...insertPromises, ...codePromises]); } catch(e) { console.error('Reservation error:', e); }
    showReservationConfirmation();
  }

  function showReservationConfirmation() {
    var entries = Object.entries(reservedMedicines);
    var expiresIso = new Date(Date.now() + 3600000).toISOString();
    var confirmHtml = entries.map(function(entry) {
      var pid = entry[0]; var data = entry[1];
      var code = data.code || 'PG-????';
      var medsHtml = data.meds.map(function(m) { return '<div style="padding:4px 0;font-size:13px;">💊 ' + m + '</div>'; }).join('');
      var phoneBtn = data.phone ? '<button class="btn btn-call" onclick="App.callPharmacy(\'' + escapeHtml(data.phone) + '\')">📞 Appeler</button>' : '';
      var waBtn = data.phone ? '<button class="btn btn-whatsapp" onclick="App.openWhatsApp(\'237' + escapeHtml(data.phone) + '\')">💬 WhatsApp</button>' : '';
      return '<div style="background:var(--dark-800);border:1px solid var(--color-border);border-radius:12px;padding:16px;margin-bottom:12px;">' +
        '<div style="font-weight:700;font-size:16px;margin-bottom:8px;">🏥 ' + escapeHtml(data.name || 'Pharmacie') + '</div>' +
        '<div style="font-size:13px;color:var(--dark-300);margin-bottom:8px;">📍 ' + escapeHtml(data.address || '') + '</div>' +
        '<div style="background:linear-gradient(135deg, rgba(5,150,105,0.15), rgba(16,185,129,0.1));border:2px dashed #10b981;border-radius:12px;padding:16px;margin-bottom:12px;text-align:center;">' +
          '<div style="font-size:11px;color:var(--dark-400);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Code de retrait</div>' +
          '<div style="font-size:28px;font-weight:800;color:#10b981;letter-spacing:4px;font-family:monospace;">' + code + '</div>' +
          '<div style="font-size:12px;color:var(--dark-400);margin-top:6px;">Presentez ce code a la pharmacie</div>' +
        '</div>' +
        '<div style="background:rgba(0,0,0,0.2);padding:10px;border-radius:8px;margin-bottom:12px;">' + medsHtml + '</div>' +
        '<div class="reservation-confirm-timer" data-expires="' + expiresIso + '" style="color:var(--gold-500);font-size:13px;margin-bottom:12px;">⏱️ Expire dans <strong>60 min</strong></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' + phoneBtn + waBtn + '<button class="btn btn-route" onclick="App.getRouteToPharmacy(\'' + escapeHtml(pid) + '\')">🗺️ Y aller</button></div></div>';
    }).join('');

    var listEl = $('#pharmacy-list');
    if (listEl) {
      listEl.innerHTML = '<div style="padding:16px;"><div style="text-align:center;margin-bottom:20px;"><span style="font-size:28px;">🎉</span><h3 style="margin:8px 0 4px;">Vos réservations</h3><p style="font-size:13px;color:var(--dark-400);">Pharmacies notifiées. Récupérez vos médicaments sous 1h.</p></div>' + confirmHtml + '<button class="btn btn-outline btn-block" style="margin-top:16px;" onclick="App.resetAfterReservation()">🔍 Nouvelle recherche</button></div>';
    }
    showToast('✅ Réservations confirmées !', 'success');
    if (reservationInterval) clearInterval(reservationInterval);
    reservationInterval = setInterval(function() {
      document.querySelectorAll('.reservation-confirm-timer[data-expires]').forEach(function(el) {
        var rem = Math.max(0, Math.floor((new Date(el.getAttribute('data-expires')) - new Date()) / 60000));
        el.innerHTML = rem > 0 ? '⏱️ Expire dans <strong>' + rem + ' min</strong>' : '⏱️ <strong style="color:var(--red-400)">Expirée</strong>';
      });
    }, 30000);
  }

  function resetAfterReservation() {
    if (reservationInterval) clearInterval(reservationInterval);
    reservedMedicines = {};
    realResponses = [];
    activeRequestIds = [];
    responseChannels.forEach(ch => supabase.removeChannel(ch));
    responseChannels = [];
    var mainActions = $('#main-actions');
    var banner = $('#responses-banner');
    if (mainActions) mainActions.style.display = '';
    if (banner) banner.style.display = 'none';
    updatePharmacies();
    resetSearch();
  }

  function resetSearch() {
    selectedMedicines = [];
    insuranceName = null;
    renderMedicineTags();
    showSearchStep(1);
    updateSessionUI();
    
    const btn = $('#proceed-search-btn');
    if (btn) btn.disabled = true;
    
    const info = $('#search-cost');
    if (info) info.classList.remove('visible');
    
    const input = $('#medicine-input');
    if (input) {
      input.value = '';
      input.focus();
    }
  }

  // ── OCR Modal ──────────────────────────────────────────
  function setupOCRModal() {
    const backdrop = $('#ocr-backdrop');
    const btnCamera = $('#ocr-btn-camera');
    const btnGallery = $('#ocr-btn-gallery');
    const inputCamera = $('#ocr-input-camera');
    const inputGallery = $('#ocr-input-gallery');

    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeOCRModal();
      });
    }
    
    if (btnCamera && inputCamera) {
      btnCamera.addEventListener('click', () => inputCamera.click());
      inputCamera.addEventListener('change', handleOCRFile);
    }
    
    if (btnGallery && inputGallery) {
      btnGallery.addEventListener('click', () => inputGallery.click());
      inputGallery.addEventListener('change', handleOCRFile);
    }
  }

  function openOCRModal() {
    const modal = $('#ocr-modal');
    if (modal) {
      modal.classList.add('active');
      modal.style.display = 'flex';
    }
  }

  function closeOCRModal() {
    const modal = $('#ocr-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
  }

  // Chargement différé du moteur OCR (≈ 60 Ko + modèle) : uniquement lors du 1er scan
  let tesseractPromise = null;
  function loadTesseract() {
    if (typeof Tesseract !== 'undefined') return Promise.resolve();
    if (!tesseractPromise) {
      tesseractPromise = new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
        s.crossOrigin = 'anonymous';
        s.onload = () => resolve();
        s.onerror = () => { tesseractPromise = null; resolve(); };
        document.head.appendChild(s);
      });
    }
    return tesseractPromise;
  }

  async function handleOCRFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    closeOCRModal();
    showToast('📸 Analyse de l\'ordonnance en cours...', 'info');

    try {
      await loadTesseract();
      if (typeof Tesseract !== 'undefined') {
        const result = await Tesseract.recognize(file, 'fra', {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              const percent = Math.round(m.progress * 100);
              showToast(`📸 Analyse en cours... ${percent}%`, 'info');
            }
          }
        });

        const text = result.data.text;
        
        // Open search modal and try to extract medicine names
        openSearchModal();
        
        if (typeof COMMON_MEDICATIONS !== 'undefined') {
          const found = COMMON_MEDICATIONS.filter(med => 
            text.toLowerCase().includes(med.toLowerCase().split(' ')[0].toLowerCase())
          );
          
          found.forEach(med => addMedicine(med));
          
          if (found.length > 0) {
            showToast(`✅ ${found.length} médicament(s) détecté(s)`, 'success');
          } else {
            showToast('⚠️ Aucun médicament reconnu. Saisissez-les manuellement.', 'info');
          }
        }
      }
    } catch (error) {
      console.error('OCR error:', error);
      showToast('❌ Erreur lors de l\'analyse. Saisissez manuellement.', 'error');
      openSearchModal();
    }
  }

  // ── Demo Modal ─────────────────────────────────────────
  function initDemoSlides() {
    const container = $('#demo-slides');
    if (!container) return;

    container.innerHTML = DEMO_SLIDES.map((slide, i) => `
      <div class="demo-slide ${i === 0 ? 'active' : ''}" data-slide="${i}">
        <div class="demo-slide-icon">${slide.icon}</div>
        <h3>${slide.title}</h3>
        <p>${slide.desc}</p>
      </div>
    `).join('');
  }

  function openDemoModal() {
    const modal = $('#demo-modal');
    if (modal) {
      modal.classList.add('active');
      demoSlideIndex = 0;
      updateDemoSlide();
    }
  }

  function closeDemoModal() {
    const modal = $('#demo-modal');
    if (modal) modal.classList.remove('active');
  }

  function navigateDemo(direction) {
    demoSlideIndex += direction;
    if (demoSlideIndex < 0) demoSlideIndex = 0;
    if (demoSlideIndex >= DEMO_SLIDES.length) demoSlideIndex = DEMO_SLIDES.length - 1;
    updateDemoSlide();
  }

  function updateDemoSlide() {
    $$('.demo-slide').forEach((slide, i) => {
      slide.classList.toggle('active', i === demoSlideIndex);
    });
    
    const progress = $('#demo-progress');
    if (progress) progress.textContent = `${demoSlideIndex + 1} / ${DEMO_SLIDES.length}`;

    const prevBtn = $('#demo-prev');
    const nextBtn = $('#demo-next');
    if (prevBtn) prevBtn.disabled = demoSlideIndex === 0;
    if (nextBtn) {
      if (demoSlideIndex === DEMO_SLIDES.length - 1) {
        nextBtn.textContent = '✓ Terminé';
        nextBtn.onclick = closeDemoModal;
      } else {
        nextBtn.textContent = 'Suivant →';
        nextBtn.onclick = () => navigateDemo(1);
      }
    }
  }

  // ── Detail Modal ───────────────────────────────────────
  function openDetail(pharmacy) {
    if (!pharmacy) return;

    const modal = $('#detail-modal');
    if (!modal) return;

    const nameEl = $('#detail-name');
    const addressEl = $('#detail-address');
    const distanceEl = $('#detail-distance');
    const ratingEl = $('#detail-rating');
    const statusEl = $('#detail-status-text');
    const hoursEl = $('#detail-hours');
    const badgeEl = $('#detail-badge');

    if (nameEl) nameEl.textContent = pharmacy.name;
    if (addressEl) addressEl.textContent = pharmacy.address;
    if (distanceEl) distanceEl.textContent = pharmacy.distance || '—';
    if (ratingEl) ratingEl.textContent = pharmacy.rating || '—';
    if (hoursEl) hoursEl.textContent = pharmacy.hours || '—';
    
    if (statusEl) {
      if (pharmacy.isOnDuty) {
        statusEl.textContent = 'Garde';
        statusEl.style.color = 'var(--gold-400)';
      } else if (pharmacy.isOpen) {
        statusEl.textContent = 'Ouvert';
        statusEl.style.color = 'var(--green-400)';
      } else {
        statusEl.textContent = 'Fermé';
        statusEl.style.color = 'var(--dark-400)';
      }
    }

    if (badgeEl) {
      if (pharmacy.isOnDuty) {
        badgeEl.innerHTML = '<span class="badge badge--amber">🌙 De garde</span>';
      } else if (pharmacy.isOpen) {
        badgeEl.innerHTML = '<span class="badge badge--emerald">Ouvert</span>';
      } else {
        badgeEl.innerHTML = '<span class="badge badge--red">Fermé</span>';
      }
    }

    // Bind action buttons
    const callBtn = $('#detail-call');
    const whatsappBtn = $('#detail-whatsapp');
    const routeBtn = $('#detail-route');

    if (callBtn) {
      callBtn.onclick = () => callPharmacy(pharmacy.phone);
    }
    if (whatsappBtn) {
      whatsappBtn.onclick = () => openWhatsApp(pharmacy.whatsapp);
    }
    if (routeBtn) {
      routeBtn.onclick = () => {
        closeDetail();
        getRoute(pharmacy.lat, pharmacy.lng, pharmacy.name);
      };
    }

    modal.classList.add('active');
    if (leafletMap && pharmacy.lat) {
      leafletMap.setView([pharmacy.lat, pharmacy.lng], 15);
    }
    pushNavigation('detail');
  }

  function closeDetail() {
    const modal = $('#detail-modal');
    if (modal) modal.classList.remove('active');
  }

  // ── Actions ────────────────────────────────────────────
  function callPharmacy(phone) {
    // Sécurité : seuls les chiffres et le « + » sont conservés (pas d'injection d'URI)
    const clean = String(phone || '').replace(/[^\d+]/g, '');
    if (clean) {
      window.open(`tel:${clean}`, '_self');
    } else {
      showToast('Numéro de téléphone non renseigné pour cette officine.', 'info');
    }
  }

  function openWhatsApp(number) {
    let digits = String(number || '').replace(/\D/g, '');
    if (digits.length === 9) digits = '237' + digits; // numéros camerounais saisis sans indicatif
    if (digits) {
      window.open(`https://wa.me/${digits}`, '_blank', 'noopener');
    } else {
      showToast('Numéro WhatsApp non renseigné pour cette officine.', 'info');
    }
  }

  async function getRoute(lat, lng, pharmName) {
    const pos = Geolocation.getPosition();
    if (!pos || !pos.lat || !pos.lng) {
      showToast('Veuillez d\'abord détecter votre position.', 'error');
      return;
    }

    const userLat = pos.lat;
    const userLng = pos.lng;

    if (!leafletMap) {
      const url = `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${lat},${lng}&travelmode=driving`;
      window.open(url, '_blank');
      return;
    }

    // Identify pharmacy name if not provided
    if (!pharmName) {
      const found = (pharmaciesInRadius && pharmaciesInRadius.length > 0)
        ? pharmaciesInRadius.find(p => Math.abs(p.lat - lat) < 0.0001 && Math.abs(p.lng - lng) < 0.0001)
        : null;
      pharmName = found ? found.name : 'Pharmacie';
    }

    clearRoute();
    showToast('Calcul de l\'itinéraire...', 'info');

    // On mobile, collapse bottom sheet so map path is clearly visible
    const bottomSheet = document.getElementById('bottom-sheet');
    if (bottomSheet) {
      bottomSheet.classList.add('collapsed');
      bottomSheet.classList.remove('expanded');
    }

    let routeCoords = null;
    let distKm = null;
    let durationMin = null;

    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${userLng},${userLat};${lng},${lat}?overview=full&geometries=geojson`;
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const osrmTimer = ctrl ? setTimeout(() => ctrl.abort(), 7000) : null;
      const resp = await fetch(osrmUrl, ctrl ? { signal: ctrl.signal } : undefined);
      if (osrmTimer) clearTimeout(osrmTimer);
      const data = await resp.json();

      if (data && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        routeCoords = route.geometry.coordinates.map(c => [c[1], c[0]]);
        distKm = (route.distance / 1000).toFixed(1);
        durationMin = Math.round(route.duration / 60) || 1;
      }
    } catch (e) {
      console.warn('OSRM routing fetch failed, falling back to direct line', e);
    }

    // Fallback direct path if OSRM is offline or no route returned
    if (!routeCoords || routeCoords.length === 0) {
      routeCoords = [[userLat, userLng], [lat, lng]];
      distKm = Geolocation.haversine(userLat, userLng, lat, lng).toFixed(1);
      durationMin = Math.max(1, Math.round((parseFloat(distKm) / 30) * 60)); // ~30 km/h avg city speed
    }

    // 1. Outer glow for premium aesthetics (halo bleu nuit)
    const routeOutline = L.polyline(routeCoords, {
      color: '#1e3a8a',
      weight: 9,
      opacity: 0.55,
      lineCap: 'round',
      lineJoin: 'round'
    });

    // 2. Main vibrant road polyline (bleu lumineux)
    const routeLine = L.polyline(routeCoords, {
      color: '#3b82f6',
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
      dashArray: (routeCoords.length === 2) ? '8, 8' : undefined
    });

    // 3. Destination target marker (cible vert lumineux)
    const destIcon = L.divIcon({
      className: 'dest-marker-pulse',
      html: '<div style="width:32px;height:32px;background:#10b981;border:3px solid #ffffff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 0 16px rgba(16,185,129,0.85);cursor:pointer;">🎯</div>',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    const destMarker = L.marker([lat, lng], { icon: destIcon });

    routeLayer = L.featureGroup([routeOutline, routeLine, destMarker]).addTo(leafletMap);
    leafletMap.fitBounds(routeLayer.getBounds(), { padding: [60, 60], maxZoom: 16 });

    // Show floating route banner on top of the map
    showRouteBanner(pharmName, distKm, durationMin, lat, lng, userLat, userLng);
    showToast(`🗺️ Itinéraire tracé : ${distKm} km (~${durationMin} min)`, 'success');
  }

  function clearRoute() {
    if (routeLayer && leafletMap) {
      try { leafletMap.removeLayer(routeLayer); } catch (e) {}
      routeLayer = null;
    }
    const banner = document.getElementById('client-route-banner');
    if (banner) banner.remove();
  }

  function showRouteBanner(pharmName, distKm, durationMin, lat, lng, userLat, userLng) {
    let banner = document.getElementById('client-route-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'client-route-banner';
      banner.className = 'client-route-card';
      document.body.appendChild(banner);
    }

    const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${lat},${lng}&travelmode=driving`;

    banner.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
          <span style="font-size: 22px; flex-shrink: 0;">🗺️</span>
          <div style="min-width: 0;">
            <div style="font-weight: 800; font-size: 14px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(pharmName)}</div>
            <div style="font-size: 12px; color: var(--emerald-400); font-weight: 700;">
              <span>📍 ${distKm} km</span> • <span>⏱️ ~${durationMin} min</span>
            </div>
          </div>
        </div>
        <button type="button" class="btn btn--icon" onclick="App.clearRoute()" title="Fermer l'itinéraire" style="width: 28px; height: 28px; padding: 0; flex-shrink: 0; color: #94a3b8; font-size: 16px; background: rgba(255,255,255,0.08); border-radius: 50%;">✕</button>
      </div>
      <div style="display: flex; gap: 8px;">
        <a href="${gmapsUrl}" target="_blank" rel="noopener" class="btn btn--primary btn--sm" style="flex: 1; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-size: 12px; padding: 8px 12px; font-weight: 700; border-radius: 10px;">
          <span>🧭</span> <span>Guidage GPS (Google Maps)</span>
        </a>
        <button type="button" class="btn btn--secondary btn--sm" onclick="App.clearRoute()" style="font-size: 12px; padding: 8px 12px; border-radius: 10px;">
          Effacer
        </button>
      </div>
    `;
    banner.style.display = 'block';
  }

  function findPharmacy(id) {
    const key = String(id);
    return pharmaciesInRadius.find(p => String(p.id) === key) || null;
  }

  // ── Settings ───────────────────────────────────────────
  function openSettings() {
    const modal = $('#settings-modal');
    if (modal) modal.classList.add('active');
  }

  function closeSettings() {
    const modal = $('#settings-modal');
    if (modal) modal.classList.remove('active');
  }

  // ── Navigation ─────────────────────────────────────────
  function pushNavigation(screen) {
    if (navigationHistory[navIndex] === screen) return;
    navIndex++;
    navigationHistory = navigationHistory.slice(0, navIndex);
    navigationHistory.push(screen);
  }

  function goBack() {
    window.history.back();
  }

  function goForward() {
    window.history.forward();
  }

  function goHome() {
    closeSearchModal();
    closeDetail();
    closeSettings();
    closeDemoModal();
    closeOCRModal();
    closeInsuranceModal();
    
    // Recenter map
    recenterOnUser();
    clearRoute();
    
    // Expand bottom sheet
    const sheet = $('#bottom-sheet');
    if (sheet) sheet.classList.remove('collapsed');

    pushNavigation('map');
    showToast('🏠 Retour à l\'accueil', 'success');
  }

  function navigateTo(screen) {
    closeSearchModal();
    closeDetail();
    closeSettings();
    closeDemoModal();

    switch(screen) {
      case 'search':
        openSearchModal();
        break;
      case 'detail':
        // Can't re-open detail without pharmacy ref
        break;
      case 'map':
      default:
        recenterOnUser();
        break;
    }
  }

  // ── Bottom Sheet ───────────────────────────────────────
  function setupBottomSheet() {
    const sheet = document.getElementById('bottom-sheet');
    const handle = $('#sheet-handle');
    if (!sheet || !handle) return;

    let startY, startTranslate, isDragging = false;

    function onTouchStart(e) {
      isDragging = true;
      startY = e.touches ? e.touches[0].clientY : e.clientY;
      const transform = getComputedStyle(sheet).transform;
      startTranslate = transform !== 'none' ? parseInt(new DOMMatrix(transform).m42) : 0;
      sheet.style.transition = 'none';
    }

    function onTouchMove(e) {
      if (!isDragging) return;
      const currentY = e.touches ? e.touches[0].clientY : e.clientY;
      const delta = currentY - startY;
      if (delta > 0) { // Only allow dragging down
        sheet.style.transform = `translateY(${delta}px)`;
      }
    }

    function onTouchEnd(e) {
      if (!isDragging) return;
      isDragging = false;
      sheet.style.transition = '';
      
      const currentY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
      const delta = currentY - startY;
      
      if (delta > 80) {
        sheet.classList.add('collapsed');
      } else {
        sheet.classList.remove('collapsed');
      }
      sheet.style.transform = '';
    }

    handle.addEventListener('touchstart', onTouchStart, { passive: true });
    handle.addEventListener('touchmove', onTouchMove, { passive: true });
    handle.addEventListener('touchend', onTouchEnd);

    // Mouse events for desktop
    handle.addEventListener('mousedown', onTouchStart);
    window.addEventListener('mousemove', onTouchMove);
    window.addEventListener('mouseup', onTouchEnd);

    // Click to toggle
    handle.addEventListener('click', () => {
      sheet.classList.toggle('expanded');
      const arrow = document.getElementById('sheet-arrow-icon');
      if (arrow) {
        if (sheet.classList.contains('expanded')) {
          arrow.innerHTML = '<polyline points="6 9 12 15 18 9"/>'; // Down
        } else {
          arrow.innerHTML = '<polyline points="18 15 12 9 6 15"/>'; // Up
        }
      }
    });
  }

  // ── Toast ──────────────────────────────────────────────
  function showToast(message, type) {
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
  
  }

  // ── Utility ────────────────────────────────────────────
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }


  // ── Public API ─────────────────────────────────────────
  const publicApi = {
    openDetail,
    callPharmacy,
    openWhatsApp,
    getRoute,
    getRouteToPharmacy,
    clearRoute,
    findPharmacy,
    addMedicine,
    removeMedicine,
    showToast,
    toggleReserveMedicine,
    confirmAllReservations,
    resetAfterReservation,
    openNewSearchWithoutCancel,
    updateSessionUI,
  };

  // ── Start ──────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => { I18n.init(); init(); });

  return publicApi;
})();

window.App = App;
