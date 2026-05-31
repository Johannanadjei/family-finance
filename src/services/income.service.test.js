import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockRows;     // rows returned by a terminal .order()/.then()
let mockSingle;   // row returned by a terminal .single()
let eqCalls;      // [col, val] pairs passed to .eq()

vi.mock('../lib/supabase', () => {
  const make = () => {
    const q = {
      from:   () => q,
      select: () => q,
      insert: () => q,
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

import { getIncomeSources, addIncomeSource } from './income.service';

beforeEach(() => {
  mockRows   = [];
  mockSingle = { data: null, error: null };
  eqCalls    = [];
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
});
