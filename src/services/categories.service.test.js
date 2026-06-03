import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockSingle;   // row returned by a terminal .single()
let mockRows;     // rows returned by a terminal .then() (bulk insert .select())
let insertArgs;   // payloads passed to .insert()

vi.mock('../lib/supabase', () => {
  const make = () => {
    const q = {
      from:   () => q,
      select: () => q,
      insert: (payload) => { insertArgs.push(payload); return q; },
      is:     () => q,
      eq:     () => q,
      single: () => Promise.resolve(mockSingle),
      then:   (fn) => Promise.resolve({ data: mockRows, error: null }).then(fn),
    };
    return q;
  };
  return { supabase: { from: () => make() } };
});

import { addCategory, bulkAddCategories } from './categories.service';

beforeEach(() => {
  mockSingle = { data: null, error: null };
  mockRows   = [];
  insertArgs = [];
});

// Commit 14a — client-side cycle_id stamping. The mutation resolves cycle_id from
// the budget month and passes it through; the service forwards it into the insert
// when present, so the resolve_cycle_id trigger short-circuits on it. When absent
// (onboarding — no cycle exists yet) the payload omits it and the trigger resolves.

describe('addCategory', () => {
  const base = { name: 'Groceries', budget_amount: 500, month: '2026-05', sort_order: 0 };

  it('inserts and returns the row when the category is valid', async () => {
    mockSingle = { data: { id: 'cat-1', ...base }, error: null };
    const { data, error } = await addCategory('c-1', base);
    expect(error).toBeNull();
    expect(data.id).toBe('cat-1');
  });

  it('returns a validation error (no insert) when month is missing', async () => {
    const { data, error } = await addCategory('c-1', { name: 'Groceries', budget_amount: 500 });
    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(insertArgs).toHaveLength(0);
  });

  it('forwards cycle_id into the insert when supplied', async () => {
    mockSingle = { data: { id: 'cat-1' }, error: null };
    await addCategory('c-1', base, 'cyc-9');
    expect(insertArgs[0]).toMatchObject({ budget_centre_id: 'c-1', cycle_id: 'cyc-9' });
  });

  it('OMITS cycle_id from the insert when no cycleId supplied', async () => {
    mockSingle = { data: { id: 'cat-1' }, error: null };
    await addCategory('c-1', base);
    expect('cycle_id' in insertArgs[0]).toBe(false);
  });
});

describe('bulkAddCategories', () => {
  const base = { name: 'Groceries', budget_amount: 500, month: '2026-05', sort_order: 0 };

  it('forwards cycle_id onto every row when supplied (rollforward path)', async () => {
    await bulkAddCategories('c-1', [base, { ...base, name: 'Transport' }], 'cyc-9');
    expect(insertArgs[0]).toHaveLength(2);
    expect(insertArgs[0].every(r => r.cycle_id === 'cyc-9')).toBe(true);
  });

  it('OMITS cycle_id from every row when no cycleId supplied (onboarding path)', async () => {
    await bulkAddCategories('c-1', [base]);
    expect(insertArgs[0].every(r => !('cycle_id' in r))).toBe(true);
  });

  it('returns a validation error (no insert) when a row has no month', async () => {
    const { data, error } = await bulkAddCategories('c-1', [{ name: 'Groceries', budget_amount: 500 }]);
    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(insertArgs).toHaveLength(0);
  });
});
