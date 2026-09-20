/**
 * lib/activity.js
 *
 * Pure derivations for the ACTIVITY FEED — the chronological view of a hub's
 * transactions, as opposed to the money arithmetic in lib/finance.js.
 *
 * Same contract as lib/finance.js and lib/cycles.js: pure functions, no React,
 * no imports from the app, no side effects, no async (CLAUDE.md §7). It is a
 * separate module only because finance.js sits at its 400-line cap — "extract,
 * don't compress", the same cut as useIncomeMutations and DashboardProviders.
 */

/**
 * Newest transaction FIRST, by the TRANSACTION DATE — the date the money moved,
 * never the row's creation time.
 *
 * Why this exists: the optimistic-update contract prepends a newly-added row to
 * `txs` (useTransactionMutations.addTransaction, useIncomeMutations.markReceived),
 * so until the next load the head of the list is whatever was typed last, not
 * what happened last. Recent Activity read that order directly and showed a
 * back-dated receipt above later transactions.
 *
 * created_at is the TIEBREAK only, for two rows on the same day: of two expenses
 * both dated the 12th, the one entered later reads as the more recent. Rows with
 * no created_at (optimistic ones, before the server row settles) sort after their
 * same-day siblings rather than jumping the queue.
 *
 * Pure and non-mutating — returns a new array; `txs` is state elsewhere.
 */
export const sortTxsByDate = (txs) =>
  [...(txs || [])].sort((a, b) => {
    if (a.date !== b.date) return String(b.date || '').localeCompare(String(a.date || ''));
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
