/**
 * lib/fixtures.js
 *
 * Single source of truth for the Stage 1 QA fixture account identities.
 *
 * These are 7 manually-seeded, READ-ONLY accounts (6 primary + 1 supporting
 * member) used by Stage 1 UI smoke + visual-regression tests to reach states
 * (at-cap, Pro, history wall, standard-role) that the test suite itself is
 * forbidden from creating (Stage 1 = stop-before-submit, no writes — see
 * docs/qa/phase-1-stage-1-coverage.md §0 and §0.1).
 *
 * Seeding is a one-time MANUAL step performed by hand via the UI / SQL editor,
 * documented in docs/qa/fixture-accounts.md (the source of truth for ALL of
 * these, including the supporting member). Once seeded, these accounts MUST NOT
 * be touched manually — any login/edit corrupts the read-only baseline.
 *
 * Future Stage 1 / Stage 3 Playwright code imports STAGE_1_FIXTURE_EMAILS from
 * here rather than hardcoding email strings, so fixture identity has exactly one
 * definition. Pure constants — no React, no DB, no secrets (passwords live only
 * in the seeding doc / a password manager, never in source).
 */

/**
 * Condition → fixture identity. Most entries are a bare email string; the
 * supporting member carries a small descriptor so its role intent is explicit
 * in code (it is signed into as a *standard* member to verify AccessBlocked
 * screens — Phase 1 doc §3). Read emails via STAGE_1_FIXTURE_EMAILS below
 * rather than indexing values directly, since shapes are mixed by design.
 */
export const STAGE_1_FIXTURES = {
  fresh:   'stage1-fixture-fresh@bos-test.com',    // brand new, 0 hubs — onboarding / HUB01 from-zero
  hubCap:  'stage1-fixture-hub-cap@bos-test.com',  // exactly 1 hub (free cap) — HUB01 at-cap affordance
  catCap:  'stage1-fixture-cat-cap@bos-test.com',  // 1 hub, 10 categories — CAT01 affordance
  memCap:  'stage1-fixture-mem-cap@bos-test.com',  // owner of a 2-member hub — MEM01 affordance (owner perspective)
  memCapMember: {
    email:   'stage1-fixture-mem-cap-member@bos-test.com',
    role:    'standard',
    purpose: 'invited member for stage1-fixture-mem-cap, owner-perspective fixture; ' +
             'signed in as to verify standard-role AccessBlocked screens (Phase 1 §3)',
  },
  pro:     'stage1-fixture-pro@bos-test.com',      // Pro subscription, multi hub/cat — Pro state + Pro skins
  history: 'stage1-fixture-history@bos-test.com',  // 4+ cycles, free — history-wall affordance
};

/** Pull the email out of a fixture entry, whether bare string or descriptor. */
const emailOf = (fixture) => (typeof fixture === 'string' ? fixture : fixture.email);

/** Flat list of all 7 fixture emails (e.g. for allowlists / sweep assertions). */
export const STAGE_1_FIXTURE_EMAILS = Object.values(STAGE_1_FIXTURES).map(emailOf);
