#!/usr/bin/env node
/**
 * Pharma-Garde v17.0 — Pipeline de Build & Minification 3G/4G (Zéro Dépendance)
 * ──────────────────────────────────────────────────────────────────────────────
 * • Génère `dist/` prêt pour Vercel Static CDN (aucun `npm install` requis).
 * • Minifie les fichiers JS via un lexer à états finis (préserve chaînes,
 *   template literals `${...}`, regex literals `/.../` et ASI sur retours ligne).
 * • Minifie les fichiers CSS (supprime commentaires et espaces superflus tout en
 *   préservant `calc(...)` et les chaînes CSS).
 * • Vérifie la syntaxe de CHAQUE fichier JS minifié dans `dist/` via `node --check`.
 *   En cas d'anomalie sur un fichier, repli automatique sur l'original + alerte.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const ROOT_FILES = [
  'index.html',
  'pharmacien.html',
  'medecin.html',
  'etablissement.html',
  'delegue.html',
  'grossiste.html',
  'manifest.json',
  'sw.js',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'favicon.png',
];

const ASSET_DIRS = ['css', 'js'];

/**
 * Détermine si un `/` en JS ouvre une RegExp plutôt qu'une division,
 * à partir du dernier jeton significatif avant `/`.
 */
function canStartRegex(prevToken) {
  if (!prevToken) return true;
  if (prevToken.type === 'keyword') {
    return /^(return|case|throw|in|of|instanceof|typeof|void|delete|new|else|do|yield|await)$/.test(prevToken.value);
  }
  if (prevToken.type === 'punct') {
    // Après ), ], ++, --, c'est une division ; après (, [, {, ;, ,, =, :, ?, !, &, |, +, -, *, %, ^, ~, <, >, c'est une RegExp
    return !/^[)\]]$|^\+\+$|^--$/.test(prevToken.value);
  }
  return false;
}

/**
 * Minificateur JS sûr à machine d'états :
 * Supprime les commentaires // et /* ... *\/, les lignes vides et l'indentation,
 * tout en préservant à 100 % les chaînes, template literals imbriqués, regex et ASI.
 */
export function minifyJS(source) {
  const src = String(source || '').replace(/\r\n/g, '\n');
  const n = src.length;
  let out = '';
  let i = 0;

  // Pile pour suivre les `${ ... }` à l'intérieur des template literals
  const tplBraceStack = [];
  let prevToken = null; // { type: 'ident'|'keyword'|'number'|'string'|'punct', value: string }

  const isIdentStart = (ch) => /[A-Za-z_$]/.test(ch);
  const isIdentPart = (ch) => /[A-Za-z0-9_$]/.test(ch);
  const KEYWORDS = new Set([
    'return', 'case', 'throw', 'in', 'of', 'instanceof', 'typeof',
    'void', 'delete', 'new', 'else', 'do', 'yield', 'await'
  ]);

  function scanTemplateRest() {
    while (i < n) {
      const ch = src[i];
      if (ch === '\\') {
        out += ch + (src[i + 1] || '');
        i += 2;
        continue;
      }
      if (ch === '`') {
        out += '`';
        i++;
        prevToken = { type: 'string', value: '`' };
        return;
      }
      if (ch === '$' && src[i + 1] === '{') {
        out += '${';
        i += 2;
        tplBraceStack.push(0);
        prevToken = { type: 'punct', value: '{' };
        return;
      }
      out += ch;
      i++;
    }
  }

  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];

    // 1. Commentaire ligne //
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < n && src[i] !== '\n') i++;
      continue;
    }

    // 2. Commentaire bloc /* ... */
    if (ch === '/' && next === '*') {
      i += 2;
      let hadNewline = false;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') hadNewline = true;
        i++;
      }
      i += 2;
      out += hadNewline ? '\n' : ' ';
      continue;
    }

    // 3. Chaînes '...' ou "..."
    if (ch === '\'' || ch === '"') {
      const quote = ch;
      out += ch;
      i++;
      while (i < n) {
        const c = src[i];
        out += c;
        i++;
        if (c === '\\' && i < n) {
          out += src[i];
          i++;
        } else if (c === quote) {
          break;
        }
      }
      prevToken = { type: 'string', value: quote };
      continue;
    }

    // 4. Template literal `...`
    if (ch === '`') {
      out += '`';
      i++;
      scanTemplateRest();
      continue;
    }

    // 5. Accolades à l'intérieur d'un `${...}`
    if (tplBraceStack.length > 0 && ch === '{') {
      tplBraceStack[tplBraceStack.length - 1]++;
      out += '{';
      i++;
      prevToken = { type: 'punct', value: '{' };
      continue;
    }
    if (tplBraceStack.length > 0 && ch === '}') {
      if (tplBraceStack[tplBraceStack.length - 1] === 0) {
        tplBraceStack.pop();
        out += '}';
        i++;
        scanTemplateRest();
        continue;
      } else {
        tplBraceStack[tplBraceStack.length - 1]--;
        out += '}';
        i++;
        prevToken = { type: 'punct', value: '}' };
        continue;
      }
    }

    // 6. RegExp literal /.../flags
    if (ch === '/' && canStartRegex(prevToken)) {
      out += '/';
      i++;
      let inClass = false;
      while (i < n) {
        const c = src[i];
        out += c;
        i++;
        if (c === '\\' && i < n) {
          out += src[i];
          i++;
        } else if (c === '[') {
          inClass = true;
        } else if (c === ']') {
          inClass = false;
        } else if (c === '/' && !inClass) {
          break;
        } else if (c === '\n') {
          break;
        }
      }
      while (i < n && /[a-z]/i.test(src[i])) {
        out += src[i++];
      }
      prevToken = { type: 'string', value: '/re/' };
      continue;
    }

    // 7. Identifiants / Mots-clés
    if (isIdentStart(ch)) {
      let word = ch;
      i++;
      while (i < n && isIdentPart(src[i])) word += src[i++];
      out += word;
      prevToken = { type: KEYWORDS.has(word) ? 'keyword' : 'ident', value: word };
      continue;
    }

    // 8. Nombres
    if (/[0-9]/.test(ch)) {
      let num = ch;
      i++;
      while (i < n && /[0-9a-fA-FxXoObBn._eE]/.test(src[i])) num += src[i++];
      out += num;
      prevToken = { type: 'number', value: num };
      continue;
    }

    // 9. Opérateurs ++ / -- (important pour canStartRegex)
    if ((ch === '+' && next === '+') || (ch === '-' && next === '-')) {
      out += ch + next;
      i += 2;
      prevToken = { type: 'punct', value: ch + next };
      continue;
    }

    // 10. Espaces & retours ligne
    if (ch === ' ' || ch === '\t') {
      while (i < n && (src[i] === ' ' || src[i] === '\t')) i++;
      if (out.length > 0 && out[out.length - 1] !== '\n' && out[out.length - 1] !== ' ') {
        out += ' ';
      }
      continue;
    }
    if (ch === '\n') {
      i++;
      // Supprimer l'espace de fin de ligne précédente
      if (out.endsWith(' ')) out = out.slice(0, -1);
      if (out.length > 0 && !out.endsWith('\n')) out += '\n';
      continue;
    }

    // 11. Autre caractère ponctuation
    out += ch;
    i++;
    prevToken = { type: 'punct', value: ch };
  }

  return out.trim() + '\n';
}

/**
 * Minificateur CSS sûr : supprime commentaires /*...*\/, sauts de ligne
 * et espaces redondants hors chaînes `'...'`/`"..."` tout en préservant `calc(...)`.
 */
export function minifyCSS(source) {
  const src = String(source || '').replace(/\r\n/g, '\n');
  let stripped = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (ch === '\'' || ch === '"') {
      const q = ch;
      stripped += ch;
      i++;
      while (i < n) {
        const c = src[i++];
        stripped += c;
        if (c === '\\' && i < n) stripped += src[i++];
        else if (c === q) break;
      }
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    stripped += ch;
    i++;
  }
  return stripped
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>~])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim() + '\n';
}

function walkFiles(dir) {
  const res = [];
  if (!fs.existsSync(dir)) return res;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) res.push(...walkFiles(full));
    else res.push(full);
  }
  return res;
}

export function buildProduction({ quiet = false } = {}) {
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST, { recursive: true });

  const stats = {
    files: 0,
    jsFiles: 0,
    cssFiles: 0,
    htmlFiles: 0,
    jsFallbackCount: 0,
    rawBytes: 0,
    distBytes: 0,
    jsRawBytes: 0,
    jsDistBytes: 0,
    cssRawBytes: 0,
    cssDistBytes: 0,
  };

  function processFile(absSrc, relPath) {
    const absDest = path.join(DIST, relPath);
    fs.mkdirSync(path.dirname(absDest), { recursive: true });
    const ext = path.extname(relPath).toLowerCase();
    const rawBuf = fs.readFileSync(absSrc);
    stats.files++;
    stats.rawBytes += rawBuf.length;

    if (ext === '.js') {
      stats.jsFiles++;
      stats.jsRawBytes += rawBuf.length;
      const srcStr = rawBuf.toString('utf8');
      const minStr = minifyJS(srcStr);
      fs.writeFileSync(absDest, minStr, 'utf8');
      try {
        execFileSync(process.execPath, ['--check', absDest], { stdio: 'pipe' });
        const outLen = Buffer.byteLength(minStr, 'utf8');
        stats.distBytes += outLen;
        stats.jsDistBytes += outLen;
      } catch (err) {
        // Filet de sécurité : ne jamais casser la prod
        stats.jsFallbackCount++;
        fs.writeFileSync(absDest, rawBuf);
        stats.distBytes += rawBuf.length;
        stats.jsDistBytes += rawBuf.length;
        if (!quiet) console.warn(`[build-prod] ⚠️ Repli non minifié pour ${relPath}: ${err.message}`);
      }
      return;
    }

    if (ext === '.css') {
      stats.cssFiles++;
      stats.cssRawBytes += rawBuf.length;
      const minCss = minifyCSS(rawBuf.toString('utf8'));
      fs.writeFileSync(absDest, minCss, 'utf8');
      const outLen = Buffer.byteLength(minCss, 'utf8');
      stats.distBytes += outLen;
      stats.cssDistBytes += outLen;
      return;
    }

    if (ext === '.html') {
      stats.htmlFiles++;
    }
    fs.writeFileSync(absDest, rawBuf);
    stats.distBytes += rawBuf.length;
  }

  for (const f of ROOT_FILES) {
    const full = path.join(ROOT, f);
    if (fs.existsSync(full)) processFile(full, f);
  }

  for (const dir of ASSET_DIRS) {
    const absDir = path.join(ROOT, dir);
    for (const full of walkFiles(absDir)) {
      const rel = path.relative(ROOT, full);
      processFile(full, rel);
    }
  }

  const savedPct = stats.rawBytes > 0
    ? (((stats.rawBytes - stats.distBytes) / stats.rawBytes) * 100).toFixed(1)
    : '0.0';
  const jsSavedPct = stats.jsRawBytes > 0
    ? (((stats.jsRawBytes - stats.jsDistBytes) / stats.jsRawBytes) * 100).toFixed(1)
    : '0.0';
  const cssSavedPct = stats.cssRawBytes > 0
    ? (((stats.cssRawBytes - stats.cssDistBytes) / stats.cssRawBytes) * 100).toFixed(1)
    : '0.0';

  if (!quiet) {
    console.log(`✅ Pharma-Garde dist/ généré (${stats.files} fichiers)`);
    console.log(`   JS  (${stats.jsFiles} fichiers) : ${(stats.jsRawBytes / 1024).toFixed(1)} KB → ${(stats.jsDistBytes / 1024).toFixed(1)} KB (-${jsSavedPct}%) [replis: ${stats.jsFallbackCount}]`);
    console.log(`   CSS (${stats.cssFiles} fichiers) : ${(stats.cssRawBytes / 1024).toFixed(1)} KB → ${(stats.cssDistBytes / 1024).toFixed(1)} KB (-${cssSavedPct}%)`);
    console.log(`   TOTAL              : ${(stats.rawBytes / 1024).toFixed(1)} KB → ${(stats.distBytes / 1024).toFixed(1)} KB (-${savedPct}%)`);
  }

  return stats;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const res = buildProduction();
  if (res.jsFallbackCount > 0) {
    console.error(`❌ ${res.jsFallbackCount} fichier(s) JS ont échoué la minification.`);
    process.exit(1);
  }
}
