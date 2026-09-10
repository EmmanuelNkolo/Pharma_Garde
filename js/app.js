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

  // ── Initialize ─────────────────────────────────────────
  function init() {
    // Splash screen timer
    setTimeout(() => {
      $('#splash-screen').classList.add('hidden');
      showLocationModal();
    }, 2500);

    bindEvents();
    initDemoSlides();
  }

  // ── Event Bindings ─────────────────────────────────────
  function bindEvents() {
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
        updatePharmacies();
      });
    });

    // Search button
    const searchBtn = $('#search-btn');
    if (searchBtn) searchBtn.addEventListener('click', openSearchModal);

    // Camera/Ordonnance button
    const cameraBtn = $('#camera-btn');
    if (cameraBtn) cameraBtn.addEventListener('click', openOCRModal);

    // Demo button
    const demoBtn = $('#demo-btn');
    if (demoBtn) demoBtn.addEventListener('click', openDemoModal);

    // Search modal
    const searchClose = $('#search-close');
    const searchBackdrop = $('#search-backdrop');
    if (searchClose) searchClose.addEventListener('click', closeSearchModal);
    if (searchBackdrop) searchBackdrop.addEventListener('click', closeSearchModal);

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
    const btnAdd = $('#btn-add-medicine');
    if (btnAdd) {
      btnAdd.addEventListener('click', () => {
        addMedicine($('#medicine-input').value.trim());
      });
    }

    // Proceed to payment
    const btnProceed = $('#btn-proceed-payment');
    if (btnProceed) btnProceed.addEventListener('click', showConfirmStep);

    // Confirm request
    const btnValidate = $('#btn-validate-request');
    const btnCancelReq = $('#btn-cancel-request');
    if (btnValidate) btnValidate.addEventListener('click', showInsuranceModal);
    if (btnCancelReq) btnCancelReq.addEventListener('click', () => showSearchStep(1));

    // Payment methods
    $$('.payment-method').forEach(method => {
      method.addEventListener('click', () => {
        $$('.payment-method').forEach(m => m.classList.remove('selected'));
        method.classList.add('selected');
        selectedPaymentMethod = method.dataset.method;
      });
    });

    // Confirm payment
    const btnConfirmPayment = $('#btn-confirm-payment');
    if (btnConfirmPayment) btnConfirmPayment.addEventListener('click', handlePayment);

    // Back to search from payment
    const btnBackSearch = $('#btn-back-search');
    if (btnBackSearch) btnBackSearch.addEventListener('click', () => showSearchStep(1));

    // New search
    const btnNewSearch = $('#btn-new-search');
    if (btnNewSearch) btnNewSearch.addEventListener('click', resetSearch);

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
          Geolocation.setManualPosition(center.lat, center.lng);
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
      PharmMap.recenterOnUser();
    });

    // Toggle switches
    $$('.toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('active');
        if (toggle.id === 'toggle-closed') {
          updatePharmacies();
        }
      });
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
    if (demoBackdrop) demoBackdrop.addEventListener('click', closeDemoModal);

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

  // ── GPS Request ────────────────────────────────────────
  async function handleGPSRequest() {
    const btn = $('#btn-gps');
    if (btn) {
      btn.textContent = 'Détection en cours...';
      btn.disabled = true;
    }

    try {
      const pos = await Geolocation.requestPosition();
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
        if (PharmMap && PharmMap.map) PharmMap.map.invalidateSize();
      }, 500);

      setupMapWithPosition(pos);
      showToast(`📍 Position détectée : ${Geolocation.getCity()}`, 'success');
      
      // Start watching for position updates
      Geolocation.startWatching((newPos) => {
        PharmMap.setUserMarker(newPos.lat, newPos.lng);
        updatePharmacies();
      });
    } catch (error) {
      console.error('GPS error:', error);
      // Fallback to last saved city or default
      const savedCity = Geolocation.loadSavedCity();
      const cityData = CITIES_AND_QUARTERS[savedCity] || CITIES_AND_QUARTERS['Douala'];
      Geolocation.setManualPosition(cityData.center.lat, cityData.center.lng);
      hideLocationModal();
      setupMapWithPosition(cityData.center);
      showToast(`⚠️ GPS indisponible — Position par défaut : ${savedCity}`, 'info');
    } finally {
      if (btn) {
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Détecter ma position`;
        btn.disabled = false;
      }
    }
  }

  // ── Map Setup ──────────────────────────────────────────
  function setupMapWithPosition(pos) {
    const app = $('#app');
    if (app) app.classList.add('active');

    // Initialize map
    PharmMap.initMap('map', pos, 13);
    PharmMap.setUserMarker(pos.lat, pos.lng);
    PharmMap.drawRadiusCircle(pos, currentRadius);

    // Update city badge
    const city = Geolocation.getCity();
    const cityDisplay = $('#city-name-display');
    if (cityDisplay) cityDisplay.textContent = city;

    // Update settings city dropdown
    const settingsCity = $('#settings-city');
    if (settingsCity) settingsCity.value = city;

    // Update pharmacies
    updatePharmacies();

    // Add to navigation
    pushNavigation('map');
  }

  // ── Pharmacy Data ──────────────────────────────────────
  function updatePharmacies() {
    const pos = Geolocation.getPosition();
    if (!pos) return;

    // Get all local pharmacies
    let allPharmacies = typeof LOCAL_PHARMACIES !== 'undefined' ? LOCAL_PHARMACIES.slice() : [];

    // Add distance to each
    allPharmacies = allPharmacies.map(p => {
      const pCopy = Object.assign({}, p);
      pCopy.distance = parseFloat(Geolocation.distanceTo(p.lat, p.lng).toFixed(1));
      return pCopy;
    });

    // Filter by radius
    pharmaciesInRadius = allPharmacies.filter(p => p.distance <= currentRadius);

    // Show/hide closed pharmacies based on setting
    const toggleEl = $('#toggle-closed'); const showClosed = toggleEl ? toggleEl.classList.contains('active') : false;
    let displayPharmacies = showClosed 
      ? pharmaciesInRadius 
      : pharmaciesInRadius.filter(p => p.isOpen || p.isOnDuty);

    // Sort: on-duty first, then open, then by distance
    displayPharmacies.sort((a, b) => {
      if (a.isOnDuty && !b.isOnDuty) return -1;
      if (!a.isOnDuty && b.isOnDuty) return 1;
      if (a.isOpen && !b.isOpen) return -1;
      if (!a.isOpen && b.isOpen) return 1;
      return a.distance - b.distance;
    });

    // Update map markers
    PharmMap.addPharmacyMarkers(displayPharmacies, (p) => openDetail(p));
    PharmMap.drawRadiusCircle(pos, currentRadius);

    // Update stats
    const openCount = displayPharmacies.filter(p => p.isOpen).length;
    const guardCount = displayPharmacies.filter(p => p.isOnDuty).length;
    const openCountEl = $('#open-count');
    const guardCountEl = $('#guard-count');
    if (openCountEl) openCountEl.textContent = `${openCount} pharmacie${openCount > 1 ? 's' : ''} ouverte${openCount > 1 ? 's' : ''}`;
    if (guardCountEl) guardCountEl.textContent = `${guardCount} de garde`;

    // Render pharmacy list
    renderPharmacyList(displayPharmacies);
  }

  // ── Pharmacy List Rendering ────────────────────────────
  function renderPharmacyList(pharmacies) {
    const list = $('#pharmacy-list');
    if (!list) return;

    if (pharmacies.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <div class="empty-state-text">Aucune pharmacie trouvée dans un rayon de ${currentRadius} km. Essayez d'élargir le rayon de recherche.</div>
        </div>
      `;
      return;
    }

    list.innerHTML = pharmacies.map(p => {
      let statusBadge;
      if (p.isOnDuty) {
        statusBadge = '<span class="badge badge-guard">🌙 De garde</span>';
      } else if (p.isOpen) {
        statusBadge = '<span class="badge badge-open">Ouvert</span>';
      } else {
        statusBadge = '<span class="badge badge-closed">Fermé</span>';
      }

      return `
        <div class="pharmacy-card ${p.isOnDuty ? 'on-duty' : ''}" onclick="App.openDetail(App.findPharmacy('${p.id}'))">
          <div class="card-header">
            <div class="card-info">
              <div class="card-name">${p.name}</div>
              <div class="card-address">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                ${p.address}
              </div>
            </div>
            <div class="card-distance">
              <span class="distance-value">${p.distance}</span>
              <span class="distance-unit">km</span>
            </div>
          </div>
          <div class="card-meta">
            ${statusBadge}
            <span class="card-hours">🕐 ${p.hours || '—'}</span>
          </div>
          <div class="card-actions">
            <button class="btn btn-call" onclick="event.stopPropagation(); App.callPharmacy('${p.phone}')">
              📞 Appeler
            </button>
            <button class="btn btn-whatsapp" onclick="event.stopPropagation(); App.openWhatsApp('${p.whatsapp}')">
              💬 WhatsApp
            </button>
            <button class="btn btn-route" onclick="event.stopPropagation(); App.getRoute(${p.lat}, ${p.lng})">
              🗺️ Y aller
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // ── Search Modal ───────────────────────────────────────
  function openSearchModal() {
    const modal = $('#search-modal');
    if (modal) {
      modal.classList.add('active');
      pushNavigation('search');
      
      // Update search info
      const openPharmacies = pharmaciesInRadius.filter(p => p.isOpen || p.isOnDuty);
      const countEl = $('#search-pharmacy-count');
      const radiusEl = $('#search-radius-display');
      if (countEl) countEl.textContent = openPharmacies.length;
      if (radiusEl) radiusEl.textContent = `${currentRadius} km`;

      // Update cost display
      const cost = Payment.getSearchCost();
      const costEl = $('.search-cost');
      if (costEl) costEl.textContent = cost === 0 ? 'GRATUIT (session active)' : `${cost} FCFA`;

      // Focus input
      setTimeout(() => {
        const input = $('#medicine-input');
        if (input) input.focus();
      }, 300);
    }
  }

  function closeSearchModal() {
    const modal = $('#search-modal');
    if (modal) modal.classList.remove('active');
    // Reset to step 1
    showSearchStep(1);
  }

  function showSearchStep(step) {
    $$('.search-step').forEach(s => s.classList.remove('active'));
    const stepEl = $(`#search-step-${step}`);
    if (stepEl) stepEl.classList.add('active');
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
          <span>💊 ${med}</span>
          <span style="color: var(--green-400);">✓</span>
        </div>
      `).join('');
    }

    showSearchStep('confirm');
  }

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
    
    const input = $('#medicine-input');
    if (input) input.value = '';
    
    const autocompleteList = $('#autocomplete-list');
    if (autocompleteList) autocompleteList.classList.remove('visible');

    // Enable proceed button
    const btn = $('#btn-proceed-payment');
    if (btn) btn.disabled = selectedMedicines.length === 0;

    // Show search info
    const info = $('#search-info');
    if (info) info.classList.add('visible');
  }

  function removeMedicine(index) {
    selectedMedicines.splice(index, 1);
    renderMedicineTags();
    
    const btn = $('#btn-proceed-payment');
    if (btn) btn.disabled = selectedMedicines.length === 0;

    if (selectedMedicines.length === 0) {
      const info = $('#search-info');
      if (info) info.classList.remove('visible');
    }
  }

  function renderMedicineTags() {
    const container = $('#medicines-tags-container');
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
      backdrop.addEventListener('click', closeInsuranceModal);
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

  function proceedToPayment() {
    const cost = Payment.getSearchCost();
    
    if (cost === 0) {
      // Session active, skip payment
      handleSearchRequest();
      return;
    }

    // Show payment step
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
        showToast(`✅ ${result.message}`, 'success');
        handleSearchRequest();
      } else {
        showToast(`❌ ${result.error}`, 'error');
      }
    } catch (error) {
      showToast('❌ Erreur de paiement. Réessayez.', 'error');
    } finally {
      if (btn) {
        btn.textContent = '✅ Confirmer le paiement';
        btn.disabled = false;
      }
    }
  }

  // ── Search Request (REAL — Supabase) ────────────────────
  let currentRequestId = null;
  let responseChannel = null;
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
      const expiresAt = new Date(Date.now() + 2 * 3600000).toISOString();
      
      const { data, error } = await supabase
        .from('requests')
        .insert([{
          medicines: selectedMedicines,
          user_lat: pos ? pos.lat : null,
          user_lng: pos ? pos.lng : null,
          radius: currentRadius,
          status: 'pending',
          user_phone: (phoneInput && phoneInput.value) ? phoneInput.value : null,
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

      currentRequestId = data.id;

      // Close modal, show waiting in bottom sheet
      const modal = $('#search-modal');
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

      // Subscribe to responses
      if (responseChannel) supabase.removeChannel(responseChannel);
      responseChannel = supabase
        .channel(`responses_for_${currentRequestId}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'responses',
          filter: `request_id=eq.${currentRequestId}`
        }, (payload) => {
          const resp = payload.new;
          realResponses.push(resp);
          renderPatientResponses();
          showToast('🔔 Nouvelle réponse d\'une pharmacie !', 'info');
        })
        .subscribe();

    } catch(e) {
      console.error('Search request error:', e);
      if (pingStatus) pingStatus.textContent = '❌ Erreur.';
    }
  }

  // ── Render Patient Responses (Multi-Pharmacy Per-Medicine Reserve) ──
  function renderPatientResponses() {
    const listEl = $('#pharmacy-list');
    if (!listEl || realResponses.length === 0) return;

    // Add confirm reservations button at top
    let confirmBtnHtml = '<div id="confirm-reservations-bar" style="display:none; padding: 12px; background: rgba(16,185,129,0.15); border-radius: 12px; margin-bottom: 16px; text-align: center;">' +
      '<p style="font-size: 13px; color: var(--green-400); margin-bottom: 8px;">Médicaments sélectionnés de plusieurs pharmacies</p>' +
      '<button class="btn btn-primary btn-block" onclick="App.confirmAllReservations()">✅ Confirmer les réservations</button></div>';

    listEl.innerHTML = confirmBtnHtml + realResponses.map(resp => {
      const pos = Geolocation.getPosition();
      let distance = '—';
      if (pos && resp.pharmacy_id) {
        // Try to find pharmacy coords from our Supabase data
        // For now we show address
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
            ? `<button class="btn btn-sm reserve-med-btn" data-pharmacy-id="${resp.pharmacy_id}" data-med="${med}" data-pharmacy-name="${resp.pharmacy_name || ''}" data-pharmacy-phone="${resp.pharmacy_phone || ''}" data-pharmacy-address="${resp.pharmacy_address || ''}" onclick="App.toggleReserveMedicine(this)">Réserver</button>`
            : '';

          return `<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 13px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
            <span style="font-weight: 500; flex: 1;">💊 ${med}</span>
            ${badge}
            ${reserveBtn}
          </div>`;
        }).join('');
      }

      return `
        <div class="pharmacy-card" data-pharmacy-id="${resp.pharmacy_id}">
          <div class="card-header" style="margin-bottom: 12px;">
            <div class="card-info">
              <div class="card-name">${resp.pharmacy_name || 'Pharmacie'}</div>
              <div class="card-address" style="font-size: 13px; color: var(--dark-300);">
                📍 ${resp.pharmacy_address || 'Adresse inconnue'}
              </div>
            </div>
          </div>
          <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
            ${medsHtml}
          </div>
          <div class="card-actions">
            ${resp.pharmacy_phone ? `
              <button class="btn btn-call" onclick="App.callPharmacy('${resp.pharmacy_phone}')">📞 Appeler</button>
              <button class="btn btn-whatsapp" onclick="App.openWhatsApp('237${resp.pharmacy_phone}')">💬 WhatsApp</button>
            ` : ''}
            <button class="btn btn-route" onclick="App.getRoute(0, 0)">🗺️ Y aller</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function toggleReserveMedicine(btnEl) {
    var pharmacyId = btnEl.getAttribute('data-pharmacy-id');
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
        reservedMedicines[pharmacyId] = { meds: [], name: pharmacyName, phone: pharmacyPhone, address: pharmacyAddress };
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
    var insertPromises = entries.map(function(entry) {
      return supabase.from('reservations').insert([{
        request_id: currentRequestId, pharmacy_id: entry[0], patient_phone: patientPhone,
        medicines: entry[1].meds, status: 'active', created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      }]);
    });
    try { await Promise.all(insertPromises); } catch(e) { console.error('Reservation error:', e); }
    showReservationConfirmation();
  }

  function showReservationConfirmation() {
    var entries = Object.entries(reservedMedicines);
    var expiresIso = new Date(Date.now() + 3600000).toISOString();
    var confirmHtml = entries.map(function(entry) {
      var pid = entry[0]; var data = entry[1];
      var medsHtml = data.meds.map(function(m) { return '<div style="padding:4px 0;font-size:13px;">💊 ' + m + '</div>'; }).join('');
      var phoneBtn = data.phone ? '<button class="btn btn-call" onclick="App.callPharmacy(\'' + data.phone + '\')">📞 Appeler</button>' : '';
      var waBtn = data.phone ? '<button class="btn btn-whatsapp" onclick="App.openWhatsApp(\'237' + data.phone + '\')">💬 WhatsApp</button>' : '';
      return '<div style="background:var(--dark-800);border:1px solid var(--color-border);border-radius:12px;padding:16px;margin-bottom:12px;">' +
        '<div style="font-weight:700;font-size:16px;margin-bottom:8px;">🏥 ' + (data.name || 'Pharmacie') + '</div>' +
        '<div style="font-size:13px;color:var(--dark-300);margin-bottom:12px;">📍 ' + (data.address || '') + '</div>' +
        '<div style="background:rgba(0,0,0,0.2);padding:10px;border-radius:8px;margin-bottom:12px;">' + medsHtml + '</div>' +
        '<div class="reservation-confirm-timer" data-expires="' + expiresIso + '" style="color:var(--gold-500);font-size:13px;margin-bottom:12px;">⏱️ Expire dans <strong>60 min</strong></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' + phoneBtn + waBtn + '<button class="btn btn-route" onclick="App.getRoute(0,0)">🗺️ Y aller</button></div></div>';
    }).join('');

    var listEl = $('#pharmacy-list');
    if (listEl) {
      listEl.innerHTML = '<div style="padding:16px;"><div style="text-align:center;margin-bottom:20px;"><span style="font-size:28px;">🎉</span><h3 style="margin:8px 0 4px;">Vos réservations</h3><p style="font-size:13px;color:var(--dark-400);">Pharmacies notifiées. Récupérez vos médicaments sous 1h.</p></div>' + confirmHtml + '<button class="btn btn-outline btn-block" style="margin-top:16px;" onclick="App.resetAfterReservation()">🔍 Nouvelle recherche</button></div>';
    }
    showToast('✅ Réservations confirmées !', 'success');
    setInterval(function() {
      document.querySelectorAll('.reservation-confirm-timer[data-expires]').forEach(function(el) {
        var rem = Math.max(0, Math.floor((new Date(el.getAttribute('data-expires')) - new Date()) / 60000));
        el.innerHTML = rem > 0 ? '⏱️ Expire dans <strong>' + rem + ' min</strong>' : '⏱️ <strong style="color:var(--red-400)">Expirée</strong>';
      });
    }, 30000);
  }

  function resetAfterReservation() {
    reservedMedicines = {};
    realResponses = [];
    currentRequestId = null;
    if (responseChannel) { supabase.removeChannel(responseChannel); responseChannel = null; }
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
    
    const btn = $('#btn-proceed-payment');
    if (btn) btn.disabled = true;
    
    const info = $('#search-info');
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

    if (backdrop) backdrop.addEventListener('click', closeOCRModal);
    
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
    if (modal) modal.style.display = 'flex';
  }

  function closeOCRModal() {
    const modal = $('#ocr-modal');
    if (modal) modal.style.display = 'none';
  }

  async function handleOCRFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    closeOCRModal();
    showToast('📸 Analyse de l\'ordonnance en cours...', 'info');

    try {
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
        badgeEl.innerHTML = '<span class="badge badge-guard">🌙 De garde</span>';
      } else if (pharmacy.isOpen) {
        badgeEl.innerHTML = '<span class="badge badge-open">Ouvert</span>';
      } else {
        badgeEl.innerHTML = '<span class="badge badge-closed">Fermé</span>';
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
        getRoute(pharmacy.lat, pharmacy.lng);
      };
    }

    modal.classList.add('active');
    PharmMap.highlightPharmacy(pharmacy);
    pushNavigation('detail');
  }

  function closeDetail() {
    const modal = $('#detail-modal');
    if (modal) modal.classList.remove('active');
  }

  // ── Actions ────────────────────────────────────────────
  function callPharmacy(phone) {
    if (phone) {
      window.open(`tel:${phone}`, '_self');
    }
  }

  function openWhatsApp(number) {
    if (number) {
      window.open(`https://wa.me/${number}`, '_blank');
    }
  }

  function getRoute(lat, lng) {
    const pos = Geolocation.getPosition();
    if (pos) {
      PharmMap.drawRoute(pos.lat, pos.lng, lat, lng);
    } else {
      window.open(`https://www.google.com/maps/dir//${lat},${lng}`, '_blank');
    }
  }

  function findPharmacy(id) {
    return pharmaciesInRadius.find(p => p.id === id) || null;
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
    if (navIndex > 0) {
      navIndex--;
      navigateTo(navigationHistory[navIndex]);
    }
  }

  function goForward() {
    if (navIndex < navigationHistory.length - 1) {
      navIndex++;
      navigateTo(navigationHistory[navIndex]);
    }
  }

  function goHome() {
    closeSearchModal();
    closeDetail();
    closeSettings();
    closeDemoModal();
    closeOCRModal();
    closeInsuranceModal();
    
    // Recenter map
    PharmMap.recenterOnUser();
    PharmMap.clearRoute();
    
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
        PharmMap.recenterOnUser();
        break;
    }
  }

  // ── Bottom Sheet ───────────────────────────────────────
  function setupBottomSheet() {
    const sheet = $('#bottom-sheet');
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
      sheet.classList.toggle('collapsed');
    });
  }

  // ── Toast ──────────────────────────────────────────────
  function showToast(message, type = 'success') {
    const toast = $('#toast');
    const toastMessage = $('#toast-message');
    if (toast && toastMessage) {
      toast.className = `toast toast-${type} show`;
      toastMessage.textContent = message;
      setTimeout(() => toast.classList.remove('show'), 3500);
    }
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
    findPharmacy,
    addMedicine,
    removeMedicine,
    showToast,
    toggleReserveMedicine,
    confirmPharmacyReservations,
  };

  // ── Start ──────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

  return publicApi;
})();

window.App = App;
