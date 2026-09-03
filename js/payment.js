/**
 * Pharma-Garde — Payment Module
 * Handles Mobile Money payments (Orange Money & MTN MoMo)
 * Architecture ready for CamPay / Monetbil integration
 * 
 * IMPORTANT: The merchant account (694929909) is NEVER exposed client-side.
 * It is configured server-side in Supabase Edge Functions.
 */

const Payment = (() => {
  // ── Constants ──────────────────────────────────────────
  const SEARCH_COST = 100; // FCFA
  const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24h in ms
  const SESSION_KEY = 'pharmagarde_payment_session';

  // Payment gateway config
  // In production, these calls go through Supabase Edge Functions
  const PAYMENT_ENDPOINT = null; // Will be set when Edge Function is deployed

  // ── Phone number validation ────────────────────────────
  const PHONE_PATTERNS = {
    momo: /^6[5678]\d{7}$/, // MTN: 65x, 66x, 67x, 68x
    om: /^6[59]\d{7}$/,     // Orange: 65x, 69x
  };

  /**
   * Validate phone number for the selected operator
   */
  function validatePhone(phone, method) {
    const cleaned = phone.replace(/\s+/g, '').replace(/^\+?237/, '');
    
    if (cleaned.length !== 9) return { valid: false, error: 'Le numéro doit contenir 9 chiffres' };
    
    // Check operator match
    if (method === 'momo') {
      if (!PHONE_PATTERNS.momo.test(cleaned)) {
        return { valid: false, error: 'Ce numéro ne semble pas être un numéro MTN (67x, 65x, 68x)' };
      }
    } else if (method === 'om') {
      if (!PHONE_PATTERNS.om.test(cleaned)) {
        return { valid: false, error: 'Ce numéro ne semble pas être un numéro Orange (69x, 65x)' };
      }
    }
    
    return { valid: true, cleaned: cleaned };
  }

  /**
   * Check if user has an active payment session (24h window)
   */
  function hasActiveSession() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY));
      if (session && (Date.now() - session.timestamp < SESSION_DURATION)) {
        return true;
      }
    } catch(e) { /* ignore */ }
    return false;
  }

  /**
   * Create a new payment session
   */
  function createSession(transactionId) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        transactionId,
        timestamp: Date.now(),
        expiresAt: Date.now() + SESSION_DURATION,
      }));
    } catch(e) { /* ignore */ }
  }

  /**
   * Get the session expiry time remaining (ms)
   */
  function getSessionTimeRemaining() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY));
      if (session) {
        const remaining = session.expiresAt - Date.now();
        return Math.max(0, remaining);
      }
    } catch(e) { /* ignore */ }
    return 0;
  }

  /**
   * Get the cost for a search (0 if session is active)
   */
  function getSearchCost() {
    return hasActiveSession() ? 0 : SEARCH_COST;
  }

  /**
   * Process a payment via CamPay / Mobile Money
   * In production, this calls a Supabase Edge Function
   * The Edge Function handles the actual API call with the merchant credentials
   */
  async function processPayment(phone, method, amount) {
    const validation = validatePhone(phone, method);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // If session is active, no payment needed
    if (hasActiveSession()) {
      return { 
        success: true, 
        transactionId: 'SESSION_ACTIVE',
        message: 'Session active — Recherche gratuite',
        amount: 0
      };
    }

    // ── Production path: Supabase Edge Function ──
    if (PAYMENT_ENDPOINT) {
      try {
        const response = await fetch(PAYMENT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: validation.cleaned,
            amount: amount,
            method: method, // 'momo' or 'om'
            description: 'Pharma-Garde - Recherche Express',
          }),
        });

        const result = await response.json();
        
        if (result.success) {
          createSession(result.transactionId);
          return {
            success: true,
            transactionId: result.transactionId,
            message: 'Paiement confirmé',
            amount: amount
          };
        } else {
          return {
            success: false,
            error: result.error || 'Paiement refusé. Veuillez réessayer.',
          };
        }
      } catch (error) {
        console.error('Payment API error:', error);
        return {
          success: false,
          error: 'Erreur de connexion. Vérifiez votre connexion internet.',
        };
      }
    }

    // ── Development path: Simulation ──
    // This simulates the payment flow for development/testing
    return new Promise((resolve) => {
      const operatorName = method === 'momo' ? 'MTN MoMo' : 'Orange Money';
      
      console.log(`[DEV] Simulation paiement ${operatorName}: ${amount} FCFA → ${validation.cleaned}`);
      console.log(`[DEV] Merchant account: ***HIDDEN*** (configured server-side)`);

      // Simulate processing delay
      setTimeout(() => {
        const txId = 'TX-' + Date.now() + '-' + Math.random().toString(36).substr(2, 8);
        
        createSession(txId);
        
        resolve({
          success: true,
          transactionId: txId,
          message: `Paiement ${operatorName} simulé avec succès`,
          amount: amount,
          simulated: true
        });
      }, 2000);
    });
  }

  /**
   * Check payment status (for async payment confirmations)
   */
  async function checkPaymentStatus(transactionId) {
    if (!PAYMENT_ENDPOINT) {
      // Dev mode
      return { status: 'SUCCESS', transactionId };
    }

    try {
      const response = await fetch(`${PAYMENT_ENDPOINT}/status/${transactionId}`);
      return await response.json();
    } catch (error) {
      return { status: 'ERROR', error: error.message };
    }
  }

  return {
    SEARCH_COST,
    validatePhone,
    hasActiveSession,
    getSearchCost,
    getSessionTimeRemaining,
    processPayment,
    checkPaymentStatus,
  };
})();

window.Payment = Payment;
