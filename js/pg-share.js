/**
 * Pharma-Garde — Module Partage, QR Code & Installation PWA
 * Permet l'envoi du lien à un ami (WhatsApp, Telegram, etc.),
 * la génération et le scan d'un QR Code en direct,
 * ainsi que l'installation de l'application sur smartphone (Android/iOS) et ordinateur (PC/Mac).
 */

(function (window) {
  'use strict';

  let deferredInstallPrompt = null;
  const APP_NAME = 'Pharma-Garde';
  const APP_TAGLINE = 'Trouvez vos médicaments dans les pharmacies de garde et de proximité au Cameroun !';

  // Écoute de l'événement d'installation PWA par le navigateur
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const btn = document.getElementById('btn-welcome-install');
    if (btn) btn.style.display = 'inline-flex';
    const modalInstallBtn = document.getElementById('pg-pwa-direct-install-btn');
    if (modalInstallBtn) modalInstallBtn.style.display = 'inline-flex';
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    if (typeof showToast === 'function') {
      showToast('🎉 Pharma-Garde a été installée avec succès sur votre appareil !', 'success');
    }
  });

  function getAppUrl() {
    // URL propre sans paramètres inutiles
    const loc = window.location;
    return loc.origin + loc.pathname;
  }

  function getShareMessage() {
    const url = getAppUrl();
    return `🏥 *${APP_NAME}*\n${APP_TAGLINE}\n\n👉 Accédez directement à l'application ici :\n${url}`;
  }

  function openModal(initialTab = 'share') {
    let overlay = document.getElementById('pg-share-overlay');
    if (!overlay) {
      overlay = buildModalDOM();
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
    switchTab(initialTab);
    renderQrCode();
  }

  function closeModal() {
    const overlay = document.getElementById('pg-share-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function switchTab(tab) {
    const tabs = ['share', 'qr', 'install'];
    tabs.forEach((t) => {
      const btn = document.getElementById(`pg-tab-btn-${t}`);
      const pane = document.getElementById(`pg-pane-${t}`);
      if (btn && pane) {
        if (t === tab) {
          btn.classList.add('active');
          pane.style.display = 'block';
        } else {
          btn.classList.remove('active');
          pane.style.display = 'none';
        }
      }
    });

    if (tab === 'qr') {
      renderQrCode();
    }
  }

  function renderQrCode() {
    const container = document.getElementById('pg-qr-container');
    if (!container) return;

    const url = getAppUrl();
    const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(url)}&color=059669&bgcolor=ffffff&margin=12`;

    container.innerHTML = `
      <img src="${qrImgUrl}" alt="QR Code Pharma-Garde" id="pg-qr-img" crossorigin="anonymous" style="width:220px;height:220px;display:block;">
      <div class="pg-qr-logo-overlay">💊</div>
    `;
  }

  function downloadQr() {
    const img = document.getElementById('pg-qr-img');
    if (!img) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 260;
      canvas.height = 260;
      const ctx = canvas.getContext('2d');
      const tempImg = new Image();
      tempImg.crossOrigin = 'anonymous';
      tempImg.onload = function () {
        ctx.drawImage(tempImg, 0, 0, 260, 260);
        const link = document.createElement('a');
        link.download = 'QR_Pharma-Garde.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        if (typeof showToast === 'function') {
          showToast('📥 Téléchargement du QR Code démarré !', 'success');
        }
      };
      tempImg.src = img.src;
    } catch (e) {
      window.open(img.src, '_blank');
    }
  }

  async function copyLink() {
    const url = getAppUrl();
    try {
      await navigator.clipboard.writeText(url);
      const btn = document.getElementById('pg-copy-link-btn');
      if (btn) {
        const oldText = btn.textContent;
        btn.textContent = '✅ Copié !';
        setTimeout(() => { btn.textContent = oldText; }, 2500);
      }
      if (typeof showToast === 'function') {
        showToast('✅ Lien copié dans votre presse-papier !', 'success');
      }
    } catch (err) {
      const input = document.getElementById('pg-share-link-input');
      if (input) {
        input.select();
        document.execCommand('copy');
        if (typeof showToast === 'function') {
          showToast('✅ Lien copié !', 'success');
        }
      }
    }
  }

  function shareWhatsApp() {
    const msg = getShareMessage();
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }

  function shareTelegram() {
    const url = getAppUrl();
    const msg = `${APP_NAME} — ${APP_TAGLINE}`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(msg)}`, '_blank');
  }

  function shareFacebook() {
    const url = getAppUrl();
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
  }

  function shareTwitter() {
    const url = getAppUrl();
    const text = `${APP_NAME} — ${APP_TAGLINE}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
  }

  function shareEmail() {
    const subject = `${APP_NAME} — ${APP_TAGLINE}`;
    const body = getShareMessage();
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function shareSms() {
    const body = getShareMessage();
    window.location.href = `sms:?body=${encodeURIComponent(body)}`;
  }

  async function shareNative() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: APP_NAME,
          text: APP_TAGLINE,
          url: getAppUrl(),
        });
      } catch (e) {
        /* annulé par l'utilisateur */
      }
    } else {
      shareWhatsApp();
    }
  }

  async function promptInstall() {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        deferredInstallPrompt = null;
        if (typeof showToast === 'function') {
          showToast('✅ Installation acceptée !', 'success');
        }
        closeModal();
      }
    } else {
      // Ouvre l'onglet installation avec le guide visuel détaillé
      openModal('install');
    }
  }

  function buildModalDOM() {
    const overlay = document.createElement('div');
    overlay.id = 'pg-share-overlay';
    overlay.className = 'pg-share-overlay';
    overlay.style.display = 'none';

    overlay.onclick = (e) => {
      if (e.target === overlay) closeModal();
    };

    const url = getAppUrl();

    overlay.innerHTML = `
      <div class="pg-share-modal" role="dialog" aria-modal="true" aria-labelledby="pg-share-title">
        <div class="pg-share-header">
          <div class="pg-share-header__title" id="pg-share-title">
            <span style="font-size:22px;">✨</span>
            <span>Partager Pharma-Garde</span>
          </div>
          <button type="button" class="pg-share-close" onclick="PharmaShare.closeModal()" title="Fermer">✕</button>
        </div>

        <!-- Onglets -->
        <div class="pg-share-tabs">
          <button type="button" class="pg-share-tab active" id="pg-tab-btn-share" onclick="PharmaShare.switchTab('share')">
            <span>🔗</span> <span>Partager</span>
          </button>
          <button type="button" class="pg-share-tab" id="pg-tab-btn-qr" onclick="PharmaShare.switchTab('qr')">
            <span>📱</span> <span>QR Code</span>
          </button>
          <button type="button" class="pg-share-tab" id="pg-tab-btn-install" onclick="PharmaShare.switchTab('install')">
            <span>📲</span> <span>Installer</span>
          </button>
        </div>

        <div class="pg-share-body">
          <!-- ── ONGLET 1 : PARTAGE ── -->
          <div id="pg-pane-share">
            <p style="font-size:13.5px;color:var(--text-secondary);margin-bottom:16px;text-align:center;">
              Envoyez Pharma-Garde à un ami ou collègue pour qu'il trouve ses médicaments et pharmacies de garde :
            </p>

            <div class="pg-share-grid">
              <button type="button" class="pg-share-network-btn pg-share-network-btn--wa" onclick="PharmaShare.shareWhatsApp()">
                <span style="font-size:20px;">💬</span>
                <span>WhatsApp</span>
              </button>
              <button type="button" class="pg-share-network-btn pg-share-network-btn--tg" onclick="PharmaShare.shareTelegram()">
                <span style="font-size:20px;">✈️</span>
                <span>Telegram</span>
              </button>
              <button type="button" class="pg-share-network-btn pg-share-network-btn--fb" onclick="PharmaShare.shareFacebook()">
                <span style="font-size:20px;">👥</span>
                <span>Facebook</span>
              </button>
              <button type="button" class="pg-share-network-btn pg-share-network-btn--tw" onclick="PharmaShare.shareTwitter()">
                <span style="font-size:20px;">🐦</span>
                <span>X (Twitter)</span>
              </button>
              <button type="button" class="pg-share-network-btn" onclick="PharmaShare.shareSms()">
                <span style="font-size:20px;">✉️</span>
                <span>SMS</span>
              </button>
              <button type="button" class="pg-share-network-btn" onclick="PharmaShare.shareEmail()">
                <span style="font-size:20px;">📧</span>
                <span>Email</span>
              </button>
            </div>

            ${navigator.share ? `
              <button type="button" class="btn btn--primary btn--block" onclick="PharmaShare.shareNative()" style="margin-bottom:14px;gap:8px;">
                <span>📱</span> <span>Partager via une autre application</span>
              </button>
            ` : ''}

            <!-- Copier le lien -->
            <label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px;">
              Lien direct de l'application
            </label>
            <div class="pg-share-copylink">
              <input type="text" id="pg-share-link-input" class="pg-share-copylink__input" value="${url}" readonly>
              <button type="button" id="pg-copy-link-btn" class="pg-share-copylink__btn" onclick="PharmaShare.copyLink()">Copier</button>
            </div>
          </div>

          <!-- ── ONGLET 2 : QR CODE ── -->
          <div id="pg-pane-qr" style="display:none;">
            <div class="pg-qr-wrapper">
              <div class="pg-qr-box" id="pg-qr-container">
                <!-- Image QR insérée dynamiquement -->
              </div>
              <p class="pg-qr-desc">
                Pointez la caméra de votre smartphone sur ce code pour ouvrir l'application instantanément sans taper d'adresse.
              </p>
              <div style="display:flex;gap:10px;width:100%;max-width:320px;">
                <button type="button" class="btn btn--primary btn--block" onclick="PharmaShare.downloadQr()" style="font-size:13px;padding:10px 14px;">
                  <span>📥</span> <span>Télécharger le QR Code</span>
                </button>
              </div>
            </div>
          </div>

          <!-- ── ONGLET 3 : INSTALLATION PWA ── -->
          <div id="pg-pane-install" style="display:none;">
            <div class="pg-install-card">
              <div class="pg-install-app-preview">
                <span style="font-size:26px;">💊</span>
                <span style="font-size:9px;font-weight:900;color:#fff;margin-top:2px;">PHARMA</span>
              </div>
              <div>
                <div style="font-weight:800;font-size:15px;color:#fff;">Pharma-Garde</div>
                <div style="font-size:12px;color:var(--emerald-400);font-weight:600;">Application web & mobile</div>
                <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px;">Affichez le logo et le nom directement sur votre écran</div>
              </div>
            </div>

            <button type="button" id="pg-pwa-direct-install-btn" class="btn btn--primary btn--block" onclick="PharmaShare.promptInstall()" style="margin-bottom:16px;display:none;font-size:14px;padding:12px;">
              <span>📲</span> <span>Ajouter à l'écran d'accueil maintenant</span>
            </button>

            <div style="font-size:12px;font-weight:800;color:var(--amber-400);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px;">
              Comment l'ajouter sur votre écran :
            </div>

            <div class="pg-install-step">
              <span class="pg-install-badge">🍎</span>
              <div>
                <strong style="color:#fff;">Sur iPhone & iPad (Safari) :</strong><br>
                Appuyez sur le bouton Partager <strong>⎋</strong> en bas de Safari, puis faites défiler et choisissez <strong>« Sur l'écran d'accueil ⊞ »</strong>.
              </div>
            </div>

            <div class="pg-install-step">
              <span class="pg-install-badge">🤖</span>
              <div>
                <strong style="color:#fff;">Sur Android (Google Chrome) :</strong><br>
                Touchez les 3 points <strong>⋮</strong> en haut à droite puis sélectionnez <strong>« Installer l'application »</strong> ou <strong>« Ajouter à l'écran d'accueil »</strong>.
              </div>
            </div>

            <div class="pg-install-step">
              <span class="pg-install-badge">💻</span>
              <div>
                <strong style="color:#fff;">Sur Ordinateur (PC / Mac) :</strong><br>
                Cliquez sur l'icône d'installation <strong>⊞</strong> ou <strong>💻</strong> située tout à droite dans la barre d'adresse de votre navigateur (Chrome / Edge).
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    return overlay;
  }

  // Exportation globale
  window.PharmaShare = {
    openModal,
    closeModal,
    switchTab,
    copyLink,
    shareWhatsApp,
    shareTelegram,
    shareFacebook,
    shareTwitter,
    shareEmail,
    shareSms,
    shareNative,
    promptInstall,
    downloadQr,
  };

  // Initialisation automatique
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Détecte si déjà en mode standalone PWA
      if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
        const btn = document.getElementById('btn-welcome-install');
        if (btn) btn.style.display = 'none';
      }
    });
  }

})(window);
