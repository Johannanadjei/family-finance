/**
 * lib/cycles.js
 *
 * Pure budget-cycle pickers. A "cycle" is a row from budget_cycles with
 * `start_date`/`end_date` as 'YYYY-MM-DD' strings (Postgres DATE). For zero-padded
 * ISO dates, lexicographic comparison equals chronological order, so date windows
 * are resolved with plain string `<=`/`>=` and `.localeCompare` — no Date parsing.
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
