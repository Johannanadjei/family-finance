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
