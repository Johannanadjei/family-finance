import { describe, it, expect, vi, beforeEach } from 'vitest';

// Result the terminal .order() resolves to, and the .eq()/.order() args captured
// so we can assert the cycle-scoped query shape (Commit 11 read migration).
let mockResult;
let eqCalls;
let orderCalls;
// Captures for the cycle-scoped UPDATE (moveTransactionToCycle). `singleResult`
// is what the terminal .single() resolves to; updateArgs/eqCalls assert the shape.
let singleResult;
let updateArgs;

vi.mock('../lib/supabase', () => {
  const make = () => {
    const q = {
      from:   () => q,
      select: () => q,
      is:     () => q,
      eq:     (col, val) => { eqCalls.push([col, val]); return q; },
      order:  (col, opts) => { orderCalls.push([col, opts]); return Promise.resolve(mockResult); },
      update: (vals) => { updateArgs.push(vals); return q; },
      single: () => Promise.resolve(singleResult),
    };
    return q;
  };
  return { supabase: { from: () => make() } };
});

// warnOnEmptyColdLoad is a canary, not under test here — stub it out.
vi.mock('../lib/auth', () => ({ warnOnEmptyColdLoad: vi.fn() }));

import { getTransactionsByCycle, moveTransactionToCycle } from './transactions.service';

beforeEach(() => {
  mockResult   = { data: [], error: null };
  singleResult = { data: null, error: null };
  eqCalls      = [];
  orderCalls   = [];
  updateArgs   = [];
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

describe('moveTransactionToCycle', () => {
  it('writes cycle_id directly (not date) and returns the updated row on success', async () => {
    singleResult = { data: { id: 'tx-1', cycle_id: 'cyc-jun', date: '2026-05-31' }, error: null };
    const { data, error } = await moveTransactionToCycle('tx-1', 'cyc-jun');
    expect(updateArgs).toContainEqual({ cycle_id: 'cyc-jun' });   // only cycle_id — date preserved
    expect(eqCalls).toContainEqual(['id', 'tx-1']);
    expect(data.cycle_id).toBe('cyc-jun');
    expect(data.date).toBe('2026-05-31');                         // date untouched (Path 2)
    expect(error).toBeNull();
  });

  it('returns the error on a failed update', async () => {
    singleResult = { data: null, error: { message: 'permission denied' } };
    const { data, error } = await moveTransactionToCycle('tx-1', 'cyc-jun');
    expect(data).toBeNull();
    expect(error).toEqual({ message: 'permission denied' });
  });

  it('refuses a falsy cycleId without touching the database (CYC02 guard)', async () => {
    const { data, error } = await moveTransactionToCycle('tx-1', null);
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect(updateArgs).toHaveLength(0);   // no write attempted
  });
});
