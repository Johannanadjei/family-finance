import { describe, it, expect, vi, beforeEach } from 'vitest';

// Result the terminal .order() resolves to, and the .eq()/.order() args captured
// so we can assert the cycle-scoped query shape (Commit 11 read migration).
let mockResult;
let eqCalls;
let orderCalls;

vi.mock('../lib/supabase', () => {
  const make = () => {
    const q = {
      from:   () => q,
      select: () => q,
      is:     () => q,
      eq:     (col, val) => { eqCalls.push([col, val]); return q; },
      order:  (col, opts) => { orderCalls.push([col, opts]); return Promise.resolve(mockResult); },
    };
    return q;
  };
  return { supabase: { from: () => make() } };
});

// warnOnEmptyColdLoad is a canary, not under test here — stub it out.
vi.mock('../lib/auth', () => ({ warnOnEmptyColdLoad: vi.fn() }));

import { getTransactionsByCycle } from './transactions.service';

beforeEach(() => {
  mockResult = { data: [], error: null };
  eqCalls    = [];
  orderCalls = [];
});

describe('getTransactionsByCycle', () => {
  it('filters by budget_centre_id AND cycle_id (not a date range)', async () => {
    await getTransactionsByCycle('centre-1', 'cyc-99');
    expect(eqCalls).toContainEqual(['budget_centre_id', 'centre-1']);
    expect(eqCalls).toContainEqual(['cycle_id', 'cyc-99']);
  });

  it('orders by date descending (most recent first)', async () => {
    await getTransactionsByCycle('centre-1', 'cyc-99');
    expect(orderCalls).toContainEqual(['date', { ascending: false }]);
  });

  it('returns the rows array on success', async () => {
    mockResult = { data: [{ id: 'tx-1', cycle_id: 'cyc-99' }], error: null };
    const { data, error } = await getTransactionsByCycle('centre-1', 'cyc-99');
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('tx-1');
    expect(error).toBeNull();
  });

  it('returns an empty array (never null) on a genuine empty success', async () => {
    mockResult = { data: null, error: null };
    const { data, error } = await getTransactionsByCycle('centre-1', 'cyc-99');
    expect(data).toEqual([]);
    expect(error).toBeNull();
  });

  it('returns data:null and the error on failure (never masks a failure as [])', async () => {
    mockResult = { data: null, error: { message: 'permission denied' } };
    const { data, error } = await getTransactionsByCycle('centre-1', 'cyc-99');
    expect(data).toBeNull();                 // not [] — see CLAUDE.md §12
    expect(error).toEqual({ message: 'permission denied' });
  });
});
