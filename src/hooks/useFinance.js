/**
 * hooks/useFinance.js
 *
 * Central financial state hook.
 * Loads transactions and income sources from Supabase.
 * Computes all derived financial values via lib/finance.js.
 * Handles all financial mutations with optimistic updates and rollbacks.
 *
 * PARAMETERS:
 *   { centre, categories } — from useBudgetCentre
 *
 * RULES:
 * - Never imports from mockData or constants for financial values
 * - All calculations use lib/finance.js functions
 * - All mutations follow optimistic update pattern with rollback
 * - markReceived is two-phase — both phases roll back on failure
 * - prefs are stored in localStorage only — never in Supabase
 * - txs always reflects current month unless loadMonth() is called
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getTransactionsByMonth, addTransaction as dbAddTransaction, updateTransaction as dbUpdateTransaction, deleteTransaction as dbDeleteTransaction } from '../services/transactions.service';
import { getIncomeSources } from '../services/income.service';
import {
  calcTotalIncome, calcTotalSpent, calcBudgetUsedPct,
  getBudgetStatusFromBudget, calcTotalFixed, calcFixedSpent,
  calcSpareMoney,
  calcTotalExpected, calcTotalReceived,
  calcWeeklyData, calcCategorySpend, calcTopCategories, calcDaysUntil,
  getCurrentMonth,
} from '../lib/finance';
import { loadPrefs, saveThemeSkin as persistSkin, saveThemeAccent as persistAccent, saveNotifications as persistNotifs } from '../lib/storage';
import { waitForSession } from '../lib/auth';
import { useIncomeMutations } from './useIncomeMutations';

export function useFinance({ centre, categories }) {
  const centreId      = centre?.id           || null;
  const surplusTarget = centre?.surplus_target || 0;
  const currency      = centre?.currency      || 'GHS';

  // ── State ─────────────────────────────────────────────────────────────────
  const [txs,            setTxs]            = useState([]);
  // allIncomes holds income sources across ALL months (Settings' all-months
  // view + the single mutation source-of-truth). `incomes` below is the
  // activeMonth slice derived from it — Payday/Home read the slice.
  const [allIncomes,     setAllIncomes]     = useState([]);
  const [activeMonth,    setActiveMonth]    = useState(getCurrentMonth());
  const [loading,        setLoading]        = useState(true);
  const [loaded,         setLoaded]         = useState(false);
  const [error,          setError]          = useState(null);
  const [prefs,          setPrefs]          = useState(() => loadPrefs());

  // ── Load functions ────────────────────────────────────────────────────────

  const loadTxs = useCallback(async (month) => {
    if (!centreId) return { data: [], error: null };
    const result = await getTransactionsByMonth(centreId, month);
    if (result.error) console.error('[useFinance] loadTxs error:', result.error.message);
    return result;
  }, [centreId]);

  // Loads every month's sources (no month filter) into allIncomes. The active
  // month is derived client-side (see `incomes` memo) so month navigation needs
  // no refetch, and mutations have a single list to update.
  const loadIncomes = useCallback(async () => {
    if (!centreId) return { data: [], error: null };
    const result = await getIncomeSources(centreId);
    if (result.error) console.error('[useFinance] loadIncomes error:', result.error.message);
    return result;
  }, [centreId]);

  const load = useCallback(async (month) => {
    if (!centreId) { setTxs([]); setAllIncomes([]); setLoaded(true); setLoading(false); return; }

    setLoading(true);
    setError(null);
    // Clear stale data so a previous hub's rows can't bleed in during the fetch.
    setTxs([]);
    setAllIncomes([]);

    // Auth-readiness gate — never query against an unhydrated/stale token (else a
    // cold-load query races the refresh, RLS returns an empty 200 → silent data loss).
    const { error: sessionErr } = await waitForSession();
    if (sessionErr) {
      console.error('[useFinance] session not ready:', sessionErr.message);
      setError('Could not verify your session. Please retry.');
      setLoading(false);
      return;
    }

    const [txResult, incomeResult] = await Promise.all([
      loadTxs(month),
      loadIncomes(),
    ]);

    // Never let an error masquerade as data: `loaded` flips true only on a clean fetch.
    let ok = true;
    if (txResult.error)     { setError(txResult.error.message); ok = false; }
    if (incomeResult.error) { setError(incomeResult.error.message); ok = false; }

    setTxs(txResult.data || []);
    setAllIncomes(incomeResult.data || []);
    if (ok) setLoaded(true);
    setLoading(false);
  }, [centreId, loadTxs, loadIncomes]);

  useEffect(() => {
    load(activeMonth);
  }, [load, activeMonth]);

  // ── Derived values ────────────────────────────────────────────────────────

  // Active-month slice of allIncomes. Payday/Home and every income total below
  // read THIS, not allIncomes — so they stay scoped to the month being viewed.
  const incomes        = useMemo(() => allIncomes.filter(i => i.month === activeMonth),         [allIncomes, activeMonth]);

  const monthlyIncome  = useMemo(() => calcTotalExpected(incomes),                              [incomes]);
  const totalIncome    = useMemo(() => calcTotalIncome(txs),                                    [txs]);
  const totalSpent     = useMemo(() => calcTotalSpent(txs),                                     [txs]);
  const totalReceived  = useMemo(() => calcTotalReceived(incomes),                              [incomes]);
  const totalExpected  = useMemo(() => calcTotalExpected(incomes),                              [incomes]);
  const totalPending   = useMemo(() => incomes.filter(i => !i.received).reduce((sum, i) => sum + (i.expected_amount || 0), 0), [incomes]);
  const allIncome      = useMemo(() => totalIncome,                                                   [totalIncome]);
  const fixedTotal     = useMemo(() => calcTotalFixed(categories),                              [categories]);
  const fixedSpent     = useMemo(() => calcFixedSpent(txs, categories),                        [txs, categories]);
  const budgetSpend    = useMemo(() => txs.filter(t => t.type === 'expense' && !t.from_spare).reduce((s, t) => s + Number(t.amount), 0), [txs]);
  const spareSpend     = useMemo(() => txs.filter(t => t.type === 'expense' &&  t.from_spare).reduce((s, t) => s + Number(t.amount), 0), [txs]);
  const spareMoney     = useMemo(() => calcSpareMoney(allIncome, fixedTotal, budgetSpend, spareSpend), [allIncome, fixedTotal, budgetSpend, spareSpend]);
  const budgetRemaining = useMemo(() => Math.max(0, fixedTotal - budgetSpend),                  [fixedTotal, budgetSpend]);
  const healthPct      = useMemo(() => calcBudgetUsedPct(budgetSpend, fixedTotal),              [budgetSpend, fixedTotal]);
  const budgetStatus   = useMemo(() => getBudgetStatusFromBudget(healthPct),                    [healthPct]);
  const weeklyData     = useMemo(() => calcWeeklyData(txs, categories, monthlyIncome),         [txs, categories, monthlyIncome]);
  const categorySpend  = useMemo(() => calcCategorySpend(txs, categories),                     [txs, categories]);
  const topCategories  = useMemo(() => calcTopCategories(txs),                                  [txs]);

  const nextUnpaid = useMemo(() => {
    const unpaid  = incomes.filter(i => !i.received);
    if (!unpaid.length) return null;

    const withDays = unpaid.map(i => ({
      ...i,
      label:     i.label,
      daysUntil: i.pay_day ? calcDaysUntil(i.pay_day) : null,
    }));

    // Sort: sources with a pay day come first, flexible last
    withDays.sort((a, b) => {
      if (a.daysUntil === null) return 1;
      if (b.daysUntil === null) return -1;
      return a.daysUntil - b.daysUntil;
    });

    return withDays[0];
  }, [incomes]);

  // ── Transaction mutations ─────────────────────────────────────────────────

  const addTransaction = useCallback(async (tx) => {
    if (!centreId) return { data: null, error: new Error('No active budget centre') };

    const tempId     = crypto.randomUUID();
    const optimistic = {
      ...tx,
      id:               tempId,
      budget_centre_id: centreId,
      _optimistic:      true,
    };

    setTxs(prev => [optimistic, ...prev]);

    const { data, error } = await dbAddTransaction(centreId, tx);

    if (error) {
      setTxs(prev => prev.filter(t => t.id !== tempId));
      console.error('[useFinance] addTransaction rollback:', error.message);
      return { data: null, error };
    }

    if (data) {
      setTxs(prev => prev.map(t => t.id === tempId ? { ...data, _optimistic: false } : t));
    } else {
      // Insert succeeded but RLS blocked read-back — keep all optimistic field values,
      // just clear the flag so the row is no longer dimmed/disabled.
      setTxs(prev => prev.map(t => t.id === tempId ? { ...t, _optimistic: false } : t));
    }
    return { data, error: null };
  }, [centreId]);

  const updateTransaction = useCallback(async (transactionId, updates) => {
    const prev = txs.find(t => t.id === transactionId);
    if (!prev) return { data: null, error: new Error('Transaction not found') };

    setTxs(prevTxs => prevTxs.map(t => t.id === transactionId ? { ...t, ...updates } : t));

    const { data, error } = await dbUpdateTransaction(transactionId, updates);

    if (error) {
      setTxs(prevTxs => prevTxs.map(t => t.id === transactionId ? prev : t));
      console.error('[useFinance] updateTransaction rollback:', error.message);
      return { data: null, error };
    }

    setTxs(prevTxs => prevTxs.map(t => t.id === transactionId ? { ...data, _optimistic: false } : t));
    return { data, error: null };
  }, [txs]);

  const deleteTransaction = useCallback(async (transactionId) => {
    const prev = txs.find(t => t.id === transactionId);
    if (!prev) return { error: new Error('Transaction not found') };

    setTxs(prevTxs => prevTxs.filter(t => t.id !== transactionId));

    const { error } = await dbDeleteTransaction(transactionId);

    if (error) {
      setTxs(prevTxs => [prev, ...prevTxs]);
      console.error('[useFinance] deleteTransaction rollback:', error.message);
      return { error };
    }

    return { error: null };
  }, [txs]);

  // ── Income mutations ──────────────────────────────────────────────────────
  // Extracted to useIncomeMutations to keep this hook within its size budget;
  // state still lives here and is passed in with its setters. See that file for
  // the two-phase optimistic + rollback reference implementation.

  const {
    markReceived,
    markPending,
    updateExpectedAmount,
    updateIncomeSource,
    addIncomeSource,
    copyIncomeSourcesToMonth,
    deleteIncomeSource,
    // Mutations operate on the full cross-month list (find-by-id is month-agnostic);
    // the activeMonth `incomes` slice re-derives automatically.
  } = useIncomeMutations({ centreId, currency, incomes: allIncomes, txs, setIncomes: setAllIncomes, setTxs });

  // ── Month navigation ──────────────────────────────────────────────────────

  const loadMonth = useCallback(async (month) => {
    setActiveMonth(month);
    await load(month);
  }, [load]);

  // ── Reload ────────────────────────────────────────────────────────────────

  const reload = useCallback(() => load(activeMonth), [load, activeMonth]);

  // ── Preferences ───────────────────────────────────────────────────────────

  const saveThemeSkin = useCallback((skin) => {
    persistSkin(skin);
    setPrefs(p => ({ ...p, themeSkin: skin }));
  }, []);

  const saveThemeAccent = useCallback((accent) => {
    persistAccent(accent);
    setPrefs(p => ({ ...p, themeAccent: accent }));
  }, []);

  const saveNotifications = useCallback((notifs) => {
    persistNotifs(notifs);
    setPrefs(p => ({ ...p, notifications: notifs }));
  }, []);

  // ── Return ────────────────────────────────────────────────────────────────

  return {
    // Raw data
    txs,
    incomes,        // activeMonth slice — Payday / Home / totals
    allIncomes,     // every month — Settings' all-months view
    activeMonth,

    // Derived financial values
    monthlyIncome,
    totalIncome,
    totalSpent,
    totalReceived,
    allIncome,
    totalExpected,
    totalPending,
    fixedTotal,
    fixedSpent,
    budgetSpend,
    spareSpend,
    spareMoney,
    budgetRemaining,
    surplusTarget,
    healthPct,
    budgetStatus,
    nextUnpaid,
    weeklyData,
    categorySpend,
    topCategories,

    // Transaction mutations
    addTransaction,
    updateTransaction,
    deleteTransaction,

    // Income mutations
    markReceived,
    markPending,
    updateExpectedAmount,
    updateIncomeSource,
    addIncomeSource,
    copyIncomeSourcesToMonth,
    deleteIncomeSource,

    // Navigation
    loadMonth,
    reload,

    // State
    loading,
    loaded,
    error,

    // Preferences
    prefs,
    saveThemeSkin,
    saveThemeAccent,
    saveNotifications,
  };
}
