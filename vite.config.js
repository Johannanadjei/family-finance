import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// ── Build identity (see src/lib/buildInfo.js) ────────────────────────────────
// Resolved ONCE, here, at config time — not in application code, which has no
// access to git or to Vercel's env. Order matters:
//   1. VERCEL_GIT_COMMIT_SHA — authoritative on Vercel, and correct even though
//      the build image's checkout is shallow/detached.
//   2. git rev-parse HEAD    — local dev and any non-Vercel CI.
//   3. 'local'               — no git (a tarball, a sandbox); never fail the build
//                              over a cosmetic stamp.
const buildSha = () => {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'local';
  }
};

const BUILD_SHA  = buildSha();
const BUILD_DATE = new Date().toISOString();

export default defineConfig({
  // Inlined as string literals at transform time. Declared here rather than via
  // import.meta.env so they are available identically to the app, the test run and
  // the production bundle, with no VITE_ prefix and no .env plumbing.
  define: {
    __BOS_BUILD_SHA__:  JSON.stringify(BUILD_SHA),
    __BOS_BUILD_DATE__: JSON.stringify(BUILD_DATE),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registration is application code (src/lib/pwa.js initPwaUpdates), not a
      // build-injected <script>. That is what lets the app decide between a silent
      // reload and a toast. See CLAUDE.md §13.
      injectRegister: false,
      includeAssets: ['icons/*.png', 'favicon.svg'],
      // public/manifest.json is canonical; don't generate/inject a second one
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff,woff2}'],
        // MUST be explicit. The plugin only auto-applies these two for
        // registerType:'autoUpdate' when injectRegister is 'auto'/unset
        // (vite-plugin-pwa/dist/index.js:874). Setting injectRegister:false
        // above silently drops both, which would leave a new SW waiting forever.
        skipWaiting:   true,
        clientsClaim:  true,
        // Drop precaches from superseded builds; without this an installed user
        // accumulates one full asset set per deploy.
        cleanupOutdatedCaches: true,
        // No runtimeCaching: the app requests no cross-origin assets. A prior
        // google-fonts-cache rule was dead config — 'Nunito' is only a
        // font-family name, never loaded from Google, so no request ever fired
        // (verified against the live deployed HTML/CSS/JS, 2026-07-23).
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals:     true,
    // The two build-identity defines, repeated for the test run. Vitest builds its
    // own transform pipeline and does not inherit the top-level `define` in every
    // version, so buildInfo.js would hit a bare `typeof __BOS_BUILD_SHA__` and fall
    // back to 'local' — which passes, silently, while proving nothing about the
    // real wiring. Declaring them here keeps the tests honest.
    define: {
      __BOS_BUILD_SHA__:  JSON.stringify(BUILD_SHA),
      __BOS_BUILD_DATE__: JSON.stringify(BUILD_DATE),
    },
    // Playwright specs live in e2e/ and match vitest's default *.spec.js glob.
    // Without this they'd be collected here and fail on the @playwright/test import.
    exclude:     [...configDefaults.exclude, 'e2e/**'],
    coverage: {
      provider:   'v8',
      reporter:   ['text', 'json', 'html'],
      include:    ['src/lib/**', 'src/features/**/onboarding.validation.js'],
      thresholds: { lines: 90, functions: 90, branches: 80 },
    },
  },
});
