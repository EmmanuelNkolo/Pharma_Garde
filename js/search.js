/**
 * Pharma-Garde — Search Module
 * Handles medicine search, autocomplete, and pharmacy ping simulation
 */

const Search = (() => {
  let currentMedicine = '';
  let autocompleteIndex = -1;

  let debounceTimeout = null;

  /**
   * Fetch medications from local robust list AND the internet (Wikipedia OpenSearch)
   * @param {string} query - User input
   * @returns {Promise<Array<string>>} Matching medications
   */
  async function fetchMedications(query) {
    if (!query || query.length < 2) return [];

    let localResults = [];
    try {
      const normalizedQuery = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      localResults = LOCAL_MEDICINES.filter(med => {
        const normalizedMed = med.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return normalizedMed.includes(normalizedQuery);
      });
    } catch (error) {
      console.error('Local search error:', error);
    }

    let internetResults = [];
    try {
      // Aller chercher sur internet (API publique Wikipedia FR)
      const res = await fetch(`https://fr.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=10&namespace=0&format=json&origin=*`);
      const data = await res.json();
      if (data && data[1]) {
        // Nettoyer les résultats (enlever les mots entre parenthèses si on veut, ou juste garder tel quel)
        internetResults = data[1].filter(item => !item.toLowerCase().includes('homonymie'));
      }
    } catch(e) {
      console.error('Internet search error:', e);
    }

    // Fusionner (Local en priorité) et dédupliquer, limité à 10 résultats
    const combined = [...new Set([...localResults, ...internetResults])];
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

    // Remove current highlight
    items.forEach((item) => item.classList.remove('highlighted'));

    if (direction === 'down') {
      autocompleteIndex = Math.min(autocompleteIndex + 1, items.length - 1);
    } else if (direction === 'up') {
      autocompleteIndex = Math.max(autocompleteIndex - 1, 0);
    }

    items[autocompleteIndex].classList.add('highlighted');
    return items[autocompleteIndex].dataset.value;
  }

  function pingPharmacies(medicineName, pharmacies, onResponse) {
    return new Promise(async (resolve) => {
      currentMedicine = medicineName;
      const requestedMeds = medicineName.split(',').map(m => m.trim()).filter(m => m);
      const session = JSON.parse(localStorage.getItem('PharmaGarde_Session') || 'null');
      const phone = session ? session.phone : 'Anonyme';

      try {
        // 1. Enregistrer la demande dans Supabase
        const { data: request, error } = await supabase
          .from('requests')
          .insert([{ user_phone: phone, medicines: requestedMeds, status: 'pending' }])
          .select()
          .single();

        if (error) throw error;

        let responders = [];

        // 2. Écouter les réponses en Temps Réel
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
               // Trouver la pharmacie dans notre base globale ou locale
               const pharmacy = pharmacies.find(p => p.id === updatedRequest.pharmacy_id) || window.PHARMACIES.find(p => p.id === updatedRequest.pharmacy_id) || pharmacies[0];
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

        // 3. Fin de la requête après 30 secondes (30s) au lieu de 3 minutes
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

  /**
   * Get the current medicine being searched
   */
  function getCurrentMedicine() {
    return currentMedicine;
  }

  /**
   * Reset the search state
   */
  function reset() {
    currentMedicine = '';
    autocompleteIndex = -1;
  }

  return {
    filterMedications,
    renderAutocomplete,
    navigateAutocomplete,
    pingPharmacies,
    getCurrentMedicine,
    reset,
  };
})();
