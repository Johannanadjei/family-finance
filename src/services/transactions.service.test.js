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
// Captures for addTransaction's INSERT. `inserted` flips when .insert() runs so
// the shared .select() can act as a terminal (insert path) or stay chainable
// (read path) without two mock factories. `mockUser` is what auth.getUser()
// resolves to — the erasure guard below drives it directly.
let insertArgs;
let insertResult;
let inserted;
let mockUser;

vi.mock('../lib/supabase', () => {
  const make = () => {
    const q = {
      from:   () => q,
      is:     () => q,
      eq:     (col, val) => { eqCalls.push([col, val]); return q; },
      order:  (col, opts) => { orderCalls.push([col, opts]); return Promise.resolve(mockResult); },
      update: (vals) => { updateArgs.push(vals); return q; },
      single: () => Promise.resolve(singleResult),
      insert: (vals) => { insertArgs.push(vals); inserted = true; return q; },
    };
    // Chainable on the read path; terminal once .insert() has run.
    q.select = () => (inserted ? Promise.resolve(insertResult) : q);
    return q;
  };
  return {
    supabase: {
      from: () => make(),
      auth: { getUser: () => Promise.resolve({ data: { user: mockUser }, error: null }) },
    },
  };
});

// warnOnEmptyColdLoad is a canary, not under test here — stub it out.
vi.mock('../lib/auth', () => ({ warnOnEmptyColdLoad: vi.fn() }));

import { getTransactionsByCycle, moveTransactionToCycle, addTransaction } from './transactions.service';
import { mockNewTxPayload } from '../test-utils/fixtures';

beforeEach(() => {
  mockResult   = { data: [], error: null };
  singleResult = { data: null, error: null };
  eqCalls      = [];
  orderCalls   = [];
  updateArgs   = [];
  insertArgs   = [];
  insertResult = { data: [{ id: 'tx-1' }], error: null };
  inserted     = false;
  mockUser     = { id: 'u-1', email: 'someone@example.com', user_metadata: { full_name: 'Ama Mensah' } };
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

// ── addTransaction: logged_by_name must never carry an email ──────────────────
// logged_by_name is a denormalised string with no FK. Anything written here
// survives soft delete AND any future erasure of public.users / auth.users, so
// an email address landing here would be un-erasable personal data replicated
// across every transaction row. The live audit (2026-08-30) found 417 rows with
// an inline name and ZERO containing an email — these tests keep that at zero.
describe('addTransaction — logged_by_name erasure guard', () => {
  it('uses the display name from user metadata', async () => {
    await addTransaction('centre-1', mockNewTxPayload);
    expect(insertArgs[0].logged_by_name).toBe('Ama Mensah');
  });

  it('falls back to an EMPTY STRING, never the email, when no display name exists', async () => {
    mockUser = { id: 'u-1', email: 'someone@example.com', user_metadata: {} };
    await addTransaction('centre-1', mockNewTxPayload);
    expect(insertArgs[0].logged_by_name).toBe('');
    expect(insertArgs[0].logged_by_name).not.toBe('someone@example.com');
  });

  it('writes the email into NO column of the inserted row', async () => {
    mockUser = { id: 'u-1', email: 'someone@example.com', user_metadata: {} };
    await addTransaction('centre-1', mockNewTxPayload);
    expect(JSON.stringify(insertArgs[0])).not.toContain('someone@example.com');
  });

  it('still honours an explicitly supplied logged_by_name', async () => {
    await addTransaction('centre-1', { ...mockNewTxPayload, logged_by_name: 'Kofi' });
    expect(insertArgs[0].logged_by_name).toBe('Kofi');
  });

  it('leaves logged_by_name empty when there is no signed-in user at all', async () => {
    mockUser = null;
    await addTransaction('centre-1', mockNewTxPayload);
    expect(insertArgs[0].logged_by_name).toBe('');
  });
});
