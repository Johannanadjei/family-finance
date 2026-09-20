/**
 * hooks/useHubLoad.js
 *
 * The active hub's data loaders, extracted from useFinance to keep that hook
 * within its 450-line budget — the same cut as useIncomeMutations /
 * useTransactionMutations: the state still lives in useFinance and is passed in
 * with its setters; this hook owns the fetch orchestration only and holds no
 * state of its own beyond the freshness stamp.
 *
 * WHAT IT OWNS
 *   loadCycles(opts)       — the hub-scoped cycle list
 *   load(cycleId, opts)    — transactions (by cycle) + income sources (all months)
 *   reload()               — re-fetch the viewed cycle, loudly
 *   reloadHub()            — re-fetch EVERY cycle-aware slice of the active hub,
 *                            silently: cycles + categories + transactions + income
 *   lastLoadedAt           — a ref holding the ms timestamp of the last CLEAN
 *                            transaction/income fetch; the freshness gate reads it
 *
 * ── LOUD vs SILENT — why reloadHub is not just reload ────────────────────────
 * The loud path is for a mount or a hub switch: it flips `loading`/`cyclesLoading`
 * and CLEARS the arrays before fetching, so a previous hub's rows can never bleed
 * into the next one, and so a failed fetch leaves nothing stale on screen.
 *
 * That is exactly wrong for a background refresh. Clearing would blank the
 * dashboard to a skeleton every time the user tabs back, and — worse — a failed
 * background fetch would replace good data with an empty dashboard, which is the
 * data-loss-on-refresh shape CLAUDE.md §12 exists to prevent.
 *
 * So `silent: true` inverts both halves of that contract on purpose:
 *   - no loading/cyclesLoading flip  → no skeleton, no `if (cyclesLoading) return null`
 *                                      blank frame in the views
 *   - no pre-clear                   → the current rows stay up during the fetch
 *   - NO WRITE ON FAILURE            → a failed silent refresh leaves the last good
 *                                      data on screen and reports through `error`
 *                                      (DashboardShell's retry banner). It must never
 *                                      turn into a phantom empty.
 *
 * The asymmetry on error is deliberate and runs the other way for the loud path:
 * there, writing the empty result IS the correct behaviour, because the alternative
 * is showing hub A's data under hub B's name.
 */

import { useCallback, useRef } from 'react';
import { getTransactionsByCycle } from '../services/transactions.service';
import { getIncomeSources } from '../services/income.service';
import { getCyclesForCentre } from '../services/cycles.service';
import { waitForSession } from '../lib/auth';

export function useHubLoad({
  centreId,
  viewedCycleIdRef,
  reloadCategories = null,
  setTxs, setAllIncomes,
  setCycles, setCyclesLoading,
  setLoading, setLoaded, setError,
}) {
  // ms timestamp of the last clean transaction/income fetch. A ref, not state:
  // the freshness gate reads it from an event handler, where a state value would
  // be a stale closure, and nothing renders from it.
  const lastLoadedAt = useRef(0);

  const loadTxs = useCallback(async (cycleId) => {
    if (!centreId) return { data: [], error: null };
    const result = await getTransactionsByCycle(centreId, cycleId);
    if (result.error) console.error('[useHubLoad] loadTxs error:', result.error.message);
    return result;
  }, [centreId]);

  // Loads every month's sources (no month filter) into allIncomes. The active
  // month is derived client-side (see useFinance's `incomes` memo) so month
  // navigation needs no refetch, and mutations have a single list to update.
  const loadIncomes = useCallback(async () => {
    if (!centreId) return { data: [], error: null };
    const result = await getIncomeSources(centreId);
    if (result.error) console.error('[useHubLoad] loadIncomes error:', result.error.message);
    return result;
  }, [centreId]);

  // ── Cycles ──────────────────────────────────────────────────────────────────
  // Hub-scoped (keyed on centreId, NOT activeMonth) — cycles span the whole hub,
  // so month navigation must not refetch them.
  const loadCycles = useCallback(async ({ silent = false } = {}) => {
    // Null-centre pre-settle: useFinance mounts above App's auth/centre gates, so
    // this fires once with centreId === null before the centre resolves. We must
    // NOT flip cyclesLoading false here — leaving it at its initial true keeps the
    // views' `if (cyclesLoading) return null` gate engaged so they never render a
    // phantom empty/zero frame (the setup banner + GHS 0) when the dashboard
    // first mounts. Only a REAL loadCycles (valid centreId) settles the flag.
    // See docs/engineering-decisions.md (cold-load flash post-mortem).
    if (!centreId) { setCycles([]); return; }
    if (!silent) setCyclesLoading(true);
    const { error: sessionErr } = await waitForSession();
    if (sessionErr) {
      console.error('[useHubLoad] loadCycles session not ready:', sessionErr.message);
      if (!silent) setCyclesLoading(false);
      return;
    }
    const { data, error } = await getCyclesForCentre(centreId);
    if (error) console.error('[useHubLoad] loadCycles error:', error.message);
    // On the LOUD path an error still writes [] — deliberately. A loud load is a
    // mount or a hub switch, and holding the previous hub's cycles there would put
    // hub A's periods under hub B's name. A SILENT refresh has no such risk and
    // the opposite duty: keep what is on screen.
    if (!error || !silent) setCycles(data || []);
    if (!silent) setCyclesLoading(false);
  }, [centreId, setCycles, setCyclesLoading]);

  // ── Transactions + income ───────────────────────────────────────────────────
  // Transactions are read by cycle_id (Commit 11). `cycleId` is resolved by the
  // gated loader effect in useFinance (after activeCycle is derived) — never
  // undefined once we reach the Promise.all. Income still loads all-months
  // (deferred to the client-slice migration). The full guard stack (centre
  // validity, waitForSession, stale-clear) is preserved exactly — see
  // useFinance.race.test.js.
  const load = useCallback(async (cycleId, { silent = false } = {}) => {
    if (!centreId) { setTxs([]); setAllIncomes([]); setLoaded(true); setLoading(false); return; }

    if (!silent) {
      setLoading(true);
      // Clear stale data so a previous hub's rows can't bleed in during the fetch.
      setTxs([]);
      setAllIncomes([]);
    }
    setError(null);

    // Auth-readiness gate — never query against an unhydrated/stale token (else a
    // cold-load query races the refresh, RLS returns an empty 200 → silent data loss).
    const { error: sessionErr } = await waitForSession();
    if (sessionErr) {
      console.error('[useHubLoad] session not ready:', sessionErr.message);
      setError('Could not verify your session. Please retry.');
      if (!silent) setLoading(false);
      return;
    }

    // Cycles settled but none resolved yet (brand-new hub, auto-create in flight).
    // Hold WITHOUT flipping `loaded` — a successful-empty here would be a phantom.
    if (!cycleId) { if (!silent) setLoading(false); return; }

    const [txResult, incomeResult] = await Promise.all([
      loadTxs(cycleId),
      loadIncomes(),
    ]);

    // Never let an error masquerade as data: `loaded` flips true only on a clean fetch.
    let ok = true;
    if (txResult.error)     { setError(txResult.error.message); ok = false; }
    if (incomeResult.error) { setError(incomeResult.error.message); ok = false; }

    // See the LOUD vs SILENT note at the top: a silent refresh that failed must not
    // overwrite good rows with the null a failed service read returns.
    if (ok || !silent) {
      setTxs(txResult.data || []);
      setAllIncomes(incomeResult.data || []);
    }
    if (ok) { setLoaded(true); lastLoadedAt.current = Date.now(); }
    if (!silent) setLoading(false);
  }, [centreId, loadTxs, loadIncomes, setTxs, setAllIncomes, setLoading, setLoaded, setError]);

  // Re-fetch the currently-viewed cycle, loudly (the error banner's Retry action).
  // The cycle id comes from a ref because it is derived AFTER this hook runs in
  // useFinance; reading it at call time also keeps this callback stable.
  const reload = useCallback(
    () => load(viewedCycleIdRef.current, { silent: false }),
    [load, viewedCycleIdRef],
  );

  // THE multi-device freshness entry point: re-fetch every cycle-aware slice of the
  // active hub without disturbing what is on screen. Categories live in
  // useBudgetCentre, so its reloadCategories is threaded down through useFinance.
  const reloadHub = useCallback(async () => {
    if (!centreId) return;
    await Promise.all([
      loadCycles({ silent: true }),
      reloadCategories ? reloadCategories() : Promise.resolve(),
      load(viewedCycleIdRef.current, { silent: true }),
    ]);
  }, [centreId, loadCycles, reloadCategories, load, viewedCycleIdRef]);

  return { loadCycles, load, reload, reloadHub, lastLoadedAt };
}
