/**
 * e2e/helpers/signIn.js
 *
 * Shared sign-in for the Stage 1 fixture accounts: email + password → PIN → gate.
 *
 * All 7 fixtures carry a PIN, so this always drives the PinScreen path and never the
 * PinSetupFlow "skip" path. Driving one path for every fixture keeps the helper free
 * of branching, and a fixture that has lost its PIN fails here loudly (the pin-screen
 * wait times out) rather than quietly taking a different route through the app.
 *
 * The password is read from the environment, never committed — docs/qa/fixture-accounts.md
 * keeps it as the one secret outside source control. playwright.config.js loads it from
 * .env into process.env.
 */

import { expect } from '@playwright/test';

const FIXTURE_PIN = '1611';

/** The shared fixture password. Throws rather than attempting a doomed sign-in. */
export function fixturePassword() {
  const password = process.env.E2E_FIXTURE_PASSWORD;
  if (!password) {
    throw new Error('E2E_FIXTURE_PASSWORD not set — see docs/qa/fixture-accounts.md');
  }
  return password;
}

/**
 * Sign a fixture account in and settle on whichever gate it belongs at.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} email — from STAGE_1_FIXTURES in src/lib/fixtures.js
 * @param {{ pin?: string }} [options]
 */
export async function signIn(page, email, { pin = FIXTURE_PIN } = {}) {
  await page.goto('/');

  await page.getByTestId('auth-email-input').fill(email);
  await page.getByTestId('auth-password-input').fill(fixturePassword());
  await page.getByTestId('auth-submit-btn').click();

  await expect(page.getByTestId('pin-screen')).toBeVisible();

  // PinPad auto-submits on the 4th digit — no separate confirm click.
  for (const digit of pin) {
    await page.getByTestId(`pin-key-${digit}`).click();
  }

  // Past the PIN gate the app forks on fixture state: the fresh fixture owns no hub
  // and renders OnboardingFlow; every seeded fixture renders the dashboard shell.
  // Wait for either so one helper serves all 7. The caller asserts which one it got.
  await page
    .locator('[data-testid="onboarding-flow"], #app-shell')
    .first()
    .waitFor({ state: 'visible' });
}
