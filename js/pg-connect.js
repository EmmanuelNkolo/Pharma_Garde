/**
 * Pharma-Garde — PG Connect (module partagé Pharmacie ⇄ Délégué)
 * ─────────────────────────────────────────────────────────────
 *  • Avatars & photo de profil (capture caméra / galerie, recadrage carré, compression)
 *  • Fiche contact + conversation style WhatsApp (messagerie interne sécurisée Supabase)
 *  • Fil d'interactions (promotions, visites, messages) fusionné et daté
 *  • Filtres de période : Tout · Aujourd'hui · Semaine ▾ · Mois ▾ · Année ▾
 *  • Export PDF sélectif (html2pdf si présent, sinon impression navigateur)
 *  • Carte « Support développeur » (+237 694 929 909 · Capbioconsulting@gmail.com)
 * Expose : window.PGConnect
 */
(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════
  //  CONSTANTES
  // ═══════════════════════════════════════════════════════
  const DEV = {
    name: 'CAP BIO Consulting',
    phone: '+237694929909',
    phoneDisplay: '+237 694 929 909',
    whatsapp: '237694929909',
    email: 'Capbioconsulting@gmail.com',
  };

  const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  // ═══════════════════════════════════════════════════════
  //  UTILITAIRES
  // ═══════════════════════════════════════════════════════
  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function initials(name) {
    const parts = String(name || '').replace(/^(pharmacie|pharmacy|dr\.?|docteur)\s+/i, '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'PG';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /**
   * Avatar HTML. variant: 'delegate' (or), 'pharmacy' (émeraude + croix), 'dev'
   */
  function avatarHtml(opts) {
    const o = opts || {};
    const size = o.size || 44;
    const variant = o.variant || 'delegate';
    const ring = o.ring === false ? '' : ' pg-avatar--ring';
    const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;`;
    const online = o.badge ? `<span class="pg-avatar__badge">${esc(o.badge)}</span>` : '';
    if (o.url) {
      return `<span class="pg-avatar pg-avatar--${variant}${ring}" style="${style}"><img src="${esc(o.url)}" alt="${esc(o.name || 'Profil')}" loading="lazy" decoding="async">${online}</span>`;
    }
    const content = variant === 'pharmacy'
      ? `<span class="pg-avatar__cross" aria-hidden="true"></span><span class="pg-avatar__ini">${esc(initials(o.name))}</span>`
      : `<span class="pg-avatar__ini">${esc(initials(o.name))}</span>`;
    return `<span class="pg-avatar pg-avatar--${variant} pg-avatar--empty${ring}" style="${style}" aria-label="${esc(o.name || '')}">${content}${online}</span>`;
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function fmtDate(d, withYear) {
    d = new Date(d);
    if (isNaN(d)) return '';
    return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + (withYear === false ? '' : ' ' + d.getFullYear());
  }

  function fmtTime(d) {
    d = new Date(d);
    if (isNaN(d)) return '';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function fmtDateTime(d) {
    return fmtDate(d) + ' · ' + fmtTime(d);
  }

  function dayLabel(d) {
    d = new Date(d);
    const now = new Date();
    const y = new Date(); y.setDate(now.getDate() - 1);
    if (sameDay(d, now)) return "Aujourd'hui";
    if (sameDay(d, y)) return 'Hier';
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function timeAgo(d) {
    const t = new Date(d).getTime();
    if (!t) return '';
    const diff = Math.max(0, Date.now() - t);
    const m = Math.floor(diff / 60000);
    if (m < 1) return "À l'instant";
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' h';
    const dd = Math.floor(h / 24);
    if (dd === 1) return 'Hier';
    if (dd < 7) return dd + ' j';
    return fmtDate(d, new Date(d).getFullYear() !== new Date().getFullYear());
  }

  function cmPhoneDigits(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.startsWith('00237')) d = d.slice(5);
    if (d.startsWith('237') && d.length > 9) d = d.slice(3);
    return d;
  }

  function waLink(phone, text) {
    const d = cmPhoneDigits(phone);
    if (!d) return '';
    return 'https://wa.me/237' + d + (text ? '?text=' + encodeURIComponent(text) : '');
  }

  function telLink(phone) {
    const d = cmPhoneDigits(phone);
    return d ? 'tel:+237' + d : '';
  }

  function toast(msg, type) {
    const t = document.getElementById('toast');
    const m = document.getElementById('toast-message');
    if (!t || !m) return;
    t.className = 'toast toast--' + (type || 'success');
    m.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._pgTimer);
    t._pgTimer = setTimeout(() => t.classList.remove('show'), 3600);
  }

  function sb() {
    return (typeof supabase !== 'undefined' && supabase && supabase.from) ? supabase : null;
  }

  // ═══════════════════════════════════════════════════════
  //  IMAGES : recadrage carré + compression JPEG
  // ═══════════════════════════════════════════════════════
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image illisible'));
      img.src = src;
    });
  }

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('Lecture du fichier impossible'));
      r.readAsDataURL(file);
    });
  }

  async function squareCompress(src, size, quality) {
    size = size || 320;
    quality = quality || 0.82;
    const img = await loadImage(src);
    const side = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const sx = ((img.naturalWidth || img.width) - side) / 2;
    const sy = ((img.naturalHeight || img.height) - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#0a0f1c';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', quality);
  }

  async function processFile(file) {
    if (!file) return null;
    if (!/^image\//.test(file.type)) throw new Error('Veuillez choisir une image (JPG, PNG, WEBP).');
    if (file.size > 15 * 1024 * 1024) throw new Error('Image trop lourde (15 Mo maximum).');
    const raw = await readAsDataURL(file);
    return squareCompress(raw, 320, 0.82);
  }

  function pickFromGallery() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', async () => {
        try { resolve(await processFile(input.files && input.files[0])); }
        catch (e) { toast('❌ ' + e.message, 'error'); resolve(null); }
        finally { input.remove(); }
      });
      input.click();
    });
  }

  /** Capture photo via la caméra (selfie). Repli : sélecteur natif avec capture. */
  function captureFromCamera() {
    return new Promise((resolve) => {
      const fallback = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.setAttribute('capture', 'user');
        input.style.display = 'none';
        document.body.appendChild(input);
        input.addEventListener('change', async () => {
          try { resolve(await processFile(input.files && input.files[0])); }
          catch (e) { toast('❌ ' + e.message, 'error'); resolve(null); }
          finally { input.remove(); }
        });
        input.click();
      };

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return fallback();

      const overlay = document.createElement('div');
      overlay.className = 'pg-cam';
      overlay.innerHTML = `
        <div class="pg-cam__box" role="dialog" aria-modal="true" aria-label="Prendre une photo de profil">
          <div class="pg-cam__head">
            <strong>📷 Photo de profil</strong>
            <button type="button" class="pg-icon-btn" data-cam="close" aria-label="Fermer">✕</button>
          </div>
          <div class="pg-cam__stage">
            <video playsinline autoplay muted></video>
            <div class="pg-cam__mask"></div>
          </div>
          <p class="pg-cam__hint">Centrez votre visage dans le cercle puis appuyez sur le déclencheur.</p>
          <div class="pg-cam__actions">
            <button type="button" class="pg-btn pg-btn--ghost" data-cam="flip">🔄 Retourner</button>
            <button type="button" class="pg-cam__shutter" data-cam="shot" aria-label="Prendre la photo"></button>
            <button type="button" class="pg-btn pg-btn--ghost" data-cam="gallery">🖼️ Galerie</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const video = overlay.querySelector('video');
      let stream = null;
      let facing = 'user';
      let done = false;

      const stop = () => { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
      const finish = (val) => { if (done) return; done = true; stop(); overlay.remove(); resolve(val); };
      const start = async () => {
        stop();
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 720 }, height: { ideal: 720 } }, audio: false });
          video.srcObject = stream;
          video.classList.toggle('pg-cam__mirror', facing === 'user');
        } catch (e) {
          finish(null);
          fallback();
        }
      };

      overlay.addEventListener('click', async (e) => {
        const act = e.target.closest('[data-cam]');
        if (!act) { if (e.target === overlay) finish(null); return; }
        const a = act.getAttribute('data-cam');
        if (a === 'close') finish(null);
        if (a === 'flip') { facing = facing === 'user' ? 'environment' : 'user'; start(); }
        if (a === 'gallery') { finish(null); resolve(await pickFromGallery()); }
        if (a === 'shot') {
          const w = video.videoWidth, h = video.videoHeight;
          if (!w || !h) return;
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          if (facing === 'user') { ctx.translate(w, 0); ctx.scale(-1, 1); }
          ctx.drawImage(video, 0, 0, w, h);
          const data = await squareCompress(c.toDataURL('image/jpeg', 0.92), 320, 0.82);
          finish(data);
        }
      });
      start();
    });
  }

  // ═══════════════════════════════════════════════════════
  //  FILTRE DE PÉRIODE (Tout · Aujourd'hui · Semaine ▾ · Mois ▾ · Année ▾)
  // ═══════════════════════════════════════════════════════
  function mondayOf(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = x.getDay() || 7;
    x.setDate(x.getDate() - day + 1);
    return x;
  }

  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
  }

  function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function parseYmd(s) {
    const p = String(s || '').split('-').map(Number);
    return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
  }

  function periodRange(st) {
    st = st || { type: 'all' };
    const now = new Date();
    if (st.type === 'today') {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { start: s, end: new Date(s.getTime() + 86400000) };
    }
    if (st.type === 'week') {
      const s = st.week ? parseYmd(st.week) : mondayOf(now);
      const e = new Date(s); e.setDate(s.getDate() + 7);
      return { start: s, end: e };
    }
    if (st.type === 'month') {
      const [y, m] = (st.month || (now.getFullYear() + '-' + (now.getMonth() + 1))).split('-').map(Number);
      return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
    }
    if (st.type === 'year') {
      const y = Number(st.year || now.getFullYear());
      return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
    }
    return null;
  }

  function periodMatch(dateStr, st) {
    if (!st || st.type === 'all' || st === 'all') return true;
    if (typeof st === 'string') st = { type: st };
    const d = new Date(dateStr);
    if (isNaN(d)) return false;
    const r = periodRange(st);
    return !r || (d >= r.start && d < r.end);
  }

  function periodLabel(st) {
    if (!st || st.type === 'all') return 'Toutes périodes';
    const r = periodRange(st);
    if (st.type === 'today') return "Aujourd'hui (" + fmtDate(r.start) + ')';
    if (st.type === 'week') {
      const e = new Date(r.end); e.setDate(e.getDate() - 1);
      return 'Semaine ' + isoWeek(r.start) + ' · du ' + fmtDate(r.start, false) + ' au ' + fmtDate(e);
    }
    if (st.type === 'month') return MONTHS[r.start.getMonth()] + ' ' + r.start.getFullYear();
    if (st.type === 'year') return 'Année ' + r.start.getFullYear();
    return '';
  }

  /**
   * Rend la barre de filtres dans `container` et appelle onChange(state).
   * Retourne { get state(), set(type) }.
   */
  function renderPeriodFilter(container, onChange, opts) {
    if (!container) return null;
    const o = opts || {};
    const now = new Date();
    const thisMonday = mondayOf(now);

    let weekOpts = '';
    for (let i = 0; i < 26; i++) {
      const s = new Date(thisMonday); s.setDate(thisMonday.getDate() - i * 7);
      const e = new Date(s); e.setDate(s.getDate() + 6);
      const lbl = (i === 0 ? 'Cette semaine · ' : i === 1 ? 'Semaine dernière · ' : 'Sem. ' + isoWeek(s) + ' · ') +
        s.getDate() + ' ' + MONTHS_SHORT[s.getMonth()] + ' – ' + e.getDate() + ' ' + MONTHS_SHORT[e.getMonth()] +
        (e.getFullYear() !== now.getFullYear() ? ' ' + e.getFullYear() : '');
      weekOpts += `<option value="${ymd(s)}">${esc(lbl)}</option>`;
    }

    let monthOpts = '';
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthOpts += `<option value="${d.getFullYear()}-${d.getMonth() + 1}">${MONTHS[d.getMonth()]} ${d.getFullYear()}${i === 0 ? ' (en cours)' : ''}</option>`;
    }

    let yearOpts = '';
    const minYear = Math.min(o.minYear || now.getFullYear() - 4, now.getFullYear());
    for (let y = now.getFullYear(); y >= minYear; y--) {
      yearOpts += `<option value="${y}">${y}${y === now.getFullYear() ? ' (en cours)' : ''}</option>`;
    }

    container.classList.add('pg-period');
    container.innerHTML = `
      <button type="button" class="pg-period__pill active" data-ptype="all">Tout</button>
      <button type="button" class="pg-period__pill" data-ptype="today">Aujourd'hui</button>
      <label class="pg-period__pill pg-period__pill--select" data-ptype="week" title="Choisir une semaine">
        <span class="pg-period__lbl">📅 Semaine</span>
        <select aria-label="Choisir une semaine">${weekOpts}</select>
      </label>
      <label class="pg-period__pill pg-period__pill--select" data-ptype="month" title="Choisir un mois">
        <span class="pg-period__lbl">🗓️ Mois</span>
        <select aria-label="Choisir un mois">${monthOpts}</select>
      </label>
      <label class="pg-period__pill pg-period__pill--select" data-ptype="year" title="Choisir une année">
        <span class="pg-period__lbl">📈 Année</span>
        <select aria-label="Choisir une année">${yearOpts}</select>
      </label>
      <div class="pg-period__current" aria-live="polite"></div>`;

    const state = { type: 'all', week: ymd(thisMonday), month: now.getFullYear() + '-' + (now.getMonth() + 1), year: String(now.getFullYear()) };
    const current = container.querySelector('.pg-period__current');

    const apply = (type) => {
      state.type = type;
      container.querySelectorAll('[data-ptype]').forEach(el => el.classList.toggle('active', el.getAttribute('data-ptype') === type));
      if (current) current.textContent = type === 'all' ? '' : '🔎 ' + periodLabel(state);
      if (typeof onChange === 'function') onChange(Object.assign({}, state));
    };

    container.querySelectorAll('button[data-ptype]').forEach(btn => {
      btn.addEventListener('click', () => apply(btn.getAttribute('data-ptype')));
    });
    container.querySelectorAll('label[data-ptype]').forEach(lbl => {
      const type = lbl.getAttribute('data-ptype');
      const sel = lbl.querySelector('select');
      sel.addEventListener('change', () => { state[type] = sel.value; apply(type); });
      // Un clic simple sur la pastille active immédiatement la période en cours
      sel.addEventListener('focus', () => { if (state.type !== type) { state[type] = sel.value; apply(type); } });
    });

    return {
      get state() { return Object.assign({}, state); },
      set: apply,
    };
  }

  // ═══════════════════════════════════════════════════════
  //  SUPPORT DÉVELOPPEUR
  // ═══════════════════════════════════════════════════════
  function supportCardHtml(space) {
    const msg = 'Bonjour CAP BIO Consulting, je vous contacte depuis Pharma-Garde (' + (space || 'application') + ').';
    return `
      <div class="pg-support">
        <div class="pg-support__head">
          <span class="pg-support__icon">🛟</span>
          <div>
            <div class="pg-support__title">Support &amp; Assistance</div>
            <div class="pg-support__sub">Un souci, une suggestion ? Contactez directement le développeur de Pharma-Garde.</div>
          </div>
        </div>
        <div class="pg-support__grid">
          <a class="pg-support__btn pg-support__btn--wa" href="https://wa.me/${DEV.whatsapp}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">
            <span>💬</span><span><strong>WhatsApp</strong><small>${DEV.phoneDisplay}</small></span>
          </a>
          <a class="pg-support__btn pg-support__btn--call" href="tel:${DEV.phone}">
            <span>📞</span><span><strong>Appeler</strong><small>${DEV.phoneDisplay}</small></span>
          </a>
          <a class="pg-support__btn pg-support__btn--mail" href="mailto:${DEV.email}?subject=${encodeURIComponent('Pharma-Garde — ' + (space || 'Support'))}&body=${encodeURIComponent(msg + '\n\n')}">
            <span>✉️</span><span><strong>Email</strong><small>${DEV.email}</small></span>
          </a>
        </div>
        <div class="pg-support__foot">Développé par <strong>${DEV.name}</strong> · Réponse rapide 7j/7</div>
      </div>`;
  }

  function mountSupport(target, space) {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (el) el.innerHTML = supportCardHtml(space);
  }

  function openSupport(space) {
    let modal = document.getElementById('pg-support-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'pg-support-modal';
      modal.className = 'pg-modal';
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) modal.classList.remove('open'); });
    }
    modal.innerHTML = `<div class="pg-modal__box" role="dialog" aria-modal="true">
      <button type="button" class="pg-icon-btn pg-modal__close" data-close aria-label="Fermer">✕</button>
      ${supportCardHtml(space)}
    </div>`;
    modal.classList.add('open');
  }

  // ═══════════════════════════════════════════════════════
  //  MESSAGERIE (Supabase : table direct_messages)
  // ═══════════════════════════════════════════════════════
  const Chat = {
    available: null, // null = inconnu, true/false après sonde
    _listeners: [],
    _channel: null,
  };

  function isMissingTable(err) {
    if (!err) return false;
    const c = String(err.code || '');
    const m = String(err.message || '').toLowerCase();
    return c === '42P01' || c === 'PGRST205' || c === 'PGRST202' || (m.includes('direct_messages') && (m.includes('not') || m.includes('exist') || m.includes('schema cache')));
  }

  async function probeChat() {
    if (Chat.available !== null) return Chat.available;
    const client = sb();
    if (!client) { Chat.available = false; return false; }
    try {
      const { error } = await client.from('direct_messages').select('id', { head: true, count: 'exact' }).limit(1);
      Chat.available = !(error && isMissingTable(error));
      if (!Chat.available) console.warn('[Pharma-Garde] Messagerie interne inactive : exécutez supabase_schema_v8_profiles_messaging.sql');
    } catch (e) { Chat.available = false; }
    return Chat.available;
  }

  async function fetchThread(pharmacyId, delegateId) {
    if (!(await probeChat())) return [];
    const { data, error } = await sb().from('direct_messages').select('*')
      .eq('pharmacy_id', pharmacyId).eq('delegate_id', delegateId)
      .order('created_at', { ascending: true }).limit(500);
    if (error) { console.warn('fetchThread', error); return []; }
    return data || [];
  }

  /** Tous les messages de l'utilisateur (pour la liste des conversations / badges). */
  async function fetchInbox(myRole, myId) {
    if (!(await probeChat())) return [];
    const col = myRole === 'pharmacy' ? 'pharmacy_id' : 'delegate_id';
    const { data, error } = await sb().from('direct_messages').select('id, pharmacy_id, delegate_id, sender_role, body, created_at, read_at')
      .eq(col, myId).order('created_at', { ascending: false }).limit(1000);
    if (error) return [];
    return data || [];
  }

  /** Résume la boîte : { [otherId]: { last, unread } } */
  function summarizeInbox(messages, myRole) {
    const map = {};
    (messages || []).forEach(m => {
      const other = myRole === 'pharmacy' ? m.delegate_id : m.pharmacy_id;
      if (!map[other]) map[other] = { last: m, unread: 0, count: 0 };
      map[other].count++;
      if (m.sender_role !== myRole && !m.read_at) map[other].unread++;
    });
    return map;
  }

  async function sendMessage(pharmacyId, delegateId, myRole, body) {
    const text = String(body || '').trim();
    if (!text) return null;
    if (!(await probeChat())) throw new Error('Messagerie interne indisponible pour le moment.');
    const { data, error } = await sb().from('direct_messages').insert([{
      pharmacy_id: pharmacyId, delegate_id: delegateId, sender_role: myRole, body: text.slice(0, 2000),
    }]).select().single();
    if (error) throw error;
    return data;
  }

  async function markRead(pharmacyId, delegateId, myRole) {
    if (!(await probeChat())) return;
    const otherRole = myRole === 'pharmacy' ? 'delegate' : 'pharmacy';
    try {
      await sb().from('direct_messages').update({ read_at: new Date().toISOString() })
        .eq('pharmacy_id', pharmacyId).eq('delegate_id', delegateId)
        .eq('sender_role', otherRole).is('read_at', null);
    } catch (e) { /* silencieux */ }
  }

  /** Écoute temps réel de tous les messages concernant l'utilisateur. */
  async function listen(myRole, myId, cb) {
    if (typeof cb === 'function') Chat._listeners.push(cb);
    if (Chat._channel || !(await probeChat())) return;
    const col = myRole === 'pharmacy' ? 'pharmacy_id' : 'delegate_id';
    try {
      Chat._channel = sb().channel('pg_dm_' + myRole + '_' + myId)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages', filter: col + '=eq.' + myId }, (payload) => {
          Chat._listeners.forEach(fn => { try { fn(payload); } catch (e) { console.warn(e); } });
        })
        .subscribe();
    } catch (e) { console.warn('listen', e); }
  }

  function stopListening() {
    if (Chat._channel && sb()) { try { sb().removeChannel(Chat._channel); } catch (e) {} }
    Chat._channel = null;
    Chat._listeners = [];
  }

  // ═══════════════════════════════════════════════════════
  //  FICHE CONTACT + CONVERSATION (style WhatsApp)
  // ═══════════════════════════════════════════════════════
  let sheet = null;
  let sheetCtx = null;

  function ensureSheet() {
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'pg-chat-sheet';
    sheet.className = 'pg-sheet';
    sheet.setAttribute('aria-hidden', 'true');
    sheet.innerHTML = `
      <div class="pg-sheet__backdrop" data-sheet="close"></div>
      <aside class="pg-sheet__panel" role="dialog" aria-modal="true" aria-label="Conversation">
        <header class="pg-sheet__head">
          <button type="button" class="pg-icon-btn" data-sheet="close" aria-label="Retour">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button type="button" class="pg-sheet__who" data-sheet="tab-profile" title="Voir le profil">
            <span class="pg-sheet__avatar"></span>
            <span class="pg-sheet__names">
              <span class="pg-sheet__name"></span>
              <span class="pg-sheet__sub"></span>
            </span>
          </button>
          <div class="pg-sheet__acts"></div>
        </header>
        <nav class="pg-sheet__tabs">
          <button type="button" class="pg-sheet__tab active" data-sheet="tab-chat">💬 Échanges</button>
          <button type="button" class="pg-sheet__tab" data-sheet="tab-profile">👤 Profil</button>
        </nav>
        <section class="pg-sheet__body pg-sheet__body--chat">
          <div class="pg-thread" aria-live="polite"></div>
        </section>
        <section class="pg-sheet__body pg-sheet__body--profile" hidden></section>
        <footer class="pg-composer">
          <div class="pg-composer__notice" hidden></div>
          <div class="pg-composer__row">
            <textarea rows="1" maxlength="2000" placeholder="Écrire un message sécurisé…" aria-label="Votre message"></textarea>
            <button type="button" class="pg-composer__send" data-sheet="send" aria-label="Envoyer">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
          <div class="pg-composer__secure">🔒 Messagerie interne Pharma-Garde — visible uniquement par vous deux</div>
        </footer>
      </aside>`;
    document.body.appendChild(sheet);

    const ta = sheet.querySelector('textarea');
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); doSend(); }
    });

    sheet.addEventListener('click', (e) => {
      const el = e.target.closest('[data-sheet]');
      if (!el) return;
      const a = el.getAttribute('data-sheet');
      if (a === 'close') closeSheet();
      if (a === 'send') doSend();
      if (a === 'tab-chat') switchTab('chat');
      if (a === 'tab-profile') switchTab('profile');
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet.classList.contains('open')) closeSheet(); });
    return sheet;
  }

  function switchTab(tab) {
    if (!sheet) return;
    sheet.querySelectorAll('.pg-sheet__tab').forEach(t => t.classList.toggle('active', t.getAttribute('data-sheet') === 'tab-' + tab));
    sheet.querySelector('.pg-sheet__body--chat').hidden = tab !== 'chat';
    sheet.querySelector('.pg-sheet__body--profile').hidden = tab !== 'profile';
    sheet.querySelector('.pg-composer').hidden = tab !== 'chat';
    if (tab === 'chat') scrollThreadBottom();
  }

  function scrollThreadBottom() {
    const body = sheet && sheet.querySelector('.pg-sheet__body--chat');
    if (body) requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
  }

  function renderThread() {
    if (!sheet || !sheetCtx) return;
    const ctx = sheetCtx;
    const items = [];
    (ctx.events || []).forEach(ev => items.push(Object.assign({ _kind: 'event' }, ev)));
    (ctx.messages || []).forEach(m => items.push({ _kind: 'msg', at: m.created_at, msg: m }));
    items.sort((a, b) => new Date(a.at) - new Date(b.at));

    const thread = sheet.querySelector('.pg-thread');
    if (items.length === 0) {
      thread.innerHTML = `<div class="pg-thread__empty">
        <div class="pg-thread__empty-ico">🤝</div>
        <strong>Aucun échange pour le moment</strong>
        <span>Les promotions, visites et messages échangés avec ${esc(ctx.contact.name)} s'afficheront ici, du plus ancien au plus récent.</span>
      </div>`;
      return;
    }

    let html = `<div class="pg-thread__intro">🔒 Historique complet et confidentiel de vos échanges avec <strong>${esc(ctx.contact.name)}</strong>.</div>`;
    let lastDay = '';
    items.forEach(it => {
      const d = new Date(it.at);
      if (isNaN(d)) return;
      const key = ymd(d);
      if (key !== lastDay) { lastDay = key; html += `<div class="pg-thread__day"><span>${esc(dayLabel(d))}</span></div>`; }
      if (it._kind === 'msg') {
        const mine = it.msg.sender_role === ctx.myRole;
        const ticks = mine ? `<span class="pg-bubble__ticks ${it.msg.read_at ? 'is-read' : ''}" title="${it.msg.read_at ? 'Lu' : 'Envoyé'}">✓✓</span>` : '';
        html += `<div class="pg-bubble ${mine ? 'pg-bubble--mine' : 'pg-bubble--theirs'}${it.msg._pending ? ' is-pending' : ''}">
          <div class="pg-bubble__text">${esc(it.msg.body).replace(/\n/g, '<br>')}</div>
          <div class="pg-bubble__meta">${fmtTime(d)} ${ticks}</div>
        </div>`;
      } else {
        const side = it.side === 'mine' ? 'pg-event--mine' : it.side === 'theirs' ? 'pg-event--theirs' : '';
        html += `<div class="pg-event ${side}">
          <div class="pg-event__ico">${it.icon || '📌'}</div>
          <div class="pg-event__main">
            <div class="pg-event__title">${esc(it.title || '')}</div>
            ${it.text ? `<div class="pg-event__text">${esc(it.text)}</div>` : ''}
            <div class="pg-event__foot">
              ${it.status ? `<span class="pg-chip pg-chip--${it.tone || 'gold'}">${esc(it.status)}</span>` : ''}
              <span class="pg-event__time">${fmtTime(d)}</span>
            </div>
          </div>
        </div>`;
      }
    });
    thread.innerHTML = html;
    scrollThreadBottom();
  }

  function renderProfile() {
    if (!sheet || !sheetCtx) return;
    const c = sheetCtx.contact;
    const stats = (sheetCtx.stats || []).map(s => `<div class="pg-pstat"><div class="pg-pstat__v">${esc(s.value)}</div><div class="pg-pstat__l">${esc(s.label)}</div></div>`).join('');
    const chips = (c.chips || []).map(ch => `<span class="pg-chip pg-chip--gold">🏭 ${esc(ch)}</span>`).join('');
    const details = (c.details || []).filter(d => d && d.value).map(d => `
      <div class="pg-pdetail"><span class="pg-pdetail__l">${esc(d.label)}</span><span class="pg-pdetail__v">${esc(d.value)}</span></div>`).join('');
    const tel = telLink(c.phone);
    const wa = waLink(c.whatsapp || c.phone, 'Bonjour ' + (c.name || '') + ', je vous contacte via Pharma-Garde.');
    sheet.querySelector('.pg-sheet__body--profile').innerHTML = `
      <div class="pg-profile">
        <div class="pg-profile__hero">
          ${avatarHtml({ url: c.avatarUrl, name: c.name, size: 112, variant: c.variant })}
          <h3 class="pg-profile__name">${esc(c.name)}</h3>
          ${c.subtitle ? `<div class="pg-profile__sub">${esc(c.subtitle)}</div>` : ''}
          ${chips ? `<div class="pg-profile__chips">${chips}</div>` : ''}
          ${c.firstContact ? `<div class="pg-profile__first">🕓 Premier contact : ${esc(fmtDate(c.firstContact))}</div>` : ''}
        </div>
        <div class="pg-profile__quick">
          <button type="button" class="pg-qbtn" data-sheet="tab-chat"><span>💬</span>Message</button>
          ${tel ? `<a class="pg-qbtn" href="${tel}"><span>📞</span>Appeler</a>` : ''}
          ${wa ? `<a class="pg-qbtn" href="${wa}" target="_blank" rel="noopener"><span>🟢</span>WhatsApp</a>` : ''}
          ${c.email ? `<a class="pg-qbtn" href="mailto:${esc(c.email)}"><span>✉️</span>Email</a>` : ''}
        </div>
        ${stats ? `<div class="pg-pstats">${stats}</div>` : ''}
        ${details ? `<div class="pg-pdetails">${details}</div>` : ''}
      </div>`;
  }

  function renderHead() {
    const c = sheetCtx.contact;
    sheet.querySelector('.pg-sheet__avatar').innerHTML = avatarHtml({ url: c.avatarUrl, name: c.name, size: 42, variant: c.variant });
    sheet.querySelector('.pg-sheet__name').textContent = c.name || '';
    sheet.querySelector('.pg-sheet__sub').textContent = c.subtitle || '';
    const tel = telLink(c.phone);
    const wa = waLink(c.whatsapp || c.phone);
    sheet.querySelector('.pg-sheet__acts').innerHTML =
      (tel ? `<a class="pg-icon-btn" href="${tel}" title="Appeler" aria-label="Appeler">📞</a>` : '') +
      (wa ? `<a class="pg-icon-btn" href="${wa}" target="_blank" rel="noopener" title="WhatsApp" aria-label="WhatsApp">🟢</a>` : '');
  }

  async function doSend() {
    if (!sheet || !sheetCtx) return;
    const ta = sheet.querySelector('textarea');
    const body = ta.value.trim();
    if (!body) return;
    const ctx = sheetCtx;
    const temp = { id: 'tmp_' + Date.now(), body, sender_role: ctx.myRole, created_at: new Date().toISOString(), _pending: true };
    ctx.messages = (ctx.messages || []).concat([temp]);
    ta.value = ''; ta.style.height = 'auto';
    renderThread();
    try {
      const saved = await sendMessage(ctx.pharmacyId, ctx.delegateId, ctx.myRole, body);
      ctx.messages = ctx.messages.map(m => m.id === temp.id ? saved : m);
      renderThread();
      if (typeof ctx.onSent === 'function') ctx.onSent(saved);
    } catch (e) {
      ctx.messages = ctx.messages.filter(m => m.id !== temp.id);
      renderThread();
      ta.value = body;
      toast('❌ ' + (e.message || 'Message non envoyé'), 'error');
    }
  }

  /**
   * Ouvre la fiche contact / conversation.
   * opts: { myRole, pharmacyId, delegateId, contact:{name,subtitle,avatarUrl,variant,chips,phone,whatsapp,email,details,firstContact},
   *         events:[{at,icon,title,text,status,tone,side}], stats:[{label,value}], tab:'chat'|'profile', onSent, onClose }
   */
  async function openConversation(opts) {
    ensureSheet();
    sheetCtx = Object.assign({ messages: [] }, opts);
    renderHead();
    renderProfile();
    renderThread();
    switchTab(opts.tab || 'chat');
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pg-sheet-open');

    const notice = sheet.querySelector('.pg-composer__notice');
    const ta = sheet.querySelector('textarea');
    const sendBtn = sheet.querySelector('.pg-composer__send');
    const ok = await probeChat();
    notice.hidden = ok;
    ta.disabled = !ok; sendBtn.disabled = !ok;
    if (!ok) {
      const wa = waLink(opts.contact.whatsapp || opts.contact.phone);
      notice.innerHTML = '⚠️ La messagerie interne est momentanément indisponible.' + (wa ? ` <a href="${wa}" target="_blank" rel="noopener">Écrire sur WhatsApp →</a>` : '');
      return;
    }

    const myCtx = sheetCtx;
    const msgs = await fetchThread(opts.pharmacyId, opts.delegateId);
    if (sheetCtx !== myCtx) return;
    sheetCtx.messages = msgs;
    renderThread();
    await markRead(opts.pharmacyId, opts.delegateId, opts.myRole);
    if (typeof opts.onRead === 'function') opts.onRead();
    setTimeout(() => { if (window.matchMedia('(min-width: 768px)').matches) ta.focus(); }, 250);
  }

  function updateConversation(patch) {
    if (!sheetCtx) return;
    Object.assign(sheetCtx, patch || {});
    if (patch && patch.contact) { renderHead(); renderProfile(); }
    if (patch && patch.stats) renderProfile();
    renderThread();
  }

  /** À appeler depuis listen() : injecte un message entrant si la conversation est ouverte. */
  function handleIncoming(payload) {
    if (!sheet || !sheetCtx || !sheet.classList.contains('open')) return false;
    const m = payload.new || {};
    if (m.pharmacy_id !== sheetCtx.pharmacyId || m.delegate_id !== sheetCtx.delegateId) return false;
    const list = sheetCtx.messages || [];
    const idx = list.findIndex(x => x.id === m.id);
    if (idx >= 0) list[idx] = m; else list.push(m);
    sheetCtx.messages = list;
    renderThread();
    if (payload.eventType === 'INSERT' && m.sender_role !== sheetCtx.myRole) markRead(m.pharmacy_id, m.delegate_id, sheetCtx.myRole);
    return true;
  }

  function closeSheet() {
    if (!sheet) return;
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('pg-sheet-open');
    const cb = sheetCtx && sheetCtx.onClose;
    sheetCtx = null;
    if (typeof cb === 'function') cb();
  }

  function currentConversation() {
    return sheetCtx ? { pharmacyId: sheetCtx.pharmacyId, delegateId: sheetCtx.delegateId } : null;
  }

  // ═══════════════════════════════════════════════════════
  //  EXPORT PDF SÉLECTIF
  // ═══════════════════════════════════════════════════════
  /**
   * Ouvre une boîte de dialogue de sélection puis appelle onExport(keys).
   * options: [{ key, label, desc, checked }]
   */
  function openExportDialog(cfg) {
    let modal = document.getElementById('pg-export-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'pg-export-modal';
      modal.className = 'pg-modal';
      document.body.appendChild(modal);
    }
    const opts = (cfg.options || []).map(o => `
      <label class="pg-check">
        <input type="checkbox" value="${esc(o.key)}" ${o.checked === false ? '' : 'checked'}>
        <span class="pg-check__box"></span>
        <span class="pg-check__txt"><strong>${esc(o.label)}</strong>${o.desc ? `<small>${esc(o.desc)}</small>` : ''}</span>
      </label>`).join('');
    modal.innerHTML = `<div class="pg-modal__box" role="dialog" aria-modal="true">
      <button type="button" class="pg-icon-btn pg-modal__close" data-close aria-label="Fermer">✕</button>
      <div class="pg-export__head">
        <span class="pg-export__ico">📄</span>
        <div><h3>${esc(cfg.title || 'Exporter en PDF')}</h3><p>${esc(cfg.subtitle || 'Choisissez les informations à inclure dans le rapport.')}</p></div>
      </div>
      ${cfg.periodLabel ? `<div class="pg-export__period">🔎 Période : <strong>${esc(cfg.periodLabel)}</strong></div>` : ''}
      <div class="pg-export__list">${opts}</div>
      <div class="pg-export__actions">
        <button type="button" class="pg-btn pg-btn--ghost" data-close>Annuler</button>
        <button type="button" class="pg-btn pg-btn--primary" data-export>⬇️ Télécharger le PDF</button>
      </div>
    </div>`;
    modal.onclick = (e) => {
      if (e.target === modal || e.target.closest('[data-close]')) { modal.classList.remove('open'); return; }
      if (e.target.closest('[data-export]')) {
        const keys = Array.from(modal.querySelectorAll('input[type=checkbox]:checked')).map(i => i.value);
        if (keys.length === 0) { toast('Sélectionnez au moins une rubrique.', 'error'); return; }
        modal.classList.remove('open');
        cfg.onExport(keys);
      }
    };
    modal.classList.add('open');
  }

  /**
   * Génère et télécharge un rapport PDF professionnel.
   * report: { title, subtitle, owner, period, kpis:[{label,value}], sections:[{heading, columns:[], rows:[[]], empty}], fileName }
   */
  async function downloadReport(report) {
    const r = report || {};
    const now = new Date();
    const kpis = (r.kpis || []).map(k => `<td style="padding:10px;border:1px solid #d1fae5;text-align:center;background:#f0fdf4;">
      <div style="font-size:20px;font-weight:800;color:#047857;">${esc(k.value)}</div>
      <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.5px;">${esc(k.label)}</div></td>`).join('');
    const sections = (r.sections || []).map(s => {
      const head = (s.columns || []).map(c => `<th style="background:#064e3b;color:#fff;padding:7px 8px;text-align:left;font-size:10.5px;">${esc(c)}</th>`).join('');
      const rows = (s.rows || []).length
        ? s.rows.map((row, i) => `<tr style="background:${i % 2 ? '#f8fafc' : '#fff'};">${row.map(c => `<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:10.5px;color:#0f172a;vertical-align:top;">${esc(c)}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${(s.columns || []).length || 1}" style="padding:12px;text-align:center;color:#64748b;font-style:italic;font-size:11px;">${esc(s.empty || 'Aucune donnée pour cette période.')}</td></tr>`;
      return `<div style="margin-top:18px;page-break-inside:auto;">
        <h2 style="font-size:13.5px;color:#b45309;margin:0 0 6px;border-left:4px solid #f59e0b;padding-left:8px;">${esc(s.heading)}</h2>
        <table style="width:100%;border-collapse:collapse;"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
      </div>`;
    }).join('');

    const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0f172a;padding:22px 26px;width:760px;">
      <table style="width:100%;border-collapse:collapse;border-bottom:3px solid #059669;padding-bottom:10px;"><tr>
        <td style="vertical-align:middle;">
          <div style="display:inline-block;width:34px;height:34px;background:#059669;border-radius:8px;position:relative;vertical-align:middle;">
            <div style="position:absolute;left:14px;top:7px;width:6px;height:20px;background:#fff;border-radius:2px;"></div>
            <div style="position:absolute;left:7px;top:14px;width:20px;height:6px;background:#fff;border-radius:2px;"></div>
          </div>
          <span style="font-size:20px;font-weight:800;color:#064e3b;vertical-align:middle;margin-left:8px;">Pharma-Garde</span>
          <div style="font-size:10px;font-weight:800;color:#b45309;letter-spacing:1px;text-transform:uppercase;margin-top:4px;">${esc(r.space || '')}</div>
        </td>
        <td style="text-align:right;font-size:10.5px;color:#475569;vertical-align:top;">
          Édité le ${esc(now.toLocaleDateString('fr-FR'))} à ${esc(fmtTime(now))}<br>${esc(r.owner || '')}
        </td></tr></table>
      <h1 style="font-size:19px;margin:16px 0 2px;color:#064e3b;">${esc(r.title || 'Rapport')}</h1>
      <div style="font-size:11.5px;color:#475569;">${esc(r.subtitle || '')}${r.period ? ' · <strong style="color:#b45309;">' + esc(r.period) + '</strong>' : ''}</div>
      ${kpis ? `<table style="width:100%;border-collapse:collapse;margin-top:14px;"><tr>${kpis}</tr></table>` : ''}
      ${sections}
      <div style="margin-top:24px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:9.5px;color:#64748b;text-align:center;">
        Document confidentiel généré par Pharma-Garde · Support : ${DEV.phoneDisplay} · ${DEV.email}
      </div>
    </div>`;

    const fileName = (r.fileName || 'Rapport_PharmaGarde') + '_' + ymd(now) + '.pdf';
    if (typeof html2pdf !== 'undefined') {
      const holder = document.createElement('div');
      holder.style.cssText = 'position:fixed;left:-10000px;top:0;background:#fff;';
      holder.innerHTML = html;
      document.body.appendChild(holder);
      try {
        await html2pdf().set({
          margin: [8, 6, 10, 6], filename: fileName,
          image: { type: 'jpeg', quality: 0.96 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] },
        }).from(holder.firstElementChild).save();
        toast('✅ Rapport PDF téléchargé', 'success');
      } catch (e) {
        console.error(e);
        printFallback(html, fileName);
      } finally { holder.remove(); }
    } else {
      printFallback(html, fileName);
    }
  }

  function printFallback(html, title) {
    const w = window.open('', '_blank');
    if (!w) { toast('Autorisez les fenêtres pop-up pour imprimer le rapport.', 'error'); return; }
    w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title></head><body style="margin:0;">${html}<script>setTimeout(function(){window.print();},400);<\/script></body></html>`);
    w.document.close();
  }

  // ═══════════════════════════════════════════════════════
  //  EXPORT PUBLIC
  // ═══════════════════════════════════════════════════════
  window.PGConnect = {
    DEV,
    esc, initials, avatarHtml, fmtDate, fmtTime, fmtDateTime, timeAgo, dayLabel, waLink, telLink, toast,
    // Photo
    processFile, pickFromGallery, captureFromCamera,
    // Période
    renderPeriodFilter, periodMatch, periodRange, periodLabel,
    // Support
    supportCardHtml, mountSupport, openSupport,
    // Messagerie
    chat: {
      probe: probeChat, fetchThread, fetchInbox, summarizeInbox, send: sendMessage, markRead, listen, stopListening,
      get available() { return Chat.available; },
    },
    openConversation, updateConversation, handleIncoming, closeConversation: closeSheet, currentConversation,
    // PDF
    openExportDialog, downloadReport,
  };
})();
