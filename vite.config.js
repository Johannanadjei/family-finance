import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
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
