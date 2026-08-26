/**
 * Pharma-Garde — Search Module
 * Handles medicine search, autocomplete, and pharmacy ping simulation
 */

const Search = (() => {
  let currentMedicine = '';
  let autocompleteIndex = -1;

  /**
   * Filter medications list for autocomplete
   * @param {string} query - User input
   * @returns {Array<string>} Matching medications
   */
  function filterMedications(query) {
    if (!query || query.length < 2) return [];

    const normalizedQuery = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    return COMMON_MEDICATIONS.filter((med) => {
      const normalizedMed = med.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return normalizedMed.includes(normalizedQuery);
    }).slice(0, 8);
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
   * Render the autocomplete dropdown
   */
  function renderAutocomplete(query, container, onSelect) {
    const results = filterMedications(query);
    autocompleteIndex = -1;

    if (results.length === 0) {
      container.classList.remove('visible');
      container.innerHTML = '';
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

    container.classList.add('visible');

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

  function pingPharmacies(medicineName, pharmacies) {
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
               // Le pharmacien a cliqué sur "OUI"
               const pharmacy = pharmacies.find(p => p.id === updatedRequest.pharmacy_id) || pharmacies[0];
               if (pharmacy) {
                 const respondingPharmacy = {
                    ...pharmacy,
                    responseTime: 5,
                    availableMedicines: requestedMeds
                 };
                 supabase.removeChannel(channel);
                 resolve([respondingPharmacy]);
               }
            } else if (updatedRequest.status === 'rejected') {
                 // Continuer d'attendre d'autres pharmacies, ou terminer si c'était la seule
                 // Pour la démo, on ignore juste
            }
          })
          .subscribe();

        // 3. Timeout après 30 secondes
        setTimeout(() => {
          supabase.removeChannel(channel);
          // Pour la démo, on résout avec un tableau vide (aucune pharmacie n'a répondu)
          resolve([]);
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
