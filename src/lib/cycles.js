/**
 * lib/cycles.js
 *
 * Pure budget-cycle pickers. A "cycle" is a row from budget_cycles with
 * `start_date`/`end_date` as 'YYYY-MM-DD' strings (Postgres DATE). For zero-padded
 * ISO dates, lexicographic comparison equals chronological order, so the PICKERS
 * below resolve date windows with plain string `<=`/`>=` and `.localeCompare` — no
 * Date parsing.
 *
 * Pure functions only — no React, no app imports, no side effects.
 */

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

// ── Budget-period range builders (Phase B) ──────────────────────────────────────
// Unlike the pickers above (string compares, no Date), these compute month
// boundaries, so they parse into UTC Date. Still pure: no React, no app imports,
// deterministic given their args. They return { start, end, name } where start/end
// are 'YYYY-MM-DD' and name is the majority-month label for the common single-month
// case (e.g. 'July 2026'). For ranges the user edits to span months, the server's
// cycle_majority_name is authoritative — these names are the quick-create defaults.

// Last day of the calendar month that contains [y, m0] (m0 = 0-based month).
function monthEnd(y, m0) {
  return new Date(Date.UTC(y, m0 + 1, 0)).toISOString().slice(0, 10);   // day 0 of next month
}

// 'Month YYYY' label for the month of a 'YYYY-MM-DD' start date (UTC, matches
// lib/dates.formatMonth and the SQL cycle_majority_name 'FMMonth YYYY' output).
function monthLabel(startStr) {
  const [y, m] = startStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// The day after a 'YYYY-MM-DD' date, as 'YYYY-MM-DD'.
function nextDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * The calendar month CONTAINING `today` — the sensible first-period default for a
 * brand-new hub (Decision Q3: hub created June 28 → 'June 1 – June 30'). No cycle
 * list needed; a new hub has none.
 *
 * @param {string} today — 'YYYY-MM-DD'
 * @returns {{ start: string, end: string, name: string }}
 */
export function currentCalendarMonthRange(today) {
  const [y, m] = today.split('-').map(Number);
  const start  = `${today.slice(0, 7)}-01`;
  const end    = monthEnd(y, m - 1);
  return { start, end, name: monthLabel(start) };
}

/**
 * The NEXT budget period to offer from the quick-create button: the calendar month
 * immediately after the hub's latest live cycle (start = day after its end). With no
 * cycles yet it falls back to the current calendar month. Start = day-after-latest
 * guarantees the range never overlaps an existing cycle (GiST / CYC01).
 *
 * @param {Array<{ start_date: string, end_date: string, deleted_at?: string|null }>} cycles
 * @param {string} today — 'YYYY-MM-DD'
 * @returns {{ start: string, end: string, name: string }}
 */
export function nextCalendarMonthRange(cycles, today) {
  const latestEnd = cycles
    .filter(c => !c.deleted_at)
    .reduce((max, c) => (max === null || c.end_date.localeCompare(max) > 0 ? c.end_date : max), null);
  if (!latestEnd) return currentCalendarMonthRange(today);

  const start  = nextDay(latestEnd);
  const [y, m] = start.split('-').map(Number);
  return { start, end: monthEnd(y, m - 1), name: monthLabel(start) };
}
