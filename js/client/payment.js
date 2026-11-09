/**
 * Pharma-Garde — Payment Module
 * Handles Mobile Money payments (Orange Money & MTN MoMo) with 24-hour Unlimited Search Sessions.
 * 
 * IMPORTANT: The merchant account (694929909) is NEVER exposed client-side.
 * It is configured server-side in Supabase Edge Functions.
 */

const Payment = (() => {
  // ── Constants ──────────────────────────────────────────
  const SEARCH_COST = 100; // FCFA
  const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const SESSION_KEY = 'pharmagarde_payment_session';
  const PHONE_KEY = 'pharmagarde_client_phone';

  // ── Phone number validation ────────────────────────────
  const PHONE_PATTERNS = {
    momo: /^6[5678]\d{7}$/, // MTN: 65x, 66x, 67x, 68x
    om: /^6[59]\d{7}$/,     // Orange: 65x, 69x
  };

  /**
   * Validate phone number for the selected operator
   */
  function validatePhone(phone, method) {
    if (!phone) return { valid: false, error: 'Veuillez entrer un numéro de téléphone' };
    const cleaned = String(phone).replace(/\s+/g, '').replace(/^\+?237/, '');

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
   * Internal: Read session object from localStorage or sessionStorage
   */
  function getSessionRaw() {
    // 1. Try localStorage
    try {
      const fromLocal = localStorage.getItem(SESSION_KEY);
      if (fromLocal) {
        const parsed = JSON.parse(fromLocal);
        if (parsed && (parsed.expiresAt || parsed.timestamp)) {
          return parsed;
        }
      }
    } catch (e) {}

    // 2. Fallback to sessionStorage (useful in private browsing or mobile webviews)
    try {
      const fromSession = sessionStorage.getItem(SESSION_KEY);
      if (fromSession) {
        const parsed = JSON.parse(fromSession);
        if (parsed && (parsed.expiresAt || parsed.timestamp)) {
          return parsed;
        }
      }
    } catch (e) {}

    return null;
  }

  /**
   * Check if user has an active payment session (valid for 24h)
   */
  function hasActiveSession() {
    const session = getSessionRaw();
    if (!session) return false;

    const now = Date.now();
    const expiresAt = session.expiresAt 
      ? Number(session.expiresAt) 
      : (Number(session.timestamp) + SESSION_DURATION);

    if (!isNaN(expiresAt) && expiresAt > now) {
      return true;
    }

    // Session has expired — clear it cleanly
    clearSession();
    return false;
  }

  /**
   * Create or renew a 24-hour payment session
   */
  function createSession(transactionId, phone, customTimestamp) {
    const now = customTimestamp ? Number(customTimestamp) : Date.now();
    const sessionObj = {
      transactionId: transactionId || ('SES_' + now),
      phone: phone || '',
      timestamp: now,
      expiresAt: now + SESSION_DURATION,
      createdAtIso: new Date(now).toISOString(),
    };

    // Mirror in both storages for maximum resilience
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionObj));
      if (phone) localStorage.setItem(PHONE_KEY, phone);
    } catch (e) {}

    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionObj));
      if (phone) sessionStorage.setItem(PHONE_KEY, phone);
    } catch (e) {}

    return sessionObj;
  }

  /**
   * Clear active payment session
   */
  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  /**
   * Get the session expiry time remaining (in ms)
   */
  function getSessionTimeRemaining() {
    const session = getSessionRaw();
    if (!session) return 0;

    const now = Date.now();
    const expiresAt = session.expiresAt 
      ? Number(session.expiresAt) 
      : (Number(session.timestamp) + SESSION_DURATION);

    if (!isNaN(expiresAt) && expiresAt > now) {
      return Math.max(0, expiresAt - now);
    }
    return 0;
  }

  /**
   * Get detailed session info for UI badges and countdowns
   */
  function getSessionInfo() {
    const active = hasActiveSession();
    if (!active) {
      return {
        active: false,
        remainingMs: 0,
        remainingHours: 0,
        remainingMinutes: 0,
        formatted: 'Expiré',
        phone: localStorage.getItem(PHONE_KEY) || sessionStorage.getItem(PHONE_KEY) || '',
        transactionId: ''
      };
    }

    const session = getSessionRaw() || {};
    const remainingMs = getSessionTimeRemaining();
    const remainingHours = Math.floor(remainingMs / (3600 * 1000));
    const remainingMinutes = Math.floor((remainingMs % (3600 * 1000)) / (60 * 1000));

    let formatted = '';
    if (remainingHours > 0) {
      formatted = `${remainingHours}h ${remainingMinutes < 10 ? '0' + remainingMinutes : remainingMinutes}m`;
    } else {
      formatted = `${remainingMinutes}m`;
    }

    const phone = session.phone || localStorage.getItem(PHONE_KEY) || sessionStorage.getItem(PHONE_KEY) || '';

    return {
      active: true,
      remainingMs,
      remainingHours,
      remainingMinutes,
      formatted,
      phone,
      transactionId: session.transactionId || ''
    };
  }

  /**
   * Verify and auto-restore session from Supabase backend if client has paid within last 24h
   */
  async function verifyRemoteSession(phone) {
    if (hasActiveSession()) return true;
    if (!phone || !window.supabase) return false;

    const cleaned = String(phone).replace(/\s+/g, '').replace(/^\+?237/, '');
    if (cleaned.length !== 9) return false;

    const twentyFourHoursAgo = new Date(Date.now() - SESSION_DURATION).toISOString();

    try {
      // 1. Check payments table within the last 24h
      const { data: recentPayments, error: pErr } = await window.supabase
        .from('payments')
        .select('reference, status, created_at, metadata')
        .in('status', ['SUCCESSFUL', 'complete', 'completed', 'paid'])
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(25);

      if (!pErr && recentPayments && recentPayments.length > 0) {
        const match = recentPayments.find(p => {
          const metaStr = JSON.stringify(p.metadata || {});
          return metaStr.includes(cleaned) || (p.reference && p.reference.includes(cleaned));
        });

        if (match) {
          const paymentTime = new Date(match.created_at).getTime();
          createSession(match.reference, cleaned, paymentTime);
          return true;
        }
      }

      // 2. Check requests table: if user made an approved request in last 24h with this phone
      const { data: recentRequests, error: rErr } = await window.supabase
        .from('requests')
        .select('id, user_phone, created_at')
        .eq('user_phone', cleaned)
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!rErr && recentRequests && recentRequests.length > 0) {
        const reqTime = new Date(recentRequests[0].created_at).getTime();
        createSession('REQ_' + recentRequests[0].id, cleaned, reqTime);
        return true;
      }
    } catch (err) {
      console.warn('[Payment] verifyRemoteSession warning:', err);
    }

    return false;
  }

  /**
   * Get the cost for a search (0 FCFA if session is active, else 100 FCFA)
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

    const payAmount = (typeof amount === 'number' && amount >= 0) ? amount : SEARCH_COST;

    // If session is already active, no payment needed!
    if (hasActiveSession()) {
      const info = getSessionInfo();
      return {
        success: true,
        transactionId: info.transactionId || 'SESSION_ACTIVE',
        message: `Pass 24h actif · Valide encore ${info.formatted}`,
        amount: 0
      };
    }

    // Check if remote DB already has an active payment for this number
    const restored = await verifyRemoteSession(validation.cleaned);
    if (restored) {
      const info = getSessionInfo();
      return {
        success: true,
        transactionId: info.transactionId || 'SESSION_RESTORED',
        message: `Pass 24h retrouvé et restauré · Valide encore ${info.formatted}`,
        amount: 0
      };
    }

    try {
      if (!window.supabase) {
        return { success: false, error: "Erreur de configuration serveur (Supabase manquant)" };
      }

      // Appeler l'Edge Function pour initier + compléter le paiement (push USSD direct)
      const { data, error } = await supabase.functions.invoke('notchpay-payment', {
        body: {
          action: 'collect',
          phone: validation.cleaned,
          method: method,
          amount: payAmount,
          description: 'Pharma-Garde - Pass 24h Recherche'
        }
      });

      if (error || !data) {
        throw new Error(error?.message || "Erreur de connexion au serveur de paiement");
      }

      if (data.success && data.reference) {
        if (!data.direct_charge) {
          const errMsg = data.error_detail || 'Paiement direct refusé. Veuillez vérifier votre solde et réessayer.';
          
          if (errMsg.toLowerCase().includes('insufficient') || errMsg.toLowerCase().includes('solde')) {
             return { success: false, error: 'Désolé, votre solde est insuffisant. Veuillez recharger votre compte.' };
          }
          
          return { 
            success: false, 
            error: errMsg,
            redirect: Boolean(data.authorization_url),
            authorization_url: data.authorization_url
          };
        }

        // Polling payment confirmation (USSD push entered by user)
        return await pollPaymentStatus(
          data.reference, 
          payAmount, 
          data.message || 'Veuillez entrer votre code PIN sur votre téléphone pour confirmer.',
          validation.cleaned
        );
      } else {
        return { success: false, error: data.error || 'Paiement refusé par l\'opérateur.' };
      }
    } catch (err) {
      if (err && (err.message || '').toLowerCase().includes('insufficient')) {
        return { success: false, error: 'Désolé, votre solde est insuffisant. Veuillez recharger votre compte avant de relancer la recherche.' };
      }
      console.error('Payment Edge Function error:', err);
      return { success: false, error: 'Erreur réseau : ' + (err.message || 'Erreur inconnue') };
    }
  }

  /**
   * Poll payment status until confirmed or timed out
   */
  async function pollPaymentStatus(reference, amount, defaultMessage = 'Veuillez patienter...', clientPhone = '') {
    let isPaid = false;
    let finalMessage = defaultMessage;
    
    let delayMs = 2500;
    let totalElapsed = 0;
    const MAX_TIMEOUT = 120000; // 2 minutes
    
    while (totalElapsed < MAX_TIMEOUT) {
      await new Promise(r => setTimeout(r, delayMs));
      totalElapsed += delayMs;
      
      const statusCheck = await checkPaymentStatus(reference);

      if (statusCheck.status === 'SUCCESSFUL') {
        isPaid = true;
        finalMessage = 'Paiement de 100 FCFA confirmé avec succès ! Pass 24h activé 🎉';
        break;
      } else if (statusCheck.status === 'FAILED') {
        return { success: false, error: 'Désolé, le paiement a échoué (Annulé ou solde insuffisant).' };
      }

      // Backoff progressif (max 6s)
      delayMs = Math.min(6000, delayMs * 1.35);
    }

    if (isPaid) {
      createSession(reference, clientPhone);
      return { 
        success: true, 
        transactionId: reference, 
        message: finalMessage, 
        amount: amount 
      };
    } else {
      return { 
        success: false, 
        error: 'Temps d\'attente dépassé. Si vous avez validé votre code PIN sur votre téléphone, votre session 24h sera prise en compte.' 
      };
    }
  }

  /**
   * Check payment status via Supabase DB or Edge Function
   */
  async function checkPaymentStatus(reference) {
    try {
      if (!window.supabase) return { status: 'ERROR', error: 'Supabase manquant' };

      // 1. Check Supabase DB 'payments' table first (webhook writes here instantly)
      try {
        const { data: dbPayment } = await window.supabase
          .from('payments')
          .select('status, reference, amount')
          .eq('reference', reference)
          .maybeSingle();

        if (dbPayment) {
          const st = String(dbPayment.status || '').toLowerCase();
          if (st === 'successful' || st === 'complete' || st === 'completed' || st === 'paid') {
            return { status: 'SUCCESSFUL', data: dbPayment };
          }
          if (st === 'failed' || st === 'canceled' || st === 'cancelled') {
            return { status: 'FAILED', data: dbPayment };
          }
        }
      } catch (dbErr) {
        console.warn('DB payment check warning:', dbErr);
      }

      // 2. Query Notch Pay via Edge Function
      const { data, error } = await supabase.functions.invoke('notchpay-payment', {
        body: {
          action: 'status',
          reference: reference
        }
      });

      if (error || !data) throw (error || new Error('Erreur de statut'));
      
      const rawSt = String(data.raw_status || data.status || '').toLowerCase();
      if (rawSt === 'complete' || rawSt === 'completed' || rawSt === 'successful' || rawSt === 'paid') {
        return { status: 'SUCCESSFUL', data: data.data };
      } else if (rawSt === 'canceled' || rawSt === 'cancelled' || rawSt === 'failed' || rawSt === 'expired') {
        return { status: 'FAILED', data: data.data };
      }
      
      return { status: data.status || 'PENDING', data: data.data };
    } catch (error) {
      return { status: 'ERROR', error: error.message };
    }
  }

  return {
    SEARCH_COST,
    SESSION_DURATION,
    validatePhone,
    hasActiveSession,
    createSession,
    clearSession,
    getSessionRaw,
    getSessionInfo,
    getSessionTimeRemaining,
    getSearchCost,
    verifyRemoteSession,
    processPayment,
    checkPaymentStatus,
    pollPaymentStatus,
  };
})();

window.Payment = Payment;
