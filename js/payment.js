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

      // Pre-open popup to avoid browser blockers since the API call is async
      let popup = null;
      try {
        popup = window.open('about:blank', 'NotchPayCheckout', 'width=500,height=700');
      } catch(e) {}

      // Appeler l'Edge Function pour initier le paiement
      const { data, error } = await supabase.functions.invoke('notchpay-payment', {
        body: {
          action: 'collect',
          phone: validation.cleaned,
          amount: amount,
          description: 'Pharma-Garde - Recherche Express'
        }
      });

      if (error || !data) {
        if (popup) popup.close();
        throw new Error(error?.message || "Erreur de connexion à l'Edge Function");
      }

      if (data.success && data.reference) {
        // Rediriger la popup vers l'URL de paiement Notch Pay
        if (data.authorization_url && popup) {
          popup.location.href = data.authorization_url;
        } else if (data.authorization_url) {
           // Fallback if popup was blocked
           window.location.href = data.authorization_url;
        }

        // Le paiement a été initié avec succès sur Notch Pay.
        // On fait maintenant du polling pour attendre que l'utilisateur valide sur son téléphone.
        
        let isPaid = false;
        let attempts = 0;
        let finalMessage = 'Paiement initié. Veuillez valider sur votre téléphone.';
        
        while (attempts < 60) { // Attend jusqu'à ~5 minutes (60 * 5s)
          await new Promise(r => setTimeout(r, 5000));
          attempts++;
          
          const statusCheck = await checkPaymentStatus(data.reference);
          
          // Si la popup a été fermée par l'utilisateur
          if (popup && popup.closed && statusCheck.status !== 'SUCCESSFUL') {
              return { success: false, error: 'La fenêtre de paiement a été fermée.' };
          }

          if (statusCheck.status === 'SUCCESSFUL') {
            isPaid = true;
            finalMessage = 'Paiement confirmé avec succès.';
            if (popup) popup.close();
            break;
          } else if (statusCheck.status === 'FAILED') {
            if (popup) popup.close();
            return { success: false, error: 'Le paiement a échoué ou a été annulé.' };
          }
        }

        if (isPaid) {
          createSession(data.reference);
          return { success: true, transactionId: data.reference, message: finalMessage, amount: amount };
        } else {
          if (popup) popup.close();
          return { success: false, error: 'Temps d\'attente dépassé. Si vous avez payé, l\'application l\'enregistrera en arrière-plan. Veuillez réessayer la recherche.' };
        }
      } else {
        if (popup) popup.close();
        return { success: false, error: data.error || 'Paiement refusé.' };
      }
    } catch (err) {
      console.error('Payment Edge Function error:', err);
      return { success: false, error: 'Erreur Notch Pay : ' + (err.message || 'Erreur inconnue') };
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
  };
})();

window.Payment = Payment;
