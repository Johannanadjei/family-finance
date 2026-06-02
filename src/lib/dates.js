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
 * Today's date as 'YYYY-MM-DD' (UTC, matching DATE columns and getCurrentMonth).
 * Hub-timezone-aware "today" (Intl conversion) is deferred — v1 assumes UTC parity.
 */
export const getToday = () => new Date().toISOString().slice(0, 10);

/**
 * True if `month` ('YYYY-MM') is strictly before the current month.
 * Lexicographic compare is safe for zero-padded 'YYYY-MM'.
 */
export const isPastMonth = (month) => !!month && month < getCurrentMonth();

/**
 * Format a 'YYYY-MM' string as a human-readable month label.
 * @param {string} ym - Month string in 'YYYY-MM' format (e.g. '2026-05')
 * @returns {string} Formatted label (e.g. "May 2026")
 *
 * Edge cases: bad input (null/undefined/invalid string) silently yields
 * "January 2001" via V8's lenient Date parsing. All call sites pass real
 * 'YYYY-MM' strings, so this never triggers in practice.
 */
export const formatMonth = (ym) =>
  new Date(ym + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
