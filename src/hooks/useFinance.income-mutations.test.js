/**
 * useFinance.income-mutations.test.js
 *
 * Regression tests for the income-source ↔ income-transaction reconciliation
 * (income_source_id FK migration). Guards three shipped bugs:
 *
 *   T1 (Bug A) — editing a received source's amount updates the linked income
 *                tx, so Home allIncome reflects the NEW amount, not new+old.
 *   T2 (Bug A2)— the income tx is linked by FK, not by label string. After a
 *                label change, markPending finds + removes the tx by FK and a
 *                re-confirm replaces it (allIncome = single amount, not double).
 *   T3 (Bug B) — deleting a received source soft-deletes its linked income tx,
 *                so Home allIncome drops to the recalculated total.
 *
 * Each test is RED against pre-FK code (see Phase 1/3 diagnosis) and GREEN
 * after the fix.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useFinance } from './useFinance';

vi.mock('../lib/auth', () => ({ waitForSession: vi.fn().mockResolvedValue({ data: { session: { expires_at: 9999999999 } }, error: null }), warnOnEmptyColdLoad: vi.fn(), sessionAgeMs: vi.fn(() => 0) }));
vi.mock('../services/transactions.service', () => ({ getTransactionsByCycle: vi.fn(), addTransaction: vi.fn(), updateTransaction: vi.fn(), deleteTransaction: vi.fn() }));
vi.mock('../services/income.service', () => ({ getIncomeSources: vi.fn(), markReceived: vi.fn(), markPending: vi.fn(), updateExpectedAmount: vi.fn(), addIncomeSource: vi.fn(), bulkAddIncomeSources: vi.fn(), deleteIncomeSource: vi.fn(), updateIncomeSource: vi.fn() }));
vi.mock('../services/cycles.service', () => ({ getCyclesForCentre: vi.fn().mockResolvedValue({ data: [], error: null }) }));
vi.mock('../lib/storage', () => ({ loadPrefs: () => ({ themeSkin: 'family_warmth' }), saveThemeSkin: vi.fn(), saveThemeAccent: vi.fn(), saveNotifications: vi.fn() }));

import { getTransactionsByCycle, addTransaction, updateTransaction, deleteTransaction } from '../services/transactions.service';
import { getIncomeSources, markReceived, markPending, addIncomeSource, bulkAddIncomeSources, deleteIncomeSource, updateIncomeSource } from '../services/income.service';
import { getCyclesForCentre } from '../services/cycles.service';

const C    = { id: 'centre-1', currency: 'GHS', surplus_target: 0 };
const CATS = [{ id: 'cat-1', name: 'Groceries', icon: '🛒', budget_amount: 500, is_fixed: true }];
// Wide-range cycle that always contains today, so the Commit-11 gated loader
// resolves a cid and load() fetches txs (these tests assert on tx-derived allIncome).
const CURRENT = { id: 'cyc-cur', budget_centre_id: 'centre-1', name: 'Current', start_date: '2000-01-01', end_date: '2999-12-31', anchor_type: 'calendar', deleted_at: null };

// A single received income source and the income transaction it created via
// markReceived, linked by income_source_id (the FK this migration introduces).
const SOURCE = { id: 'inc-1', label: 'Salary', expected_amount: 5000, received: true, received_amount: 5000, currency: 'GHS', pay_day: 25, pay_day_type: 'fixed_date' };
const INCOME_TX = { id: 'tx-1', type: 'income', amount: 5000, category_name: 'Salary', description: 'Salary received', source: 'main_app', income_source_id: 'inc-1', date: '2026-05-19', week: 'Week 3', currency: 'GHS', _optimistic: false };

const mount = (txs, inc, cycles = [CURRENT]) => {
  getTransactionsByCycle.mockResolvedValue({ data: txs, error: null });
  getIncomeSources.mockResolvedValue({ data: inc, error: null });
  getCyclesForCentre.mockResolvedValue({ data: cycles, error: null });
  return renderHook(() => useFinance({ centre: C, allCategories: CATS }));
};

describe('useFinance — income mutation reconciliation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ── T1: Bug A — edit amount replaces, never adds ──────────────────────────
  it('T1: editing a received source amount updates the linked tx → allIncome reflects the NEW amount, not new+old', async () => {
    const { result } = mount([{ ...INCOME_TX }], [{ ...SOURCE }]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.allIncome).toBe(5000);

    // Server returns the updated source row + the reconciled tx row.
    updateIncomeSource.mockResolvedValue({ data: { ...SOURCE, expected_amount: 8000 }, error: null });
    updateTransaction.mockResolvedValue({ data: { ...INCOME_TX, amount: 8000 }, error: null });

    await act(async () => {
      await result.current.updateIncomeSource('inc-1', {
        label: 'Salary', expected_amount: 8000, pay_day_type: 'fixed_date', pay_day: 25,
      });
    });

    // Home's transaction-derived income must be 8000 — NOT 5000 (stale) and NOT 13000 (added).
    expect(result.current.allIncome).toBe(8000);
  });

  // ── T2: Bug A2 — FK link survives a label change; re-confirm replaces ──────
  it('T2: after a label change orphans the string match, markPending+re-confirm yields a SINGLE income (FK match), not a double', async () => {
    // Source label already edited to "Wages"; the income tx still carries the
    // old category_name "Salary" — exactly the orphaned state a Settings label
    // edit produces. The only durable link is income_source_id.
    const renamed = { ...SOURCE, label: 'Wages' };
    const { result } = mount([{ ...INCOME_TX }], [renamed]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.allIncome).toBe(5000);

    // Un-confirm: must locate the linked tx by FK (not by label) and remove it.
    markPending.mockResolvedValue({ error: null });
    deleteTransaction.mockResolvedValue({ error: null });
    await act(async () => { await result.current.markPending('inc-1'); });

    // Re-confirm: inserts a fresh income tx for the same source.
    markReceived.mockResolvedValue({ error: null });
    addTransaction.mockResolvedValue({ data: { id: 'tx-2', type: 'income', amount: 5000, category_name: 'Wages', description: 'Wages received', source: 'main_app', income_source_id: 'inc-1', date: '2026-05-25', week: 'Week 4', currency: 'GHS', _optimistic: false }, error: null });
    await act(async () => { await result.current.markReceived('inc-1', 5000, '2026-05-25'); });

    // Single income of 5000 — the old tx was removed by FK match. Pre-fix the
    // string match misses "Wages", leaves tx-1 in place, and this is 10000.
    expect(result.current.allIncome).toBe(5000);
  });

  // ── T3: Bug B — delete removes the linked income tx ───────────────────────
  it('T3: deleting a received source soft-deletes its linked income tx → allIncome drops to recalculated total', async () => {
    const { result } = mount([{ ...INCOME_TX }], [{ ...SOURCE }]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.allIncome).toBe(5000);

    deleteIncomeSource.mockResolvedValue({ error: null });
    deleteTransaction.mockResolvedValue({ error: null });

    await act(async () => { await result.current.deleteIncomeSource('inc-1'); });

    // The only income source is gone AND its income tx is gone → Home shows 0.
    expect(result.current.allIncome).toBe(0);
    expect(result.current.incomes).toHaveLength(0);
  });

  // ── T4: parity with migrate_20/21 — the income tx always carries the HUB
  //        currency, never the (vestigial) per-source currency, even when they
  //        diverge. Pre-fix this stamped income.currency ('EUR'); post-fix it is
  //        always the hub's 'GHS'. ──────────────────────────────────────────────
  it('T4: markReceived stamps the income tx with the hub currency, ignoring a divergent income_sources.currency', async () => {
    const diverged = { ...SOURCE, received: false, received_amount: 0, currency: 'EUR' };
    const { result } = mount([], [diverged]);
    await waitFor(() => expect(result.current.loading).toBe(false));

    markReceived.mockResolvedValue({ error: null });
    addTransaction.mockResolvedValue({ data: { ...INCOME_TX, id: 'tx-9', currency: 'GHS' }, error: null });
    await act(async () => { await result.current.markReceived('inc-1', 5000, '2026-05-25'); });

    expect(addTransaction).toHaveBeenCalledWith('centre-1', expect.objectContaining({ currency: 'GHS' }));
  });
});

// ── Phase 2B: income rollforward (copyIncomeSourcesToCycle) ─────────────────
// Both ends of the copy are CYCLE IDS. allIncomes spans two periods; the source
// period has two recurring sources plus one migration "Other Income" bucket that
// must never carry forward.
const FROM = '2026-05', TO = '2026-06';
const CYC_FROM = { id: 'cyc-may', budget_centre_id: 'centre-1', name: 'May', start_date: FROM + '-01', end_date: FROM + '-31', anchor_type: 'calendar', deleted_at: null };
const CYC_TO   = { id: 'cyc-jun', budget_centre_id: 'centre-1', name: 'Jun', start_date: TO   + '-01', end_date: TO   + '-30', anchor_type: 'calendar', deleted_at: null };
const CYC_EMPTY= { id: 'cyc-apr', budget_centre_id: 'centre-1', name: 'Apr', start_date: '2026-04-01', end_date: '2026-04-30', anchor_type: 'calendar', deleted_at: null };
const ALL_INCOMES = [
  { id: 'inc-1',    label: 'Adjei Salary', icon: '💰', expected_amount: 30000, currency: 'GHS', pay_day: 31,   pay_day_type: 'last_working_day', received: true,  received_amount: 30000, month: FROM, cycle_id: 'cyc-may', notes: '' },
  { id: 'inc-2',    label: 'Dita Salary',  icon: '💼', expected_amount: 15000, currency: 'GHS', pay_day: 25,   pay_day_type: 'fixed_date',       received: false, received_amount: 0,     month: FROM, cycle_id: 'cyc-may', notes: '' },
  { id: 'bucket-1', label: 'Other Income', icon: '💰', expected_amount: 0,     currency: 'GHS', pay_day: null, pay_day_type: 'flexible',         received: true,  received_amount: 500,   month: FROM, cycle_id: 'cyc-may', notes: '__one_off_bucket__' },
];
const serverRow = (id, label, month, cycle_id) => ({ id, label, icon: '💰', expected_amount: 1, currency: 'GHS', pay_day: null, pay_day_type: 'flexible', received: false, received_amount: 0, month, cycle_id, notes: '' });
const CYCLES = [CURRENT, CYC_FROM, CYC_TO, CYC_EMPTY];

describe('useFinance — copyIncomeSourcesToCycle (Phase 2B rollforward)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('copies ALL non-bucket sources when no ids are passed, into the target PERIOD', async () => {
    const { result } = mount([], ALL_INCOMES.map(s => ({ ...s })), CYCLES);
    await waitFor(() => expect(result.current.loading).toBe(false));

    bulkAddIncomeSources.mockResolvedValue({ data: [serverRow('new-1', 'Adjei Salary', TO, 'cyc-jun'), serverRow('new-2', 'Dita Salary', TO, 'cyc-jun')], error: null });
    await act(async () => { await result.current.copyIncomeSourcesToCycle('cyc-may', 'cyc-jun'); });

    expect(bulkAddIncomeSources).toHaveBeenCalledTimes(1);
    const [cid, rows, cycleId] = bulkAddIncomeSources.mock.calls[0];
    expect(cid).toBe('centre-1');
    expect(cycleId).toBe('cyc-jun');                               // the TARGET period id, passed straight through
    expect(rows).toHaveLength(2);                                  // the bucket is excluded
    expect(rows.map(r => r.label).sort()).toEqual(['Adjei Salary', 'Dita Salary']);
    expect(rows.every(r => r.month === TO)).toBe(true);            // month DERIVED from the target period
    expect(rows.every(r => r.notes === '')).toBe(true);
    // Server rows land in allIncomes under the new period.
    expect(result.current.allIncomes.filter(i => i.cycle_id === 'cyc-jun')).toHaveLength(2);
  });

  it('copies only the explicitly selected subset', async () => {
    const { result } = mount([], ALL_INCOMES.map(s => ({ ...s })), CYCLES);
    await waitFor(() => expect(result.current.loading).toBe(false));

    bulkAddIncomeSources.mockResolvedValue({ data: [serverRow('new-2', 'Dita Salary', TO, 'cyc-jun')], error: null });
    await act(async () => { await result.current.copyIncomeSourcesToCycle('cyc-may', 'cyc-jun', ['inc-2']); });

    const [, rows] = bulkAddIncomeSources.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('Dita Salary');
  });

  it('excludes one-off buckets even when their id is passed explicitly (data-layer backstop)', async () => {
    const { result } = mount([], ALL_INCOMES.map(s => ({ ...s })), CYCLES);
    await waitFor(() => expect(result.current.loading).toBe(false));

    bulkAddIncomeSources.mockResolvedValue({ data: [serverRow('new-1', 'Adjei Salary', TO, 'cyc-jun')], error: null });
    await act(async () => { await result.current.copyIncomeSourcesToCycle('cyc-may', 'cyc-jun', ['inc-1', 'bucket-1']); });

    const [, rows] = bulkAddIncomeSources.mock.calls[0];
    expect(rows).toHaveLength(1);                                  // bucket-1 filtered out
    expect(rows[0].label).toBe('Adjei Salary');
  });

  it('is a no-op (no insert) when the source PERIOD has no copyable sources', async () => {
    const { result } = mount([], ALL_INCOMES.map(s => ({ ...s })), CYCLES);
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      const r = await result.current.copyIncomeSourcesToCycle('cyc-apr', 'cyc-jun');   // April is empty
      expect(r.error).toBeNull();
      expect(r.data).toEqual([]);
    });
    expect(bulkAddIncomeSources).not.toHaveBeenCalled();
  });

  it('REFUSES (no insert) when the TARGET period id is unknown — validated before any work', async () => {
    const { result } = mount([], ALL_INCOMES.map(s => ({ ...s })), CYCLES);
    await waitFor(() => expect(result.current.loading).toBe(false));

    let res;
    await act(async () => { res = await result.current.copyIncomeSourcesToCycle('cyc-may', 'cyc-nope'); });

    expect(res.error).toBeTruthy();
    expect(res.error.message).toMatch(/cyc-nope/);
    expect(bulkAddIncomeSources).not.toHaveBeenCalled();
    // and nothing optimistic was left behind
    expect(result.current.allIncomes).toHaveLength(ALL_INCOMES.length);
  });

  it('inserts optimistic rows immediately, then rolls them ALL back when the bulk insert fails', async () => {
    const { result } = mount([], ALL_INCOMES.map(s => ({ ...s })), CYCLES);
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = result.current.allIncomes.length;

    let resolveBulk;
    bulkAddIncomeSources.mockReturnValue(new Promise(res => { resolveBulk = res; }));

    let pending;
    await act(async () => { pending = result.current.copyIncomeSourcesToCycle('cyc-may', 'cyc-jun'); });
    // Optimistic: both new rows carry the TARGET cycle_id before the service settles.
    expect(result.current.allIncomes.filter(i => i.cycle_id === 'cyc-jun')).toHaveLength(2);

    await act(async () => { resolveBulk({ data: null, error: new Error('network') }); await pending; });
    // Rolled back — every optimistic row removed, list back to its original size.
    expect(result.current.allIncomes.length).toBe(before);
    expect(result.current.allIncomes.filter(i => i.cycle_id === 'cyc-jun')).toHaveLength(0);
  });
});

// cycle_id is income's ONLY period key: addIncomeSource takes a period id from the
// caller and DERIVES `month` from it. Nothing resolves a month back to a period.
describe('useFinance — addIncomeSource (cycle_id is the key, month is derived)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('stamps the caller-chosen period and derives month from its start_date', async () => {
    const { result } = mount([], [], CYCLES);
    await waitFor(() => expect(result.current.loading).toBe(false));

    addIncomeSource.mockResolvedValue({ data: serverRow('new-1', 'Freelance', TO, 'cyc-jun'), error: null });
    // NOTE: no `month` on the payload — the caller does not supply one any more.
    const newSource = { label: 'Freelance', icon: '💰', expected_amount: 1, currency: 'GHS', pay_day: null, pay_day_type: 'flexible', notes: '' };
    await act(async () => { await result.current.addIncomeSource(newSource, 'cyc-jun'); });

    expect(addIncomeSource).toHaveBeenCalledWith('centre-1', { ...newSource, month: TO }, 'cyc-jun');
  });

  it('DERIVES month from the period even when the caller passes a contradictory one', async () => {
    // The bug this workstream closes: month and cycle_id disagreeing. The period wins.
    const { result } = mount([], [], CYCLES);
    await waitFor(() => expect(result.current.loading).toBe(false));

    addIncomeSource.mockResolvedValue({ data: serverRow('new-1', 'Freelance', TO, 'cyc-jun'), error: null });
    const newSource = { label: 'Freelance', expected_amount: 1, currency: 'GHS', pay_day: null, pay_day_type: 'flexible', month: '1999-01', notes: '' };
    await act(async () => { await result.current.addIncomeSource(newSource, 'cyc-jun'); });

    const [, row] = addIncomeSource.mock.calls[0];
    expect(row.month).toBe(TO);            // NOT '1999-01'
  });

  it('picks the period by ID even when two periods start in the SAME month', async () => {
    // The exact production shape ("The house"): Sept 1–17 and Sept 18 – Oct 18.
    // Under the old month lookup this was a coin flip; by id there is no ambiguity.
    const SEP_A = { id: 'cyc-sep-a', budget_centre_id: 'centre-1', name: 'Sep A', start_date: '2026-09-01', end_date: '2026-09-17', anchor_type: 'custom', deleted_at: null };
    const SEP_B = { id: 'cyc-sep-b', budget_centre_id: 'centre-1', name: 'Sep B', start_date: '2026-09-18', end_date: '2026-10-18', anchor_type: 'custom', deleted_at: null };
    const { result } = mount([], [], [CURRENT, SEP_A, SEP_B]);
    await waitFor(() => expect(result.current.loading).toBe(false));

    addIncomeSource.mockResolvedValue({ data: serverRow('new-1', 'Freelance', '2026-09', 'cyc-sep-b'), error: null });
    const newSource = { label: 'Freelance', expected_amount: 1, currency: 'GHS', pay_day: null, pay_day_type: 'flexible', notes: '' };
    await act(async () => { await result.current.addIncomeSource(newSource, 'cyc-sep-b'); });

    const [, row, cycleId] = addIncomeSource.mock.calls[0];
    expect(cycleId).toBe('cyc-sep-b');     // the one asked for, not the first September
    expect(row.month).toBe('2026-09');     // both share this month — which is why it can't be the key
  });

  it('refuses (no insert) when the period id is unknown — CYC02 invariant', async () => {
    const { result } = mount([], [], CYCLES);
    await waitFor(() => expect(result.current.loading).toBe(false));

    const newSource = { label: 'Freelance', expected_amount: 1, currency: 'GHS', pay_day: null, pay_day_type: 'flexible', notes: '' };
    let res;
    await act(async () => { res = await result.current.addIncomeSource(newSource, 'cyc-nope'); });

    expect(res.error).toBeTruthy();
    expect(addIncomeSource).not.toHaveBeenCalled();
  });
});
