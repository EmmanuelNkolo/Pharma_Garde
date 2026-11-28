/**
 * Pharma-Garde — Payment Module
 * Handles Mobile Money payments (Orange Money & MTN MoMo) with 24-hour Unlimited Search Sessions.
 *
 * IMPORTANT: The merchant account is NEVER exposed client-side.
 * It is configured server-side in Supabase Edge Functions.
 */

const Payment = (() => {
  // ── Constants ──────────────────────────────────────────
  const SEARCH_COST = 100; // FCFA
  const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const SESSION_KEY = 'pharmagarde_payment_session';
  const PHONE_KEY = 'pharmagarde_client_phone';
  const PENDING_TX_KEY = 'pharmagarde_pending_payment_tx';
  const COOKIE_KEY = 'pg_pass_24h';
  const PENDING_TTL = 2 * 60 * 60 * 1000; // 2h window to recover pending USSD/checkout payment

  // ── Phone number validation ────────────────────────────
  const PHONE_PATTERNS = {
    momo: /^6[5678]\d{7}$/, // MTN: 65x, 66x, 67x, 68x
    om: /^6[59]\d{7}$/,     // Orange: 65x, 69x
  };

  /**
   * Normalize a Cameroonian phone number to 9 digits (without +237 or spaces)
   */
  function normalizePhone(phone) {
    return String(phone || '').replace(/\D/g, '').replace(/^237/, '');
  }

  /**
   * Validate phone number for the selected operator
   */
  function validatePhone(phone, method) {
    if (!phone) return { valid: false, error: 'Veuillez entrer un numéro de téléphone' };
    const cleaned = normalizePhone(phone);

    if (cleaned.length !== 9) return { valid: false, error: 'Le numéro doit contenir 9 chiffres' };

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
   * Cookie helpers (extra persistence fallback for mobile WebViews / Safari / iOS)
   */
  function readSessionCookie() {
    try {
      if (typeof document === 'undefined' || !document.cookie) return null;
      const parts = document.cookie.split(';');
      for (let i = 0; i < parts.length; i++) {
        const kv = parts[i].trim();
        if (kv.indexOf(COOKIE_KEY + '=') === 0) {
          const val = decodeURIComponent(kv.slice(COOKIE_KEY.length + 1));
          const parsed = JSON.parse(val);
          if (parsed && (parsed.expiresAt || parsed.timestamp)) return parsed;
        }
      }
    } catch (e) {}
    return null;
  }

  function writeSessionCookie(sessionObj) {
    try {
      if (typeof document === 'undefined') return;
      const remainingSec = Math.max(60, Math.floor((Number(sessionObj.expiresAt) - Date.now()) / 1000));
      const compact = JSON.stringify({
        transactionId: sessionObj.transactionId,
        phone: sessionObj.phone,
        timestamp: sessionObj.timestamp,
        expiresAt: sessionObj.expiresAt
      });
      document.cookie = `${COOKIE_KEY}=${encodeURIComponent(compact)}; Max-Age=${remainingSec}; Path=/; SameSite=Lax`;
    } catch (e) {}
  }

  function clearSessionCookie() {
    try {
      if (typeof document === 'undefined') return;
      document.cookie = `${COOKIE_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
    } catch (e) {}
  }

  /**
   * Persist client phone safely in both storages (normalized 9 digits)
   */
  function saveClientPhone(phone) {
    const cleaned = normalizePhone(phone);
    if (!cleaned || cleaned.length !== 9) return '';
    try { localStorage.setItem(PHONE_KEY, cleaned); } catch (e) {}
    try { sessionStorage.setItem(PHONE_KEY, cleaned); } catch (e) {}
    return cleaned;
  }

  function getSavedClientPhone() {
    let raw = '';
    try { raw = localStorage.getItem(PHONE_KEY) || ''; } catch (e) {}
    if (!raw) {
      try { raw = sessionStorage.getItem(PHONE_KEY) || ''; } catch (e) {}
    }
    if (!raw) {
      const s = getSessionRaw();
      if (s && s.phone) raw = s.phone;
    }
    return normalizePhone(raw);
  }

  /**
   * Pending transaction persistence (survives USSD lock-screen, tab close, or NotchPay redirect)
   */
  function savePendingTx(tx) {
    if (!tx || !tx.reference) return;
    const payload = {
      reference: String(tx.reference),
      merchantReference: tx.merchantReference ? String(tx.merchantReference) : '',
      phone: normalizePhone(tx.phone || ''),
      method: tx.method || 'momo',
      amount: Number(tx.amount || SEARCH_COST),
      authorizationUrl: tx.authorizationUrl || '',
      createdAt: Date.now()
    };
    try { localStorage.setItem(PENDING_TX_KEY, JSON.stringify(payload)); } catch (e) {}
    try { sessionStorage.setItem(PENDING_TX_KEY, JSON.stringify(payload)); } catch (e) {}
  }

  function getPendingTx() {
    let parsed = null;
    try {
      const raw = localStorage.getItem(PENDING_TX_KEY) || sessionStorage.getItem(PENDING_TX_KEY);
      if (raw) parsed = JSON.parse(raw);
    } catch (e) {}
    if (!parsed || !parsed.reference) return null;
    if (Date.now() - Number(parsed.createdAt || 0) > PENDING_TTL) {
      clearPendingTx();
      return null;
    }
    return parsed;
  }

  function clearPendingTx() {
    try { localStorage.removeItem(PENDING_TX_KEY); } catch (e) {}
    try { sessionStorage.removeItem(PENDING_TX_KEY); } catch (e) {}
  }

  /**
   * Internal: Read session object from localStorage, sessionStorage, or cookie
   */
  function getSessionRaw() {
    let best = null;
    const candidates = [];

    try {
      const fromLocal = localStorage.getItem(SESSION_KEY);
      if (fromLocal) candidates.push(JSON.parse(fromLocal));
    } catch (e) {}

    try {
      const fromSession = sessionStorage.getItem(SESSION_KEY);
      if (fromSession) candidates.push(JSON.parse(fromSession));
    } catch (e) {}

    const fromCookie = readSessionCookie();
    if (fromCookie) candidates.push(fromCookie);

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (!c || (!c.expiresAt && !c.timestamp)) continue;
      const exp = c.expiresAt ? Number(c.expiresAt) : (Number(c.timestamp) + SESSION_DURATION);
      if (isNaN(exp)) continue;
      if (!best || exp > Number(best.expiresAt || (Number(best.timestamp) + SESSION_DURATION))) {
        best = c;
      }
    }

    // Re-mirror valid session across storages if found only in one layer (e.g. cookie or sessionStorage)
    if (best) {
      const exp = best.expiresAt ? Number(best.expiresAt) : (Number(best.timestamp) + SESSION_DURATION);
      if (exp > Date.now()) {
        try {
          if (!localStorage.getItem(SESSION_KEY)) {
            localStorage.setItem(SESSION_KEY, JSON.stringify(best));
          }
          if (best.phone && !localStorage.getItem(PHONE_KEY)) {
            localStorage.setItem(PHONE_KEY, normalizePhone(best.phone));
          }
        } catch (e) {}
      }
    }

    return best;
  }

  /**
   * Check if user has an active payment session (valid for 24h)
   */
  function hasActiveSession() {
    if (window.PGAdmin && typeof window.PGAdmin.isAdmin === 'function' && window.PGAdmin.isAdmin()) {
      return true;
    }
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
    const cleanedPhone = normalizePhone(phone || getSavedClientPhone());
    const parsedCustom = customTimestamp ? Number(customTimestamp) : NaN;
    const now = (!isNaN(parsedCustom) && parsedCustom > 0) ? parsedCustom : Date.now();

    const sessionObj = {
      transactionId: transactionId || ('SES_' + now),
      phone: cleanedPhone,
      timestamp: now,
      expiresAt: now + SESSION_DURATION,
      createdAtIso: new Date(now).toISOString(),
    };

    // Mirror across localStorage, sessionStorage, and same-origin cookie for maximum resilience
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionObj));
      if (cleanedPhone) localStorage.setItem(PHONE_KEY, cleanedPhone);
    } catch (e) {}

    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionObj));
      if (cleanedPhone) sessionStorage.setItem(PHONE_KEY, cleanedPhone);
    } catch (e) {}

    writeSessionCookie(sessionObj);
    clearPendingTx();

    return sessionObj;
  }

  /**
   * Clear active payment session
   */
  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    clearSessionCookie();
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
    if (window.PGAdmin && typeof window.PGAdmin.isAdmin === 'function' && window.PGAdmin.isAdmin()) {
      return {
        active: true,
        remainingMs: SESSION_DURATION,
        remainingHours: 24,
        remainingMinutes: 0,
        formatted: '👑 Admin Illimité',
        phone: getSavedClientPhone() || '694929909',
        transactionId: 'SUPER_ADMIN_PASS'
      };
    }
    const active = hasActiveSession();
    if (!active) {
      return {
        active: false,
        remainingMs: 0,
        remainingHours: 0,
        remainingMinutes: 0,
        formatted: 'Expiré',
        phone: getSavedClientPhone(),
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
      formatted = `${Math.max(1, remainingMinutes)}m`;
    }

    const phone = normalizePhone(session.phone) || getSavedClientPhone();

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
   * Check whether a pending payment transaction (after USSD or NotchPay hosted checkout) was confirmed
   */
  async function checkPendingTransaction() {
    if (hasActiveSession()) return true;
    const pending = getPendingTx();
    if (!pending || !pending.reference) return false;

    const statusCheck = await checkPaymentStatus(pending.reference, pending.phone);
    if (statusCheck.status === 'SUCCESSFUL') {
      const ts = statusCheck.createdAt ? new Date(statusCheck.createdAt).getTime() : Date.now();
      createSession(pending.reference, pending.phone || statusCheck.phone || '', ts);
      return true;
    }
    if (statusCheck.status === 'FAILED') {
      clearPendingTx();
    }
    return false;
  }

  /**
   * Verify and auto-restore session from Supabase backend (Edge Function + direct DB fallback)
   * if client has paid within the last 24h
   */
  async function verifyRemoteSession(phone) {
    if (hasActiveSession()) return true;
    if (!window.supabase) return false;

    const cleaned = normalizePhone(phone || getSavedClientPhone());
    const pending = getPendingTx();

    if (cleaned.length !== 9 && !pending) return false;

    // 1. Server-side authoritative verification via Edge Function (service_role, no 25-row cap, recovers pending NotchPay TX)
    try {
      if (window.supabase.functions) {
        const { data, error } = await window.supabase.functions.invoke('notchpay-payment', {
          body: {
            action: 'verify_session',
            phone: cleaned || (pending && pending.phone) || '',
            pending_reference: pending ? pending.reference : ''
          }
        });

        if (!error && data && data.success && data.active) {
          const paymentTime = data.created_at ? new Date(data.created_at).getTime() : Date.now();
          const finalPhone = normalizePhone(data.phone || cleaned || (pending && pending.phone));
          createSession(data.reference || 'SES_REMOTE', finalPhone, paymentTime);
          return true;
        }
      }
    } catch (efErr) {
      console.warn('[Payment] Edge verify_session fallback to direct DB:', efErr);
    }

    if (cleaned.length !== 9) return false;

    const twentyFourHoursAgo = new Date(Date.now() - SESSION_DURATION).toISOString();

    try {
      // 2. Direct Supabase fallback: check `payments` table within the last 24h (limit 250, digit-normalized matching)
      const { data: recentPayments, error: pErr } = await window.supabase
        .from('payments')
        .select('reference, status, created_at, metadata')
        .in('status', ['SUCCESSFUL', 'complete', 'completed', 'paid'])
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(250);

      if (!pErr && recentPayments && recentPayments.length > 0) {
        const match = recentPayments.find(p => {
          const ref = String(p.reference || '');
          const meta = p.metadata || {};
          if (ref.startsWith('sub_') || meta.type === 'subscription') return false;
          const metaDigits = JSON.stringify(meta).replace(/\D/g, '');
          return metaDigits.includes(cleaned) || ref.replace(/\D/g, '').includes(cleaned);
        });

        if (match) {
          const paymentTime = new Date(match.created_at).getTime();
          createSession(match.reference, cleaned, paymentTime);
          return true;
        }
      }

      // 3. Direct Supabase fallback: check `requests` table within last 24h (digit-normalized matching)
      const { data: recentRequests, error: rErr } = await window.supabase
        .from('requests')
        .select('id, user_phone, created_at')
        .gte('created_at', twentyFourHoursAgo)
        .not('user_phone', 'is', null)
        .order('created_at', { ascending: false })
        .limit(250);

      if (!rErr && recentRequests && recentRequests.length > 0) {
        const reqMatch = recentRequests.find(r => normalizePhone(r.user_phone) === cleaned);
        if (reqMatch) {
          const reqTime = new Date(reqMatch.created_at).getTime();
          createSession('REQ_' + reqMatch.id, cleaned, reqTime);
          return true;
        }
      }
    } catch (err) {
      console.warn('[Payment] verifyRemoteSession warning:', err);
    }

    return false;
  }

  /**
   * Unified restore: checks local session -> pending TX -> remote DB session
   */
  let _restoreInFlight = null;
  async function restoreSessionIfAvailable(explicitPhone) {
    if (hasActiveSession()) return true;
    const targetPhone = normalizePhone(explicitPhone || getSavedClientPhone());
    const pending = getPendingTx();
    if (!targetPhone && !pending) return false;

    if (_restoreInFlight && !explicitPhone) return _restoreInFlight;

    const job = (async () => {
      if (pending) {
        const okPending = await checkPendingTransaction();
        if (okPending) return true;
      }
      return await verifyRemoteSession(targetPhone);
    })();

    if (!explicitPhone) {
      _restoreInFlight = job.finally(() => { _restoreInFlight = null; });
      return _restoreInFlight;
    }
    return job;
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

    const cleaned = validation.cleaned;
    // Persist phone BEFORE payment so returning after USSD / redirect always remembers the client
    saveClientPhone(cleaned);

    const payAmount = (typeof amount === 'number' && amount >= 0) ? amount : SEARCH_COST;

    // 1. If session is already active locally, no payment needed!
    if (hasActiveSession()) {
      const info = getSessionInfo();
      return {
        success: true,
        restored: true,
        transactionId: info.transactionId || 'SESSION_ACTIVE',
        message: `Pass 24h actif · Valide encore ${info.formatted}`,
        amount: 0
      };
    }

    // 2. Check pending transaction or remote DB before ever initiating a new charge
    const restored = await restoreSessionIfAvailable(cleaned);
    if (restored) {
      const info = getSessionInfo();
      return {
        success: true,
        restored: true,
        transactionId: info.transactionId || 'SESSION_RESTORED',
        message: `Pass 24h retrouvé et restauré · Valide encore ${info.formatted}`,
        amount: 0
      };
    }

    try {
      if (!window.supabase) {
        return { success: false, error: "Erreur de configuration serveur (Supabase manquant)" };
      }

      const { data, error } = await window.supabase.functions.invoke('notchpay-payment', {
        body: {
          action: 'collect',
          phone: cleaned,
          method: method,
          amount: payAmount,
          description: 'Pharma-Garde - Pass 24h Recherche'
        }
      });

      if (error || !data) {
        throw new Error(error?.message || "Erreur de connexion au serveur de paiement");
      }

      // Server-side anti-double-charge confirmed an existing 24h pass
      if (data.success && data.already_active) {
        const ts = data.created_at ? new Date(data.created_at).getTime() : Date.now();
        createSession(data.reference || 'SES_ACTIVE', cleaned, ts);
        const info = getSessionInfo();
        return {
          success: true,
          restored: true,
          transactionId: info.transactionId,
          message: `Pass 24h déjà actif · Valide encore ${info.formatted}`,
          amount: 0
        };
      }

      if (data.success && data.reference) {
        // Save pending transaction IMMEDIATELY before USSD polling or checkout redirect!
        savePendingTx({
          reference: data.reference,
          merchantReference: data.merchant_reference || '',
          phone: cleaned,
          method: method,
          amount: payAmount,
          authorizationUrl: data.authorization_url || ''
        });

        if (!data.direct_charge) {
          const errMsg = data.error_detail || 'Paiement direct refusé. Veuillez vérifier votre solde et réessayer.';

          if (errMsg.toLowerCase().includes('insufficient') || errMsg.toLowerCase().includes('solde')) {
            clearPendingTx();
            return { success: false, error: 'Désolé, votre solde est insuffisant. Veuillez recharger votre compte.' };
          }

          return {
            success: false,
            error: errMsg,
            reference: data.reference,
            phone: cleaned,
            redirect: Boolean(data.authorization_url),
            authorization_url: data.authorization_url
          };
        }

        // Polling payment confirmation (USSD push entered by user)
        return await pollPaymentStatus(
          data.reference,
          payAmount,
          data.message || 'Veuillez entrer votre code PIN sur votre téléphone pour confirmer.',
          cleaned
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
    const cleaned = normalizePhone(clientPhone || getSavedClientPhone());
    let isPaid = false;
    let confirmedTs = Date.now();
    let finalMessage = defaultMessage;

    let delayMs = 2500;
    let totalElapsed = 0;
    const MAX_TIMEOUT = 120000; // 2 minutes

    while (totalElapsed < MAX_TIMEOUT) {
      await new Promise(r => setTimeout(r, delayMs));
      totalElapsed += delayMs;

      const statusCheck = await checkPaymentStatus(reference, cleaned);

      if (statusCheck.status === 'SUCCESSFUL') {
        isPaid = true;
        if (statusCheck.createdAt) {
          const parsed = new Date(statusCheck.createdAt).getTime();
          if (!isNaN(parsed)) confirmedTs = parsed;
        }
        finalMessage = 'Paiement de 100 FCFA confirmé avec succès ! Pass 24h activé 🎉';
        break;
      } else if (statusCheck.status === 'FAILED') {
        clearPendingTx();
        return { success: false, error: 'Désolé, le paiement a échoué (Annulé ou solde insuffisant).' };
      }

      delayMs = Math.min(6000, delayMs * 1.35);
    }

    if (isPaid) {
      createSession(reference, cleaned, confirmedTs);
      return {
        success: true,
        transactionId: reference,
        message: finalMessage,
        amount: amount
      };
    } else {
      // Keep pending TX stored so if the user finishes their PIN 10 seconds later, return/re-click restores automatically!
      return {
        success: false,
        pending: true,
        reference: reference,
        error: 'Temps d\'attente dépassé. Si vous avez validé votre code PIN, cliquez à nouveau sur « Confirmer » pour activer votre Pass 24h sans repayer.'
      };
    }
  }

  /**
   * Check payment status via Supabase DB or Edge Function
   */
  async function checkPaymentStatus(reference, clientPhone) {
    try {
      if (!window.supabase) return { status: 'ERROR', error: 'Supabase manquant' };
      const cleaned = normalizePhone(clientPhone || getSavedClientPhone());

      // 1. Check Supabase DB 'payments' table first (webhook writes here instantly)
      try {
        const { data: dbPayment } = await window.supabase
          .from('payments')
          .select('status, reference, amount, created_at, metadata')
          .eq('reference', reference)
          .maybeSingle();

        if (dbPayment) {
          const st = String(dbPayment.status || '').toLowerCase();
          if (st === 'successful' || st === 'complete' || st === 'completed' || st === 'paid') {
            return {
              status: 'SUCCESSFUL',
              createdAt: dbPayment.created_at,
              phone: normalizePhone(dbPayment.metadata?.phone || cleaned),
              data: dbPayment
            };
          }
          if (st === 'failed' || st === 'canceled' || st === 'cancelled' || st === 'expired') {
            return { status: 'FAILED', data: dbPayment };
          }
        }
      } catch (dbErr) {
        console.warn('DB payment check warning:', dbErr);
      }

      // 2. Query Notch Pay via Edge Function (also persists SUCCESSFUL into Supabase `payments`)
      const { data, error } = await window.supabase.functions.invoke('notchpay-payment', {
        body: {
          action: 'status',
          reference: reference,
          phone: cleaned
        }
      });

      if (error || !data) throw (error || new Error('Erreur de statut'));

      const rawSt = String(data.raw_status || data.status || '').toLowerCase();
      if (rawSt === 'complete' || rawSt === 'completed' || rawSt === 'successful' || rawSt === 'paid') {
        return {
          status: 'SUCCESSFUL',
          createdAt: data.created_at,
          phone: normalizePhone(data.phone || cleaned),
          data: data.data
        };
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
    normalizePhone,
    validatePhone,
    hasActiveSession,
    createSession,
    clearSession,
    getSessionRaw,
    getSessionInfo,
    getSessionTimeRemaining,
    getSearchCost,
    saveClientPhone,
    getSavedClientPhone,
    getPendingTx,
    clearPendingTx,
    checkPendingTransaction,
    verifyRemoteSession,
    restoreSessionIfAvailable,
    processPayment,
    checkPaymentStatus,
    pollPaymentStatus,
  };
})();

window.Payment = Payment;
