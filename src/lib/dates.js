/**
 * lib/dates.js
 *
 * Pure month-key helpers. A "month" throughout the app is a 'YYYY-MM' string —
 * the same shape budget_categories.month and income_sources.month store, so the
 * keys compare lexicographically (no Date parsing needed for ordering).
 *
 * Pure functions only — no React, no app imports, no side effects.
 */

/** Current month as 'YYYY-MM' (UTC, matching how rows are stamped). */
export const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

/**
 * True if `month` ('YYYY-MM') is strictly before the current month.
 * Lexicographic compare is safe for zero-padded 'YYYY-MM'.
 */
export const isPastMonth = (month) => !!month && month < getCurrentMonth();
