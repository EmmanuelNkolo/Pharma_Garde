/**
 * Pharma-Garde — Main Application Controller
 * Orchestrates all modules and manages UI interactions
 */

const App = (() => {
  // ── State ──────────────────────────────────────────────
  let currentRadius = 5;
  let currentCity = 'Douala';
  let showClosed = false;
  let filteredPharmacies = [];
  let selectedPharmacy = null;
  let searchResults = [];
  let savedPhone = '';

  // ── DOM References ─────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Splash & Location
  const splashScreen = $('#splash-screen');
  const locationModal = $('#location-modal');
  const btnGps = $('#btn-gps');
  // Removed manual location variables
  
  const navBack = $('#nav-back');
  const navForward = $('#nav-forward');
  const cameraBtn = $('#camera-btn');

  // App
  const appContainer = $('#app');
  const cityNameDisplay = $('#city-name-display');

  // Radius
  const radiusPills = $$('.radius-pill');

  // Bottom Sheet
  const bottomSheet = $('#bottom-sheet');
  const sheetHandle = $('#sheet-handle');
  const pharmacyList = $('#pharmacy-list');
  const openCount = $('#open-count');
  const guardCount = $('#guard-count');

  // Search Modal
  const searchModal = $('#search-modal');
  const searchBtn = $('#search-btn');
  const searchClose = $('#search-close');
  const searchBackdrop = $('#search-backdrop');
  const medicineInput = $('#medicine-input');
  const btnAddMedicine = $('#btn-add-medicine');
  const medicinesTagsContainer = $('#medicines-tags-container');
  const ocrCameraInput = $('#ocr-camera-input');
  const autocompleteList = $('#autocomplete-list');
  const searchInfo = $('#search-info');
  const searchPharmacyCount = $('#search-pharmacy-count');
  const searchRadiusDisplay = $('#search-radius-display');
  const btnProceedPayment = $('#btn-proceed-payment');
  
  let requestedMedicines = [];

  // Payment
  const methodMomo = $('#method-momo');
  const methodOm = $('#method-om');
  const phoneInput = $('#phone-input');
  const btnConfirmPayment = $('#btn-confirm-payment');
  const btnBackSearch = $('#btn-back-search');

  // Ping
  const pingMedicineName = $('#ping-medicine-name');
  const pingPharmacyCount = $('#ping-pharmacy-count');
  const pingStatus = $('#ping-status');
  const pingDetail = $('#ping-detail');

  // Results
  const resultsList = $('#results-list');
  const resultCount = $('#result-count');
  const resultSubtitle = $('#result-subtitle');
  const btnNewSearch = $('#btn-new-search');

  // Detail Modal
  const detailModal = $('#detail-modal');
  const detailBackdrop = $('#detail-backdrop');

  // Settings
  const settingsModal = $('#settings-modal');
  const settingsOpen = $('#settings-open');
  const settingsClose = $('#settings-close');
  const settingsBackdrop = $('#settings-backdrop');
  const settingsRadius = $('#settings-radius');
  const settingsCity = $('#settings-city');
  const toggleClosed = $('#toggle-closed');

  // Toast
  const toast = $('#toast');
  const toastMessage = $('#toast-message');

  // ── Initialization ─────────────────────────────────────
  function init() {
    // Show splash screen for 2 seconds
    setTimeout(() => {
      splashScreen.classList.add('hidden');
      locationModal.classList.add('active');
    }, 2000);

    bindEvents();
  }

  // ── Event Binding ──────────────────────────────────────
  function bindEvents() {
    // Location
    btnGps.addEventListener('click', handleGpsRequest);
    // Removed manual location event bindings

    if (navBack) navBack.addEventListener('click', () => history.back());
    if (navForward) navForward.addEventListener('click', () => history.forward());
    if (cameraBtn) {
      cameraBtn.addEventListener('click', () => {
        if (ocrCameraInput) ocrCameraInput.click();
      });
    }
    if (ocrCameraInput) {
      ocrCameraInput.addEventListener('change', handleOcrSimulation);
    }

    // Radius pills
    radiusPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        setRadius(parseInt(pill.dataset.radius));
      });
    });

    // Bottom sheet
    sheetHandle.addEventListener('click', toggleBottomSheet);

    // Search
    searchBtn.addEventListener('click', openSearchModal);
    searchClose.addEventListener('click', closeSearchModal);
    searchBackdrop.addEventListener('click', closeSearchModal);
    medicineInput.addEventListener('input', handleMedicineInput);
    medicineInput.addEventListener('keydown', handleMedicineKeydown);
    if (btnAddMedicine) btnAddMedicine.addEventListener('click', addMedicine);
    
    const btnCancelRequest = $('#btn-cancel-request');
    const btnValidateRequest = $('#btn-validate-request');
    if (btnCancelRequest) btnCancelRequest.addEventListener('click', goToSearchStep);
    if (btnValidateRequest) btnValidateRequest.addEventListener('click', goToPaymentStep);

    // Payment flow
    btnProceedPayment.addEventListener('click', goToConfirmStep);
    methodMomo.addEventListener('click', () => selectPaymentMethod('momo'));
    methodOm.addEventListener('click', () => selectPaymentMethod('om'));
    phoneInput.addEventListener('input', handlePhoneInput);
    btnConfirmPayment.addEventListener('click', handlePayment);
    btnBackSearch.addEventListener('click', goToSearchStep);

    // Results
    btnNewSearch.addEventListener('click', resetSearch);

    // Detail modal
    detailBackdrop.addEventListener('click', closeDetailModal);

    // Settings
    settingsOpen.addEventListener('click', openSettings);
    settingsClose.addEventListener('click', closeSettings);
    settingsBackdrop.addEventListener('click', closeSettings);
    settingsRadius.addEventListener('change', (e) => setRadius(parseInt(e.target.value)));
    settingsCity.addEventListener('change', handleSettingsCityChange);
    toggleClosed.addEventListener('click', () => {
      showClosed = !showClosed;
      toggleClosed.classList.toggle('active');
      updatePharmacyDisplay();
    });

    // Language toggle
    $$('.lang-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.lang-option').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        showToast('Langue mise à jour', 'info');
      });
    });

    // Close autocomplete when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-input-wrapper')) {
        autocompleteList.classList.remove('visible');
      }
    });
  }

  // ── Location Handlers ──────────────────────────────────
  async function handleGpsRequest() {
    btnGps.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;"></div> Localisation en cours...';
    btnGps.disabled = true;

    try {
      const position = await Geolocation.getUserLocation();
      currentCity = Geolocation.detectCity();
      startApp(position);
    } catch (error) {
      btnGps.innerHTML = '📍 Détecter ma position';
      btnGps.disabled = false;
      showToast(error.message, 'error');
    }
  }

  // ── App Start ──────────────────────────────────────────
  function startApp(position) {
    // Hide location modal
    locationModal.classList.remove('active');

    // Show main app
    appContainer.classList.add('active');

    // Update city display
    cityNameDisplay.textContent = currentCity;
    settingsCity.value = currentCity;

    // Initialize map
    PharmMap.initMap('map', position, 13);
    PharmMap.setUserMarker(position.lat, position.lng);
    PharmMap.drawRadiusCircle(position, currentRadius);

    // Load pharmacies
    updatePharmacyDisplay();

    showToast(`📍 Position détectée — ${currentCity}`, 'success');
  }

  // ── Pharmacy Display ───────────────────────────────────
  function updatePharmacyDisplay() {
    filteredPharmacies = Geolocation.filterByRadius(PHARMACIES, currentRadius, showClosed);

    // Update map markers
    PharmMap.addPharmacyMarkers(filteredPharmacies, (pharmacy) => {
      openDetailModal(pharmacy);
    });

    // Update radius circle
    const pos = Geolocation.getPosition();
    if (pos) {
      PharmMap.drawRadiusCircle(pos, currentRadius);
    }

    // Update stats
    const openPharmacies = filteredPharmacies.filter((p) => p.isOpen || p.isOnDuty);
    const guardPharmacies = filteredPharmacies.filter((p) => p.isOnDuty);
    openCount.textContent = `${openPharmacies.length} pharmacie${openPharmacies.length > 1 ? 's' : ''} ouverte${openPharmacies.length > 1 ? 's' : ''}`;
    guardCount.textContent = `${guardPharmacies.length} de garde`;

    // Render pharmacy list
    renderPharmacyList(filteredPharmacies);
  }

  function renderPharmacyList(pharmacies) {
    if (pharmacies.length === 0) {
      pharmacyList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <div class="empty-state-text">Aucune pharmacie trouvée dans un rayon de ${currentRadius} km.<br>Essayez d'augmenter le rayon de recherche.</div>
        </div>
      `;
      return;
    }

    pharmacyList.innerHTML = pharmacies
      .map((p) => {
        const statusBadge = p.isOnDuty
          ? '<span class="badge badge-guard">🌙 De garde</span>'
          : p.isOpen
            ? '<span class="badge badge-open">Ouvert</span>'
            : '<span class="badge badge-closed">Fermé</span>';

        return `
          <div class="pharmacy-card ${p.isOnDuty ? 'on-duty' : ''}" data-id="${p.id}" onclick="App.openDetailModal(App.findPharmacy('${p.id}'))">
            <div class="card-header">
              <div class="card-info">
                <div class="card-name">${p.name}</div>
                <div class="card-address">📍 ${p.address}</div>
              </div>
              <div class="card-distance">
                <span class="distance-value">${p.distance}</span>
                <span class="distance-unit">km</span>
              </div>
            </div>
            <div class="card-meta">
              ${statusBadge}
              <span class="card-hours">🕐 ${p.hours}</span>
            </div>
            <div class="card-actions">
              <button class="btn btn-call" onclick="event.stopPropagation(); App.callPharmacy('${p.phone}')">📞 Appeler</button>
              <button class="btn btn-whatsapp" onclick="event.stopPropagation(); App.openWhatsApp('${p.whatsapp}')">💬 WhatsApp</button>
              <button class="btn btn-route" onclick="event.stopPropagation(); App.openRoute(${p.lat}, ${p.lng})">🗺️ Y aller</button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // ── Radius ─────────────────────────────────────────────
  function setRadius(radius) {
    currentRadius = radius;

    // Update pills
    radiusPills.forEach((pill) => {
      pill.classList.toggle('active', parseInt(pill.dataset.radius) === radius);
    });

    // Update settings
    settingsRadius.value = radius;

    // Refresh
    updatePharmacyDisplay();
  }

  // ── Bottom Sheet ───────────────────────────────────────
  function toggleBottomSheet() {
    bottomSheet.classList.toggle('collapsed');
  }

  // ── Search Modal ───────────────────────────────────────
  function openSearchModal() {
    searchModal.classList.add('active');
    // Ensure step 1 is active
    showSearchStep(1);
    medicineInput.value = '';
    requestedMedicines = [];
    renderMedicineTags();
    searchInfo.classList.remove('visible');
    btnProceedPayment.disabled = true;

    // Update search info
    const openPharmacies = Geolocation.getOpenPharmacies(PHARMACIES, currentRadius);
    searchPharmacyCount.textContent = openPharmacies.length;
    searchRadiusDisplay.textContent = `${currentRadius} km`;

    setTimeout(() => medicineInput.focus(), 400);
  }

  function closeSearchModal() {
    searchModal.classList.remove('active');
    autocompleteList.classList.remove('visible');
    Search.reset();
  }

  function showSearchStep(step) {
    $$('.search-step').forEach((s) => s.classList.remove('active'));
    $(`#search-step-${step}`).classList.add('active');
  }

  // ── Medicine Input & Autocomplete ──────────────────────
  function handleMedicineInput(e) {
    const query = e.target.value.trim();

    Search.renderAutocomplete(query, autocompleteList, (value) => {
      medicineInput.value = value;
      onMedicineSelected(value);
    });

    if (query.length >= 2) {
      searchInfo.classList.add('visible');
      btnProceedPayment.disabled = false;
    } else {
      searchInfo.classList.remove('visible');
      btnProceedPayment.disabled = true;
    }
  }

  function handleMedicineKeydown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const direction = e.key === 'ArrowDown' ? 'down' : 'up';
      const value = Search.navigateAutocomplete(direction, autocompleteList);
      if (value) {
        medicineInput.value = value;
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      autocompleteList.classList.remove('visible');
      addMedicine();
    } else if (e.key === 'Escape') {
      autocompleteList.classList.remove('visible');
    }
  }

  function addMedicine() {
    const query = medicineInput.value.trim();
    if (query.length >= 2) {
      onMedicineSelected(query);
    }
  }

  function onMedicineSelected(medicineName) {
    if (!requestedMedicines.includes(medicineName)) {
      requestedMedicines.push(medicineName);
      renderMedicineTags();
    }
    medicineInput.value = '';
    autocompleteList.classList.remove('visible');
  }

  function renderMedicineTags() {
    medicinesTagsContainer.innerHTML = '';
    requestedMedicines.forEach((med, index) => {
      const tag = document.createElement('div');
      tag.className = 'medicine-tag';
      tag.innerHTML = `
        ${med}
        <span class="remove-tag" data-index="${index}">✕</span>
      `;
      medicinesTagsContainer.appendChild(tag);
    });

    $$('.remove-tag').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        requestedMedicines.splice(idx, 1);
        renderMedicineTags();
      });
    });

    if (requestedMedicines.length > 0) {
      searchInfo.classList.add('visible');
      btnProceedPayment.disabled = false;
    } else {
      searchInfo.classList.remove('visible');
      btnProceedPayment.disabled = true;
    }
  }

  function handleOcrSimulation(e) {
    if (!e.target.files || e.target.files.length === 0) return;
    showToast('Analyse de l\'ordonnance en cours...', 'info');
    setTimeout(() => {
      const mocks = ['Paracétamol 500mg', 'Vitamine C'];
      mocks.forEach(m => {
        if (!requestedMedicines.includes(m)) requestedMedicines.push(m);
      });
      renderMedicineTags();
      showToast('2 médicaments détectés', 'success');
      // Open modal if not open
      if (!searchModal.classList.contains('active')) {
        openSearchModal();
      }
    }, 1500);
  }

  // ── Confirmation & Payment Flow ────────────────────────
  function goToConfirmStep() {
    if (requestedMedicines.length === 0) return;
    
    showSearchStep('confirm');
    
    // Render the list of products for confirmation
    const confirmList = $('#confirm-products-list');
    if (confirmList) {
      confirmList.innerHTML = requestedMedicines.map(m => `
        <div style="padding: 10px 0; border-bottom: 1px solid var(--dark-600); display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 18px;">💊</span>
          <span style="font-weight: 500; font-size: 15px;">${m}</span>
        </div>
      `).join('');
      // Enlever la bordure du dernier élément
      if(confirmList.lastElementChild) {
        confirmList.lastElementChild.style.borderBottom = 'none';
      }
    }
  }

  function goToPaymentStep() {
    showSearchStep(2);
    
    // Always default to 100 FCFA when opening the modal since the input is blank
    const amountToPay = 100;
    const amountVal = $('#payment-amount-val');
    if(amountVal) amountVal.textContent = amountToPay;
    btnConfirmPayment.innerHTML = `✅ Confirmer le paiement — ${amountToPay} FCFA`;
    
    phoneInput.value = ''; // Always clear to let user input their own number
    btnConfirmPayment.disabled = true;
  }

  function goToSearchStep() {
    showSearchStep(1);
  }

  function selectPaymentMethod(method) {
    Payment.setMethod(method);
    methodMomo.classList.toggle('selected', method === 'momo');
    methodOm.classList.toggle('selected', method === 'om');
  }

  function handlePhoneInput() {
    const phone = phoneInput.value.trim();
    const isValid = Payment.validatePhone(phone);
    btnConfirmPayment.disabled = !isValid;

    let amountToPay = 100;

    // If the phone is valid, check if it has an active session
    if (isValid) {
      const session = JSON.parse(localStorage.getItem('PharmaGarde_Session') || 'null');
      if (session && session.phone === phone && session.expiry > Date.now()) {
        amountToPay = 0;
      }
    }

    const amountVal = $('#payment-amount-val');
    if(amountVal) amountVal.textContent = amountToPay;
    btnConfirmPayment.innerHTML = `✅ Confirmer le paiement — ${amountToPay} FCFA`;
  }

  async function handlePayment() {
    const phone = phoneInput.value.trim();
    if (!Payment.validatePhone(phone)) {
      showToast('Numéro de téléphone invalide', 'error');
      return;
    }

    savedPhone = phone;
    const amountVal = $('#payment-amount-val');
    const amountToPay = amountVal ? parseInt(amountVal.textContent, 10) : 100;

    // Show loading state
    btnConfirmPayment.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;display:inline-block;"></div> Traitement...';
    btnConfirmPayment.disabled = true;

    if (amountToPay === 0) {
      // Session is already active, skip API payment call
      setTimeout(() => {
        showToast('Demande gratuite validée (Session active)', 'success');
        processSearch();
      }, 800);
      return;
    }

    // Process actual payment
    const result = await Payment.processPayment(phone, amountToPay, `Recherche: ${requestedMedicines.join(', ')}`);

    if (result.success) {
      // Save 24h session
      localStorage.setItem('PharmaGarde_Session', JSON.stringify({
        phone: phone,
        expiry: Date.now() + 24 * 3600 * 1000
      }));
      showToast(result.message, 'success');
      processSearch();
    } else {
      showToast(result.message, 'error');
      btnConfirmPayment.innerHTML = `✅ Confirmer le paiement — ${amountToPay} FCFA`;
      btnConfirmPayment.disabled = false;
    }
  }

  async function processSearch() {
    // Move to ping step
    showSearchStep(3);
    const medicineNames = requestedMedicines.join(', ');
    pingMedicineName.textContent = medicineNames;
    const openPharmacies = Geolocation.getOpenPharmacies(PHARMACIES, currentRadius);
    pingPharmacyCount.textContent = openPharmacies.length;
    pingStatus.textContent = 'Envoi aux pharmacies...';

    // Simulate pinging
    setTimeout(() => {
      pingStatus.textContent = 'En attente des réponses...';
    }, 1500);

    // Get results
    const results = await Search.pingPharmacies(medicineNames, openPharmacies);
    searchResults = results;

    // Show results
    showSearchResults(results, medicineNames);
  }

  // ── Search Results ─────────────────────────────────────
  function showSearchResults(results, medicineName) {
    showSearchStep(4);

    resultCount.textContent = results.length;
    resultSubtitle.textContent = `pharmacie${results.length > 1 ? 's' : ''} ${results.length > 1 ? 'ont' : 'a'} confirmé la disponibilité de « ${medicineName} »`;

    if (results.length === 0) {
      resultsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">😞</div>
          <div class="empty-state-text">
            Malheureusement, aucune pharmacie dans votre zone n'a confirmé avoir ce médicament en stock.<br><br>
            Essayez d'augmenter votre rayon de recherche ou contactez directement les pharmacies.
          </div>
        </div>
      `;
      return;
    }

    resultsList.innerHTML = results
      .map(
        (p, index) => {
          const medsInStock = p.availableMedicines ? p.availableMedicines.map(m => `<span class="badge badge-stock" style="margin-right: 4px; display:inline-block; margin-bottom:4px;">✅ ${m}</span>`).join('') : '';
          return `
          <div class="result-card" style="animation-delay: ${index * 150}ms">
            <div class="result-card-header">
              <span class="result-card-name">💊 ${p.name}</span>
              <span class="result-card-distance">${p.distance} km</span>
            </div>
            <div class="result-card-address">📍 ${p.address} — ${p.quarter}</div>
            <div style="margin: 8px 0; font-size: 13px;">
              ${medsInStock}
            </div>
            <div class="result-card-actions">
              <button class="btn btn-primary btn-sm" onclick="PharmMap.drawRoute(Geolocation.getPosition().lat, Geolocation.getPosition().lng, ${p.lat}, ${p.lng})">🗺️ Y aller</button>
              <button class="btn btn-call btn-sm" onclick="App.callPharmacy('${p.phone}')">📞 Appeler</button>
              <button class="btn btn-gold btn-sm" onclick="App.reserveMedicine(${index})">🔒 Réserver</button>
            </div>
          </div>
          `;
        }
      )
      .join('');
  }

  function resetSearch() {
    showSearchStep(1);
    medicineInput.value = '';
    searchInfo.classList.remove('visible');
    btnProceedPayment.disabled = true;
    btnConfirmPayment.innerHTML = '✅ Confirmer le paiement — 100 FCFA';
    btnConfirmPayment.disabled = false;
    Search.reset();
    searchResults = [];
    setTimeout(() => medicineInput.focus(), 300);
  }

  // ── Reservation ────────────────────────────────────────
  async function reserveMedicine(index) {
    const pharmacy = searchResults[index];
    if (!pharmacy) return;

    const phone = savedPhone || prompt('Entrez votre numéro Mobile Money :');
    if (!phone) return;

    showToast('Traitement de la réservation...', 'info');

    const result = await Payment.processReservation(
      phone,
      pharmacy.name,
      Search.getCurrentMedicine()
    );

    if (result.success) {
      showToast(`🔒 Médicament réservé à ${pharmacy.name} pour 1 heure !`, 'success');

      // Add timer to the result card
      const cards = resultsList.querySelectorAll('.result-card');
      if (cards[index]) {
        const existingTimer = cards[index].querySelector('.reserve-timer');
        if (!existingTimer) {
          const timerDiv = document.createElement('div');
          timerDiv.className = 'reserve-timer';
          timerDiv.innerHTML = '🔒 Réservé — <span id="timer-' + index + '">60:00</span> restantes';
          cards[index].appendChild(timerDiv);
          startReservationTimer(index, 3600);
        }
      }
    } else {
      showToast(result.message, 'error');
    }
  }

  function startReservationTimer(index, seconds) {
    const timerEl = document.getElementById(`timer-${index}`);
    if (!timerEl) return;

    let remaining = seconds;
    const interval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(interval);
        timerEl.textContent = 'Expirée';
        return;
      }
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }, 1000);
  }

  // ── Pharmacy Detail Modal ──────────────────────────────
  function openDetailModal(pharmacy) {
    selectedPharmacy = pharmacy;

    $('#detail-name').textContent = pharmacy.name;
    $('#detail-address').textContent = pharmacy.address;
    $('#detail-distance').textContent = pharmacy.distance || '—';
    $('#detail-rating').textContent = pharmacy.rating || '—';
    $('#detail-hours').textContent = pharmacy.hours;

    // Status
    if (pharmacy.isOnDuty) {
      $('#detail-status-text').textContent = '🌙 Garde';
      $('#detail-status-text').style.color = 'var(--gold-400)';
      $('#detail-badge').innerHTML = '<span class="badge badge-guard">🌙 De garde</span>';
    } else if (pharmacy.isOpen) {
      $('#detail-status-text').textContent = '✅ Ouvert';
      $('#detail-status-text').style.color = 'var(--green-400)';
      $('#detail-badge').innerHTML = '<span class="badge badge-open">Ouvert</span>';
    } else {
      $('#detail-status-text').textContent = '❌ Fermé';
      $('#detail-status-text').style.color = 'var(--red-400)';
      $('#detail-badge').innerHTML = '<span class="badge badge-closed">Fermé</span>';
    }

    // Action buttons
    $('#detail-call').onclick = () => callPharmacy(pharmacy.phone);
    $('#detail-whatsapp').onclick = () => openWhatsApp(pharmacy.whatsapp);
    $('#detail-route').onclick = () => openRoute(pharmacy.lat, pharmacy.lng);

    detailModal.classList.add('active');

    // Highlight on map
    PharmMap.highlightPharmacy(pharmacy);
  }

  function closeDetailModal() {
    detailModal.classList.remove('active');
    selectedPharmacy = null;
  }

  // ── Settings ───────────────────────────────────────────
  function openSettings() {
    settingsModal.classList.add('active');
  }

  function closeSettings() {
    settingsModal.classList.remove('active');
  }

  function handleSettingsCityChange() {
    const city = settingsCity.value;
    currentCity = city;
    cityNameDisplay.textContent = city;

    const cityData = CITIES_AND_QUARTERS[city];
    if (cityData) {
      Geolocation.setUserPosition(cityData.center.lat, cityData.center.lng);
      PharmMap.centerOn(cityData.center.lat, cityData.center.lng, 12);
      PharmMap.setUserMarker(cityData.center.lat, cityData.center.lng);
      updatePharmacyDisplay();
      showToast(`📍 Ville changée : ${city}`, 'success');
    }
  }

  // ── External Actions ───────────────────────────────────
  function callPharmacy(phone) {
    window.open(`tel:${phone}`, '_self');
  }

  function openWhatsApp(whatsapp) {
    const message = encodeURIComponent('Bonjour, je vous contacte via Pharma-Garde. J\'aimerais savoir si vous avez un médicament en stock.');
    window.open(`https://wa.me/${whatsapp}?text=${message}`, '_blank');
  }

  function openRoute(lat, lng) {
    const userPos = Geolocation.getPosition();
    if (userPos) {
      window.open(
        `https://www.google.com/maps/dir/${userPos.lat},${userPos.lng}/${lat},${lng}`,
        '_blank'
      );
    } else {
      window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
    }
  }

  function findPharmacy(id) {
    return filteredPharmacies.find((p) => p.id === id) || null;
  }

  // ── Toast Notifications ────────────────────────────────
  function showToast(message, type = 'success') {
    toast.className = `toast toast-${type} show`;
    toastMessage.textContent = message;

    setTimeout(() => {
      toast.classList.remove('show');
    }, 3500);
  }

  // ── Public API ─────────────────────────────────────────
  return {
    init,
    callPharmacy,
    openWhatsApp,
    openRoute,
    openDetailModal,
    findPharmacy,
    reserveMedicine,
    showToast,
  };
})();

// ── Start the application ────────────────────────────────
document.addEventListener('DOMContentLoaded', App.init);
