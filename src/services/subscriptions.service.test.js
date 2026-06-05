/**
 * services/subscriptions.service.test.js
 *
 * Covers getCurrentSubscription (fetch: filters, soft-delete, error) and
 * resolveSubscription (pure tier logic: none/active/expired/canceled-in-period).
 *
 * Supabase is mocked as a chainable query builder terminating at .maybeSingle(),
 * mirroring cycles.service.test.js.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockResolve;   // resolves .maybeSingle()
let eqCalls;       // [col, val] pairs passed to .eq()
let isCalls;       // [col, val] pairs passed to .is()

vi.mock('../lib/supabase', () => {
  const chain = () => {
    const q = {
      from:        () => q,
      select:      () => q,
      eq:          (col, val) => { eqCalls.push([col, val]); return q; },
      is:          (col, val) => { isCalls.push([col, val]); return q; },
      order:       () => q,
      limit:       () => q,
      maybeSingle: () => Promise.resolve(mockResolve),
    };
    return q;
  };
  return { supabase: { from: () => chain() } };
});

import { getCurrentSubscription, resolveSubscription } from './subscriptions.service';

const proRow = {
  id:                   'sub-1',
  user_id:              'user-1',
  tier:                 'pro',
  status:               'active',
  current_period_end:   '2999-01-01T00:00:00Z',
  cancel_at_period_end: false,
};

beforeEach(() => {
  mockResolve = { data: null, error: null };
  eqCalls     = [];
  isCalls     = [];
});

// ── getCurrentSubscription ──────────────────────────────────────────────────
describe('getCurrentSubscription', () => {
  it('filters by user_id and deleted_at, returns the row on success', async () => {
    mockResolve = { data: proRow, error: null };
    const { data, error } = await getCurrentSubscription('user-1');
    expect(error).toBeNull();
    expect(data).toEqual(proRow);
    expect(eqCalls).toContainEqual(['user_id', 'user-1']);
    expect(isCalls).toContainEqual(['deleted_at', null]);
  });

  it('returns data null (no row) without an error when the user has no subscription', async () => {
    mockResolve = { data: null, error: null };
    const { data, error } = await getCurrentSubscription('user-1');
    expect(data).toBeNull();
    expect(error).toBeNull();
  });

  it('returns the error truthfully on a failed fetch (never masks as data)', async () => {
    mockResolve = { data: null, error: { message: 'rls denied' } };
    const { data, error } = await getCurrentSubscription('user-1');
    expect(data).toBeNull();
    expect(error).toEqual({ message: 'rls denied' });
  });

  it('short-circuits to data null with no DB call when userId is missing', async () => {
    const { data, error } = await getCurrentSubscription(null);
    expect(data).toBeNull();
    expect(error).toBeNull();
    expect(eqCalls).toEqual([]);
  });
});

// ── resolveSubscription (pure) ──────────────────────────────────────────────
describe('resolveSubscription', () => {
  const now = new Date('2026-06-05T00:00:00Z');

  it('resolves a null row to free', () => {
    expect(resolveSubscription(null, now)).toEqual({
      subscription: null, tier: 'free', isActive: false, isPro: false,
    });
  });

  it('resolves an active, in-period pro row to pro', () => {
    const row = { tier: 'pro', status: 'active', current_period_end: '2026-07-05T00:00:00Z' };
    const r = resolveSubscription(row, now);
    expect(r).toMatchObject({ tier: 'pro', isActive: true, isPro: true });
  });

  it('resolves an expired active row (period ended) to free', () => {
    const row = { tier: 'pro', status: 'active', current_period_end: '2026-05-01T00:00:00Z' };
    const r = resolveSubscription(row, now);
    expect(r).toMatchObject({ tier: 'free', isActive: false, isPro: false });
  });

  it('resolves a canceled-in-period row (cancel_at_period_end, period still open) to pro', () => {
    const row = { tier: 'pro', status: 'active', cancel_at_period_end: true, current_period_end: '2026-07-05T00:00:00Z' };
    const r = resolveSubscription(row, now);
    expect(r).toMatchObject({ tier: 'pro', isActive: true, isPro: true });
  });

  it('resolves a canceled (non-active status) row to free', () => {
    const row = { tier: 'pro', status: 'canceled', current_period_end: '2026-07-05T00:00:00Z' };
    const r = resolveSubscription(row, now);
    expect(r).toMatchObject({ tier: 'free', isActive: false, isPro: false });
  });

  it('treats a null current_period_end as open-ended (active → pro)', () => {
    const row = { tier: 'pro', status: 'active', current_period_end: null };
    const r = resolveSubscription(row, now);
    expect(r).toMatchObject({ tier: 'pro', isActive: true, isPro: true });
  });
});
