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
vi.mock('../services/cycles.service', () => ({ getCyclesForCentre: vi.fn().mockResolvedValue({ data: [], error: null }), createCalendarCycle: vi.fn().mockResolvedValue({ data: null, error: null }) }));
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
});

// ── Phase 2B: income rollforward (copyIncomeSourcesToMonth) ──────────────────
// allIncomes spans two months; May has two recurring sources plus one migration
// "Other Income" bucket that must never carry forward.
const PREV = '2026-04', FROM = '2026-05', TO = '2026-06';
// Rollforward stamps cycle_id on the optimistic rows by resolving the TARGET month
// (Commit 11.5, mirroring the Commit-10 trigger). Tests that insert must seed a cycle
// whose start-month is TO, alongside CURRENT (which the gated loader needs for today).
const CYC_TO = { id: 'cyc-jun', budget_centre_id: 'centre-1', name: 'Jun', start_date: TO + '-01', end_date: TO + '-30', anchor_type: 'calendar', deleted_at: null };
const ALL_INCOMES = [
  { id: 'inc-1',   label: 'Adjei Salary', icon: '💰', expected_amount: 30000, currency: 'GHS', pay_day: 31,   pay_day_type: 'last_working_day', received: true,  received_amount: 30000, month: FROM, notes: '' },
  { id: 'inc-2',   label: 'Dita Salary',  icon: '💼', expected_amount: 15000, currency: 'GHS', pay_day: 25,   pay_day_type: 'fixed_date',       received: false, received_amount: 0,     month: FROM, notes: '' },
  { id: 'bucket-1', label: 'Other Income', icon: '💰', expected_amount: 0,     currency: 'GHS', pay_day: null, pay_day_type: 'flexible',         received: true,  received_amount: 500,   month: FROM, notes: '__one_off_bucket__' },
];
const serverRow = (id, label, month) => ({ id, label, icon: '💰', expected_amount: 1, currency: 'GHS', pay_day: null, pay_day_type: 'flexible', received: false, received_amount: 0, month, notes: '' });

describe('useFinance — copyIncomeSourcesToMonth (Phase 2B rollforward)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('copies ALL non-bucket sources when no ids are passed, into the target month', async () => {
    const { result } = mount([], ALL_INCOMES.map(s => ({ ...s })), [CURRENT, CYC_TO]);
    await waitFor(() => expect(result.current.loading).toBe(false));

    bulkAddIncomeSources.mockResolvedValue({ data: [serverRow('new-1', 'Adjei Salary', TO), serverRow('new-2', 'Dita Salary', TO)], error: null });
    await act(async () => { await result.current.copyIncomeSourcesToMonth(FROM, TO); });

    expect(bulkAddIncomeSources).toHaveBeenCalledTimes(1);
    const [cid, rows, cycleId] = bulkAddIncomeSources.mock.calls[0];
    expect(cid).toBe('centre-1');
    expect(cycleId).toBe('cyc-jun');   // Commit 14a — TARGET cycle_id stamped into the DB insert too
    expect(rows).toHaveLength(2);                                  // the bucket is excluded
    expect(rows.map(r => r.label).sort()).toEqual(['Adjei Salary', 'Dita Salary']);
    expect(rows.every(r => r.month === TO)).toBe(true);
    expect(rows.every(r => r.notes === '')).toBe(true);
    // Server rows land in allIncomes under the new month.
    expect(result.current.allIncomes.filter(i => i.month === TO)).toHaveLength(2);
  });

  it('copies only the explicitly selected subset', async () => {
    const { result } = mount([], ALL_INCOMES.map(s => ({ ...s })), [CURRENT, CYC_TO]);
    await waitFor(() => expect(result.current.loading).toBe(false));

    bulkAddIncomeSources.mockResolvedValue({ data: [serverRow('new-2', 'Dita Salary', TO)], error: null });
    await act(async () => { await result.current.copyIncomeSourcesToMonth(FROM, TO, ['inc-2']); });

    const [, rows] = bulkAddIncomeSources.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('Dita Salary');
  });

  it('excludes one-off buckets even when their id is passed explicitly (data-layer backstop)', async () => {
    const { result } = mount([], ALL_INCOMES.map(s => ({ ...s })), [CURRENT, CYC_TO]);
    await waitFor(() => expect(result.current.loading).toBe(false));

    bulkAddIncomeSources.mockResolvedValue({ data: [serverRow('new-1', 'Adjei Salary', TO)], error: null });
    await act(async () => { await result.current.copyIncomeSourcesToMonth(FROM, TO, ['inc-1', 'bucket-1']); });

    const [, rows] = bulkAddIncomeSources.mock.calls[0];
    expect(rows).toHaveLength(1);                                  // bucket-1 filtered out
    expect(rows[0].label).toBe('Adjei Salary');
  });

  it('is a no-op (no insert) when the source month has no copyable sources', async () => {
    const { result } = mount([], ALL_INCOMES.map(s => ({ ...s })));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      const r = await result.current.copyIncomeSourcesToMonth(PREV, TO);   // April is empty
      expect(r.error).toBeNull();
      expect(r.data).toEqual([]);
    });
    expect(bulkAddIncomeSources).not.toHaveBeenCalled();
  });

  it('inserts optimistic rows immediately, then rolls them ALL back when the bulk insert fails', async () => {
    const { result } = mount([], ALL_INCOMES.map(s => ({ ...s })), [CURRENT, CYC_TO]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = result.current.allIncomes.length;

    let resolveBulk;
    bulkAddIncomeSources.mockReturnValue(new Promise(res => { resolveBulk = res; }));

    let pending;
    await act(async () => { pending = result.current.copyIncomeSourcesToMonth(FROM, TO); });
    // Optimistic: both new TO-month rows are present before the service settles.
    expect(result.current.allIncomes.filter(i => i.month === TO)).toHaveLength(2);

    await act(async () => { resolveBulk({ data: null, error: new Error('network') }); await pending; });
    // Rolled back — every optimistic row removed, list back to its original size.
    expect(result.current.allIncomes.length).toBe(before);
    expect(result.current.allIncomes.filter(i => i.month === TO)).toHaveLength(0);
  });
});

// Commit 14a — addIncomeSource forwards the resolved cycle_id into the DB insert.
describe('useFinance — addIncomeSource (cycle_id stamping)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('threads the cycle_id resolved from the source month to the DB insert', async () => {
    const { result } = mount([], [], [CURRENT, CYC_TO]);
    await waitFor(() => expect(result.current.loading).toBe(false));

    addIncomeSource.mockResolvedValue({ data: serverRow('new-1', 'Freelance', TO), error: null });
    const newSource = { label: 'Freelance', icon: '💰', expected_amount: 1, currency: 'GHS', pay_day: null, pay_day_type: 'flexible', month: TO, notes: '' };
    await act(async () => { await result.current.addIncomeSource(newSource); });

    expect(addIncomeSource).toHaveBeenCalledWith('centre-1', newSource, 'cyc-jun');
  });

  it('refuses (no insert) when no cycle covers the source month — CYC02 invariant', async () => {
    const { result } = mount([], [], [CURRENT]);   // CURRENT starts 2000-01 — no cycle for TO
    await waitFor(() => expect(result.current.loading).toBe(false));

    const newSource = { label: 'Freelance', expected_amount: 1, currency: 'GHS', pay_day: null, pay_day_type: 'flexible', month: TO, notes: '' };
    let res;
    await act(async () => { res = await result.current.addIncomeSource(newSource); });

    expect(res.error).toBeTruthy();
    expect(addIncomeSource).not.toHaveBeenCalled();
  });
});
