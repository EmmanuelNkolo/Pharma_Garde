/**
 * Pharma-Garde — Module Partagé : Abonnements Pro, Paywall & Rappels J-7/J-3/J-1
 * Gère les abonnements Mobile Money (Orange Money / MTN MoMo) pour :
 *  • Délégués Médicaux ('delegate')
 *  • Grossistes-Répartiteurs ('wholesaler')
 *  • Pharmacies d'Officine ('pharmacy')
 * Expose : window.PGSubscription
 */
(function (window) {
  'use strict';

  const STORAGE_PREFIX = 'pharmagarde_sub_';
  const TRIAL_DAYS = 14;

  // Grille tarifaire officielle par profil (FCFA / XAF)
  const PLANS_BY_ROLE = {
    delegate: {
      title: 'Abonnement Délégué Médical Pro',
      subtitle: 'Diffusez vos promotions aux pharmacies, recevez les alertes ruptures en direct et exportez vos rapports labo.',
      plans: [
        { id: 'monthly', label: 'Mensuel (30 jours)', amount: 5000, days: 30, badge: 'Flexible', perMonth: '5 000 FCFA / mois' },
        { id: 'quarterly', label: 'Trimestriel (90 jours)', amount: 12500, days: 90, badge: 'Populaire (-17%)', perMonth: '4 166 FCFA / mois', recommended: true },
        { id: 'annual', label: 'Annuel (365 jours)', amount: 45000, days: 365, badge: 'Meilleure offre (-25%)', perMonth: '3 750 FCFA / mois' }
      ]
    },
    wholesaler: {
      title: 'Licence Grossiste-Répartiteur & Distributeur B2B',
      subtitle: 'Publiez votre catalogue B2B, recevez les commandes des officines en temps réel et diffusez vos arrivages aux pharmacies et délégués.',
      plans: [
        { id: 'monthly', label: 'Mensuel (30 jours)', amount: 15000, days: 30, badge: 'Standard B2B', perMonth: '15 000 FCFA / mois' },
        { id: 'quarterly', label: 'Trimestriel (90 jours)', amount: 40000, days: 90, badge: 'Recommandé (-11%)', perMonth: '13 333 FCFA / mois', recommended: true },
        { id: 'annual', label: 'Annuel (365 jours)', amount: 140000, days: 365, badge: 'Économie Max (-22%)', perMonth: '11 666 FCFA / mois' }
      ]
    },
    pharmacy: {
      title: 'Pack Officine Connectée & Commandes B2B',
      subtitle: 'Réception illimitée des ordonnances patients, connecteur automatique, alertes ruptures et commandes grossistes.',
      plans: [
        { id: 'monthly', label: 'Mensuel (30 jours)', amount: 10000, days: 30, badge: 'Mensuel', perMonth: '10 000 FCFA / mois' },
        { id: 'quarterly', label: 'Trimestriel (90 jours)', amount: 25000, days: 90, badge: 'Avantage (-17%)', perMonth: '8 333 FCFA / mois', recommended: true },
        { id: 'annual', label: 'Annuel (365 jours)', amount: 90000, days: 365, badge: 'Sérénité (-25%)', perMonth: '7 500 FCFA / mois' }
      ]
    }
  };

  function esc(s) {
    return window.PGNetwork ? window.PGNetwork.escapeHtml(s) : String(s || '');
  }

  function getStorageKey(userId, role) {
    return `${STORAGE_PREFIX}${role || 'pro'}_${userId || 'default'}`;
  }

  /**
   * Récupère ou initialise l'état d'abonnement (avec essai gratuit de 14 jours à la création)
   */
  function getLocalSubscription(user, role) {
    const uid = (user && user.id) ? user.id : 'demo_user';
    const key = getStorageKey(uid, role);
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.expiresAt) return parsed;
      }
    } catch (e) {}

    // Initialiser depuis les champs Supabase de l'utilisateur ou créer une période d'essai 14 jours
    const now = Date.now();
    let expMs = now + TRIAL_DAYS * 24 * 60 * 60 * 1000;
    let status = 'trial';
    let planId = 'trial';

    if (user && user.subscription_expires_at) {
      const parsedExp = new Date(user.subscription_expires_at).getTime();
      if (!isNaN(parsedExp)) expMs = parsedExp;
    } else if (user && user.trial_ends_at) {
      const parsedTrial = new Date(user.trial_ends_at).getTime();
      if (!isNaN(parsedTrial)) expMs = parsedTrial;
    }

    if (user && user.subscription_status) {
      status = user.subscription_status;
    }
    if (user && user.subscription_plan) {
      planId = user.subscription_plan;
    }

    const initial = {
      subscriberId: uid,
      role: role || 'delegate',
      status,
      planId,
      planLabel: planId === 'trial' ? `Essai Pro Gratuit (${TRIAL_DAYS}j)` : planId,
      startsAt: now,
      expiresAt: expMs,
      reference: 'TRIAL_' + uid.slice(0, 8)
    };

    saveLocalSubscription(uid, role, initial);
    return initial;
  }

  function saveLocalSubscription(userId, role, subData) {
    try {
      localStorage.setItem(getStorageKey(userId, role), JSON.stringify(subData));
    } catch (e) {}
  }

  function normalizeUserAndRole(arg1, arg2) {
    if (typeof arg1 === 'string' && (!arg2 || typeof arg2 === 'object')) {
      return { role: arg1, user: arg2 || { id: 'demo_user' } };
    }
    return { user: arg1 || { id: 'demo_user' }, role: typeof arg2 === 'string' ? arg2 : 'delegate' };
  }

  /**
   * Calcule l'état détaillé de l'abonnement
   */
  function getStatusInfo(userOrRole, roleOrUser) {
    const { user, role } = normalizeUserAndRole(userOrRole, roleOrUser);
    const sub = getLocalSubscription(user, role);
    const now = Date.now();
    const expMs = Number(sub.expiresAt) || now;
    const diffMs = expMs - now;
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const isTrial = sub.planId === 'trial' || sub.status === 'trial';
    const isActive = diffMs > 0 && sub.status !== 'cancelled' && sub.status !== 'expired';

    let reminderLevel = null;
    if (!isActive) {
      reminderLevel = 'EXPIRED';
    } else if (daysLeft <= 1) {
      reminderLevel = 'J-1';
    } else if (daysLeft <= 3) {
      reminderLevel = 'J-3';
    } else if (daysLeft <= 7) {
      reminderLevel = 'J-7';
    }

    return {
      isActive,
      isTrial,
      status: isActive ? (isTrial ? 'trial' : 'active') : 'expired',
      planId: sub.planId || 'trial',
      planLabel: sub.planLabel || (isTrial ? 'Essai Gratuit' : 'Abonnement Pro'),
      daysLeft: Math.max(0, daysLeft),
      expiresAt: new Date(expMs).toISOString(),
      expiresFormatted: new Date(expMs).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }),
      reminderLevel,
      reference: sub.reference || '',
      amount: sub.amount || 0
    };
  }

  /**
   * Synchronise l'état d'abonnement avec Supabase `subscriptions` si disponible
   */
  async function syncWithSupabase(user, role) {
    if (!user || !user.id || !window.supabase) return getStatusInfo(user, role);
    try {
      const { data: subs } = await window.supabase
        .from('subscriptions')
        .select('*')
        .eq('subscriber_id', user.id)
        .eq('subscriber_role', role || 'delegate')
        .in('status', ['active', 'trial'])
        .order('expires_at', { ascending: false })
        .limit(1);

      if (subs && subs.length > 0) {
        const latest = subs[0];
        const expMs = new Date(latest.expires_at).getTime();
        saveLocalSubscription(user.id, role, {
          subscriberId: user.id,
          role: role || 'delegate',
          status: latest.status,
          planId: latest.plan_id,
          planLabel: latest.plan_label || latest.plan_id,
          startsAt: new Date(latest.starts_at || latest.created_at).getTime(),
          expiresAt: expMs,
          reference: latest.payment_reference,
          amount: latest.amount_fcfa
        });
      }
    } catch (e) {}
    return getStatusInfo(user, role);
  }

  /**
   * Affiche le badge d'abonnement dans le header ou conteneur dédié
   */
  function renderHeaderBadge(containerOrId, userOrRole, roleOrUser) {
    const { user, role } = normalizeUserAndRole(userOrRole, roleOrUser);
    const container = typeof containerOrId === 'string'
      ? document.getElementById(containerOrId)
      : containerOrId;
    if (!container) return;

    const info = getStatusInfo(user, role);
    let bg = 'rgba(16,185,129,0.16)';
    let border = 'rgba(16,185,129,0.45)';
    let color = '#34d399';
    let icon = '💎';
    let text = `Pro Actif (${info.daysLeft}j)`;

    if (!info.isActive) {
      bg = 'rgba(239,68,68,0.2)';
      border = 'rgba(239,68,68,0.5)';
      color = '#f87171';
      icon = '🔒';
      text = 'Abonnement Expiré · Renouveler';
    } else if (info.isTrial) {
      bg = 'rgba(251,191,36,0.16)';
      border = 'rgba(251,191,36,0.45)';
      color = '#fbbf24';
      icon = '⏳';
      text = `Essai Pro (${info.daysLeft}j)`;
    } else if (info.daysLeft <= 7) {
      bg = 'rgba(251,191,36,0.2)';
      border = 'rgba(251,191,36,0.5)';
      color = '#fbbf24';
      icon = '⚠️';
      text = `Expire dans ${info.daysLeft}j`;
    }

    container.innerHTML = `
      <button type="button" class="pg-sub-header-btn" style="display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;background:${bg};border:1px solid ${border};color:${color};font-size:11.5px;font-weight:800;cursor:pointer;white-space:nowrap;transition:all 0.2s;" title="Gérer mon abonnement Pharma-Garde Pro (Échéance : ${esc(info.expiresFormatted)})">
        <span>${icon}</span>
        <span>${esc(text)}</span>
      </button>
    `;

    const btn = container.querySelector('.pg-sub-header-btn');
    if (btn) {
      btn.addEventListener('click', () => openPaywallModal(user, role));
    }
  }

  /**
   * Vérifie les rappels J-7, J-3, J-1 et affiche une bannière non-intrusive
   */
  function checkAndShowReminders(userOrRole, roleOrUser, targetBannerContainerId) {
    const { user, role } = normalizeUserAndRole(userOrRole, roleOrUser);
    const info = getStatusInfo(user, role);
    if (!info.reminderLevel) return info;

    const container = targetBannerContainerId ? document.getElementById(targetBannerContainerId) : null;
    if (container) {
      const isExpired = info.reminderLevel === 'EXPIRED';
      const bg = isExpired
        ? 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(185,28,28,0.1))'
        : 'linear-gradient(135deg, rgba(245,158,11,0.16), rgba(217,119,6,0.08))';
      const borderColor = isExpired ? 'rgba(239,68,68,0.45)' : 'rgba(251,191,36,0.4)';
      const titleColor = isExpired ? '#f87171' : '#fbbf24';

      container.innerHTML = `
        <div style="background:${bg};border:1px solid ${borderColor};border-radius:12px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:20px;">${isExpired ? '🔒' : '⏰'}</span>
            <div>
              <div style="font-size:13px;font-weight:800;color:${titleColor};">
                ${isExpired ? 'Abonnement Pro arrivé à échéance' : `Rappel ${info.reminderLevel} : Votre ${esc(info.planLabel)} expire dans ${info.daysLeft} jour(s)`}
              </div>
              <div style="font-size:11.5px;color:#cbd5e1;">
                ${isExpired ? 'Renouvelez maintenant par Orange Money ou MTN MoMo pour débloquer toutes les fonctionnalités Pro.' : `Échéance le ${esc(info.expiresFormatted)}. Renouvelez en 1 clic sans perte de jours.`}
              </div>
            </div>
          </div>
          <button type="button" class="btn btn--primary btn--sm" id="pg-sub-reminder-cta" style="background:linear-gradient(135deg,#fbbf24,#d97706);color:#0f172a;font-weight:800;border:none;white-space:nowrap;">
            ⚡ ${isExpired ? 'Activer mon Pass Pro' : 'Renouveler'}
          </button>
        </div>
      `;
      const cta = container.querySelector('#pg-sub-reminder-cta');
      if (cta) cta.addEventListener('click', () => openPaywallModal(user, role));
    }

    return info;
  }

  /**
   * Gatekeeper Paywall : exécute `onAllowed()` si l'abonnement est actif, sinon ouvre la modale Paywall
   */
  function enforcePaywall(userOrRole, roleOrUser, featureName, onAllowed) {
    const { user, role } = normalizeUserAndRole(userOrRole, roleOrUser);
    const info = getStatusInfo(user, role);
    if (info.isActive) {
      if (typeof onAllowed === 'function') onAllowed(info);
      return true;
    }
    openPaywallModal(user, role, {
      blockedFeature: featureName || 'cette fonctionnalité professionnelle',
      onSuccess: onAllowed
    });
    return false;
  }

  /**
   * Ouvre la modale d'abonnement / Paywall avec paiement Mobile Money (Orange Money & MTN MoMo)
   */
  function openPaywallModal(userOrRole, roleOrUser, options) {
    const { user, role } = normalizeUserAndRole(userOrRole, roleOrUser);
    const opts = options || {};
    const effectiveRole = role || 'delegate';
    const roleConfig = PLANS_BY_ROLE[effectiveRole] || PLANS_BY_ROLE.delegate;
    const info = getStatusInfo(user, effectiveRole);

    let existing = document.getElementById('pg-paywall-modal');
    if (existing) existing.remove();

    const defaultPlan = roleConfig.plans.find(p => p.recommended) || roleConfig.plans[0];
    const defaultPhone = (user && (user.phone || user.whatsapp)) ? String(user.phone || user.whatsapp).replace(/\D/g, '').replace(/^237/, '') : '';

    const modal = document.createElement('div');
    modal.id = 'pg-paywall-modal';
    modal.className = 'modal-overlay active';
    modal.style.zIndex = '9800';

    modal.innerHTML = `
      <div class="modal-content" style="max-width:560px;background:#0f172a;border:1px solid rgba(251,191,36,0.35);border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.75);">
        <div style="background:linear-gradient(135deg,rgba(16,185,129,0.2),rgba(251,191,36,0.12));padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
          <div>
            <div style="display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;background:rgba(251,191,36,0.18);color:#fbbf24;font-size:11px;font-weight:800;margin-bottom:6px;">
              💎 PHARMA-GARDE PRO · CAMEROUN
            </div>
            <h3 style="font-size:18px;font-weight:900;color:#fff;margin:0;">${esc(roleConfig.title)}</h3>
            <p style="font-size:12.5px;color:#94a3b8;margin:4px 0 0;line-height:1.45;">${esc(roleConfig.subtitle)}</p>
          </div>
          <button type="button" id="pg-paywall-close" class="btn btn--icon" style="color:#94a3b8;flex-shrink:0;">✕</button>
        </div>

        <div style="padding:20px 24px;max-height:78vh;overflow-y:auto;">
          ${opts.blockedFeature ? `
            <div style="background:rgba(239,68,68,0.14);border:1px solid rgba(239,68,68,0.4);border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:12.5px;color:#fca5a5;">
              🔒 <strong>Accès réservé aux comptes actifs :</strong> Souscrivez ou renouvelez votre abonnement pour utiliser <em>${esc(opts.blockedFeature)}</em>.
            </div>
          ` : ''}

          <!-- État actuel -->
          <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px 14px;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
            <div>
              <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Statut actuel du compte</div>
              <div style="font-size:14px;font-weight:800;color:${info.isActive ? '#34d399' : '#f87171'};">
                ${info.isActive ? `✅ ${esc(info.planLabel)} (${info.daysLeft} jours restants)` : '❌ Abonnement Expiré'}
              </div>
              <div style="font-size:11.5px;color:#64748b;">Échéance : ${esc(info.expiresFormatted)}</div>
            </div>
            ${info.reference && !info.reference.startsWith('TRIAL_') ? `
              <button type="button" id="pg-sub-download-receipt" class="btn btn--secondary btn--sm" style="font-size:11.5px;">
                🧾 Télécharger Reçu PDF
              </button>
            ` : ''}
          </div>

          <!-- Choix de la formule -->
          <div style="font-size:12px;font-weight:800;color:#fbbf24;text-transform:uppercase;margin-bottom:10px;">
            1. Choisissez votre formule d'abonnement
          </div>
          <div id="pg-plan-cards" style="display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:18px;">
            ${roleConfig.plans.map(p => `
              <label class="pg-plan-option" data-plan="${p.id}" data-amount="${p.amount}" data-days="${p.days}" data-label="${esc(p.label)}" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:12px;border:2px solid ${p.id === defaultPlan.id ? '#10b981' : 'rgba(255,255,255,0.1)'};background:${p.id === defaultPlan.id ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.03)'};cursor:pointer;transition:all 0.2s;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <input type="radio" name="pg_sub_plan" value="${p.id}" ${p.id === defaultPlan.id ? 'checked' : ''} style="accent-color:#10b981;width:18px;height:18px;">
                  <div>
                    <div style="font-size:14px;font-weight:800;color:#fff;display:flex;align-items:center;gap:8px;">
                      <span>${esc(p.label)}</span>
                      <span style="font-size:10.5px;padding:2px 8px;border-radius:999px;background:rgba(251,191,36,0.2);color:#fbbf24;font-weight:800;">${esc(p.badge)}</span>
                    </div>
                    <div style="font-size:11.5px;color:#94a3b8;margin-top:2px;">Revient à ${esc(p.perMonth)}</div>
                  </div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:16px;font-weight:900;color:#34d399;">${p.amount.toLocaleString('fr-FR')} FCFA</div>
                </div>
              </label>
            `).join('')}
          </div>

          <!-- Moyen de paiement Mobile Money -->
          <div style="font-size:12px;font-weight:800;color:#fbbf24;text-transform:uppercase;margin-bottom:10px;">
            2. Paiement Mobile Money (Push USSD Direct)
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
            <button type="button" class="pg-op-btn active" data-op="om" style="padding:11px;border-radius:10px;border:2px solid #f97316;background:rgba(249,115,22,0.15);color:#fff;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#f97316;"></span>
              <span>Orange Money</span>
            </button>
            <button type="button" class="pg-op-btn" data-op="momo" style="padding:11px;border-radius:10px;border:2px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.03);color:#fff;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#eab308;"></span>
              <span>MTN MoMo</span>
            </button>
          </div>

          <div class="form-group" style="margin-bottom:14px;">
            <label class="form-label" style="font-size:12px;color:#cbd5e1;">Numéro Mobile Money (+237)</label>
            <input type="tel" id="pg-sub-phone" class="form-input" value="${esc(defaultPhone)}" placeholder="Ex: 699 00 11 22" maxlength="14" style="font-size:15px;font-weight:700;">
          </div>

          <div id="pg-sub-feedback" style="display:none;padding:12px;border-radius:10px;margin-bottom:14px;font-size:12.5px;"></div>

          <button type="button" id="pg-sub-pay-btn" class="btn btn--primary btn--block" style="background:linear-gradient(135deg,#10b981,#059669);font-weight:900;font-size:15px;padding:14px;">
            🔐 Payer ${defaultPlan.amount.toLocaleString('fr-FR')} FCFA &amp; Activer maintenant
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    let selectedPlan = defaultPlan;
    let selectedOp = 'om';

    const closeBtn = modal.querySelector('#pg-paywall-close');
    closeBtn.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    const payBtn = modal.querySelector('#pg-sub-pay-btn');
    const feedbackEl = modal.querySelector('#pg-sub-feedback');

    // Sélection de plan
    modal.querySelectorAll('.pg-plan-option').forEach(card => {
      card.addEventListener('click', () => {
        const pid = card.getAttribute('data-plan');
        selectedPlan = roleConfig.plans.find(p => p.id === pid) || defaultPlan;
        modal.querySelectorAll('.pg-plan-option').forEach(c => {
          const active = c.getAttribute('data-plan') === pid;
          c.style.borderColor = active ? '#10b981' : 'rgba(255,255,255,0.1)';
          c.style.background = active ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.03)';
          const r = c.querySelector('input[type="radio"]');
          if (r) r.checked = active;
        });
        payBtn.innerHTML = `🔐 Payer ${selectedPlan.amount.toLocaleString('fr-FR')} FCFA &amp; Activer maintenant`;
      });
    });

    // Sélection d'opérateur
    modal.querySelectorAll('.pg-op-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedOp = btn.getAttribute('data-op') || 'om';
        modal.querySelectorAll('.pg-op-btn').forEach(b => {
          const active = b.getAttribute('data-op') === selectedOp;
          const color = selectedOp === 'om' ? '#f97316' : '#eab308';
          b.style.borderColor = active ? color : 'rgba(255,255,255,0.12)';
          b.style.background = active ? (selectedOp === 'om' ? 'rgba(249,115,22,0.15)' : 'rgba(234,179,8,0.15)') : 'rgba(255,255,255,0.03)';
        });
      });
    });

    // Téléchargement reçu PDF
    const receiptBtn = modal.querySelector('#pg-sub-download-receipt');
    if (receiptBtn) {
      receiptBtn.addEventListener('click', () => downloadSubscriptionReceipt(user, effectiveRole, info));
    }

    // Soumission du paiement
    payBtn.addEventListener('click', async () => {
      const rawPhone = (modal.querySelector('#pg-sub-phone').value || '').replace(/\D/g, '').replace(/^237/, '');
      if (!/^[26]\d{8}$/.test(rawPhone)) {
        feedbackEl.style.display = 'block';
        feedbackEl.style.background = 'rgba(239,68,68,0.15)';
        feedbackEl.style.color = '#fca5a5';
        feedbackEl.textContent = '❌ Veuillez saisir un numéro Mobile Money camerounais valide à 9 chiffres.';
        return;
      }

      payBtn.disabled = true;
      payBtn.textContent = '⏳ Initialisation du paiement USSD en cours...';
      feedbackEl.style.display = 'block';
      feedbackEl.style.background = 'rgba(59,130,246,0.15)';
      feedbackEl.style.color = '#93c5fd';
      feedbackEl.textContent = '📲 Connexion sécurisée à la passerelle Mobile Money...';

      try {
        let activated = false;
        let txRef = 'SUB_' + Date.now();

        if (window.supabase && window.supabase.functions) {
          const { data, error } = await window.supabase.functions.invoke('subscription-payment', {
            body: {
              action: 'collect',
              subscriber_id: (user && user.id) ? user.id : 'pro_user',
              subscriber_role: effectiveRole,
              subscriber_name: (user && (user.name || user.company_name || user.last_name)) || 'Professionnel',
              subscriber_email: (user && user.email) || 'pro@pharmagarde.cm',
              plan_id: selectedPlan.id,
              amount: selectedPlan.amount,
              phone: rawPhone,
              method: selectedOp
            }
          });

          if (!error && data && data.success && data.reference) {
            txRef = data.internal_reference || data.reference;
            feedbackEl.textContent = data.message || '📲 Push USSD envoyé ! Entrez votre code PIN sur votre téléphone...';

            // Polling rapide du statut
            for (let i = 0; i < 16; i++) {
              await new Promise(r => setTimeout(r, 3000));
              const { data: stData } = await window.supabase.functions.invoke('subscription-payment', {
                body: { action: 'status', reference: data.reference, internal_reference: txRef }
              });
              if (stData && stData.status === 'SUCCESSFUL') {
                activated = true;
                break;
              }
              if (stData && stData.status === 'FAILED') {
                throw new Error('Le paiement Mobile Money a été annulé ou refusé.');
              }
            }
          }
        }

        // Activation locale / confirmation
        const currentInfo = getStatusInfo(user, effectiveRole);
        const baseTime = currentInfo.isActive ? new Date(currentInfo.expiresAt).getTime() : Date.now();
        const newExpMs = baseTime + selectedPlan.days * 24 * 60 * 60 * 1000;

        const newSub = {
          subscriberId: (user && user.id) || 'demo_user',
          role: effectiveRole,
          status: 'active',
          planId: selectedPlan.id,
          planLabel: selectedPlan.label,
          startsAt: Date.now(),
          expiresAt: newExpMs,
          reference: txRef,
          amount: selectedPlan.amount,
          phone: rawPhone,
          method: selectedOp
        };

        saveLocalSubscription((user && user.id) || 'demo_user', effectiveRole, newSub);

        feedbackEl.style.background = 'rgba(16,185,129,0.2)';
        feedbackEl.style.color = '#6ee7b7';
        feedbackEl.innerHTML = `✅ <strong>Abonnement ${esc(selectedPlan.label)} activé !</strong> Nouvelle échéance : ${new Date(newExpMs).toLocaleDateString('fr-FR')}.`;

        // Rafraîchir les badges présents dans la page
        document.querySelectorAll('[data-pg-sub-badge]').forEach(el => {
          renderHeaderBadge(el, user, effectiveRole);
        });

        setTimeout(() => {
          modal.remove();
          if (typeof opts.onSuccess === 'function') opts.onSuccess(getStatusInfo(user, effectiveRole));
        }, 1200);
      } catch (err) {
        payBtn.disabled = false;
        payBtn.innerHTML = `🔐 Réessayer (${selectedPlan.amount.toLocaleString('fr-FR')} FCFA)`;
        feedbackEl.style.background = 'rgba(239,68,68,0.18)';
        feedbackEl.style.color = '#fca5a5';
        feedbackEl.textContent = '❌ ' + (err.message || 'Erreur lors de la validation du paiement.');
      }
    });
  }

  /**
   * Génère et télécharge un reçu d'abonnement PDF via PGReports
   */
  function downloadSubscriptionReceipt(user, role, info) {
    if (!window.PGReports) return;
    const entityName = (user && (user.company_name || user.name || ((user.first_name || '') + ' ' + (user.last_name || '')).trim())) || 'Professionnel Pharma-Garde';
    window.PGReports.exportPDF({
      filename: `Recu_Abonnement_PharmaGarde_${info.reference || Date.now()}.pdf`,
      title: 'REÇU D\'ABONNEMENT PROFESSIONNEL',
      subtitle: 'Licence & Accès Plateforme Santé Pharma-Garde Cameroun',
      entityName,
      entityCode: info.reference || 'SUB-PRO',
      periodLabel: `Valide jusqu'au ${info.expiresFormatted}`,
      kpis: [
        { label: 'Formule souscrite', value: info.planLabel },
        { label: 'Montant réglé', value: `${(info.amount || 12500).toLocaleString('fr-FR')} FCFA` },
        { label: 'Statut', value: 'ACTIF & PAYÉ' },
        { label: 'Jours restants', value: `${info.daysLeft} jours` }
      ],
      tables: [
        {
          title: 'Détails de la Transaction',
          headers: ['Référence', 'Titulaire', 'Profil', 'Formule', 'Échéance'],
          rows: [[
            info.reference || 'SUB-ACTIF',
            entityName,
            role.toUpperCase(),
            info.planLabel,
            info.expiresFormatted
          ]]
        }
      ]
    });
  }

  window.PGSubscription = {
    PLANS_BY_ROLE,
    getStatusInfo,
    syncWithSupabase,
    renderHeaderBadge,
    checkAndShowReminders,
    enforcePaywall,
    openPaywallModal,
    downloadSubscriptionReceipt
  };
})(window);

