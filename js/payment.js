/**
 * Pharma-Garde — Payment Module
 * Handles Mobile Money payment simulation (MoMo & Orange Money)
 */

const Payment = (() => {
  let selectedMethod = 'momo';
  let lastTransactionId = null;

  const SEARCH_COST = 200;     // FCFA
  const RESERVE_COST = 100;    // FCFA

  /**
   * Set the selected payment method
   * @param {'momo' | 'om'} method
   */
  function setMethod(method) {
    selectedMethod = method;
  }

  /**
   * Get the currently selected payment method
   */
  function getMethod() {
    return selectedMethod;
  }

  /**
   * Get the display name for a payment method
   */
  function getMethodName(method) {
    return method === 'momo' ? 'MTN Mobile Money' : 'Orange Money';
  }

  /**
   * Validate a Cameroonian phone number
   * @param {string} phone
   * @returns {boolean}
   */
  function validatePhone(phone) {
    // Remove spaces and dashes
    const cleaned = phone.replace(/[\s-]/g, '');

    // Cameroon phone numbers: start with 6, 9 digits total
    // Or with +237, then 9 digits
    if (/^6\d{8}$/.test(cleaned)) return true;
    if (/^\+?237\s?6\d{8}$/.test(cleaned)) return true;

    return false;
  }

  /**
   * Validate phone number against selected payment method
   * MTN: 67x, 65x, 68x
   * Orange: 69x, 66x, 655, 656, 657, 658, 659
   */
  function validatePhoneForMethod(phone, method) {
    const cleaned = phone.replace(/[\s\-+237]/g, '');
    if (cleaned.length < 2) return true; // Not enough digits to validate yet

    // Basic validation for demo - in production, use operator prefixes
    return true;
  }

  /**
   * Format a phone number for display
   */
  function formatPhone(phone) {
    const cleaned = phone.replace(/[\s-]/g, '');
    if (cleaned.length === 9) {
      return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
    }
    return phone;
  }

  /**
   * Simulate a Mobile Money payment
   * In production, this would call CamPay / Monetbil API
   * @param {string} phone - User's phone number
   * @param {number} amount - Amount in FCFA
   * @param {string} description - Transaction description
   * @returns {Promise<{success: boolean, transactionId: string, message: string}>}
   */
  function processPayment(phone, amount, description) {
    return new Promise((resolve) => {
      // Simulate payment processing (1.5-3 seconds)
      // En production, on utilise un agrégateur de paiement (Campay, Monetbil) pour 
      // prélever le compte MOMO ou OM de l'utilisateur et créditer le compte OM 694929909
      console.log(`[PAIEMENT] Prélevement de ${amount} FCFA sur le numéro ${phone} (${selectedMethod.toUpperCase()})`);
      console.log(`[PAIEMENT] Transfert des fonds vers le compte marchand OM masqué : 694929909`);

      const delay = 1500 + Math.random() * 1500;

      setTimeout(() => {
        // Generate a fake transaction ID
        const transactionId = 'PG-' + Date.now().toString(36).toUpperCase() + '-' + 
                              Math.random().toString(36).slice(2, 6).toUpperCase();
        
        lastTransactionId = transactionId;

        // 95% success rate for simulation
        const success = Math.random() > 0.05;

        if (success) {
          resolve({
            success: true,
            transactionId,
            message: `Paiement de ${amount} FCFA via ${getMethodName(selectedMethod)} réussi !`,
            method: selectedMethod,
            amount,
            phone: formatPhone(phone),
            timestamp: new Date().toISOString(),
          });
        } else {
          resolve({
            success: false,
            transactionId: null,
            message: 'Échec du paiement. Veuillez vérifier votre solde et réessayer.',
            method: selectedMethod,
          });
        }
      }, delay);
    });
  }

  /**
   * Process a reservation payment
   */
  function processReservation(phone, pharmacyName, medicineName) {
    return processPayment(
      phone,
      RESERVE_COST,
      `Réservation de ${medicineName} à ${pharmacyName}`
    );
  }

  /**
   * Get the last transaction ID
   */
  function getLastTransactionId() {
    return lastTransactionId;
  }

  /**
   * Get pricing constants
   */
  function getPricing() {
    return {
      search: SEARCH_COST,
      reserve: RESERVE_COST,
    };
  }

  return {
    setMethod,
    getMethod,
    getMethodName,
    validatePhone,
    validatePhoneForMethod,
    formatPhone,
    processPayment,
    processReservation,
    getLastTransactionId,
    getPricing,
  };
})();
