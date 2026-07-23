import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'favicon.svg'],
      // public/manifest.json is canonical; don't generate/inject a second one
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff,woff2}'],
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
