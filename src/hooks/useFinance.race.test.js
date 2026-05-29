/**
 * hooks/useFinance.race.test.js
 *
 * Regression guard for the data-loss-on-refresh bug class.
 *
 * Root cause: useFinance fired Supabase queries off the React `user`/`centre`
 * before the auth token was hydrated. RLS-blocked queries returned 200 with [],
 * which rendered as an empty dashboard ("data loss"). A second refresh worked
 * because the session was warm by then.
 *
 * These tests assert:
 *   1. the first fetch DOES NOT fire until waitForSession() resolves (gating)
 *   2. a failed fetch surfaces an error and does NOT present a successful-empty
 *   3. a genuine empty result sets loaded=true (distinguishable from failure)
 *   4. when the session never readies, the fetch never fires and an error shows
 *
 * Written to FAIL against the pre-fix code (where useFinance had no gate), the
 * same way the modal-handoff regression test (300b434) was proven first.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFinance } from './useFinance';

vi.mock('../lib/auth', () => ({
  waitForSession:     vi.fn(),
  warnOnEmptyColdLoad: vi.fn(),
  sessionAgeMs:       vi.fn(() => 0),
}));
vi.mock('../services/transactions.service', () => ({
  getTransactionsByMonth: vi.fn(), addTransaction: vi.fn(), updateTransaction: vi.fn(), deleteTransaction: vi.fn(),
}));
vi.mock('../services/income.service', () => ({
  getIncomeSources: vi.fn(), markReceived: vi.fn(), markPending: vi.fn(),
  updateExpectedAmount: vi.fn(), addIncomeSource: vi.fn(), deleteIncomeSource: vi.fn(),
}));
vi.mock('../lib/storage', () => ({
  loadPrefs: () => ({ themeSkin: 'family_warmth' }),
  saveThemeSkin: vi.fn(), saveThemeAccent: vi.fn(), saveNotifications: vi.fn(),
}));

import { waitForSession } from '../lib/auth';
import { getTransactionsByMonth } from '../services/transactions.service';
import { getIncomeSources } from '../services/income.service';

const C    = { id: 'centre-1', currency: 'GHS', surplus_target: 4500 };
const CATS = [{ id: 'cat-1', name: 'Groceries', budget_amount: 500, is_fixed: true }];

describe('useFinance — auth-readiness gate (data-loss-on-refresh)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('does NOT query Supabase until waitForSession resolves', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    waitForSession.mockReturnValue(gate);
    getTransactionsByMonth.mockResolvedValue({ data: [], error: null });
    getIncomeSources.mockResolvedValue({ data: [], error: null });

    renderHook(() => useFinance({ centre: C, categories: CATS }));

    // Flush microtasks — the fetch must STILL be blocked behind the gate.
    await Promise.resolve();
    await Promise.resolve();
    expect(getTransactionsByMonth).not.toHaveBeenCalled();
    expect(getIncomeSources).not.toHaveBeenCalled();

    // Open the gate — now the fetch is allowed to fire.
    release({ data: { session: { expires_at: 9_999_999_999 } }, error: null });
    await waitFor(() => expect(getTransactionsByMonth).toHaveBeenCalled());
  });

  it('surfaces an error (not a silent empty) when the fetch fails', async () => {
    waitForSession.mockResolvedValue({ data: { session: { expires_at: 9_999_999_999 } }, error: null });
    getTransactionsByMonth.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    getIncomeSources.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useFinance({ centre: C, categories: CATS }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('permission denied');
    expect(result.current.loaded).toBe(false); // did not present a successful-empty
    expect(result.current.txs).toEqual([]);     // safe array even on failure
  });

  it('marks loaded=true on a genuine empty result', async () => {
    waitForSession.mockResolvedValue({ data: { session: { expires_at: 9_999_999_999 } }, error: null });
    getTransactionsByMonth.mockResolvedValue({ data: [], error: null });
    getIncomeSources.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useFinance({ centre: C, categories: CATS }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(null);
    expect(result.current.loaded).toBe(true);
    expect(result.current.txs).toEqual([]);
  });

  it('blocks the fetch and surfaces an error when the session never readies', async () => {
    waitForSession.mockResolvedValue({ data: null, error: new Error('Session not established') });

    const { result } = renderHook(() => useFinance({ centre: C, categories: CATS }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getTransactionsByMonth).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
    expect(result.current.loaded).toBe(false);
  });
});
