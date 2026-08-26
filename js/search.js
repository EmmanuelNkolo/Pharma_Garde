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

  /**
   * Simulate pinging pharmacies for a medication
   * In production, this would be an API call
   * @param {string} medicineName
   * @param {Array} pharmacies - Open pharmacies in range
   * @returns {Promise<Array>} Pharmacies that have the medicine in stock
   */
  function pingPharmacies(medicineName, pharmacies) {
    return new Promise((resolve) => {
      // Simulate network delay (2-5 seconds)
      const delay = 2000 + Math.random() * 3000;

      currentMedicine = medicineName;
      const requestedMeds = medicineName.split(',').map(m => m.trim()).filter(m => m);

      setTimeout(() => {
        // Simulate random responses
        // In production, each pharmacy would respond individually
        const respondingPharmacies = pharmacies.filter(() => {
          // ~70% chance a pharmacy has at least one of the medicines
          return Math.random() > 0.3;
        });

        // Ensure at least 1 result for demo purposes
        if (respondingPharmacies.length === 0 && pharmacies.length > 0) {
          respondingPharmacies.push(pharmacies[0]);
        }

        resolve(
          respondingPharmacies.map((p) => {
            // Assign available medicines
            const availableMeds = requestedMeds.filter(() => Math.random() > 0.3); // 70% chance to have a specific med
            // If they have none but were selected as a responding pharmacy, give them at least one
            if(availableMeds.length === 0) availableMeds.push(requestedMeds[0]);

            return {
              ...p,
              responseTime: Math.floor(Math.random() * 30) + 5, // 5-35 seconds
              availableMedicines: availableMeds,
            };
          })
        );
      }, delay);
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
