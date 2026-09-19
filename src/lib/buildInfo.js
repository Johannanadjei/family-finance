/**
 * lib/buildInfo.js
 *
 * Identifies the build a client is actually running. Exposed as
 * `window.__BOS_BUILD__` (set in main.jsx) so you can read it straight from the
 * DevTools console — which is how the PWA update test tells "the new build took
 * over" apart from "the page merely reloaded". See CLAUDE.md §13.
 *
 * This file is BUNDLED, so bumping BUILD_MARKER changes the entry chunk's content
 * hash, which changes dist/sw.js, which is what makes the browser detect an update
 * at all. A docs-only edit does none of that — CLAUDE.md is never imported.
 *
 * For a verification deploy, bump ONLY the string below.
 */

export const BUILD_MARKER = 'verification-deploy-2 — 2026-09-19T11:15:40Z';
