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
vi.mock('../services/transactions.service', () => ({ getTransactionsByMonth: vi.fn(), addTransaction: vi.fn(), updateTransaction: vi.fn(), deleteTransaction: vi.fn() }));
vi.mock('../services/income.service', () => ({ getIncomeSources: vi.fn(), markReceived: vi.fn(), markPending: vi.fn(), updateExpectedAmount: vi.fn(), addIncomeSource: vi.fn(), deleteIncomeSource: vi.fn(), updateIncomeSource: vi.fn() }));
vi.mock('../lib/storage', () => ({ loadPrefs: () => ({ themeSkin: 'family_warmth' }), saveThemeSkin: vi.fn(), saveThemeAccent: vi.fn(), saveNotifications: vi.fn() }));

import { getTransactionsByMonth, addTransaction, updateTransaction, deleteTransaction } from '../services/transactions.service';
import { getIncomeSources, markReceived, markPending, deleteIncomeSource, updateIncomeSource } from '../services/income.service';

const C    = { id: 'centre-1', currency: 'GHS', surplus_target: 0 };
const CATS = [{ id: 'cat-1', name: 'Groceries', icon: '🛒', budget_amount: 500, is_fixed: true }];

// A single received income source and the income transaction it created via
// markReceived, linked by income_source_id (the FK this migration introduces).
const SOURCE = { id: 'inc-1', label: 'Salary', expected_amount: 5000, received: true, received_amount: 5000, currency: 'GHS', pay_day: 25, pay_day_type: 'fixed_date' };
const INCOME_TX = { id: 'tx-1', type: 'income', amount: 5000, category_name: 'Salary', description: 'Salary received', source: 'main_app', income_source_id: 'inc-1', date: '2026-05-19', week: 'Week 3', currency: 'GHS', _optimistic: false };

const mount = (txs, inc) => {
  getTransactionsByMonth.mockResolvedValue({ data: txs, error: null });
  getIncomeSources.mockResolvedValue({ data: inc, error: null });
  return renderHook(() => useFinance({ centre: C, categories: CATS }));
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
