/**
 * e2e/period-range.spec.js
 *
 * The period-identity fix, end to end: a period's date range is visible on the
 * Budget screen, and the creator refuses a range that overlaps an existing period.
 *
 * WHY THIS SPEC EXISTS
 *   A hub held two adjacent periods (1–17 Sep and 18 Sep–18 Oct) both labelled
 *   "September 2026". The app correctly showed the one containing today; it was
 *   empty, and with only a name on screen the earlier period's data looked deleted.
 *   The range under the label is what tells them apart.
 *
 * READ-ONLY BY CONSTRUCTION (§0 write-rail, see helpers/test-base.js)
 *   Stage 1 runs against the real, shared, production Supabase project. There is no
 *   test DB, so this spec CANNOT create a hub or a period — those are RPC writes the
 *   rail aborts and fails on. Instead it uses the seeded `history` fixture (4+ live
 *   cycles) and stops before submit: the overlap is caught CLIENT-side, so clicking
 *   Create fires no network write at all. The rail asserting clean at teardown is
 *   itself part of the assertion — it proves the refusal happened before the wire.
 *
 *   The server's CYC01 path is therefore NOT covered here; it is unit-tested in
 *   CreateBudgetPeriodSheet.test.jsx. Covering it for real needs a scratch DB — see
 *   the journey-e2e workstream.
 */

import { test, expect }     from './helpers/test-base';
import { signIn }           from './helpers/signIn';
import { STAGE_1_FIXTURES } from '../src/lib/fixtures';

/** "18 Sep – 18 Oct 2026" / "1 Sep – 30 Sep 2026" → { start: {d,m,y}, end: {d,m,y} } */
function parseRange(text) {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [rawFrom, rawTo] = text.split('–').map(s => s.trim());
  const to   = rawTo.split(/\s+/);                    // [d, Mon, yyyy]
  const from = rawFrom.split(/\s+/);                  // [d, Mon] or [d, Mon, yyyy]
  const year = to[2];
  return {
    start: { d: from[0], m: String(MONTHS.indexOf(from[1]) + 1), y: from[2] ?? year },
    end:   { d: to[0],   m: String(MONTHS.indexOf(to[1]) + 1),   y: year },
  };
}

test('the viewed period shows its date range, and an overlapping period is refused', async ({ page }) => {
  await signIn(page, STAGE_1_FIXTURES.history);

  await page.goto('/budget');
  await expect(page.getByTestId('budget-period-label')).toBeVisible();

  // 1. The range renders beneath the period name — the fix itself.
  const rangeEl = page.getByTestId('period-range');
  await expect(rangeEl).toBeVisible();
  const rangeText = (await rangeEl.textContent()).trim();
  expect(rangeText).toMatch(/^\d{1,2} [A-Z][a-z]{2}( \d{4})? – \d{1,2} [A-Z][a-z]{2} \d{4}$/);

  // 2. Re-entering exactly that range must clash with the very period displaying it.
  //    Derived from the UI rather than hardcoded, so the spec cannot drift from the
  //    fixture's seeded dates.
  const { start, end } = parseRange(rangeText);

  await page.getByTestId('new-period-btn').click();
  await expect(page.getByTestId('create-period-sheet')).toBeVisible();
  await page.getByTestId('custom-period-btn').click();

  await page.getByTestId('period-start-day').fill(start.d);
  await page.getByTestId('period-start-month').fill(start.m);
  await page.getByTestId('period-start-year').fill(start.y);
  await page.getByTestId('period-end-day').fill(end.d);
  await page.getByTestId('period-end-month').fill(end.m);
  await page.getByTestId('period-end-year').fill(end.y);

  // The live preview echoes what is about to be committed.
  await expect(page.getByTestId('custom-period-range')).toHaveText(rangeText);

  await page.getByTestId('period-save-btn').click();

  // Refused client-side, naming the period it clashes with. The sheet stays open:
  // a submitted period would have closed it.
  await expect(page.getByTestId('create-period-sheet')).toContainText('overlaps');
  await expect(page.getByTestId('create-period-sheet')).toBeVisible();
});
