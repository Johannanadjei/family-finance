/**
 * lib/cycles.js
 *
 * Pure budget-cycle pickers. A "cycle" is a row from budget_cycles with
 * `start_date`/`end_date` as 'YYYY-MM-DD' strings (Postgres DATE). For zero-padded
 * ISO dates, lexicographic comparison equals chronological order, so the PICKERS
 * below resolve date windows with plain string `<=`/`>=` and `.localeCompare` — no
 * Date parsing. The ANCHOR helpers (Commit 14b, bottom of file) need real calendar
 * arithmetic, so they use UTC Date math (v1 is UTC — CLAUDE.md decision 13).
 *
 * Pure functions only — no React, no app imports beyond lib/dates, no side effects.
 */

import { formatMonth } from './dates';

/**
 * Resolve the cycle that should be "active" for a given date.
 * Priority: the cycle containing `today` → the most recently ended (gap day) →
 * the earliest upcoming (brand-new hub before its first cycle) → null.
 *
 * @param {Array<{ start_date: string, end_date: string, deleted_at?: string|null }>} cycles
 * @param {string} today — 'YYYY-MM-DD'
 * @returns {object|null}
 */
export function getActiveCycle(cycles, today) {
  const live = cycles.filter(c => !c.deleted_at);
  if (live.length === 0) return null;

  const current = live.find(c => c.start_date <= today && c.end_date >= today);
  if (current) return current;

  const past = live
    .filter(c => c.end_date < today)
    .sort((a, b) => b.end_date.localeCompare(a.end_date));
  if (past.length) return past[0];

  const future = live
    .filter(c => c.start_date > today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (future.length) return future[0];

  return null;
}

/**
 * Return the cycle whose range contains `dateStr`, or null if none does.
 *
 * @param {Array<{ start_date: string, end_date: string, deleted_at?: string|null }>} cycles
 * @param {string} dateStr — 'YYYY-MM-DD'
 * @returns {object|null}
 */
export function getCycleContainingDate(cycles, dateStr) {
  return cycles.find(c => !c.deleted_at && c.start_date <= dateStr && c.end_date >= dateStr) ?? null;
}

/**
 * Navigation neighbours for a cycle list, for prev/next period traversal.
 * Cycles are sorted newest-first internally, so order-independent. "next" is the
 * newer cycle, "prev" is the older — matching forward/back arrows on a timeline.
 * A missing/empty id yields nulls with both ends flagged (nav disabled).
 *
 * @param {Array<{ id: string, start_date: string, deleted_at?: string|null }>} cycles
 * @param {string|null} currentCycleId
 * @returns {{ current: object|null, prev: object|null, next: object|null, isLatest: boolean, isOldest: boolean }}
 */
export function getCycleNav(cycles, currentCycleId) {
  const live = cycles
    .filter(c => !c.deleted_at)
    .sort((a, b) => b.start_date.localeCompare(a.start_date));   // newest first
  const idx = live.findIndex(c => c.id === currentCycleId);
  return {
    current: idx >= 0 ? live[idx] : null,
    next:    idx > 0 ? live[idx - 1] : null,                     // newer
    prev:    idx >= 0 && idx < live.length - 1 ? live[idx + 1] : null,  // older
    isLatest: idx <= 0,                                          // idx 0 (or not found) → no newer
    isOldest: idx === -1 || idx === live.length - 1,             // last (or not found) → no older
  };
}

/**
 * Slice cycle-keyed rows (categories, income sources) to one cycle. The canonical
 * client-side period filter post-Commit-11: every live row carries a cycle_id
 * (Commit 10 trigger + backfill), so membership is an id match — never a month
 * string. A falsy cycleId returns [] (the loading-window contract — see
 * docs/engineering-decisions.md), which also prevents null-cycle_id rows from
 * leaking via a null === null match.
 *
 * @param {Array<{ cycle_id?: string|null }>} rows
 * @param {string|null|undefined} cycleId
 * @returns {Array}
 */
export function sliceByCycle(rows, cycleId) {
  if (!cycleId) return [];
  return rows.filter(r => r.cycle_id === cycleId);
}

/**
 * Resolve the cycle id a 'YYYY-MM' month maps to, mirroring the resolve_cycle_id()
 * database trigger (Commit 10): match on the cycle's start-month
 * (to_char(start_date,'YYYY-MM') = month). Client and server share the cycles
 * table as the single source of truth. Returns null when no live cycle covers the
 * month — callers stamp on the result and refuse the write rather than insert a
 * NULL cycle_id (the CYC02 invariant).
 *
 * @param {Array<{ id: string, start_date: string, deleted_at?: string|null }>} cycles
 * @param {string} month — 'YYYY-MM'
 * @returns {string|null}
 */
export function cycleIdForMonth(cycles, month) {
  return cycles.find(c => !c.deleted_at && c.start_date.startsWith(month))?.id ?? null;
}

// ── Anchor-aware cycle boundaries (Commit 14b) ─────────────────────────────────
// JS twins of cycle_anchored_day / cycle_majority_name / create_cycle_by_anchor in
// scripts/migrate_14b_anchor.sql — keep both sides in lockstep. UTC throughout.

const iso         = (d) => d.toISOString().slice(0, 10);
const addDays     = (d, n) => new Date(d.getTime() + n * 86400000);
const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** The anchored boundary date (a Date) for the month containing `inMonth`. */
function anchoredDay(anchorType, anchorDay, inMonth) {
  const y = inMonth.getUTCFullYear();
  const m = inMonth.getUTCMonth();
  const dim = daysInMonth(y, m);
  if (anchorType === 'fixed_day')         return new Date(Date.UTC(y, m, Math.min(anchorDay, dim)));
  if (anchorType === 'last_day_of_month') return new Date(Date.UTC(y, m, dim));
  if (anchorType === 'last_working_day') {
    let d = new Date(Date.UTC(y, m, dim));
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = addDays(d, -1);   // back off Sat/Sun
    return d;
  }
  return new Date(Date.UTC(y, m, 1));   // calendar — anchors to the 1st
}

/**
 * The cycle date range [start_date, end_date] CONTAINING referenceDate for a hub
 * anchor. 'calendar' = the whole calendar month. The other three are start-anchored:
 * the cycle runs from one month's anchor day to the day before the next month's.
 * `prevEndDate` applies the forward-only clamp (M1) — the start never reaches back
 * to or before an existing cycle's end (mirrors create_cycle_by_anchor's clamp).
 *
 * @param {string} anchorType — 'calendar'|'fixed_day'|'last_working_day'|'last_day_of_month'
 * @param {number|null} anchorDay — 1..31, only for 'fixed_day'
 * @param {string} referenceDate — 'YYYY-MM-DD' the cycle must contain
 * @param {string|null} prevEndDate — 'YYYY-MM-DD' latest existing cycle end, or null
 * @returns {{ start_date: string, end_date: string }}
 */
export function anchorToDateRange(anchorType, anchorDay, referenceDate, prevEndDate = null) {
  // Effective reference (dual-basis fix): never build a range behind an existing
  // cycle's end. referenceDate is a hint; force it to at least prevEnd+1 — the twin
  // of create_cycle_by_anchor's GREATEST(p_reference_date, max_end+1). This keeps the
  // Settings preview identical to what the RPC will actually create.
  const clampStart = prevEndDate ? addDays(new Date(prevEndDate + 'T00:00:00Z'), 1) : null;
  let ref = new Date(referenceDate + 'T00:00:00Z');
  if (clampStart && ref < clampStart) ref = clampStart;
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  let start, end;

  if (anchorType === 'calendar') {
    start = new Date(Date.UTC(y, m, 1));
    end   = new Date(Date.UTC(y, m + 1, 0));
  } else {
    const cand = anchoredDay(anchorType, anchorDay, ref);
    if (ref >= cand) {
      start = cand;
      end   = addDays(anchoredDay(anchorType, anchorDay, new Date(Date.UTC(y, m + 1, 1))), -1);
    } else {
      start = anchoredDay(anchorType, anchorDay, new Date(Date.UTC(y, m - 1, 1)));
      end   = addDays(cand, -1);
    }
  }

  // Start-clamp for anchored periods that began before prevEnd+1 (M1 short cycle).
  // v_end is already past prevEnd via the effective ref, so this can't invert.
  if (clampStart && start < clampStart) start = clampStart;

  return { start_date: iso(start), end_date: iso(end) };
}

/**
 * The default display name for a cycle, by the majority-month rule (N2): the
 * calendar month with the most days in [startDate, endDate] wins; ties break toward
 * the LATER month. Server twin: cycle_majority_name(). Used at CREATE time only —
 * the stored cycle.name is the display source of truth (views never recompute it).
 *
 * @param {string} startDate — 'YYYY-MM-DD'
 * @param {string} endDate   — 'YYYY-MM-DD'
 * @returns {string} e.g. 'June 2026'
 */
export function cycleDefaultName(startDate, endDate) {
  const end = new Date(endDate + 'T00:00:00Z');
  const tally = {};                                  // 'YYYY-MM' → day count, ascending insertion order
  for (let d = new Date(startDate + 'T00:00:00Z'); d <= end; d = addDays(d, 1)) {
    const key = iso(d).slice(0, 7);
    tally[key] = (tally[key] || 0) + 1;
  }
  let bestKey = null, bestCount = -1;
  for (const [key, count] of Object.entries(tally)) {
    if (count >= bestCount) { bestCount = count; bestKey = key; }   // >= → later month wins ties
  }
  return formatMonth(bestKey);
}

/**
 * Resolve the parameters for the NEXT cycle to create for a hub, given its most
 * recent cycle (or null for a brand-new hub). Reference date = prev.end_date + 1,
 * else `today` (decision 11). Returns everything create_cycle_by_anchor needs PLUS
 * the computed range + name, so callers (useFinance auto-create, the Settings
 * preview) don't each re-derive them — and useFinance stays under its line cap.
 *
 * @param {{ cycle_anchor_type?: string, cycle_anchor_day?: number|null }} centre
 * @param {{ end_date: string }|null} prevCycle
 * @param {string} today — 'YYYY-MM-DD'
 * @returns {{ anchor_type: string, anchor_day: number|null, reference_date: string, start_date: string, end_date: string, name: string }}
 */
export function computeNextCycleParams(centre, prevCycle, today) {
  const anchor_type = centre?.cycle_anchor_type || 'calendar';
  const anchor_day  = anchor_type === 'fixed_day' ? (centre?.cycle_anchor_day ?? null) : null;
  const prevEnd     = prevCycle?.end_date ?? null;
  const reference_date = prevEnd ? iso(addDays(new Date(prevEnd + 'T00:00:00Z'), 1)) : today;
  const { start_date, end_date } = anchorToDateRange(anchor_type, anchor_day, reference_date, prevEnd);
  return { anchor_type, anchor_day, reference_date, start_date, end_date, name: cycleDefaultName(start_date, end_date) };
}
