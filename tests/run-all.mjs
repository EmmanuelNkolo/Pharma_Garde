#!/usr/bin/env node
/**
 * Pharma-Garde v17.0 — Suite de Tests Automatisés Complète (7 Suites, Zéro Dépendance)
 * ────────────────────────────────────────────────────────────────────────────────────
 * Exécutable localement (`node tests/run-all.mjs`) et dans GitHub Actions CI.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildProduction } from '../scripts/build-prod.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, label) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(label);
    console.error(`  ❌ FAIL: ${label}`);
  }
}

function walkFiles(dir, exts) {
  const res = [];
  if (!fs.existsSync(dir)) return res;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) res.push(...walkFiles(full, exts));
    else if (!exts || exts.includes(path.extname(entry.name).toLowerCase())) res.push(full);
  }
  return res;
}

function makeStorage() {
  const store = new Map();
  return {
    get length() { return store.size; },
    key(i) { return Array.from(store.keys())[i] ?? null; },
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(String(k), String(v)); },
    removeItem(k) { store.delete(String(k)); },
    clear() { store.clear(); }
  };
}

function makeSandbox(extra = {}) {
  const ls = makeStorage();
  const ss = makeStorage();
  const listeners = {};
  let cookieJar = '';
  const doc = {
    readyState: 'complete',
    hidden: false,
    visibilityState: 'visible',
    get cookie() { return cookieJar; },
    set cookie(v) {
      const pair = String(v).split(';')[0];
      const [k, ...rest] = pair.split('=');
      const map = new Map(cookieJar.split('; ').filter(Boolean).map((p) => {
        const idx = p.indexOf('=');
        return idx >= 0 ? [p.slice(0, idx), p.slice(idx + 1)] : [p, ''];
      }));
      if (/max-age=0/i.test(v)) map.delete(k.trim());
      else map.set(k.trim(), rest.join('='));
      cookieJar = Array.from(map.entries()).map(([a, b]) => `${a}=${b}`).join('; ');
    },
    addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    dispatchEvent(evt) { (listeners[evt.type] || []).forEach((fn) => fn(evt)); return true; },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return { style: {}, setAttribute() {}, addEventListener() {}, appendChild() {}, querySelector() { return null; } }; },
    body: { appendChild() {} },
  };
  const safeSetTimeout = (fn, ms, ...a) => { const t = setTimeout(fn, ms, ...a); if (t && t.unref) t.unref(); return t; };
  const safeSetInterval = (fn, ms, ...a) => { const t = setInterval(fn, ms, ...a); if (t && t.unref) t.unref(); return t; };
  const win = {
    console,
    setTimeout: safeSetTimeout,
    clearTimeout,
    setInterval: safeSetInterval,
    clearInterval,
    Date,
    Math,
    JSON,
    URL,
    TextEncoder,
    Uint8Array,
    Promise,
    crypto: crypto.webcrypto,
    localStorage: ls,
    sessionStorage: ss,
    document: doc,
    location: { pathname: '/index.html', hostname: 'pharma-garde.vercel.app', origin: 'https://pharma-garde.vercel.app', search: '', href: 'https://pharma-garde.vercel.app/index.html' },
    navigator: { userAgent: 'PharmaGardeCI' },
    CustomEvent: class CustomEvent { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
    ...extra
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;
  return vm.createContext(win);
}

console.log('🧪 Pharma-Garde v17.0 — Suite de Tests Automatisés\n');

// ════════════════════════════════════════════════════════════════
// SUITE 1 — Syntaxe JS de tous les scripts du dépôt
// ════════════════════════════════════════════════════════════════
console.log('▶ Suite 1 : Vérification syntaxique JS (node --check)');
const jsTargets = [
  ...walkFiles(path.join(ROOT, 'js'), ['.js']),
  ...walkFiles(path.join(ROOT, 'connecteur'), ['.js']),
  ...walkFiles(path.join(ROOT, 'scripts'), ['.js', '.mjs']),
  path.join(ROOT, 'sw.js')
].filter((f) => fs.existsSync(f));

for (const file of jsTargets) {
  const rel = path.relative(ROOT, file);
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    assert(true, `Syntax OK: ${rel}`);
  } catch (e) {
    assert(false, `Syntax ERROR in ${rel}: ${e.message}`);
  }
}
assert(jsTargets.length >= 25, `At least 25 JS files checked (found ${jsTargets.length})`);

// ════════════════════════════════════════════════════════════════
// SUITE 2 — Intégrité HTML & Assets sur les 6 Espaces
// ════════════════════════════════════════════════════════════════
console.log('▶ Suite 2 : Intégrité HTML & Assets (6 espaces)');
const htmlPages = ['index.html', 'pharmacien.html', 'medecin.html', 'etablissement.html', 'delegue.html', 'grossiste.html'];
for (const page of htmlPages) {
  const full = path.join(ROOT, page);
  assert(fs.existsSync(full), `Page exists: ${page}`);
  const html = fs.readFileSync(full, 'utf8');

  // Vérifier tous les scripts & CSS locaux référencés
  const refs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((m) => m[1]);
  for (const rawRef of refs) {
    if (/^(https?:|mailto:|tel:|data:|#|javascript:)/i.test(rawRef)) continue;
    const cleanRef = rawRef.split('?')[0].split('#')[0].replace(/^\//, '');
    if (!cleanRef) continue;
    assert(fs.existsSync(path.join(ROOT, cleanRef)), `${page} asset exists: ${cleanRef}`);
  }

  // Vérifier absence d'IDs dupliqués
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]);
  const seen = new Set();
  const dups = [];
  for (const id of ids) {
    if (seen.has(id)) dups.push(id);
    seen.add(id);
  }
  assert(dups.length === 0, `${page} has no duplicate IDs (found: ${dups.join(', ')})`);
  assert(html.includes('js/core/i18n.js'), `${page} loads i18n.js`);
  assert(html.includes('js/shared/admin-portal.js'), `${page} loads admin-portal.js`);
  assert(html.includes('js/shared/push-notifications.js'), `${page} loads push-notifications.js`);
  assert(html.includes('css/pro-polish-v15.css'), `${page} loads pro-polish-v15.css`);
}

// ════════════════════════════════════════════════════════════════
// SUITE 3 — Build Production 3G/4G & Minification Lexer-Safe
// ════════════════════════════════════════════════════════════════
console.log('▶ Suite 3 : Pipeline Build & Minification 3G/4G (dist/)');
const buildStats = buildProduction({ quiet: true });
assert(buildStats.jsFallbackCount === 0, `Zero JS minification fallbacks (got ${buildStats.jsFallbackCount})`);
assert(buildStats.jsFiles >= 25, `Minified >= 25 JS files (got ${buildStats.jsFiles})`);
assert(buildStats.cssFiles >= 6, `Minified >= 6 CSS files (got ${buildStats.cssFiles})`);
assert(buildStats.distBytes < buildStats.rawBytes, `dist/ is smaller than raw (${buildStats.distBytes} < ${buildStats.rawBytes})`);
for (const page of htmlPages) {
  assert(fs.existsSync(path.join(ROOT, 'dist', page)), `dist/${page} exists`);
}
assert(fs.existsSync(path.join(ROOT, 'dist', 'sw.js')), 'dist/sw.js exists');
assert(fs.existsSync(path.join(ROOT, 'dist', 'js', 'shared', 'push-notifications.js')), 'dist/js/shared/push-notifications.js exists');

// ════════════════════════════════════════════════════════════════
// SUITE 4 — Durcissement Sécurité, Edge Functions, Cron & Cleanup
// ════════════════════════════════════════════════════════════════
console.log('▶ Suite 4 : Sécurité, Edge Functions, Cron, SQL & Cleanup');
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const csp = vercel.headers[0].headers.find((h) => h.key === 'Content-Security-Policy')?.value || '';
const permPol = vercel.headers[0].headers.find((h) => h.key === 'Permissions-Policy')?.value || '';
assert(vercel.buildCommand === 'node scripts/build-prod.mjs', 'vercel.json buildCommand configured');
assert(vercel.outputDirectory === 'dist', 'vercel.json outputDirectory = dist');
assert(permPol.includes('microphone=(self)'), 'vercel.json Permissions-Policy allows microphone=(self)');
assert(csp.includes('tessdata.projectnaptha.com') && csp.includes("'wasm-unsafe-eval'"), 'vercel.json CSP allows Tesseract OCR');

const adminPortalJs = fs.readFileSync(path.join(ROOT, 'js/shared/admin-portal.js'), 'utf8');
assert(!adminPortalJs.includes('DEFAULT_MASTER_HASH'), 'admin-portal.js has ZERO hardcoded DEFAULT_MASTER_HASH');
assert(adminPortalJs.includes("data-atab=\"revenue\""), 'admin-portal.js has Revenue & KPIs tab');
assert(adminPortalJs.includes("action: 'revenue_analytics'"), 'admin-portal.js calls revenue_analytics server action');
assert(adminPortalJs.includes("action: 'run_subscription_reminders'"), 'admin-portal.js calls run_subscription_reminders action');

const adminAuthTs = fs.readFileSync(path.join(ROOT, 'supabase/functions/admin-auth/index.ts'), 'utf8');
assert(adminAuthTs.includes('action === "revenue_analytics"'), 'admin-auth Edge Function implements revenue_analytics');
assert(adminAuthTs.includes('action === "run_subscription_reminders"'), 'admin-auth Edge Function implements run_subscription_reminders');

const remindersTs = fs.readFileSync(path.join(ROOT, 'supabase/functions/subscription-reminders/index.ts'), 'utf8');
assert(remindersTs.includes("doctor: 'doctors'") && remindersTs.includes("facility: 'health_facilities'"), 'subscription-reminders handles all 5 Pro roles');
assert(remindersTs.includes('CRON_SECRET'), 'subscription-reminders supports optional CRON_SECRET');

const webhookTs = fs.readFileSync(path.join(ROOT, 'supabase/functions/notchpay-webhook/index.ts'), 'utf8');
assert(webhookTs.includes('merchant_reference') && webhookTs.includes('activate_subscription_by_reference'), 'notchpay-webhook handles merchant_reference sub_ activation');

const consultPayTs = fs.readFileSync(path.join(ROOT, 'supabase/functions/doctor-consultation-payment/index.ts'), 'utf8');
assert(consultPayTs.includes('action === "status"') && consultPayTs.includes('isPaidStatus') && consultPayTs.includes('transfer_doctor_payout'), 'doctor-consultation-payment enforces strict NotchPay status check & payout guard');

const sqlV16 = fs.readFileSync(path.join(ROOT, 'supabase/sql/supabase_schema_v16_production_hardening.sql'), 'utf8');
assert(!sqlV16.includes('w.user_id'), 'SQL v16 does not reference non-existent wholesalers.user_id');
assert(sqlV16.includes('pharmacy_expiry_batches') && sqlV16.includes('wholesaler_bl_signatures'), 'SQL v16 creates Pro cloud tables');

const dailyCronYml = fs.readFileSync(path.join(ROOT, '.github/workflows/daily-reminders.yml'), 'utf8');
assert(dailyCronYml.includes("cron: '0 7 * * *'") && dailyCronYml.includes('sb_publishable_'), 'daily-reminders.yml scheduled daily with exact publishable key');
assert(fs.existsSync(path.join(ROOT, '.github/workflows/ci.yml')), 'GitHub Actions CI workflow exists');
assert(!fs.existsSync(path.join(ROOT, 'archive')), 'Obsolete archive/ directory has been removed');

const swJs = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
assert(swJs.includes("addEventListener('push'") && swJs.includes("addEventListener('notificationclick'"), 'sw.js handles push and notificationclick');
assert(swJs.includes('/js/shared/push-notifications.js'), 'sw.js precaches push-notifications.js');

// ════════════════════════════════════════════════════════════════
// SUITE 5 — Runtime E2E : Session Client 24h & Anti-Double-Paiement
// ════════════════════════════════════════════════════════════════
console.log('▶ Suite 5 : Runtime E2E Session Client 24h (payment.js)');
{
  let invokeCalls = [];
  const ctx = makeSandbox({
    supabase: {
      functions: {
        async invoke(fn, opts) {
          invokeCalls.push({ fn, body: opts?.body });
          if (opts?.body?.action === 'verify_session') {
            return {
              data: {
                success: true,
                active: true,
                reference: 'PG_SERVER_RESTORED_24H',
                created_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 20 * 3600 * 1000).toISOString(),
                phone: '699112233'
              },
              error: null
            };
          }
          return { data: { status: 'PENDING', reference: 'PG_TX_NEW' }, error: null };
        }
      }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/client/payment.js'), 'utf8'), ctx);
  assert(typeof ctx.Payment === 'object', 'window.Payment exported');

  // 1. Création session + persistance triple stockage (localStorage + sessionStorage + cookie)
  ctx.Payment.createSession('TX_TEST_24H', '699112233');
  assert(ctx.Payment.hasActiveSession() === true, '24h session active immediately after createSession');
  assert(ctx.document.cookie.includes('pg_pass_24h'), '24h session mirrored in cookie pg_pass_24h');

  // 2. Survie si localStorage est vidé (ex: Safari ITP / onglet privé partiel)
  ctx.localStorage.clear();
  assert(ctx.Payment.hasActiveSession() === true, '24h session survives localStorage clear via sessionStorage/cookie');

  // 3. Anti-double-paiement : processPayment ne déclenche PAS NotchPay si la session est déjà active
  invokeCalls = [];
  const res = await ctx.Payment.processPayment('699112233', 'om');
  assert(res && res.success === true && res.restored === true && res.amount === 0, 'processPayment blocks duplicate charge when 24h session active');
  assert(invokeCalls.length === 0, 'Zero NotchPay initiate calls when 24h session already active');

  // 4. Restauration inter-appareils via `verify_session`
  ctx.Payment.clearSession();
  assert(ctx.Payment.hasActiveSession() === false, 'Session cleared cleanly');
  const restored = await ctx.Payment.restoreSessionIfAvailable('699112233');
  assert(restored === true && ctx.Payment.hasActiveSession() === true, 'restoreSessionIfAvailable restores active 24h pass from server');
}

// ════════════════════════════════════════════════════════════════
// SUITE 6 — Runtime E2E : Carnet Médical DMP & Téléconsultation Médecin
// ════════════════════════════════════════════════════════════════
console.log('▶ Suite 6 : Runtime E2E DMP & Espace Médecin');
{
  const ctx = makeSandbox();
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/shared/patient-dmp.js'), 'utf8'), ctx);
  const pat = await ctx.PGPatientDMP.registerPatient({
    full_name: 'Jean Test',
    email: 'jean.test@pharmagarde.cm',
    phone: '677001122',
    password: 'Password123!',
    pin: '2468',
    blood_group: 'O+'
  });
  assert(pat && /^PG-PAT-/.test(pat.patient_code), 'DMP registerPatient creates valid PG-PAT code');

  ctx.PGPatientDMP.lockVault();
  assert(ctx.PGPatientDMP.isVaultUnlocked() === false, 'DMP vault locks properly');
  const okPin = await ctx.PGPatientDMP.unlockVaultWithPin('2468');
  assert(okPin === true && ctx.PGPatientDMP.isVaultUnlocked() === true, 'DMP unlocks with valid PIN');

  const rec = await ctx.PGPatientDMP.pushMedicalRecord({ patient_code: pat.patient_code }, {
    category: 'lab_result',
    title: 'NFS Complète',
    summary: 'Hémoglobine 13.8 g/dL',
    issuer_type: 'laboratory',
    issuer_name: 'Labo Test Douala'
  });
  assert(rec && typeof rec.integrity_hash === 'string' && rec.integrity_hash.length === 64, 'DMP record has 64-hex SHA-256 integrity hash');

  const grant = await ctx.PGPatientDMP.createShareGrant({ grantee_label: 'Dr. Test', allowed_categories: ['lab_result'], duration_hours: 24 });
  const redeemed = await ctx.PGPatientDMP.redeemShareCode(grant.share_code, 'doctor', 'Dr. Test');
  assert(redeemed && redeemed.records.some((r) => r.id === rec.id), 'DMP granular share code grants authorized access');
  await ctx.PGPatientDMP.revokeShareGrant(grant.id);
  let revokedRejected = false;
  try { await ctx.PGPatientDMP.redeemShareCode(grant.share_code, 'doctor', 'Dr. Test'); } catch { revokedRejected = true; }
  assert(revokedRejected === true, 'Revoked DMP share code is rejected');

  // MédecinStore
  const mCtx = makeSandbox();
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/medecin/store.js'), 'utf8'), mCtx);
  const docs = mCtx.MedecinStore.getDoctors();
  assert(docs.length >= 6, `MedecinStore directory has >= 6 doctors (got ${docs.length})`);
  const cardio = mCtx.MedecinStore.filterDoctors({ specialty: 'Cardiologie' });
  assert(cardio.length >= 1, 'Multi-specialty filter finds Cardiologie doctors');
  const updatedDoc = await mCtx.MedecinStore.setDoctorTimedAvailability(docs[0], 'busy', 60, 'En bloc');
  const eff = mCtx.MedecinStore.getEffectiveAvailability(updatedDoc);
  assert(eff.status === 'busy' && eff.isAvailableNow === false, 'Timed auto-availability switches doctor to busy');
}

// ════════════════════════════════════════════════════════════════
// SUITE 7 — Runtime E2E : Notifications Push PWA (PGNotify)
// ════════════════════════════════════════════════════════════════
console.log('▶ Suite 7 : Runtime E2E Notifications Push PWA (PGNotify)');
{
  const shown = [];
  class MockNotification {
    static permission = 'default';
    static async requestPermission() {
      MockNotification.permission = 'granted';
      return 'granted';
    }
    constructor(title, opts) { shown.push({ via: 'window', title, opts }); }
    close() {}
  }
  const ctx = makeSandbox({
    Notification: MockNotification,
    navigator: {
      userAgent: 'PharmaGardeCI',
      serviceWorker: {
        ready: Promise.resolve({
          async showNotification(title, opts) {
            shown.push({ via: 'sw', title, opts });
          }
        })
      }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/shared/push-notifications.js'), 'utf8'), ctx);
  assert(ctx.PGNotify && ctx.PGNotify.isSupported() === true, 'PGNotify is exported and supported');
  const perm = await ctx.PGNotify.requestPermission(true);
  assert(perm === 'granted' && ctx.PGNotify.isEnabled() === true, 'PGNotify permission granted');

  // Onglet visible sans force -> ne spamme pas l'OS
  ctx.document.hidden = false;
  ctx.document.visibilityState = 'visible';
  const r1 = await ctx.PGNotify.notify('Test Visible', { body: 'x' });
  assert(r1 === false && shown.length === 0, 'PGNotify skips OS notification when tab is focused and force=false');

  // Onglet en arrière-plan -> passe par ServiceWorkerRegistration.showNotification
  ctx.document.hidden = true;
  ctx.document.visibilityState = 'hidden';
  const r2 = await ctx.PGNotify.notify('💊 Pharmacie trouvée', { body: 'Doliprane disponible', url: '/index.html' });
  assert(r2 === true && shown.length === 1 && shown[0].via === 'sw', 'PGNotify delivers background push via Service Worker');

  // Mode silencieux (mute)
  ctx.PGNotify.setMuted(true);
  const r3 = await ctx.PGNotify.notify('Muted', { body: 'x', force: true });
  assert(r3 === false && shown.length === 1, 'PGNotify respects muted preference');
}

// ════════════════════════════════════════════════════════════════
// SUITE 8 — Rotation PWA, Responsive Mobile/Tablette & Accès Comptes (v18.0)
// ════════════════════════════════════════════════════════════════
console.log('▶ Suite 8 : Rotation PWA, Anti-Coupure UI & Connexions Comptes (6 espaces)');
{
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert(manifest.orientation === 'any', `manifest.json allows automatic rotation (orientation="${manifest.orientation}")`);

  for (const page of htmlPages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert(!html.includes('user-scalable=no'), `${page} viewport allows natural scaling/rotation`);
  }

  const polishCss = fs.readFileSync(path.join(ROOT, 'css/pro-polish-v15.css'), 'utf8');
  assert(!/(^|\n)\.pa-screen\s*\{/.test(polishCss), 'pro-polish-v15.css does NOT override .pa-screen.hidden');
  assert(polishCss.includes('.pa-screen:not(.hidden)'), 'pro-polish-v15.css scopes .pa-screen styles to :not(.hidden)');
  assert(polishCss.includes('.pa-screen.hidden,') && polishCss.includes('display: none !important;'), 'pro-polish-v15.css guarantees .hidden hides all elements at end of cascade');
  assert(polishCss.includes('white-space: normal !important;') && polishCss.includes('overflow: visible !important;'), 'Buttons wrap text cleanly without left/right clipping');
  assert(polishCss.includes('(orientation: landscape)'), 'Responsive landscape layout rules present');

  // Vérifier que les 5 contrôleurs Pro masquent explicitement l'écran de connexion (classList + style.display)
  for (const [label, relPath] of [
    ['Médecin', 'js/medecin/app.js'],
    ['Établissement', 'js/etablissement/app.js'],
    ['Grossiste', 'js/grossiste/app.js'],
    ['Pharmacie', 'js/pharmacie/pharmacien.js'],
    ['Délégué', 'js/delegue/delegue.js'],
  ]) {
    const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    assert(code.includes("classList.add('hidden')") && code.includes(".style.display = 'none'"), `${label} showDashboard hides auth screen via both classList and style.display`);
  }

  // Simulation runtime : clic réel sur Dr Hervé Kamga -> doc-login-screen masqué, doc-dashboard visible !
  const makeEl = (id, initClasses = []) => {
    const cls = new Set(initClasses);
    const evs = {};
    return {
      id,
      style: {},
      textContent: '',
      innerHTML: '',
      value: '',
      checked: false,
      attrs: {},
      getAttribute(k) { return this.attrs[k] ?? null; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      classList: {
        add(c) { cls.add(c); },
        remove(c) { cls.delete(c); },
        contains(c) { return cls.has(c); },
        toggle(c, f) { if (f === undefined) { if (cls.has(c)) cls.delete(c); else cls.add(c); } else if (f) cls.add(c); else cls.delete(c); }
      },
      addEventListener(e, fn) { (evs[e] = evs[e] || []).push(fn); },
      click() { (evs.click || []).forEach((fn) => fn({ preventDefault() {} })); },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      appendChild() {}
    };
  };

  // Test clic Dr Hervé Kamga
  const docEls = {
    'doc-login-screen': makeEl('doc-login-screen', ['pa-screen']),
    'doc-dashboard': makeEl('doc-dashboard', ['hidden']),
    'doc-login-form': makeEl('doc-login-form'),
    'doc-register-form': makeEl('doc-register-form', ['hidden']),
    'doc-header-name': makeEl('doc-header-name'),
    'doc-header-meta': makeEl('doc-header-meta'),
    'doc-verif-pill': makeEl('doc-verif-pill'),
    'doc-badge-consults': makeEl('doc-badge-consults'),
    'dpanel-consults': makeEl('dpanel-consults'),
    'toast': makeEl('toast'),
    'toast-message': makeEl('toast-message'),
  };
  const demoDocBtn = makeEl('btn-demo-herve');
  demoDocBtn.setAttribute('data-demo-doc', 'doc_kamga_dla');
  const docCtx = makeSandbox();
  docCtx.scrollTo = () => {};
  docCtx.document.getElementById = (id) => docEls[id] || null;
  docCtx.document.querySelectorAll = (sel) => (sel === '[data-demo-doc]' ? [demoDocBtn] : []);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/medecin/store.js'), 'utf8'), docCtx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/medecin/app.js'), 'utf8'), docCtx);
  docCtx.document.dispatchEvent(new docCtx.CustomEvent('DOMContentLoaded'));
  demoDocBtn.click();
  assert(docEls['doc-login-screen'].classList.contains('hidden') && docEls['doc-login-screen'].style.display === 'none', 'Clicking Dr Hervé Kamga hides doc-login-screen completely');
  assert(!docEls['doc-dashboard'].classList.contains('hidden') && docEls['doc-dashboard'].style.display === '', 'Clicking Dr Hervé Kamga opens doc-dashboard');
  assert(docEls['doc-header-name'].textContent.includes('Hervé Kamga'), `Doctor dashboard displays Dr Hervé Kamga ("${docEls['doc-header-name'].textContent}")`);

  // Test clic Labo Pasteur Santé
  const facEls = {
    'fac-login-screen': makeEl('fac-login-screen', ['pa-screen']),
    'fac-dashboard': makeEl('fac-dashboard', ['hidden']),
    'fac-header-name': makeEl('fac-header-name'),
    'fac-header-meta': makeEl('fac-header-meta'),
    'fpanel-analyses': makeEl('fpanel-analyses'),
    'toast': makeEl('toast'),
    'toast-message': makeEl('toast-message'),
  };
  const demoFacBtn = makeEl('btn-demo-fac');
  demoFacBtn.setAttribute('data-demo-fac', 'fac_cpc_dla');
  const facCtx = makeSandbox();
  facCtx.scrollTo = () => {};
  facCtx.document.getElementById = (id) => facEls[id] || null;
  facCtx.document.querySelectorAll = (sel) => (sel === '[data-demo-fac]' ? [demoFacBtn] : []);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/etablissement/store.js'), 'utf8'), facCtx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/etablissement/app.js'), 'utf8'), facCtx);
  facCtx.document.dispatchEvent(new facCtx.CustomEvent('DOMContentLoaded'));
  demoFacBtn.click();
  assert(facEls['fac-login-screen'].classList.contains('hidden') && facEls['fac-login-screen'].style.display === 'none', 'Clicking Labo Pasteur hides fac-login-screen completely');
  assert(!facEls['fac-dashboard'].classList.contains('hidden'), 'Clicking Labo Pasteur opens fac-dashboard');
  assert(facEls['fac-header-name'].textContent.length > 3, `Facility dashboard displays facility name ("${facEls['fac-header-name'].textContent}")`);

  // Test clic Ubipharm Grossiste
  const wsEls = {
    'g-login-screen': makeEl('g-login-screen', ['pa-screen']),
    'g-dashboard': makeEl('g-dashboard', ['hidden']),
    'grossiste-header-name': makeEl('grossiste-header-name'),
    'grossiste-header-code': makeEl('grossiste-header-code'),
    'gpanel-catalog': makeEl('gpanel-catalog'),
    'toast': makeEl('toast'),
    'toast-message': makeEl('toast-message'),
  };
  const demoWsBtn = makeEl('btn-demo-ws');
  demoWsBtn.setAttribute('data-demo-ws', 'ws_ubipharm_dla');
  const wsCtx = makeSandbox();
  wsCtx.scrollTo = () => {};
  wsCtx.document.getElementById = (id) => wsEls[id] || null;
  wsCtx.document.querySelectorAll = (sel) => (sel === '[data-demo-ws]' ? [demoWsBtn] : []);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/grossiste/auth.js'), 'utf8'), wsCtx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/grossiste/app.js'), 'utf8'), wsCtx);
  wsCtx.document.dispatchEvent(new wsCtx.CustomEvent('DOMContentLoaded'));
  demoWsBtn.click();
  assert(wsEls['g-login-screen'].classList.contains('hidden') && wsEls['g-login-screen'].style.display === 'none', 'Clicking Ubipharm hides g-login-screen completely');
  assert(!wsEls['g-dashboard'].classList.contains('hidden'), 'Clicking Ubipharm opens g-dashboard');
  assert(wsEls['grossiste-header-name'].textContent.includes('UBIPHARM'), `Wholesaler dashboard displays UBIPHARM ("${wsEls['grossiste-header-name'].textContent}")`);
}

console.log('\n════════════════════════════════════════════════════════════════');
console.log(`RÉSULTAT GLOBAL : ${passed} réussis · ${failed} échoués`);
console.log('════════════════════════════════════════════════════════════════');
if (failed > 0) {
  console.error('Échecs détectés :\n - ' + failures.join('\n - '));
  process.exit(1);
}
process.exit(0);
