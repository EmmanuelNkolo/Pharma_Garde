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
    } catch (e) { /* ignore */ }
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
    } catch (e) { /* ignore */ }
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
    } catch (e) { /* ignore */ }
    return 0;
  }

  /**
   * Get the cost for a search (0 if session is active)
   */
  function getSearchCost() {
    return hasActiveSession() ? 0 : SEARCH_COST;
  }

  /**
   * Process a payment via Supabase Edge Function — Push USSD direct (sans popup)
   */
  async function processPayment(phone, method, amount) {
    const validation = validatePhone(phone, method);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // If session is active, no payment needed
    if (hasActiveSession()) {
      const remainingHours = Math.ceil(getSessionTimeRemaining() / 3600000);
      return {
        success: true,
        transactionId: 'SESSION_ACTIVE',
        message: `Session active · Valide encore ${remainingHours}h`,
        amount: 0
      };
    }

      let popup = null;
      try {
        // Pre-open popup to avoid browser blockers
        popup = window.open('about:blank', 'NotchPayCheckout', 'width=500,height=700');
      } catch (e) {}

      try {
        if (!window.supabase) {
          if (popup) popup.close();
          return { success: false, error: "Erreur de configuration serveur (Supabase manquant)" };
        }

        // Appeler l'Edge Function pour initier + compléter le paiement (push USSD direct)
        const { data, error } = await supabase.functions.invoke('notchpay-payment', {
          body: {
            action: 'collect',
            phone: validation.cleaned,
            method: method,
            amount: amount,
            description: 'Pharma-Garde - Recherche Express'
          }
        });

        if (error || !data) {
          if (popup) popup.close();
          throw new Error(error?.message || "Erreur de connexion au serveur");
        }

        if (data.success && data.reference) {
          if (!data.direct_charge) {
            // Le push USSD direct n'a pas pu être envoyé, on redirige la popup
            if (popup) {
              popup.location.href = data.authorization_url;
            } else {
              return { 
                success: true, 
                redirect: true, 
                authorization_url: data.authorization_url, 
                reference: data.reference 
              };
            }
          } else {
            // Push direct fonctionnel, pas besoin de popup
            if (popup) popup.close();
          }

          // Polling
          return await pollPaymentStatus(data.reference, amount, data.message || 'Veuillez entrer votre code PIN sur votre téléphone pour confirmer.', popup);
        } else {
          if (popup) popup.close();
          return { success: false, error: data.error || 'Paiement refusé par l\'opérateur.' };
        }
      } catch (err) {
        if (popup) popup.close();
        if (err && (err.message || '').toLowerCase().includes('insufficient')) {
          return { success: false, error: 'Désolé, votre solde est insuffisant. Veuillez recharger votre compte avant de relancer la recherche.' };
        }
        console.error('Payment Edge Function error:', err);
        return { success: false, error: 'Erreur réseau : ' + (err.message || 'Erreur inconnue') };
      }
  }

  async function pollPaymentStatus(reference, amount, defaultMessage = 'Veuillez patienter...', popup = null) {
    let isPaid = false;
    let attempts = 0;
    let finalMessage = defaultMessage;
    
    let delayMs = 3000;
    let totalElapsed = 0;
    const MAX_TIMEOUT = 120000; // 2 minutes
    
    while (totalElapsed < MAX_TIMEOUT) {
      await new Promise(r => setTimeout(r, delayMs));
      totalElapsed += delayMs;
      attempts++;
      
      const statusCheck = await checkPaymentStatus(reference);

      if (popup && popup.closed && statusCheck.status !== 'SUCCESSFUL') {
        return { success: false, error: 'La fenêtre de paiement a été fermée.' };
      }

      if (statusCheck.status === 'SUCCESSFUL') {
        isPaid = true;
        finalMessage = 'Paiement confirmé avec succès ! 🎉';
        if (popup) popup.close();
        break;
      } else if (statusCheck.status === 'FAILED') {
        if (popup) popup.close();
        return { success: false, error: 'Désolé, le paiement a échoué ou a été annulé.' };
      }

      // Backoff exponentiel (max 8s)
      delayMs = Math.min(8000, delayMs * 1.5);
    }

    if (isPaid) {
      createSession(reference);
      return { success: true, transactionId: reference, message: finalMessage, amount: amount };
    } else {
      if (popup) popup.close();
      return { success: false, error: 'Temps d\'attente dépassé. Si vous avez validé, le système se mettra à jour. Sinon, veuillez réessayer.' };
    }
  }

  /**
   * Check payment status via Supabase Edge Function
   */
  async function checkPaymentStatus(reference) {
    try {
      if (!window.supabase) return { status: 'ERROR', error: 'Supabase manquant' };

      const { data, error } = await supabase.functions.invoke('notchpay-payment', {
        body: {
          action: 'status',
          reference: reference
        }
      });

      if (error || !data) throw error;
      
      return { status: data.status, data: data.data };
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
    pollPaymentStatus,
  };
})();

window.Payment = Payment;
