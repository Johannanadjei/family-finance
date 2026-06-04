/**
 * hooks/useFinance.js
 *
 * Central financial state hook.
 * Loads transactions and income sources from Supabase.
 * Computes all derived financial values via lib/finance.js.
 * Handles all financial mutations with optimistic updates and rollbacks.
 *
 * PARAMETERS:
 *   { centre, allCategories } — from useBudgetCentre. This hook owns ALL
 *   cycle-aware slices (transactions, income, categories), keyed on cycle_id.
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
import { getTransactionsByCycle } from '../services/transactions.service';
import { getIncomeSources } from '../services/income.service';
import { getCyclesForCentre, createBudgetPeriod } from '../services/cycles.service';
import { getActiveCycle, sliceByCycle } from '../lib/cycles';
import { getToday } from '../lib/dates';
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
import { useTransactionMutations } from './useTransactionMutations';

export function useFinance({ centre, allCategories }) {
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
  // Cycles are hub-scoped (not month-scoped) — loaded once per centre, never on
  // month navigation. activeCycle is derived; auto-create fills a gap silently.
  const [cycles,         setCycles]         = useState([]);
  const [cyclesLoading,  setCyclesLoading]  = useState(true);
  // Navigable selection for cycle-migrated views (Payday in Commit 5). Null →
  // falls back to the auto-resolved activeCycle at the read site. Reset per hub.
  const [activeCycleId,  setActiveCycleId]  = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [loaded,         setLoaded]         = useState(false);
  const [error,          setError]          = useState(null);
  const [prefs,          setPrefs]          = useState(() => loadPrefs());

  // ── Load functions ────────────────────────────────────────────────────────

  const loadTxs = useCallback(async (cycleId) => {
    if (!centreId) return { data: [], error: null };
    const result = await getTransactionsByCycle(centreId, cycleId);
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

  // Transactions are read by cycle_id (Commit 11). `cycleId` is resolved by the
  // gated loader effect below (after activeCycle is derived) — never undefined once
  // we reach the Promise.all. Income still loads all-months (deferred to the
  // client-slice migration); activeMonth state drives its `incomes` slice, so load
  // needs only the cycle id. The full guard stack (centre validity, waitForSession,
  // stale-clear) is preserved exactly — see useFinance.race.test.js.
  const load = useCallback(async (cycleId) => {
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

    // Cycles settled but none resolved yet (brand-new hub, auto-create in flight).
    // Hold WITHOUT flipping `loaded` — a successful-empty here would be a phantom.
    if (!cycleId) { setLoading(false); return; }

    const [txResult, incomeResult] = await Promise.all([
      loadTxs(cycleId),
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

  // ── Cycles ──────────────────────────────────────────────────────────────────
  // Loaded once per centre (keyed on centreId, NOT activeMonth) — cycles span the
  // whole hub, so month navigation must not refetch them.
  const loadCycles = useCallback(async () => {
    if (!centreId) { setCycles([]); setCyclesLoading(false); return; }
    setCyclesLoading(true);
    const { error: sessionErr } = await waitForSession();
    if (sessionErr) {
      console.error('[useFinance] loadCycles session not ready:', sessionErr.message);
      setCyclesLoading(false);
      return;
    }
    const { data, error } = await getCyclesForCentre(centreId);
    if (error) console.error('[useFinance] loadCycles error:', error.message);
    setCycles(data || []);
    setCyclesLoading(false);
  }, [centreId]);

  useEffect(() => { loadCycles(); }, [loadCycles]);

  // Drop the navigable selection on hub switch so it re-follows the new hub's
  // auto-resolved cycle (the read-site `?? activeCycle` fallback also covers a
  // stale id, but resetting keeps the stored value honest).
  useEffect(() => { setActiveCycleId(null); }, [centreId]);

  const activeCycle = useMemo(() => getActiveCycle(cycles, getToday()), [cycles]);

  // Gated loader (Commit 11) — the SOLE trigger of load(). Transactions read by
  // cycle_id, so we must wait for cycles to settle, then resolve the cycle id via
  // the viewedCycle fallback (activeCycleId is null until the user navigates; the
  // auto-resolved activeCycle covers mount). loadMonth/loadCycle/reload are
  // state-setters only — never call load() directly, or the page double-fetches.
  // The !centreId branch still routes through load() so its clear/loaded handling
  // runs; the cyclesLoading gate plus load()'s own cid-guard cover the in-flight
  // cases without ever presenting a phantom empty. See useFinance.race.test.js.
  useEffect(() => {
    if (!centreId)      { load(null); return; }
    if (cyclesLoading)  return;
    const cid = activeCycleId ?? activeCycle?.id;
    load(cid);
  }, [centreId, cyclesLoading, activeCycleId, activeCycle?.id, load]);

  // Anchor-aware auto-create (Commit 14b) was removed in Phase A of the anchor
  // pivot. Budget periods become user-driven in Phase B (no silent gap-filling).
  // See engineering-decisions.md.

  // ── Derived values ────────────────────────────────────────────────────────

  // The cycle whose data is loaded: the navigable selection, else the auto-resolved
  // current cycle. The single key for all client slices below (Commit 11.5).
  const viewedCycleId  = activeCycleId ?? activeCycle?.id ?? null;

  // Cycle slices of the all-rows arrays. Income, categories, and (via the gated
  // loader) transactions all scope to viewedCycleId — never the month string, which
  // Commit 13 drops. Categories was clock-derived in useBudgetCentre (Commit 8 bug);
  // it lives here now so one hook owns every cycle-aware slice.
  const incomes        = useMemo(() => sliceByCycle(allIncomes, viewedCycleId),                 [allIncomes, viewedCycleId]);
  const categories     = useMemo(() => sliceByCycle(allCategories || [], viewedCycleId),        [allCategories, viewedCycleId]);

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
  // Extracted to useTransactionMutations (symmetric with useIncomeMutations) to
  // keep this hook within its size budget; state still lives here and is passed in
  // with its setter. moveTransaction (Commit 12) re-homes a tx's cycle_id, preserving
  // its date — see that file for the optimistic-remove + rollback implementation.

  const {
    addTransaction,
    updateTransaction,
    moveTransaction,
    deleteTransaction,
  } = useTransactionMutations({ centreId, txs, setTxs });

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
  } = useIncomeMutations({ centreId, currency, cycles, incomes: allIncomes, txs, setIncomes: setAllIncomes, setTxs });

  // ── Month navigation ──────────────────────────────────────────────────────

  // State-setter only (Commit 11). The gated loader effect is the sole trigger of
  // load() — calling load() here too would double-fetch on every navigation.
  // activeMonth still drives the income `incomes` client slice (income read is
  // deferred), so navigation keeps setting it.
  const loadMonth = useCallback((month) => {
    setActiveMonth(month);
  }, []);

  // Cycle navigation (Budget Cycles). Selects a cycle AND bridges activeMonth to
  // it (income slice follows) — calendar cycles are 1:1 with months. Both state
  // updates batch into one render; the gated effect then loads the new cycle.
  const loadCycle = useCallback((cycleId) => {
    const cycle = cycles.find(c => c.id === cycleId);
    if (!cycle) return null;
    setActiveCycleId(cycleId);
    loadMonth(cycle.start_date.slice(0, 7));
    return cycle;
  }, [cycles, loadMonth]);

  // Create a user-driven budget period (Phase B), then refresh: re-fetch cycles so the
  // new period appears (NoCurrentPeriodPrompt flips off, nav updates) and select it so
  // the views land on the freshly-created window. The service gates on owner/full_access
  // and traps overlap as CYC01 — errors pass straight through to the caller's UI.
  const createPeriod = useCallback(async ({ name = null, startDate, endDate }) => {
    const { data, error } = await createBudgetPeriod(centreId, { name, startDate, endDate });
    if (error) return { data: null, error };
    await loadCycles();
    setActiveCycleId(data.id);
    return { data, error: null };
  }, [centreId, loadCycles]);

  // ── Reload ────────────────────────────────────────────────────────────────

  // Re-fetch the currently-viewed cycle. Resolves the cid via the same viewedCycle
  // fallback the gated effect uses (activeCycleId is null until the user navigates).
  const reload = useCallback(
    () => load(activeCycleId ?? activeCycle?.id),
    [load, activeCycleId, activeCycle?.id],
  );

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
    incomes,        // viewed-cycle slice — Payday / Home / totals
    allIncomes,     // every month — Settings' all-months view
    categories,     // viewed-cycle slice — feeds BudgetCentreContext + the totals below
    activeMonth,

    // Cycles (Budget Cycles) — hub-scoped; views migrate to these in Commits 5-9
    cycles,
    activeCycle,
    activeCycleId,
    viewedCycleId,  // activeCycleId ?? activeCycle?.id — single source for the cycle-id fallback (Commit 14a)
    loadCycle,
    reloadCycles: loadCycles,
    createPeriod,

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
    moveTransaction,
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
