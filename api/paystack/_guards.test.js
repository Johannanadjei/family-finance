/**
 * api/paystack/_guards.test.js
 *
 * The guards are pure functions over an injected env object, so every branch is
 * exercised directly — no process.env mutation, no handler plumbing.
 *
 * What these lock in is a SECURITY property, not a behaviour: before this module the
 * repo had no test-vs-live discriminator at all (go-live review §5), and the
 * Preview/Production key separation existed only as a Vercel dashboard convention. If
 * someone later "simplifies" a guard away, these fail.
 */

import { describe, it, expect } from 'vitest';
import {
  assertLiveKeyOnlyInProduction,
  assertPlanCodesDistinct,
  PaystackConfigError,
} from './_guards.js';

const LIVE = 'sk_live_abc123';
const TEST = 'sk_test_abc123';

describe('assertLiveKeyOnlyInProduction', () => {
  // ── the branch that must throw ────────────────────────────────────────────
  it('throws when a LIVE key is used outside production', () => {
    expect(() => assertLiveKeyOnlyInProduction({ PAYSTACK_SECRET_KEY: LIVE, VERCEL_ENV: 'preview' }))
      .toThrow(PaystackConfigError);
  });

  it('throws for a live key in the development environment', () => {
    expect(() => assertLiveKeyOnlyInProduction({ PAYSTACK_SECRET_KEY: LIVE, VERCEL_ENV: 'development' }))
      .toThrow(/not "production"/);
  });

  it('throws for a live key when VERCEL_ENV is absent (local, CI) — fail-closed', () => {
    expect(() => assertLiveKeyOnlyInProduction({ PAYSTACK_SECRET_KEY: LIVE }))
      .toThrow(/\(unset\)/);
  });

  it('carries a stable code and an actionable message', () => {
    try {
      assertLiveKeyOnlyInProduction({ PAYSTACK_SECRET_KEY: LIVE, VERCEL_ENV: 'preview' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(PaystackConfigError);
      expect(e.code).toBe('live_key_outside_production');
      expect(e.message).toMatch(/Production ONLY/);
      expect(e.message).toMatch(/go-live-runbook/);
    }
  });

  it('does not leak the key itself into the error message', () => {
    try {
      assertLiveKeyOnlyInProduction({ PAYSTACK_SECRET_KEY: LIVE, VERCEL_ENV: 'preview' });
    } catch (e) {
      expect(e.message).not.toContain('abc123');
    }
  });

  // ── the branch that must pass ─────────────────────────────────────────────
  it('allows a LIVE key in production', () => {
    expect(() => assertLiveKeyOnlyInProduction({ PAYSTACK_SECRET_KEY: LIVE, VERCEL_ENV: 'production' }))
      .not.toThrow();
  });

  it('allows a TEST key in every environment — a test key in production is safe, not fatal', () => {
    for (const VERCEL_ENV of ['production', 'preview', 'development', undefined]) {
      expect(() => assertLiveKeyOnlyInProduction({ PAYSTACK_SECRET_KEY: TEST, VERCEL_ENV })).not.toThrow();
    }
  });

  it('ignores an unset key — the routes have their own missing-key handling', () => {
    expect(() => assertLiveKeyOnlyInProduction({ VERCEL_ENV: 'preview' })).not.toThrow();
  });

  it('does not treat a key merely CONTAINING sk_live_ as a live key', () => {
    expect(() => assertLiveKeyOnlyInProduction({ PAYSTACK_SECRET_KEY: 'sk_test_sk_live_x', VERCEL_ENV: 'preview' }))
      .not.toThrow();
  });
});

describe('assertPlanCodesDistinct', () => {
  const ok = { PAYSTACK_PLAN_CODE_MONTHLY: 'PLN_mmm', PAYSTACK_PLAN_CODE_ANNUAL: 'PLN_aaa' };

  it('passes when both codes are present, well-formed and distinct', () => {
    expect(() => assertPlanCodesDistinct(ok)).not.toThrow();
  });

  it('throws when the two codes are identical — the invisible renewal bug', () => {
    try {
      assertPlanCodesDistinct({ PAYSTACK_PLAN_CODE_MONTHLY: 'PLN_same', PAYSTACK_PLAN_CODE_ANNUAL: 'PLN_same' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.code).toBe('plan_codes_identical');
      expect(e.message).toMatch(/renewal/);
    }
  });

  it('throws when a code is missing, naming which one', () => {
    try {
      assertPlanCodesDistinct({ PAYSTACK_PLAN_CODE_MONTHLY: 'PLN_mmm' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.code).toBe('plan_code_missing');
      expect(e.message).toContain('PAYSTACK_PLAN_CODE_ANNUAL');
      expect(e.message).not.toContain('PAYSTACK_PLAN_CODE_MONTHLY');
    }
  });

  it('names both when both are missing', () => {
    try {
      assertPlanCodesDistinct({});
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.code).toBe('plan_code_missing');
      expect(e.message).toContain('PAYSTACK_PLAN_CODE_MONTHLY');
      expect(e.message).toContain('PAYSTACK_PLAN_CODE_ANNUAL');
    }
  });

  it('throws when a code does not start with PLN_', () => {
    try {
      assertPlanCodesDistinct({ PAYSTACK_PLAN_CODE_MONTHLY: 'Pro Monthly', PAYSTACK_PLAN_CODE_ANNUAL: 'PLN_aaa' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.code).toBe('plan_code_malformed');
      expect(e.message).toContain('PAYSTACK_PLAN_CODE_MONTHLY');
    }
  });

  it('catches a SUB_ code pasted in by mistake', () => {
    expect(() => assertPlanCodesDistinct({
      PAYSTACK_PLAN_CODE_MONTHLY: 'PLN_mmm',
      PAYSTACK_PLAN_CODE_ANNUAL:  'SUB_xyz',
    })).toThrow(/PLN_/);
  });

  it('reports missing before malformed, so the message names the real problem', () => {
    try {
      assertPlanCodesDistinct({ PAYSTACK_PLAN_CODE_ANNUAL: 'not-a-plan' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.code).toBe('plan_code_missing');
    }
  });
});
