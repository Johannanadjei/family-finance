import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockRows;     // rows returned by a terminal .order()/.then()
let mockSingle;   // row returned by a terminal .single()
let eqCalls;      // [col, val] pairs passed to .eq()
let insertArgs;   // payloads passed to .insert()

vi.mock('../lib/supabase', () => {
  const make = () => {
    const q = {
      from:   () => q,
      select: () => q,
      insert: (payload) => { insertArgs.push(payload); return q; },
      update: () => q,
      is:     () => q,
      eq:     (col, val) => { eqCalls.push([col, val]); return q; },
      single: () => Promise.resolve(mockSingle),
      order:  () => Promise.resolve({ data: mockRows, error: null }),
      then:   (fn) => Promise.resolve({ data: mockRows, error: null }).then(fn),
    };
    return q;
  };
  return { supabase: { from: () => make() } };
});

import { getIncomeSources, addIncomeSource, bulkAddIncomeSources } from './income.service';

beforeEach(() => {
  mockRows   = [];
  mockSingle = { data: null, error: null };
  eqCalls    = [];
  insertArgs = [];
});

// ── getIncomeSources — T1 red-first: month filtering ──────────────────────────

describe('getIncomeSources', () => {
  it('T1: filters by month with .eq("month", month) when a month is provided', async () => {
    await getIncomeSources('c-1', '2026-05');
    expect(eqCalls).toContainEqual(['budget_centre_id', 'c-1']);
    expect(eqCalls).toContainEqual(['month', '2026-05']);   // pre-2A ignored the arg → RED
  });

  it('does NOT filter by month when no month is provided (all-months view)', async () => {
    await getIncomeSources('c-1');
    expect(eqCalls).toContainEqual(['budget_centre_id', 'c-1']);
    expect(eqCalls.some(([col]) => col === 'month')).toBe(false);
  });

  it('returns an array on success and null on error (never masks failure)', async () => {
    mockRows = [{ id: 's-1', month: '2026-05' }];
    const ok = await getIncomeSources('c-1', '2026-05');
    expect(ok.data).toHaveLength(1);
    expect(ok.error).toBeNull();
  });
});

// ── addIncomeSource — month is required (validation) ──────────────────────────

describe('addIncomeSource', () => {
  const base = { label: 'Salary', expected_amount: 5000, currency: 'GHS', pay_day: 25, pay_day_type: 'fixed_date' };

  it('inserts and returns the row when month is valid', async () => {
    mockSingle = { data: { id: 's-1', ...base, month: '2026-05' }, error: null };
    const { data, error } = await addIncomeSource('c-1', { ...base, month: '2026-05' });
    expect(error).toBeNull();
    expect(data.month).toBe('2026-05');
  });

  it('returns a validation error (no insert) when month is missing', async () => {
    const { data, error } = await addIncomeSource('c-1', base);   // no month
    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(error.message).toMatch(/month/i);
  });

  // Commit 14a — client-side cycle_id stamping. When a cycleId is supplied it is
  // forwarded into the insert so the resolve_cycle_id trigger short-circuits on it.
  it('forwards cycle_id into the insert when supplied', async () => {
    mockSingle = { data: { id: 's-1' }, error: null };
    await addIncomeSource('c-1', { ...base, month: '2026-05' }, 'cyc-9');
    expect(insertArgs[0]).toMatchObject({ budget_centre_id: 'c-1', cycle_id: 'cyc-9' });
  });

  // No-regression contract for onboarding: no cycle exists yet, so no cycleId is
  // passed → the payload must OMIT cycle_id and let the trigger resolve from month.
  it('OMITS cycle_id from the insert when no cycleId supplied', async () => {
    mockSingle = { data: { id: 's-1' }, error: null };
    await addIncomeSource('c-1', { ...base, month: '2026-05' });
    expect('cycle_id' in insertArgs[0]).toBe(false);
  });
});

describe('bulkAddIncomeSources (cycle_id stamping)', () => {
  const base = { label: 'Salary', expected_amount: 5000, currency: 'GHS', pay_day: 25, pay_day_type: 'fixed_date', month: '2026-05' };

  it('forwards cycle_id onto every row when supplied', async () => {
    await bulkAddIncomeSources('c-1', [base, { ...base, label: 'Bonus' }], 'cyc-9');
    expect(insertArgs[0]).toHaveLength(2);
    expect(insertArgs[0].every(r => r.cycle_id === 'cyc-9')).toBe(true);
  });

  it('OMITS cycle_id from every row when no cycleId supplied (onboarding path)', async () => {
    await bulkAddIncomeSources('c-1', [base]);
    expect(insertArgs[0].every(r => !('cycle_id' in r))).toBe(true);
  });
});
