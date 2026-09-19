/**
 * lib/buildInfo.js
 *
 * Identifies the build a client is actually running. Rendered by BuildStamp in the
 * AuthFooter and Settings → Legal, and set on `window.__BOS_BUILD__` in main.jsx.
 * That is how a PWA update test tells "the new build took over" apart from "the page
 * merely reloaded" — the stamp changing is the proof. See CLAUDE.md §13.
 *
 * This file is BUNDLED, so bumping BUILD_MARKER changes the entry chunk's content
 * hash, which changes dist/sw.js, which is what makes the browser detect an update
 * at all. A docs-only edit does none of that — CLAUDE.md is never imported.
 *
 * For a verification deploy, bump ONLY the string below.
 */

export const BUILD_MARKER = 'v2 — 2026-09-19';
