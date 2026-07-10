/**
 * playwright.config.js
 *
 * Stage 1 e2e harness. Chromium only — the app is a mobile-first PWA with a single
 * 440px layout and no responsive breakpoints, so a second engine buys nothing here.
 *
 * Specs live in e2e/ and are excluded from vitest (see vite.config.js `test.exclude`),
 * so `npm test` and `npm run test:e2e` never collect each other's files.
 *
 * The §0 network write-rail is NOT configured here — arming it needs `page.route()`,
 * which only exists inside a test fixture. It lives in e2e/helpers/test-base.js.
 * This file's job is to make VITE_SUPABASE_URL (which the rail matches against) and
 * E2E_FIXTURE_PASSWORD visible to the test process.
 */

import { defineConfig, devices } from '@playwright/test';
import { loadEnv }               from 'vite';

// Vite owns .env and only exposes VITE_-prefixed vars by default; the '' prefix loads
// all of them. Mirror into process.env so the test process and the dev server started
// by `webServer` below both read identical values. Never overwrite a real env var —
// CI sets these as secrets, and those must win over a stray local .env.
const env = loadEnv('development', process.cwd(), '');
for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'E2E_FIXTURE_PASSWORD']) {
  if (env[key] && !process.env[key]) process.env[key] = env[key];
}

const BASE_URL = 'http://localhost:5173';

export default defineConfig({
  testDir:       'e2e',
  fullyParallel: true,
  forbidOnly:    !!process.env.CI,
  retries:       process.env.CI ? 2 : 0,
  // 'list' alone writes no playwright-report/, so CI's on-failure artifact would
  // upload an empty directory. Add the html reporter there; keep local runs to
  // plain console output.
  reporter:      process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: BASE_URL,
    trace:   'on-first-retry',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    command:             'npm run dev',
    url:                 BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout:             120_000,
  },
});
