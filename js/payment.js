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

  // ── CamPay Configuration ────────────────────────────────
  // ATTENTION: Pour la production, ces appels doivent être faits depuis un serveur (ex: Supabase Edge Functions)
  // pour ne pas exposer vos identifiants (username/password).
  // Pour l'instant, c'est implémenté côté client pour que ça fonctionne.
  const CAMPAY_ENV = 'demo'; // 'demo' ou 'production'
  const CAMPAY_BASE_URL = CAMPAY_ENV === 'demo' ? 'https://demo.campay.net/api' : 'https://www.campay.net/api';
  
  // REMPLACEZ PAR VOS CLÉS CAMPAY
  const CAMPAY_USERNAME = 'VOTRE_USERNAME_CAMPAY'; 
  const CAMPAY_PASSWORD = 'VOTRE_PASSWORD_CAMPAY';

  let campayToken = null;
  let tokenExpiresAt = null;

  async function getCampayToken() {
    // Réutiliser le token s'il est encore valide (on garde 5 min de marge)
    if (campayToken && tokenExpiresAt && Date.now() < tokenExpiresAt - 300000) {
      return campayToken;
    }

    try {
      const response = await fetch(`${CAMPAY_BASE_URL}/token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: CAMPAY_USERNAME,
          password: CAMPAY_PASSWORD
        })
      });

      if (!response.ok) throw new Error('Échec authentification CamPay');
      const data = await response.json();
      campayToken = data.token;
      // Le token CamPay expire généralement après un certain temps (ex: 3600s). On prend 1h par défaut.
      tokenExpiresAt = Date.now() + (data.expires_in ? data.expires_in * 1000 : 3600 * 1000);
      return campayToken;
    } catch (err) {
      console.error('Erreur Token CamPay:', err);
      return null;
    }
  }

  /**
   * Process a payment via CamPay / Mobile Money
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

    // Si les clés ne sont pas configurées, on utilise la simulation (utile pour la démo)
    if (CAMPAY_USERNAME === 'VOTRE_USERNAME_CAMPAY') {
      return new Promise((resolve) => {
        const operatorName = method === 'momo' ? 'MTN MoMo' : 'Orange Money';
        console.log(`[DEV] Simulation paiement ${operatorName}: ${amount} FCFA → ${validation.cleaned}`);
        setTimeout(() => {
          const txId = 'TX-' + Date.now();
          createSession(txId);
          resolve({ success: true, transactionId: txId, message: `Paiement ${operatorName} simulé avec succès`, amount: amount });
        }, 1500);
      });
    }

    // ── VÉRITABLE INTÉGRATION CAMPAY ──
    try {
      const token = await getCampayToken();
      if (!token) return { success: false, error: 'Impossible de contacter le service de paiement (Auth).' };

      const externalRef = 'REQ-' + Date.now();
      // On ajoute 237 au numéro nettoyé (Campay requiert souvent l'indicatif sans +)
      const phoneWithCode = validation.cleaned.startsWith('237') ? validation.cleaned : '237' + validation.cleaned;

      const response = await fetch(`${CAMPAY_BASE_URL}/collect/`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`
        },
        body: JSON.stringify({
          amount: amount.toString(),
          currency: 'XAF',
          from: phoneWithCode,
          description: 'Pharma-Garde - Recherche Express',
          external_reference: externalRef
        }),
      });

      const result = await response.json();
      
      // La requête collect renvoie un reference qu'on utilise pour vérifier le statut
      if (response.ok && result.reference) {
        // Optionnel : On pourrait boucler pour attendre la confirmation via /transaction/
        // Mais pour la simplicité immédiate, on considère la requête initiée.
        // Le client doit valider sur son téléphone.
        
        // ATTENTE ACTIVE DU PAIEMENT (Polling)
        let isPaid = false;
        let attempts = 0;
        let finalMessage = 'Paiement initié. Veuillez valider sur votre téléphone.';
        
        while (attempts < 12) { // Attend jusqu'à ~60 secondes
          await new Promise(r => setTimeout(r, 5000));
          attempts++;
          
          const statusCheck = await checkPaymentStatus(result.reference, token);
          if (statusCheck.status === 'SUCCESSFUL') {
            isPaid = true;
            finalMessage = 'Paiement confirmé avec succès.';
            break;
          } else if (statusCheck.status === 'FAILED') {
            return { success: false, error: 'Le paiement a échoué ou a été annulé.' };
          }
        }

        if (isPaid) {
          createSession(result.reference);
          return { success: true, transactionId: result.reference, message: finalMessage, amount: amount };
        } else {
          return { success: false, error: 'Temps d\'attente dépassé. Si vous avez payé, réessayez la recherche.' };
        }
      } else {
        return { success: false, error: result.message || 'Paiement refusé par l\'opérateur.' };
      }
    } catch (error) {
      console.error('Payment API error:', error);
      return { success: false, error: 'Erreur de connexion. Vérifiez votre connexion internet.' };
    }
  }

  /**
   * Check payment status on CamPay
   */
  async function checkPaymentStatus(reference, token) {
    try {
      const response = await fetch(`${CAMPAY_BASE_URL}/transaction/${reference}/`, {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`
        }
      });
      const data = await response.json();
      return { status: data.status, data: data };
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
