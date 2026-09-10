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
   * Process a payment via Supabase Edge Function (campay-payment)
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

    try {
      if (!window.supabase) {
        return { success: false, error: "Erreur de configuration serveur (Supabase manquant)" };
      }

      // Appeler l'Edge Function pour initier le paiement
      const { data, error } = await supabase.functions.invoke('campay-payment', {
        body: {
          action: 'collect',
          phone: validation.cleaned,
          amount: amount,
          description: 'Pharma-Garde - Recherche Express'
        }
      });

      if (error || !data) {
        throw new Error(error?.message || "Erreur de connexion à l'Edge Function");
      }

      if (data.success && data.reference) {
        // Le paiement a été initié avec succès sur Campay.
        // On fait maintenant du polling pour attendre que l'utilisateur valide sur son téléphone.
        
        let isPaid = false;
        let attempts = 0;
        let finalMessage = 'Paiement initié. Veuillez valider sur votre téléphone.';
        
        while (attempts < 12) { // Attend jusqu'à ~60 secondes
          await new Promise(r => setTimeout(r, 5000));
          attempts++;
          
          const statusCheck = await checkPaymentStatus(data.reference);
          if (statusCheck.status === 'SUCCESSFUL') {
            isPaid = true;
            finalMessage = 'Paiement confirmé avec succès.';
            break;
          } else if (statusCheck.status === 'FAILED') {
            return { success: false, error: 'Le paiement a échoué ou a été annulé par l\'utilisateur.' };
          }
        }

        if (isPaid) {
          createSession(data.reference);
          return { success: true, transactionId: data.reference, message: finalMessage, amount: amount };
        } else {
          return { success: false, error: 'Temps d\'attente dépassé. Si vous avez payé, l\'application l\'enregistrera en arrière-plan. Veuillez réessayer la recherche dans un instant.' };
        }
      } else {
        return { success: false, error: data.error || 'Paiement refusé par l\'opérateur.' };
      }
    } catch (err) {
      console.error('Payment Edge Function error:', err);
      return { success: false, error: 'Erreur de connexion sécurisée. Vérifiez votre connexion internet.' };
    }
  }

  /**
   * Check payment status via Supabase Edge Function
   */
  async function checkPaymentStatus(reference) {
    try {
      if (!window.supabase) return { status: 'ERROR', error: 'Supabase manquant' };

      const { data, error } = await supabase.functions.invoke('campay-payment', {
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
  };
})();

window.Payment = Payment;
