import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockRows;     // rows returned by a terminal .order()/.then()
let mockSingle;   // row returned by a terminal .single()
let eqCalls;      // [col, val] pairs passed to .eq()
let insertArgs;   // payloads passed to .insert()
let updateArgs;   // payloads passed to .update()

vi.mock('../lib/supabase', () => {
  const make = () => {
    const q = {
      from:   () => q,
      select: () => q,
      insert: (payload) => { insertArgs.push(payload); return q; },
      update: (payload) => { updateArgs.push(payload); return q; },
      is:     () => q,
      eq:     (col, val) => { eqCalls.push([col, val]); return q; },
      single:      () => Promise.resolve(mockSingle),
      maybeSingle: () => Promise.resolve(mockSingle),
      order:  () => Promise.resolve({ data: mockRows, error: null }),
      then:   (fn) => Promise.resolve({ data: mockRows, error: null }).then(fn),
    };
    return q;
  };
  return { supabase: { from: () => make() } };
});

import { getIncomeSources, addIncomeSource, bulkAddIncomeSources, moveIncomeSourceToCycle } from './income.service';

beforeEach(() => {
  mockRows   = [];
  mockSingle = { data: null, error: null };
  eqCalls    = [];
  insertArgs = [];
  updateArgs = [];
});

// ── getIncomeSources — centre-scoped, never month-scoped ─────────────────────
// The month filter (Phase 2A) is GONE: callers slice by cycle_id client-side,
// because a month cannot name a period. A stray second argument must be ignored
// rather than quietly re-introducing a month filter.

describe('getIncomeSources', () => {
  it('filters by centre only — never by month', async () => {
    await getIncomeSources('c-1');
    expect(eqCalls).toContainEqual(['budget_centre_id', 'c-1']);
    expect(eqCalls.some(([col]) => col === 'month')).toBe(false);
  });

  it('ignores a month argument if one is passed by a stale caller', async () => {
    await getIncomeSources('c-1', '2026-05');
    expect(eqCalls.some(([col]) => col === 'month')).toBe(false);
  });

  it('returns an array on success and null on error (never masks failure)', async () => {
    mockRows = [{ id: 's-1', month: '2026-05' }];
    const ok = await getIncomeSources('c-1');
    expect(ok.data).toHaveLength(1);
    expect(ok.error).toBeNull();
  });
});

// ── addIncomeSource — month is required (validation) ──────────────────────────

describe('addIncomeSource', () => {
  const base = { label: 'Salary', expected_amount: 5000, currency: 'GHS', pay_day: 25, pay_day_type: 'fixed_date' };

  it('inserts and returns the row when month is valid', async () => {
    mockSingle = { data: { id: 's-1', ...base, month: '2026-05' }, error: null };
    const { data, error } = await addIncomeSource('c-1', { ...base, month: '2026-05' }, 'cyc-9');
    expect(error).toBeNull();
    expect(data.month).toBe('2026-05');
  });

  it('returns a validation error (no insert) when month is missing', async () => {
    const { data, error } = await addIncomeSource('c-1', base, 'cyc-9');   // no month
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

  // cycle_id is income's ONLY period key, so a missing one is refused BEFORE the
  // database is touched — the trigger must never be asked to resolve from month.
  it('REFUSES the insert (CYC02) when no cycleId is supplied', async () => {
    mockSingle = { data: { id: 's-1' }, error: null };
    const { data, error } = await addIncomeSource('c-1', { ...base, month: '2026-05' });
    expect(data).toBeNull();
    expect(error.message).toMatch(/cycleId/i);
    expect(insertArgs).toHaveLength(0);   // never reached the DB
  });
});

describe('bulkAddIncomeSources (cycle_id stamping)', () => {
  const base = { label: 'Salary', expected_amount: 5000, currency: 'GHS', pay_day: 25, pay_day_type: 'fixed_date', month: '2026-05' };

  it('forwards cycle_id onto every row when supplied', async () => {
    await bulkAddIncomeSources('c-1', [base, { ...base, label: 'Bonus' }], 'cyc-9');
    expect(insertArgs[0]).toHaveLength(2);
    expect(insertArgs[0].every(r => r.cycle_id === 'cyc-9')).toBe(true);
  });

  it('REFUSES the whole bulk insert (CYC02) when no cycleId is supplied', async () => {
    const { data, error } = await bulkAddIncomeSources('c-1', [base]);
    expect(data).toBeNull();
    expect(error.message).toMatch(/cycleId/i);
    expect(insertArgs).toHaveLength(0);   // never reached the DB
  });
});

// ── moveIncomeSourceToCycle — cycle_id and month move TOGETHER ────────────────
// A cycle_id-only update would not fire the UPDATE OF month trigger and would leave
// `month` pointing at the old period. Both columns in one statement is the contract.

describe('moveIncomeSourceToCycle', () => {
  it('updates cycle_id AND month in a single statement', async () => {
    mockSingle = { data: { id: 's-1', cycle_id: 'cyc-b', month: '2026-09' }, error: null };
    const { error } = await moveIncomeSourceToCycle('s-1', 'cyc-b', '2026-09');
    expect(error).toBeNull();
    expect(updateArgs[0]).toEqual({ cycle_id: 'cyc-b', month: '2026-09' });
  });

  it('never writes cycle_id without month', async () => {
    mockSingle = { data: null, error: null };
    await moveIncomeSourceToCycle('s-1', 'cyc-b', '2026-09');
    expect('month' in updateArgs[0]).toBe(true);
  });

  it('refuses without a target cycleId — no update reaches the DB', async () => {
    const { data, error } = await moveIncomeSourceToCycle('s-1', null, '2026-09');
    expect(data).toBeNull();
    expect(error.message).toMatch(/cycleId/i);
    expect(updateArgs).toHaveLength(0);
  });

  it('refuses without a month — no update reaches the DB', async () => {
    const { data, error } = await moveIncomeSourceToCycle('s-1', 'cyc-b', null);
    expect(data).toBeNull();
    expect(error.message).toMatch(/month/i);
    expect(updateArgs).toHaveLength(0);
  });

  it('surfaces a DB error truthfully (never masks it as data)', async () => {
    mockSingle = { data: null, error: { message: 'RLS denied' } };
    const { data, error } = await moveIncomeSourceToCycle('s-1', 'cyc-b', '2026-09');
    expect(data).toBeNull();
    expect(error.message).toBe('RLS denied');
  });
});
