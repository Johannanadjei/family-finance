/**
 * hooks/useFinance.js
 *
 * Central financial state hook.
 * Loads transactions and income sources from Supabase.
 * Computes all derived financial values via lib/finance.js.
 * Handles all financial mutations with optimistic updates and rollbacks.
 *
 * PARAMETERS:
 *   { centre, allCategories, hubPlan, memberRole, reloadCategories } — from
 *   useBudgetCentre. This hook owns ALL cycle-aware slices (transactions, income,
 *   categories), keyed on cycle_id. memberRole gates the auto-continue write;
 *   reloadCategories re-syncs the categories that write carries forward.
 *
 * RULES:
 * - Never imports from mockData or constants for financial values
 * - All calculations use lib/finance.js functions
 * - All mutations follow optimistic update pattern with rollback
 * - markReceived is two-phase — both phases roll back on failure
 * - prefs are stored in localStorage only — never in Supabase
 * - txs always reflects current month unless loadMonth() is called
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createBudgetPeriod, resetBudgetPeriod } from '../services/cycles.service';
import { landingCycle, cycleForToday, sliceByCycle, visibleCycleWindow } from '../lib/cycles';
import { getToday } from '../lib/dates';
import { getLimitsForTier } from '../lib/plans';
import { can } from '../lib/roles';
import {
  calcTotalIncome, calcTotalSpent, calcBudgetUsedPct,
  getBudgetStatusFromBudget, calcTotalFixed, calcFixedSpent,
  calcSpareMoney,
  calcTotalExpected, calcTotalReceived, calcReceivedForSource, calcUnassignedIncome,
  calcWeeklyData, calcCategorySpend, calcTopCategories, pickNextUnpaid,
  getCurrentMonth,
} from '../lib/finance';
import { loadPrefs, saveThemeSkin as persistSkin, saveThemeAccent as persistAccent, saveNotifications as persistNotifs } from '../lib/storage';
import { useHubLoad } from './useHubLoad';
import { useHubFreshness } from './useHubFreshness';
import { useAutoContinuePeriod } from './useAutoContinuePeriod';
import { useIncomeMutations } from './useIncomeMutations';
import { useTransactionMutations } from './useTransactionMutations';

export function useFinance({ centre, allCategories, hubPlan = null, memberRole = 'standard', reloadCategories = null }) {
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

  // ── Loaders ───────────────────────────────────────────────────────────────
  // Extracted to useHubLoad (symmetric with useIncomeMutations /
  // useTransactionMutations) to keep this hook within its size budget; the state
  // still lives here and is passed in with its setters. That file owns the
  // loud-vs-silent contract and the reloadHub() entry point this hook's freshness
  // gate and realtime subscription both call.
  //
  // viewedCycleIdRef exists because reload()/reloadHub() need the viewed cycle id,
  // which is derived BELOW (after cycles resolve). A render-phase ref write hands
  // it to them at call time and keeps both callbacks stable.
  const viewedCycleIdRef = useRef(null);

  const { loadCycles, load, reload, reloadHub, lastLoadedAt } = useHubLoad({
    centreId, viewedCycleIdRef, reloadCategories,
    setTxs, setAllIncomes, setCycles, setCyclesLoading,
    setLoading, setLoaded, setError,
  });

  // Multi-device freshness (see useHubFreshness):
  //   realtime  — postgres_changes on the contentless hub_activity ticker, so a
  //               change by any member lands here within ~1s
  //   foreground — visibilitychange → visible and window 'online', when the last
  //               clean fetch is over 30s old; the backstop for a missed event,
  //               a killed socket, or a relaunch
  // Registers nothing until a hub resolves.
  useHubFreshness({ centreId, reloadHub, lastLoadedAt, realtime: true });

  useEffect(() => { loadCycles(); }, [loadCycles]);

  // Drop the navigable selection on hub switch so it re-follows the new hub's
  // auto-resolved cycle (the read-site `?? activeCycle` fallback also covers a
  // stale id, but resetting keeps the stored value honest).
  useEffect(() => { setActiveCycleId(null); }, [centreId]);

  // NAV fallback (may NOT contain today) vs the strict "is now covered?" answer.
  // Decisions key off currentCycle; activeCycle only picks what to SHOW — see lib/cycles.
  const activeCycle  = useMemo(() => landingCycle(cycles, getToday()), [cycles]);
  const currentCycle = useMemo(() => cycleForToday(cycles, getToday()), [cycles]);

  // ── Auto-continue (migrate_28) ──────────────────────────────────────────────
  // The guarded writer — role / already-covered / once-per-hub-and-month / no retry;
  // useAutoContinuePeriod.js explains why each of the four is load-bearing. It also
  // owns refreshAfterPeriodWrite, the single post-write refresh createPeriod shares.
  const { refreshAfterPeriodWrite, ensurePeriodNow, autoPeriod, dismissAutoPeriod, autoWillFire, autoFiring } =
    useAutoContinuePeriod({
      centreId, cycles, cyclesLoading, loadCycles, reloadCategories,
      canManageCycles: can(memberRole, 'manageCycles'),
      onPeriodSelected: setActiveCycleId,
    });

  // History visibility gate (client-side, soft UX nudge — NOT a privacy boundary).
  // The newest-N cycles a tier may navigate to (3 free / Infinity pro). Views read
  // visibleCycles for ALL navigation (getCycleNav, viewedCycle, move-to-period);
  // the full `cycles` list stays for internal plumbing (active-cycle resolution,
  // mutations). See lib/cycles.visibleCycleWindow + docs FinanceContext.
  //
  // Keyed on hubPlan (the OWNER's tier), not the viewer's: history belongs to the
  // hub, so every member of a Pro hub sees all of it. A null hubPlan means the tier
  // has not resolved yet — show everything rather than hide-then-reveal, which
  // would flash a cap the hub may not even have.
  const visibleCycles = useMemo(
    () => visibleCycleWindow(cycles, hubPlan ? getLimitsForTier(hubPlan).historyMonthsVisible : Infinity),
    [cycles, hubPlan]
  );

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
    // Auto-continue is about to create (or is creating) today's period. Hold rather
    // than fetch: fetching now paints the stale landing cycle — last month's dashboard
    // under last month's name — then snaps a moment later. The hold always ends (both
    // branches clear autoFiring; a claimed key makes autoWillFire false).
    if (autoWillFire || autoFiring) return;
    const cid = activeCycleId ?? activeCycle?.id;
    load(cid);
  }, [centreId, cyclesLoading, autoWillFire, autoFiring, activeCycleId, activeCycle?.id, load]);

  // ── Derived values ────────────────────────────────────────────────────────

  // The cycle whose data is loaded: the navigable selection, else the auto-resolved
  // current cycle. The single key for all client slices below (Commit 11.5).
  const viewedCycleId  = activeCycleId ?? activeCycle?.id ?? null;
  // Render-phase ref write (the useModalChrome precedent): hands the resolved id to
  // reload()/reloadHub(), which are created above and read it at call time.
  viewedCycleIdRef.current = viewedCycleId;

  // Cycle slices of the all-rows arrays. Income, categories, and (via the gated
  // loader) transactions all scope to viewedCycleId — never the month string, which
  // Commit 13 drops. Categories was clock-derived in useBudgetCentre (Commit 8 bug);
  // it lives here now so one hook owns every cycle-aware slice.
  // THE single derivation point for "received" (#4b). Each source's receipt is Σ its
  // live income transactions in this cycle, spliced onto the row as `received_amount`
  // + `received`. Everything downstream — getIncomeStatus, pickNextUnpaid, IncomeCard,
  // totalPending — keeps reading those two fields and is now automatically consistent
  // with Home, instead of reading the deprecated income_sources cache columns.
  const incomes        = useMemo(() => sliceByCycle(allIncomes, viewedCycleId).map(s => {
    const received_amount = calcReceivedForSource(txs, s.id);
    return { ...s, received_amount, received: received_amount > 0 };
  }), [allIncomes, viewedCycleId, txs]);
  const categories     = useMemo(() => sliceByCycle(allCategories || [], viewedCycleId),        [allCategories, viewedCycleId]);

  const monthlyIncome  = useMemo(() => calcTotalExpected(incomes),                              [incomes]);
  const totalIncome    = useMemo(() => calcTotalIncome(txs),                                    [txs]);
  const totalSpent     = useMemo(() => calcTotalSpent(txs),                                     [txs]);
  // Same selector Home reads — assigned + unassigned. Cannot diverge from totalIncome.
  const totalReceived  = useMemo(() => calcTotalReceived(txs),                                  [txs]);
  const unassignedIncome = useMemo(() => calcUnassignedIncome(txs),                             [txs]);
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

  // Pay dates resolve against the VIEWED PERIOD, never the clock's calendar month.
  const viewedCycle = useMemo(() => cycles.find(c => c.id === viewedCycleId) ?? null, [cycles, viewedCycleId]);
  const nextUnpaid  = useMemo(() => pickNextUnpaid(incomes, viewedCycle),             [incomes, viewedCycle]);

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
    copyIncomeSourcesToCycle,
    moveIncomeSourceToCycle,
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
  // new period appears (the setup banner flips off, nav updates) and select it so
  // the views land on the freshly-created window. The service gates on owner/full_access
  // and traps overlap as CYC01 — errors pass straight through to the caller's UI.
  const createPeriod = useCallback(async ({ name = null, startDate, endDate }) => {
    const { data, error } = await createBudgetPeriod(centreId, { name, startDate, endDate });
    if (error) return { data: null, error };
    await refreshAfterPeriodWrite(data.id);
    return { data, error: null };
  }, [centreId, refreshAfterPeriodWrite]);

  // Reset a FUTURE budget period: the RPC soft-deletes its categories + transactions
  // (cycle row untouched), then we re-fetch so the now-empty period re-derives its
  // slices and the empty-state UX takes over. The service gates on owner/full_access
  // (role-denied) and future-only (CYC04) — errors pass straight through to the caller's UI.
  const resetPeriod = useCallback(async (cycleId) => {
    const { data, error } = await resetBudgetPeriod(cycleId);
    if (error) return { data: null, error };
    await loadCycles();
    return { data, error: null };
  }, [loadCycles]);

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
    visibleCycles,  // tier-windowed view of `cycles` (history gate) — views use this for ALL
                    // navigation; `cycles` (full) is for internal plumbing only.
    cyclesLoading,  // true until a real (valid-centre) loadCycles settles — views gate their
                    // first paint on it so cycles resolve before any empty-state renders.
    activeCycle,
    currentCycle,   // cycleForToday — the STRICT "is now covered?" answer; null when it is not
    viewedCycle,    // the cycle the loaded slices belong to — the frame for pay dates
    activeCycleId,
    viewedCycleId,  // activeCycleId ?? activeCycle?.id — single source for the cycle-id fallback (Commit 14a)
    loadCycle,
    reloadCycles: loadCycles,
    createPeriod,
    resetPeriod,
    autoPeriod,        // receipt of a period auto-continue created this session, else null
    dismissAutoPeriod,
    ensurePeriodNow,   // manual one-tap run of the same write (the banner's owner state)

    // Derived financial values
    monthlyIncome,
    totalIncome,
    totalSpent,
    totalReceived,
    unassignedIncome,   // Σ income txs with no source FK — Payday's "Unassigned income" row
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
    copyIncomeSourcesToCycle,
    moveIncomeSourceToCycle,
    deleteIncomeSource,

    // Navigation
    loadMonth,
    reload,
    reloadHub,      // silent re-fetch of every cycle-aware slice — foreground
                    // refetch, pull-to-refresh and realtime all land here

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
