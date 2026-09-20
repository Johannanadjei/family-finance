/**
 * lib/buildInfo.js
 *
 * Identifies the build a client is actually running. Rendered by BuildStamp in the
 * AuthFooter and Settings → Legal, and set on `window.__BOS_BUILD__` in main.jsx.
 * That is how a PWA update test tells "the new build took over" apart from "the page
 * merely reloaded" — the stamp changing is the proof. See CLAUDE.md §13.
 *
 * ── WHY THIS IS DERIVED, NOT TYPED ──────────────────────────────────────────
 * BUILD_MARKER used to be a hand-edited string, and a hand-edited marker is wrong
 * by default: it only ever tells the truth in the one commit where someone
 * remembered to bump it. Every commit after that ships a stamp naming an older
 * build, which is worse than no stamp — the PWA re-test reads "did the stamp
 * change?" as its pass condition, so a stale marker can report a failed takeover
 * as a success, or a successful one as a no-op.
 *
 * The commit SHA cannot be forgotten, is unique per deploy by construction, and
 * points at the exact tree that is running. `__BOS_BUILD_SHA__` and
 * `__BOS_BUILD_DATE__` are inlined by vite.config.js `define` (Vercel's
 * VERCEL_GIT_COMMIT_SHA → `git rev-parse HEAD` → 'local'); see that file for the
 * resolution order.
 *
 * This file is BUNDLED, so the marker changing changes the entry chunk's content
 * hash, which changes dist/sw.js, which is what makes the browser detect an update
 * at all. That now happens on every commit that touches shipped code, for free —
 * no step to remember, and a docs-only edit still correctly produces no update
 * (CLAUDE.md is never imported, and the SHA only reaches the bundle via a build).
 *
 * `typeof` guards rather than bare reads: an undeclared identifier throws a
 * ReferenceError, but `typeof` on one does not. So a tool that runs this module
 * without the defines (a bare node import, some future bundler) degrades to
 * 'local' instead of crashing the app over a cosmetic string.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const sha = typeof __BOS_BUILD_SHA__ === 'string' && __BOS_BUILD_SHA__
  ? __BOS_BUILD_SHA__
  : 'local';

const iso = typeof __BOS_BUILD_DATE__ === 'string' ? __BOS_BUILD_DATE__ : '';

// UTC throughout: the stamp identifies a BUILD, so it must read the same to every
// viewer regardless of their timezone. An unparseable date drops the date half
// rather than rendering "NaN NaN NaN" next to a valid SHA.
const formatDate = (isoString) => {
  const d = new Date(isoString);
  if (!isoString || Number.isNaN(d.getTime())) return '';
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** Short SHA of the commit this bundle was built from, e.g. `86068db`. */
export const BUILD_SHA = sha.slice(0, 7);

/** Build date, e.g. `20 Sep 2026`. Empty only if the define was missing. */
export const BUILD_DATE = formatDate(iso);

/** What BuildStamp, window.__BOS_BUILD__ and main.jsx's console.info all show. */
export const BUILD_MARKER = BUILD_DATE ? `${BUILD_SHA} · ${BUILD_DATE}` : BUILD_SHA;
