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
import { getIncomeSources, markReceived as dbMarkReceived, markPending as dbMarkPending, updateExpectedAmount as dbUpdateExpectedAmount, addIncomeSource as dbAddIncomeSource, deleteIncomeSource as dbDeleteIncomeSource } from '../services/income.service';
import {
  calcTotalIncome, calcTotalSpent, calcRemaining, calcBudgetUsedPct,
  getBudgetStatusFromBudget, calcTotalFixed, calcFixedSpent, calcVariableSpent,
  calcTotalExpected, calcTotalReceived,
  calcWeeklyData, calcCategorySpend, calcTopCategories, calcDaysUntil,
  getWeekForDate, getCurrentMonth,
} from '../lib/finance';
import { loadPrefs, saveThemeSkin as persistSkin, saveThemeAccent as persistAccent, saveNotifications as persistNotifs } from '../lib/storage';

export function useFinance({ centre, categories }) {
  const centreId      = centre?.id           || null;
  const surplusTarget = centre?.surplus_target || 0;
  const currency      = centre?.currency      || 'GHS';

  // ── State ─────────────────────────────────────────────────────────────────
  const [txs,            setTxs]            = useState([]);
  const [incomes,        setIncomes]        = useState([]);
  const [activeMonth,    setActiveMonth]    = useState(getCurrentMonth());
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [prefs,          setPrefs]          = useState(() => loadPrefs());

  // ── Load functions ────────────────────────────────────────────────────────

  const loadTxs = useCallback(async (month) => {
    if (!centreId) return { data: [], error: null };
    const result = await getTransactionsByMonth(centreId, month);
    if (result.error) {
      console.error('[useFinance] loadTxs error:', result.error.message);
    }
    return result;
  }, [centreId]);

  const loadIncomes = useCallback(async () => {
    if (!centreId) return { data: [], error: null };
    const result = await getIncomeSources(centreId);
    if (result.error) {
      console.error('[useFinance] loadIncomes error:', result.error.message);
    }
    return result;
  }, [centreId]);

  const load = useCallback(async (month) => {
    if (!centreId) {
      setTxs([]);
      setIncomes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    // Clear stale data immediately — prevents previous hub's data bleeding in
    // during the async fetch when the user switches control centres.
    setTxs([]);
    setIncomes([]);

    const [txResult, incomeResult] = await Promise.all([
      loadTxs(month),
      loadIncomes(),
    ]);

    if (txResult.error)     setError(txResult.error.message);
    if (incomeResult.error) setError(incomeResult.error.message);

    setTxs(txResult.data);
    setIncomes(incomeResult.data);
    setLoading(false);
  }, [centreId, loadTxs, loadIncomes]);

  useEffect(() => {
    load(activeMonth);
  }, [load, activeMonth]);

  // ── Derived values ────────────────────────────────────────────────────────

  const monthlyIncome  = useMemo(() => calcTotalExpected(incomes),                              [incomes]);
  const totalIncome    = useMemo(() => calcTotalIncome(txs),                                    [txs]);
  const totalSpent     = useMemo(() => calcTotalSpent(txs),                                     [txs]);
  const totalReceived  = useMemo(() => calcTotalReceived(incomes),                              [incomes]);
  const totalExpected  = useMemo(() => calcTotalExpected(incomes),                              [incomes]);
  const totalPending   = useMemo(() => incomes.filter(i => !i.received).reduce((sum, i) => sum + (i.expected_amount || 0), 0), [incomes]);
  const allIncome      = useMemo(() => totalIncome,                                                   [totalIncome]);
  const availableNow   = useMemo(() => allIncome - totalSpent,                                  [allIncome, totalSpent]);
  const fixedTotal     = useMemo(() => calcTotalFixed(categories),                              [categories]);
  const fixedSpent     = useMemo(() => calcFixedSpent(txs, categories),                        [txs, categories]);
  const variableSpent  = useMemo(() => calcVariableSpent(txs, categories),                     [txs, categories]);
  const spareMoney     = useMemo(() => allIncome - fixedTotal - variableSpent,                  [allIncome, fixedTotal, variableSpent]);
  const remaining      = useMemo(() => calcRemaining(allIncome, totalSpent),                    [allIncome, totalSpent]);
  const healthPct      = useMemo(() => calcBudgetUsedPct(fixedSpent, fixedTotal),               [fixedSpent, fixedTotal]);
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

  const markReceived = useCallback(async (sourceId, receivedAmount, actualPayDate) => {
    const income = incomes.find(i => i.id === sourceId);
    if (!income) return { error: new Error('Income source not found') };

    // Phase 1 optimistic — update incomes state
    const prevIncomes = incomes;
    setIncomes(prev => prev.map(i =>
      i.id === sourceId
        ? { ...i, received: true, received_amount: receivedAmount, actual_pay_date: actualPayDate }
        : i
    ));

    // Phase 1 write — update income_sources in Supabase
    const { error: incomeErr } = await dbMarkReceived(sourceId, receivedAmount, actualPayDate);

    if (incomeErr) {
      setIncomes(prevIncomes);
      console.error('[useFinance] markReceived phase 1 rollback:', incomeErr.message);
      return { error: incomeErr };
    }

    // Phase 2 write — create income transaction
    const today      = actualPayDate || new Date().toISOString().split('T')[0];
    const { data: txData, error: txErr } = await dbAddTransaction(centreId, {
      date:          today,
      week:          getWeekForDate(today),
      type:          'income',
      category_name: income.label,
      currency:      income.currency || currency,
      amount:        receivedAmount,
      description:   income.label + ' received',
      source:        'main_app',
    });

    if (txErr) {
      // Phase 2 failed — rollback both phases
      setIncomes(prevIncomes);
      await dbMarkPending(sourceId);
      console.error('[useFinance] markReceived phase 2 rollback:', txErr.message);
      return { error: txErr };
    }

    // Both phases succeeded — add transaction to local state if read-back succeeded
    if (txData) setTxs(prev => [{ ...txData, _optimistic: false }, ...prev]);
    return { error: null };
  }, [centreId, incomes, currency]);

  const markPending = useCallback(async (sourceId) => {
    const income = incomes.find(i => i.id === sourceId);
    if (!income) return { error: new Error('Income source not found') };

    const prevIncomes = incomes;
    const prevTxs     = txs;

    // Find the matching income transaction
    const matchingTx = txs.find(t =>
      t.type          === 'income' &&
      t.category_name === income.label &&
      t.source        === 'main_app' &&
      !t.deleted_at
    );

    // Optimistic — reset incomes state
    setIncomes(prev => prev.map(i =>
      i.id === sourceId
        ? { ...i, received: false, received_amount: 0, actual_pay_date: null }
        : i
    ));

    // Optimistic — remove transaction from local state
    if (matchingTx) {
      setTxs(prev => prev.filter(t => t.id !== matchingTx.id));
    }

    // Phase 1 write — reset income_sources
    const { error: incomeErr } = await dbMarkPending(sourceId);

    if (incomeErr) {
      setIncomes(prevIncomes);
      setTxs(prevTxs);
      console.error('[useFinance] markPending phase 1 rollback:', incomeErr.message);
      return { error: incomeErr };
    }

    // Phase 2 write — soft delete the income transaction
    if (matchingTx) {
      const { error: txErr } = await dbDeleteTransaction(matchingTx.id);

      if (txErr) {
        setIncomes(prevIncomes);
        setTxs(prevTxs);
        await dbMarkReceived(sourceId, income.received_amount, income.actual_pay_date);
        console.error('[useFinance] markPending phase 2 rollback:', txErr.message);
        return { error: txErr };
      }
    }

    return { error: null };
  }, [incomes, txs]);

  const updateExpectedAmount = useCallback(async (sourceId, newAmount, extras = {}) => {
    const prev = incomes.find(i => i.id === sourceId);
    if (!prev) return { error: new Error('Income source not found') };

    const prevIncomes = incomes;
    setIncomes(p => p.map(i =>
      i.id === sourceId ? { ...i, expected_amount: newAmount, ...extras } : i
    ));

    const { error } = await dbUpdateExpectedAmount(sourceId, newAmount, extras);

    if (error) {
      setIncomes(prevIncomes);
      console.error('[useFinance] updateExpectedAmount rollback:', error.message);
      return { error };
    }

    return { error: null };
  }, [incomes]);

  const addIncomeSource = useCallback(async (source) => {
    if (!centreId) return { data: null, error: new Error('No active budget centre') };
    const tempId     = crypto.randomUUID();
    const optimistic = { ...source, id: tempId, budget_centre_id: centreId, received: false, received_amount: 0, _optimistic: true };
    setIncomes(prev => [...prev, optimistic]);
    const { data, error } = await dbAddIncomeSource(centreId, source);
    if (error) {
      setIncomes(prev => prev.filter(i => i.id !== tempId));
      console.error('[useFinance] addIncomeSource rollback:', error.message);
      return { data: null, error };
    }
    setIncomes(prev => prev.map(i => i.id === tempId ? { ...data, _optimistic: false } : i));
    return { data, error: null };
  }, [centreId]);

  const deleteIncomeSource = useCallback(async (sourceId) => {
    const prev = incomes.find(i => i.id === sourceId);
    if (!prev) return { error: new Error('Income source not found') };
    const prevIncomes = incomes;
    setIncomes(prevList => prevList.filter(i => i.id !== sourceId));
    const { error } = await dbDeleteIncomeSource(sourceId);
    if (error) {
      setIncomes(prevIncomes);
      console.error('[useFinance] deleteIncomeSource rollback:', error.message);
      return { error };
    }
    return { error: null };
  }, [incomes]);

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
    incomes,
    activeMonth,

    // Derived financial values
    monthlyIncome,
    totalIncome,
    totalSpent,
    totalReceived,
    allIncome,
    totalExpected,
    totalPending,
    availableNow,
    fixedTotal,
    fixedSpent,
    variableSpent,
    spareMoney,
    surplusTarget,
    remaining,
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
    addIncomeSource,
    deleteIncomeSource,

    // Navigation
    loadMonth,
    reload,

    // State
    loading,
    error,

    // Preferences
    prefs,
    saveThemeSkin,
    saveThemeAccent,
    saveNotifications,
  };
}
