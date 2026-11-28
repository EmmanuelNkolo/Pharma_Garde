/**
 * Pharma-Garde v17.0 — Module Notifications Push & Alertes Système PWA
 * ─────────────────────────────────────────────────────────────────────
 * Fournit des notifications système OS / Mobile temps réel via le Service Worker
 * (avec repli automatique sur `Notification` natif et toast in-app) sur les 6 espaces :
 *   • Patient    : réponse d'une pharmacie, nouveau message médecin, résultat labo DMP
 *   • Pharmacie  : nouvelle recherche patient, réservation 60 min, visite délégué
 *   • Médecin    : nouvelle téléconsultation payée, message patient, RDV
 *   • Labo/Hôp.  : demande d'analyse, résultat validé
 *   • Délégué / Grossiste : alertes réponses & commandes B2B
 *
 * Expose : window.PGNotify
 */
(function (window) {
  'use strict';

  const PREF_KEY = 'pharmagarde_push_optin_v17';

  function isSupported() {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  function getPermission() {
    if (!isSupported()) return 'unsupported';
    return Notification.permission || 'default';
  }

  function isEnabled() {
    if (getPermission() !== 'granted') return false;
    try {
      const pref = localStorage.getItem(PREF_KEY);
      return pref !== 'muted';
    } catch (e) {
      return true;
    }
  }

  function setMuted(muted) {
    try { localStorage.setItem(PREF_KEY, muted ? 'muted' : 'enabled'); } catch (e) {}
    refreshPills();
  }

  async function requestPermission(silent) {
    if (!isSupported()) return 'unsupported';
    if (Notification.permission === 'granted') {
      setMuted(false);
      return 'granted';
    }
    if (Notification.permission === 'denied') {
      if (!silent && window.PG && typeof PG.toast === 'function') {
        PG.toast('🔕 Notifications bloquées dans les réglages du navigateur.', 'warning');
      }
      return 'denied';
    }
    try {
      const res = await Notification.requestPermission();
      if (res === 'granted') {
        setMuted(false);
        if (!silent && window.PG && typeof PG.toast === 'function') {
          PG.toast('🔔 Alertes temps réel activées sur cet appareil !', 'success');
        }
      }
      refreshPills();
      return res;
    } catch (e) {
      return 'default';
    }
  }

  /**
   * Envoie une notification système (ServiceWorkerRegistration.showNotification en priorité
   * afin de fonctionner sur Android/PWA même quand l'onglet est en arrière-plan).
   *
   * @param {string} title - Titre court
   * @param {object} opts  - { body, tag, url, force, badge, icon, vibrate }
   */
  async function notify(title, opts) {
    const o = opts || {};
    if (!isEnabled()) return false;
    // Par défaut, n'affiche la notification OS que si l'onglet est masqué OU `force: true`
    const isHidden = typeof document !== 'undefined' && (document.hidden || document.visibilityState === 'hidden');
    if (!isHidden && !o.force) return false;

    const notifTitle = String(title || 'Pharma-Garde Cameroun');
    const payload = {
      body: String(o.body || ''),
      icon: o.icon || '/icon-192.png',
      badge: o.badge || '/icon-192.png',
      tag: o.tag || ('pg_' + Date.now()),
      renotify: Boolean(o.renotify),
      vibrate: Array.isArray(o.vibrate) ? o.vibrate : [180, 80, 180],
      data: { url: o.url || window.location.pathname || '/index.html' }
    };

    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((resolve) => setTimeout(() => resolve(null), 1200))
        ]);
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification(notifTitle, payload);
          return true;
        }
      }
    } catch (e) {}

    try {
      const n = new Notification(notifTitle, {
        body: payload.body,
        icon: payload.icon,
        tag: payload.tag
      });
      n.onclick = () => {
        try { window.focus(); } catch (e) {}
        n.close();
      };
      return true;
    } catch (e) {
      return false;
    }
  }

  function buildPillLabel() {
    const perm = getPermission();
    if (perm === 'unsupported') return null;
    if (perm === 'granted' && isEnabled()) return { text: '🔔 Alertes actives', active: true };
    if (perm === 'granted' && !isEnabled()) return { text: '🔕 Alertes en pause', active: false };
    if (perm === 'denied') return { text: '🔕 Alertes bloquées', active: false };
    return { text: '🔔 Activer les alertes', active: false };
  }

  function refreshPills() {
    const state = buildPillLabel();
    document.querySelectorAll('[data-pg-notify-pill]').forEach((btn) => {
      if (!state) { btn.style.display = 'none'; return; }
      btn.textContent = state.text;
      btn.style.borderColor = state.active ? 'rgba(52,211,153,0.55)' : 'rgba(148,163,184,0.35)';
      btn.style.color = state.active ? '#34d399' : '#cbd5e1';
      btn.style.background = state.active ? 'rgba(16,185,129,0.14)' : 'rgba(15,23,42,0.55)';
    });
  }

  function renderOptInPill(container) {
    if (!isSupported()) return null;
    const host = typeof container === 'string' ? document.getElementById(container) : container;
    if (!host || host.querySelector('[data-pg-notify-pill]')) return null;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-pg-notify-pill', '1');
    btn.style.cssText = 'display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:999px;border:1px solid rgba(148,163,184,0.35);background:rgba(15,23,42,0.55);color:#cbd5e1;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;transition:all 0.2s ease;';
    btn.addEventListener('click', async () => {
      if (getPermission() === 'granted') {
        const nextMuted = isEnabled();
        setMuted(nextMuted);
        if (window.PG && PG.toast) {
          PG.toast(nextMuted ? '🔕 Alertes système mises en pause.' : '🔔 Alertes système réactivées.', 'info');
        }
      } else {
        const res = await requestPermission(false);
        if (res === 'granted') {
          notify('Pharma-Garde Cameroun', {
            body: 'Vous recevrez désormais les alertes en temps réel (réponses pharmacies, médecin, résultats labo).',
            tag: 'pg_welcome_push',
            force: true
          });
        }
      }
    });
    host.appendChild(btn);
    refreshPills();
    return btn;
  }

  function autoMount() {
    if (!isSupported()) return;
    // Injecter discrètement le bouton d'activation des alertes dans les en-têtes / barres rapides disponibles
    const targets = [
      document.querySelector('.topbar__right'),
      document.querySelector('.pro-header__actions'),
      document.querySelector('.g-topbar__actions'),
      document.querySelector('.welcome-screen__quick-actions')
    ].filter(Boolean);
    if (targets.length > 0) {
      renderOptInPill(targets[0]);
    }
  }

  window.PGNotify = {
    isSupported,
    getPermission,
    isEnabled,
    setMuted,
    requestPermission,
    notify,
    renderOptInPill,
    refreshPills
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }
})(window);
