/**
 * e2e/smoke-signin.spec.js
 *
 * The first Stage 1 e2e test. Proves the whole harness end to end: the dev server
 * boots, the fixture account authenticates against the real project, the PIN gate
 * accepts, the app routes on real fixture state, and the §0 write-rail stays unfired.
 *
 * `test` comes from ./helpers/test-base — that import arms the rail. Read-only.
 */

import { test, expect }        from './helpers/test-base';
import { signIn }              from './helpers/signIn';
import { STAGE_1_FIXTURES }    from '../src/lib/fixtures';

test('fresh fixture signs in through the PIN gate and lands on onboarding', async ({ page }) => {
  await signIn(page, STAGE_1_FIXTURES.fresh);

  // The fresh fixture owns 0 hubs, so App.jsx's centre gate holds it at onboarding.
  // Reaching the dashboard instead would mean the fixture has been written to.
  await expect(page.getByTestId('onboarding-flow')).toBeVisible();
});
