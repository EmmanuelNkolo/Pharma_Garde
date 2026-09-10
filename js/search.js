/**
 * Pharma-Garde v2.0 — Search Module
 * Handles medicine search, autocomplete with Local + OpenFDA + Wikipedia
 */

const Search = (() => {
  let currentMedicine = '';
  let autocompleteIndex = -1;
  let debounceTimeout = null;

  /**
   * Fetch medications from: 1) Local list, 2) OpenFDA, 3) Wikipedia FR
   */
  async function fetchMedications(query) {
    if (!query || query.length < 2) return [];

    // 1. Local search (priority)
    let localResults = [];
    try {
      const normalizedQuery = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (typeof LOCAL_MEDICINES !== 'undefined') {
        localResults = LOCAL_MEDICINES.filter(med => {
          const normalizedMed = med.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return normalizedMed.includes(normalizedQuery);
        });
      }
    } catch (error) {
      console.error('Local search error:', error);
    }

    // 2. OpenFDA search (real drug data)
    let fdaResults = [];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const fdaRes = await fetch(
        `https://api.fda.gov/drug/label.json?search=openfda.brand_name:"${encodeURIComponent(query)}"&limit=5`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);
      if (fdaRes.ok) {
        const fdaData = await fdaRes.json();
        if (fdaData.results) {
          fdaResults = fdaData.results
            .map(r => {
              const brandName = r.openfda && r.openfda.brand_name ? r.openfda.brand_name[0] : null;
              const genericName = r.openfda && r.openfda.generic_name ? r.openfda.generic_name[0] : null;
              return brandName || genericName;
            })
            .filter(Boolean);
        }
      }
    } catch (e) {
      // OpenFDA may fail silently — that's fine
    }

    // 3. Wikipedia FR (fallback for local Cameroonian names)
    let internetResults = [];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(
        `https://fr.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&namespace=0&format=json&origin=*`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);
      const data = await res.json();
      if (data && data[1]) {
        internetResults = data[1].filter(item => !item.toLowerCase().includes('homonymie'));
      }
    } catch (e) {
      // Wikipedia may fail — that's fine
    }

    // Merge: Local → OpenFDA → Wikipedia. Deduplicate, max 10
    const combined = [...new Set([...localResults, ...fdaResults, ...internetResults])];
    return combined.slice(0, 10);
  }

  /**
   * Highlight matching text in autocomplete results
   */
  function highlightMatch(text, query) {
    const normalizedText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normalizedQuery = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const index = normalizedText.indexOf(normalizedQuery);

    if (index === -1) return text;

    const before = text.slice(0, index);
    const match = text.slice(index, index + query.length);
    const after = text.slice(index + query.length);

    return `${before}<mark>${match}</mark>${after}`;
  }

  /**
   * Render the autocomplete dropdown (Async)
   */
  async function renderAutocomplete(query, container, onSelect) {
    if (!query || query.length < 2) {
      container.classList.remove('visible');
      container.innerHTML = '';
      return;
    }

    container.innerHTML = '<div class="autocomplete-item" style="justify-content:center;color:var(--slate-500)"><div class="spinner" style="width:20px;height:20px;border-width:2px;"></div></div>';
    container.classList.add('visible');

    const results = await fetchMedications(query);
    autocompleteIndex = -1;

    if (results.length === 0) {
      container.innerHTML = '<div class="autocomplete-item" style="justify-content:center;color:var(--slate-500)">Aucun résultat</div>';
      return;
    }

    container.innerHTML = results
      .map(
        (med, i) =>
          `<div class="autocomplete-item" data-index="${i}" data-value="${med}">
            ${highlightMatch(med, query)}
          </div>`
      )
      .join('');

    // Click handlers
    container.querySelectorAll('.autocomplete-item').forEach((item) => {
      item.addEventListener('click', () => {
        onSelect(item.dataset.value);
        container.classList.remove('visible');
      });
    });
  }

  /**
   * Navigate autocomplete with keyboard
   */
  function navigateAutocomplete(direction, container) {
    const items = container.querySelectorAll('.autocomplete-item');
    if (items.length === 0) return null;

    items.forEach((item) => item.classList.remove('highlighted'));

    if (direction === 'down') {
      autocompleteIndex = Math.min(autocompleteIndex + 1, items.length - 1);
    } else if (direction === 'up') {
      autocompleteIndex = Math.max(autocompleteIndex - 1, 0);
    }

    items[autocompleteIndex].classList.add('highlighted');
    return items[autocompleteIndex].dataset.value;
  }

  function pingPharmacies(medicineName, pharmacies, insuranceName, onResponse) {
    return new Promise(async (resolve) => {
      currentMedicine = medicineName;
      const requestedMeds = medicineName.split(',').map(m => m.trim()).filter(m => m);
      const session = JSON.parse(localStorage.getItem('PharmaGarde_Session') || 'null');
      const phone = session ? session.phone : 'Anonyme';

      try {
        const insertData = { user_phone: phone, medicines: requestedMeds, status: 'pending' };
        if (insuranceName) {
          insertData.insurance_name = insuranceName;
        }

        const { data: request, error } = await supabase
          .from('requests')
          .insert([insertData])
          .select()
          .single();

        if (error) throw error;

        let responders = [];

        const channel = supabase
          .channel(`request_${request.id}`)
          .on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'requests', 
            filter: `id=eq.${request.id}` 
          }, (payload) => {
            const updatedRequest = payload.new;
            if (updatedRequest.status === 'accepted') {
               const pharmacy = pharmacies.find(p => p.id === updatedRequest.pharmacy_id) || (typeof LOCAL_PHARMACIES !== 'undefined' ? LOCAL_PHARMACIES.find(p => p.id === updatedRequest.pharmacy_id) : null) || pharmacies[0];
               if (pharmacy && !responders.find(r => r.id === pharmacy.id)) {
                 const respondingPharmacy = {
                    ...pharmacy,
                    responseTime: 5,
                    availableMedicines: requestedMeds
                 };
                 responders.push(respondingPharmacy);
                 if(onResponse) onResponse(respondingPharmacy);
               }
            }
          })
          .subscribe();

        setTimeout(() => {
          supabase.removeChannel(channel);
          resolve(responders);
        }, 30000); 

      } catch (err) {
        console.error("Erreur de ping Supabase:", err);
        resolve([]);
      }
    });
  }

  function getCurrentMedicine() {
    return currentMedicine;
  }

  function reset() {
    currentMedicine = '';
    autocompleteIndex = -1;
  }

  return {
    renderAutocomplete,
    navigateAutocomplete,
    pingPharmacies,
    getCurrentMedicine,
    reset,
  };
})();

window.Search = Search;
