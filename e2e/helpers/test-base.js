/**
 * e2e/helpers/test-base.js
 *
 * The §0 network write-rail. Every Stage 1 spec MUST import `test` from here
 * rather than from '@playwright/test' directly — that import is what arms the rail.
 *
 * Stage 1 is stop-before-submit: it drives real UI against the real, shared,
 * production Supabase project (there is no separate test DB) using 7 manually-seeded
 * READ-ONLY fixture accounts. A stray write corrupts a fixture and silently drifts
 * every visual baseline captured against it. See docs/qa/fixture-accounts.md.
 *
 * The rail does two things, and both matter:
 *   1. ABORTS the request, so the write never reaches the DB. Asserting after the
 *      fact would be too late — the row would already exist.
 *   2. RECORDS it, so the test fails loudly instead of passing with a blocked write
 *      that the app swallowed into an error toast.
 *
 * Scope: POST/PUT/PATCH/DELETE to the Supabase REST endpoint (/rest/v1/*). That
 * covers both table writes and RPC calls (/rest/v1/rpc/*), which are how this
 * codebase performs its cross-user writes (create_hub, accept_invite, …).
 *
 * Deliberately NOT railed: /auth/v1/* — sign-in POSTs a credential exchange to
 * /auth/v1/token and token refresh POSTs there too. Those are auth-path, not REST,
 * and write no application data. The glob below simply does not match them.
 */

import { test as base, expect } from '@playwright/test';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const test = base.extend({
  writeRail: [async ({ page }, use) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('VITE_SUPABASE_URL not set — refusing to run without the §0 write-rail armed.');
    }

    const violations = [];

    await page.route(`${supabaseUrl}/rest/v1/**`, async (route) => {
      const request = route.request();
      if (WRITE_METHODS.has(request.method())) {
        violations.push(`${request.method()} ${request.url()}`);
        await route.abort();
        return;
      }
      await route.continue();
    });

    await use(violations);

    expect(
      violations,
      `§0 write-rail fired — Stage 1 must not write to Supabase REST.\n${violations.join('\n')}`,
    ).toEqual([]);
  }, { auto: true }],
});

export { expect };
