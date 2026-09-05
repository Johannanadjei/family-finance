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
 * THE STRICT "IS NOW COVERED?" PREDICATE. Returns the live cycle containing
 * `today`, or null — no fallback, no nearest neighbour.
 *
 * This is the single question the whole period UX turns on, and it is deliberately
 * kept apart from landingCycle below. Conflating the two is what produced the
 * period-state cluster: landingCycle's "most recently ended" fallback made a STALE
 * PAST period answer the question "what period are we in?", so the app rendered
 * September's activity under August's name and nothing ever prompted for September.
 *
 * Rule of thumb: ask cycleForToday for any DECISION (auto-continue fires? banner
 * shows? which month label is real?); ask landingCycle only for what to SHOW when
 * the answer is "nothing covers now".
 *
 * @param {Array<{ start_date: string, end_date: string, deleted_at?: string|null }>} cycles
 * @param {string} [today] — 'YYYY-MM-DD'; defaults to UTC today (matches lib/dates.getToday)
 * @returns {object|null}
 */
export function cycleForToday(cycles, today = new Date().toISOString().slice(0, 10)) {
  return cycleForDate(cycles, today);
}

/**
 * The cycle to LAND ON for navigation when the app opens — a display fallback chain,
 * NOT a truth claim about "now".
 * Priority: the cycle containing `today` → the most recently ended (gap day) →
 * the earliest upcoming (brand-new hub before its first cycle) → null.
 *
 * NAV-ONLY. Never use this to decide whether a period exists for today, whether to
 * create one, or what to label as the current month — use cycleForToday for all
 * three. The second and third branches return a period that does NOT contain today.
 *
 * @param {Array<{ start_date: string, end_date: string, deleted_at?: string|null }>} cycles
 * @param {string} today — 'YYYY-MM-DD'
 * @returns {object|null}
 */
export function landingCycle(cycles, today) {
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
 * Return the live cycle whose range contains `dateStr`, or null if none does.
 * The date-keyed WRITE path: transactions resolve their period by containment
 * (unique under the no_overlapping_cycles GiST constraint), mirroring the
 * resolve_cycle_id() trigger's date branch.
 *
 * @param {Array<{ start_date: string, end_date: string, deleted_at?: string|null }>} cycles
 * @param {string} dateStr — 'YYYY-MM-DD'
 * @returns {object|null}
 */
export function cycleForDate(cycles, dateStr) {
  return cycles.find(c => !c.deleted_at && c.start_date <= dateStr && c.end_date >= dateStr) ?? null;
}

/**
 * The N most-recent cycles a tier may see — the history visibility gate (client-side,
 * Commit: history gate). Anchored on the NEWEST cycle (Decision D2): sort newest-first
 * and keep the first N. `limit` counts CYCLES, not calendar months (Decision D1) — it
 * comes from getLimitsForTier(plan).historyMonthsVisible (3 free / Infinity pro; the
 * "Months" in that key name predates the cycle model — it gates cycles).
 *
 * Non-mutating (sorts a copy). Empty input → []. limit === Infinity or limit >= length
 * → all cycles (sorted copy). Does NOT filter deleted_at — the raw cycles array is
 * already live-filtered at the query, and getCycleNav/sliceByCycle live-filter
 * downstream; this helper is purely about the visible WINDOW.
 *
 * @param {Array<{ start_date: string }>} cycles
 * @param {number} limit — cycle count cap; Infinity for unlimited (Pro)
 * @returns {Array}
 */
export function visibleCycleWindow(cycles, limit) {
  if (!Array.isArray(cycles) || cycles.length === 0) return [];
  const sorted = [...cycles].sort((a, b) => b.start_date.localeCompare(a.start_date));  // newest-first
  if (limit === Infinity || limit >= sorted.length) return sorted;
  return sorted.slice(0, limit);
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
 * Resolve the cycle a 'YYYY-MM' month maps to, mirroring the resolve_cycle_id()
 * database trigger (Commit 10): match on the cycle's start-month
 * (to_char(start_date,'YYYY-MM') = month). Client and server share the cycles
 * table as the single source of truth. Returns null when no live cycle covers the
 * month — callers stamp on the result and refuse the write rather than insert a
 * NULL cycle_id (the CYC02 invariant).
 *
 * @param {Array<{ id: string, start_date: string, deleted_at?: string|null }>} cycles
 * @param {string} month — 'YYYY-MM'
 * @returns {object|null}
 */
export function cycleForMonth(cycles, month) {
  return cycles.find(c => !c.deleted_at && c.start_date.startsWith(month)) ?? null;
}

/**
 * The id form of cycleForMonth, for the write paths that stamp cycle_id directly
 * (useIncomeMutations). Kept as a named wrapper rather than `cycleForMonth(...)?.id`
 * at each call site so the CYC02 refusal ("no live cycle covers this month → do not
 * insert a NULL cycle_id") reads the same everywhere.
 *
 * @param {Array<{ id: string, start_date: string, deleted_at?: string|null }>} cycles
 * @param {string} month — 'YYYY-MM'
 * @returns {string|null}
 */
export function cycleIdForMonth(cycles, month) {
  return cycleForMonth(cycles, month)?.id ?? null;
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
 * The next calendar month this hub does NOT already have a period for — the range the
 * quick-create button offers. Scans forward from the month CONTAINING `today` to
 * December of today's year and returns the first month no live cycle overlaps.
 *
 * WHY IT TAKES `cycles` NOW (this replaced nextCalendarMonthRange, which was blindly
 * today + 1 month). Auto-continue means the current month is normally already covered,
 * so "today + 1" was right by accident, not by rule. Two cases broke it:
 *   • The month containing today is UNCOVERED — auto-continue failed, or the viewer is
 *     a standard member, or this is a legacy hub. The user needs THIS month offered,
 *     not next; that is why the scan starts at `m`, not `m + 1`. Offering next month
 *     while today has no period is the "create-period CTA that never resolves" bug.
 *   • Next month is ALREADY planned (the old quick-create manufactured exactly these
 *     stray future periods). Offering it again returns CYC01 from the server — an
 *     error dialog where the button should simply have moved on to the free month.
 *
 * Overlap, not start-month equality: a custom period running 15 Sep – 14 Oct covers
 * part of both months, and offering either would overlap it (CYC01). The test is the
 * standard interval overlap `c.start <= monthEnd AND c.end >= monthStart`.
 *
 * Returns null when every month from today's through December is covered, and in
 * December when December itself is covered — the caller DISABLES quick-create rather
 * than offer a cross-year period (the year constraint — see isWithinCurrentYear and
 * the create_budget_period CYC03 check). Still history-independent in the sense that
 * matters: the scan is anchored on `today`, never on the newest cycle, so a stray
 * future period can shift the answer by a month but can never drag it out of the year.
 *
 * @param {Array<{ start_date: string, end_date: string, deleted_at?: string|null }>} cycles
 * @param {string} today — 'YYYY-MM-DD' (default: UTC today, matching lib/dates.getToday)
 * @returns {{ start: string, end: string, name: string }|null}
 */
export function nextUncoveredMonthRange(cycles = [], today = new Date().toISOString().slice(0, 10)) {
  const [y, m] = today.split('-').map(Number);   // m is 1-based
  const live   = (cycles || []).filter(c => !c.deleted_at);

  for (let mm = m; mm <= 12; mm++) {             // today's month first, then forward
    const start = `${y}-${String(mm).padStart(2, '0')}-01`;
    const end   = monthEnd(y, mm - 1);
    const overlapped = live.some(c => c.start_date <= end && c.end_date >= start);
    if (!overlapped) return { start, end, name: monthLabel(start) };
  }
  return null;                                   // nothing free inside this year
}

/**
 * True when both `startDate` and `endDate` fall within the same calendar year as
 * `today`. String-based year extraction (slice 0–4) — no Date object, no timezone
 * drift, matching the string-compare convention of the pickers above. The client gate
 * for the custom-period year constraint; its server twin is the create_budget_period
 * CYC03 check.
 *
 * @param {string} startDate — 'YYYY-MM-DD'
 * @param {string} endDate   — 'YYYY-MM-DD'
 * @param {string} today     — 'YYYY-MM-DD' (default: UTC today)
 * @returns {boolean}
 */
export function isWithinCurrentYear(startDate, endDate, today = new Date().toISOString().slice(0, 10)) {
  const yr = today.slice(0, 4);
  return startDate.slice(0, 4) === yr && endDate.slice(0, 4) === yr;
}
