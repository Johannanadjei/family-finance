/**
 * hooks/useAutoContinuePeriod.js
 *
 * AUTO-CONTINUE: the client half of ensure_current_budget_period (migrate_28).
 * Guarantees a budget period covers today, and — because the server carries the
 * previous period's plan forward in the same transaction — that the new period is
 * never empty. An empty auto-created period would read as data loss (CLAUDE.md §12),
 * which is why creation and carry-forward are one server call, not two.
 *
 * Extracted from useFinance to keep that hook inside its size budget, the same cut
 * as useIncomeMutations / useTransactionMutations. State lives here; the caller
 * supplies the cycle facts and the loaders.
 *
 * It also OWNS `refreshAfterPeriodWrite` and hands it back, rather than receiving it.
 * That is deliberate: auto-continue is only safe if its refresh is byte-identical to
 * the one a manual create runs, so the two share one function and it lives next to
 * the writer whose correctness depends on it. useFinance's createPeriod calls the
 * same returned function.
 *
 * WHY THIS EXISTS. Phase A removed anchor-aware auto-create and Phase B made periods
 * entirely user-driven — which went too far. A hub whose period ended on the 31st sat
 * with NO period for today, the dashboards silently fell back to the last one, and
 * the user saw August's plan as if it were September. This restores creation, but as
 * an idempotent SERVER write rather than the old client-side gap filler.
 *
 * ── THE FOUR GUARDS ARE LOAD-BEARING ─────────────────────────────────────────────
 * This is a write firing on hub open against the shared production database. Each
 * guard is a reason that is safe; each has a test in useFinance.autocontinue.test.js.
 *
 *  1. ROLE. `canManageCycles` — a standard member NEVER fires this. The server
 *     refuses them anyway (role-denied), but a doomed write on every hub open for
 *     every standard member is noise, not defence. The gate fails CLOSED while the
 *     role is still resolving: both this hook's caller and useBudgetCentre default
 *     the role to 'standard', so an unresolved role simply fires a beat later.
 *  2. ALREADY COVERED. `cycleForToday` short-circuits the common case, so the RPC is
 *     not called at all on the overwhelming majority of opens. The server is
 *     idempotent as a backstop (created=false, nothing written, no re-copy) — this
 *     guard is about not making the call, not about correctness.
 *  3. ONCE PER SESSION PER HUB + MONTH. The key is `${centreId}:${YYYY-MM}`, claimed
 *     BEFORE the await, so a re-render — including the one this write's own refresh
 *     triggers — cannot double-fire. Keyed per hub+month rather than per session so
 *     switching hubs still works, and a session left open across a month boundary
 *     still continues into the new month.
 *  4. NO RETRY. On failure the key STAYS claimed and nothing is rescheduled. One
 *     attempt per hub+month per session, full stop: a failed write must never become
 *     a write loop against production. The user is not stranded — no period covers
 *     today, so the banner falls through to its manual setup CTA.
 *
 * ── THE REFETCH IS THE POINT ─────────────────────────────────────────────────────
 * On success the result goes through `refreshAfterPeriodWrite`, the SAME refresh a
 * manual create runs, so the new period, its carried-forward categories and income,
 * and the receipt all appear immediately. Creating a period behind a stale view
 * reintroduces the confusion this feature exists to remove.
 *
 * @param {object}   opts
 * @param {string|null} opts.centreId
 * @param {object[]} opts.cycles           — live cycle list
 * @param {boolean}  opts.cyclesLoading    — true until the list settles
 * @param {boolean}  opts.canManageCycles  — can(role, 'manageCycles')
 * @param {function} opts.loadCycles       — async () => void; re-fetches the cycle list
 * @param {function} opts.reloadCategories — async () => void; useBudgetCentre's category re-sync
 * @param {function} opts.onPeriodSelected — (cycleId) => void; select the written period
 * @returns {{ refreshAfterPeriodWrite: function, ensurePeriodNow: function,
 *            autoPeriod: object|null, dismissAutoPeriod: function,
 *            autoWillFire: boolean, autoFiring: boolean }}
 *   ensurePeriodNow — the banner's one-tap manual run of the same write
 *   autoPeriod   — receipt of a period THIS session created, else null (the banner reads it)
 *   autoWillFire — render-time "a write is pending"; the caller's loader holds on it
 *   autoFiring   — the write is in flight; the caller's loader holds on this too
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ensureCurrentBudgetPeriod } from '../services/cycles.service';
import { cycleForToday } from '../lib/cycles';
import { getToday } from '../lib/dates';

export function useAutoContinuePeriod({
  centreId, cycles, cyclesLoading, canManageCycles, loadCycles, reloadCategories, onPeriodSelected,
}) {
  const [autoPeriod, setAutoPeriod] = useState(null);
  const [autoFiring, setAutoFiring] = useState(false);

  // Session-scoped fired keys. A ref, not state: claiming a key must be synchronous
  // and must NOT re-render, or the claim races the re-render it would cause.
  const autoFiredRef = useRef(new Set());
  // Guards against applying a result to the wrong hub after a mid-flight switch.
  const centreIdRef  = useRef(centreId);
  useEffect(() => { centreIdRef.current = centreId; }, [centreId]);
  // reloadCategories is useBudgetCentre's, so it is kept in a ref and never enters a
  // dependency array (CLAUDE.md §9.5).
  const reloadCatsRef = useRef(reloadCategories);
  useEffect(() => { reloadCatsRef.current = reloadCategories; }, [reloadCategories]);

  // The SINGLE refresh path for every period-creating write, manual or automatic:
  // re-fetch cycles, re-fetch the categories the write carried forward (they sit in
  // useBudgetCentre's cache, which knows nothing about it), then select the new
  // period. Creating one behind a stale view is the members-list-not-refreshing bug.
  const refreshAfterPeriodWrite = useCallback(async (newCycleId, { withCategories = false } = {}) => {
    await loadCycles();
    if (withCategories) await reloadCatsRef.current?.();
    if (newCycleId) onPeriodSelected(newCycleId);
  }, [loadCycles, onPeriodSelected]);

  // Drop a previous hub's receipt on switch — it describes that hub, not this one.
  useEffect(() => { setAutoPeriod(null); }, [centreId]);

  const covered = !!cycleForToday(cycles, getToday());

  // Computed DURING RENDER, deliberately, and this is the subtle part. On the commit
  // where cycles settle, this hook's effect claims the key and sets autoFiring — but
  // the caller's loader effect runs in that SAME commit against the autoFiring value
  // captured at render time, which is still false. Without a render-time signal the
  // loader would fetch the stale landing cycle before the hold ever took effect.
  // autoWillFire is that signal; once the key is claimed it goes false and autoFiring
  // (now committed) carries the hold for the rest of the in-flight window.
  const autoWillFire = !cyclesLoading && !!centreId && canManageCycles && !covered
    && !autoFiredRef.current.has(`${centreId}:${getToday().slice(0, 7)}`);

  // The write itself, shared by the automatic path below and the manual "Set up
  // September" button. One function so the manual tap cannot drift from the automatic
  // one: same RPC, same clip, same carry-forward, same refresh, same receipt.
  // It claims the once-key too, so a manual success stops the effect re-firing.
  const runEnsure = useCallback(async () => {
    autoFiredRef.current.add(`${centreId}:${getToday().slice(0, 7)}`);
    setAutoFiring(true);

    const { data, error } = await ensureCurrentBudgetPeriod(centreId);

    // Hub switched mid-flight: this result describes a hub we no longer show.
    if (centreIdRef.current !== centreId) { setAutoFiring(false); return { data: null, error }; }

    if (error || !data) {
      console.error('[useAutoContinuePeriod] ensure failed:', error?.message ?? 'empty payload');
      setAutoFiring(false);
      return { data: null, error: error ?? new Error('ensure_current_budget_period returned no payload') };
    }

    // created=false means a racer (another device, or the manual CTA) got there
    // first. Still refresh — our list said today was uncovered and the server says
    // otherwise, so the local list is stale — but show no receipt, because we did
    // not create anything. THE RECEIPT IS STRICTLY created === true.
    await refreshAfterPeriodWrite(data.cycle_id, { withCategories: data.created === true });

    if (centreIdRef.current === centreId && data.created === true) {
      setAutoPeriod({
        cycleId:           data.cycle_id,
        name:              data.name,
        startDate:         data.start_date,
        endDate:           data.end_date,
        sourceCycleId:     data.source_cycle_id ?? null,
        categoriesCarried: data.categories_carried ?? 0,
        categoriesSkipped: data.categories_skipped ?? 0,
        incomeCarried:     data.income_carried ?? 0,
        incomeSkipped:     data.income_skipped ?? 0,
        tier:              data.tier ?? null,
      });
    }
    setAutoFiring(false);
    return { data, error: null };
  }, [centreId, refreshAfterPeriodWrite]);

  useEffect(() => {
    if (!centreId)        return;                  // pre-settle
    if (cyclesLoading)    return;                  // cycle list not settled yet
    if (!canManageCycles) return;                  // guard 1 — role
    const today = getToday();
    if (cycleForToday(cycles, today)) return;      // guard 2 — already covered
    if (autoFiredRef.current.has(`${centreId}:${today.slice(0, 7)}`)) return;  // guard 3

    // guard 4 — runEnsure claims the key before awaiting and never reschedules on
    // failure, so this is one attempt per hub+month per session.
    runEnsure();
  }, [centreId, cyclesLoading, cycles, canManageCycles, runEnsure]);

  // The manual one-tap for the banner's owner state, when auto-continue never ran
  // (standard member promoted mid-session, offline, or a failed attempt). USER-
  // initiated, so it deliberately bypasses guard 3 — guard 4 forbids the app
  // retrying by itself, not the user asking again. Still gated on role, and still
  // idempotent server-side, so a double tap cannot make two periods.
  const ensurePeriodNow = useCallback(async () => {
    if (!centreId || !canManageCycles) {
      return { data: null, error: new Error('Not allowed to manage budget months in this hub') };
    }
    return runEnsure();
  }, [centreId, canManageCycles, runEnsure]);

  // Decision Q3: the receipt is dismissable. Persisting that dismissal per hub+month
  // is the banner's business, not this hook's.
  const dismissAutoPeriod = useCallback(() => setAutoPeriod(null), []);

  return { refreshAfterPeriodWrite, ensurePeriodNow, autoPeriod, dismissAutoPeriod, autoWillFire, autoFiring };
}
