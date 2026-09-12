/**
 * scripts/check-jsx-imports.mjs
 *
 * Fails when a JSX component is RENDERED but never imported or defined in that file.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * On 2026-09-05 `<PeriodSetupPrompt />` was mounted in App.jsx's DashboardShell with
 * no matching import. Every layer of the safety net let it through:
 *
 *   • 1846 unit tests passed — component tests import the component directly, and the
 *     one test that renders <App/> lands on the ONBOARDING gate, so DashboardShell is
 *     never evaluated.
 *   • The e2e smoke test passed — its fixture owns 0 hubs, so it lands on onboarding
 *     too. Same branch, same blind spot.
 *   • `vite build` SUCCEEDED and emitted a bundle. A bare undefined identifier is
 *     valid JavaScript; it throws at RUNTIME, when the expression is evaluated. So a
 *     build step in CI would not have caught it either.
 *
 * Result: a white screen for every real user, from a one-line omission, with a fully
 * green pipeline. This check closes that specific hole at the cheapest possible layer
 * — no toolchain, no dependencies, runs in the existing audit.
 *
 * NOT a substitute for ESLint (`react/jsx-no-undef` catches this and much more). It is
 * the dependency-free floor until that lands. See docs/backlog.md.
 *
 * ── HOW ──────────────────────────────────────────────────────────────────────
 * Regex, not a parser, so it strips comments and strings first — otherwise JSDoc that
 * mentions `<Link>` or `<Routes>` reads as a usage. That is not hypothetical: the
 * first run of this scanner reported 16 findings and every one was prose inside a
 * comment. A check that cries wolf gets ignored, which is worse than no check.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../src', import.meta.url).pathname;

// Capitalised JSX opening tag: <Foo …>, <Foo/>, <Foo.Bar …>. Lowercase names are DOM.
const USE = /<([A-Z][A-Za-z0-9_]*)(?:\.[A-Za-z0-9_]+)?[\s/>]/g;

// Names that resolve without an import in this codebase.
const AMBIENT = new Set(['React', 'Fragment']);

/** Blank out comments and string/template literals so prose cannot look like JSX. */
function strip(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '*') {                       // block comment
      const end = src.indexOf('*/', i + 2);
      const body = src.slice(i, end === -1 ? n : end + 2);
      out += body.replace(/[^\n]/g, ' ');
      i = end === -1 ? n : end + 2;
    } else if (c === '/' && d === '/') {                // line comment
      const end = src.indexOf('\n', i);
      out += ' '.repeat((end === -1 ? n : end) - i);
      i = end === -1 ? n : end;
    } else if (c === '"' || c === "'" || c === '`') {   // string / template literal
      const quote = c;
      let j = i + 1;
      while (j < n && src[j] !== quote) { if (src[j] === '\\') j++; j++; }
      out += ' '.repeat(Math.min(j, n) - i + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Every identifier this file brings into scope: imports, declarations, destructures. */
function declared(src) {
  const names = new Set();

  for (const m of src.matchAll(/import\s+([\s\S]+?)\s+from\s/g)) {
    const clause = m[1];
    for (const named of clause.matchAll(/\{([\s\S]*?)\}/g)) {
      for (const part of named[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (name) names.add(name);
      }
    }
    for (const part of clause.replace(/\{[\s\S]*?\}/g, '').split(',')) {
      const name = part.trim().replace(/^\*\s+as\s+/, '');
      if (/^[A-Za-z0-9_$]+$/.test(name)) names.add(name);
    }
  }

  for (const m of src.matchAll(/(?:function|class)\s+([A-Z][A-Za-z0-9_]*)/g))       names.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s+([A-Z][A-Za-z0-9_]*)\s*=/g))    names.add(m[1]);
  // const { Provider } = ctx  /  const { a: Renamed } = props
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(':').pop()?.trim();
      if (/^[A-Za-z0-9_$]+$/.test(name)) names.add(name);
    }
  }
  return names;
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.jsx?$/.test(entry))   yield path;
  }
}

const findings = [];
for (const path of walk(SRC)) {
  const code = strip(readFileSync(path, 'utf8'));
  // Both read the STRIPPED text. Comments must not feed either side: prose like
  // "importing App doesn't construct a real client" otherwise starts an import match
  // that runs to the next real `from`, swallowing the declaration it was meant to find.
  const scope = declared(code);
  for (const m of code.matchAll(USE)) {
    const name = m[1];
    if (scope.has(name) || AMBIENT.has(name)) continue;
    findings.push({
      file: path.slice(path.indexOf('/src/') + 1),
      line: code.slice(0, m.index).split('\n').length,
      name,
    });
  }
}

for (const f of findings) console.log(`  ${f.file}:${f.line}  <${f.name}> is rendered but never imported or defined`);
console.log(findings.length === 0
  ? 'OK: every rendered component is imported or defined'
  : `${findings.length} unresolved JSX component reference(s)`);
process.exit(findings.length === 0 ? 0 : 1);
