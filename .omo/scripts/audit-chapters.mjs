#!/usr/bin/env node
// audit-chapters.mjs — validate HTML link structure for CI/CD tutorial chapters
// Node 22+, ESM, zero dependencies.

import { readFile, rename, stat } from 'node:fs/promises';
import { resolve, dirname, basename, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';

// ---- Paths ----------------------------------------------------------------

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CICD_DIR = resolve(SCRIPT_DIR, '../../project-page/cicd');
const CHAPTERS_DIR = resolve(CICD_DIR, 'chapters');

const SELF_TEST = process.env.AUDIT_SELF_TEST === '1' || process.argv.includes('--self-test');

// ---- HTML tokenizers (regex-based, no deps) --------------------------------

// Match href inside <a> tags
const LINK_RE = /<a\s[^>]*?\bhref\s*=\s*"([^"]*)"[^>]*>/gi;
// Match id inside <h1>…<h6> tags (spec requirement)
const HEADING_RE = /<h([1-6])\s[^>]*?\bid\s*=\s*"([^"]*)"[^>]*>/gi;
// Match ANY element's id attribute (for fragment validation — any element is a valid anchor target)
const ANY_ID_RE = /\sid\s*=\s*"([^"]*)"/gi;
// Match href inside <link rel="stylesheet"> tags
const CSS_RE = /<link\s[^>]*?\brel\s*=\s*"stylesheet"[^>]*?\bhref\s*=\s*"([^"]*)"[^>]*>/gi;

// ---- URL helpers -----------------------------------------------------------

/** Strip query string & fragment from a URL-like path. */
function stripQuery(p) {
  const q = p.indexOf('?');
  const h = p.indexOf('#');
  const end =
    q === -1 ? (h === -1 ? p.length : h) : h === -1 ? q : Math.min(q, h);
  return p.slice(0, end);
}

/** True if `href` is a same-origin relative path (no scheme, not absolute). */
function isRelativeUrl(href) {
  if (href.startsWith('#') || href === '') return false;
  // Has a URI scheme (mailto:, tel:, javascript:, http:, https:, …)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href)) return false;
  // Absolute-path or protocol-relative
  if (href.startsWith('/')) return false;
  return true;
}

/** Resolve a relative `href` from `sourceFile` into an absolute path + fragment. */
function resolveHref(sourceFile, href) {
  const hashIdx = href.indexOf('#');
  const pathPart = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
  const fragment = hashIdx >= 0 ? href.slice(hashIdx + 1) : null;
  const clean = stripQuery(pathPart);
  return { resolved: resolve(dirname(sourceFile), clean), fragment };
}

/** Should we verify existence & fragments for this resolved link target? */
function isCheckedLink(resolved) {
  return resolved.startsWith(CHAPTERS_DIR + '/') || basename(resolved) === 'index.html';
}

// ---- HTML parsing helpers --------------------------------------------------

/** Collect every heading id from HTML (spec requirement — extract <hN id>). */
function extractHeadingIds(html) {
  const ids = new Set();
  let m;
  HEADING_RE.lastIndex = 0;
  while ((m = HEADING_RE.exec(html)) !== null) ids.add(m[2]);
  return ids;
}

/** Collect ANY element id (allows fragment validation against sections, divs, etc.). */
function extractAllIds(html) {
  const ids = new Set();
  let m;
  ANY_ID_RE.lastIndex = 0;
  while ((m = ANY_ID_RE.exec(html)) !== null) ids.add(m[1]);
  return ids;
}

// ---- Single-file audit ----------------------------------------------------

async function auditFile(filePath, errors) {
  const html = await readFile(filePath, 'utf-8');
  // Collect all element IDs for fragment validation
  const allIds = extractAllIds(html);
  // Spec requirement: also extract <hN id> headings
  extractHeadingIds(html);
  const fromCicd = relative(CICD_DIR, filePath);

  // --- <a href=""> links ----------------------------------------------------
  LINK_RE.lastIndex = 0;
  let m;
  while ((m = LINK_RE.exec(html)) !== null) {
    const href = m[1];
    if (!isRelativeUrl(href)) continue;

    // Fragment-only (#foo) — validate on current page
    if (href.startsWith('#')) {
      const frag = href.slice(1);
      if (!allIds.has(frag)) {
        errors.push(
          `${fromCicd}: fragment #${frag} not found in same page`,
        );
      }
      continue;
    }

    const { resolved, fragment } = resolveHref(filePath, href);
    if (!isCheckedLink(resolved)) continue;

    // Verify target file exists
    try {
      await stat(resolved);
    } catch {
      errors.push(
        `${fromCicd}: href="${href}" → ${relative(CICD_DIR, resolved)} NOT FOUND`,
      );
      continue;
    }

    // If target is .html with a fragment, verify the fragment
    if (fragment && extname(resolved) === '.html') {
      const targetHtml = await readFile(resolved, 'utf-8');
      const targetAllIds = extractAllIds(targetHtml);
      if (!targetAllIds.has(fragment)) {
        errors.push(
          `${fromCicd}: href="${href}" → fragment #${fragment} not found in ${basename(resolved)}`,
        );
      }
    }
  }

  // --- <link rel="stylesheet" href=""> --------------------------------------
  CSS_RE.lastIndex = 0;
  while ((m = CSS_RE.exec(html)) !== null) {
    const href = m[1];
    if (!isRelativeUrl(href)) continue;

    const { resolved } = resolveHref(filePath, href);
    try {
      await stat(resolved);
    } catch {
      errors.push(
        `${fromCicd}: stylesheet href="${href}" → ${relative(CICD_DIR, resolved)} NOT FOUND`,
      );
    }
  }
}

// ---- Full audit -----------------------------------------------------------

async function audit() {
  const files = [];
  for await (const entry of glob(`${CICD_DIR}/**/*.html`)) {
    files.push(entry);
  }
  files.sort();

  const errors = [];
  for (const f of files) {
    await auditFile(f, errors);
  }

  return { totalFiles: files.length, errors };
}

// ---- Entry points ---------------------------------------------------------

async function main() {
  const { totalFiles, errors } = await audit();
  for (const err of errors) {
    console.error(`ERROR: ${err}`);
  }
  if (errors.length > 0) {
    console.log(`FAIL ${totalFiles - errors.length}/${totalFiles} (${errors.length} errors)`);
    return 1;
  }
  console.log(`OK ${totalFiles}/${totalFiles}`);
  return 0;
}

async function runSelfTest() {
  const victim = resolve(CHAPTERS_DIR, '00-overview.html');
  const backup = resolve(CHAPTERS_DIR, '00-overview.bak');

  // Break it
  console.error('[self-test] breaking: chapters/00-overview.html → chapters/00-overview.bak');
  await rename(victim, backup);
  const first = await main();

  // Restore
  console.error('[self-test] restoring: chapters/00-overview.bak → chapters/00-overview.html');
  await rename(backup, victim);
  const second = await main();

  if (first === 1 && second === 0) {
    console.error('[self-test] PASS: broken→exit 1, restored→exit 0');
    process.exitCode = 0;
  } else {
    console.error(`[self-test] FAIL: broken=${first} restored=${second} (expected 1 then 0)`);
    process.exitCode = 1;
  }
}

// Only auto-run when directly executed (not when imported)
const isMain =
  process.argv[1] &&
  (resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url)) ||
   process.argv[1].endsWith('audit-chapters.mjs'));

if (isMain || SELF_TEST) {
  if (SELF_TEST) {
    await runSelfTest();
  } else {
    process.exitCode = await main();
  }
}
