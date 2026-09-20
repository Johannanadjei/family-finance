/**
 * services/realtime.service.js
 *
 * The one place the app opens a Supabase Realtime channel. Same rule as every
 * other service: the `supabase` client is imported HERE and nowhere else
 * (CLAUDE.md §6), so hooks and components never touch it directly.
 *
 * DEVIATION FROM THE { data, error } CONTRACT — deliberate. A subscription is not
 * a query: it has no result to return, and its failures arrive later, through the
 * status callback, not as a return value. So this returns an unsubscribe function
 * instead. Everything else about the service contract holds: it never throws, and
 * a failure is reported rather than swallowed.
 *
 * ── WHAT IT SUBSCRIBES TO ───────────────────────────────────────────────────
 * `hub_activity` ONLY — the contentless ticker installed by
 * scripts/migrate_33_hub_activity_realtime.sql. Its rows carry
 * { budget_centre_id, rev, updated_at } and nothing else, so no financial data
 * crosses the socket for ANY member role. The four data tables
 * (transactions / income_sources / budget_categories / budget_cycles) are
 * deliberately NOT published; migrate_33's header has the full leak analysis, and
 * its verify block fails loudly if any of them is ever added.
 *
 * The payload is therefore never read. The event is a bare signal meaning "this
 * hub changed"; the caller answers it with a normal, RLS-enforced refetch.
 */

import { supabase } from '../lib/supabase';

/**
 * Watch a hub for changes.
 *
 * @param {string}   centreId — budget_centres.id of the active hub
 * @param {function} onActivity — called with no arguments on every change. The
 *                   payload is intentionally not passed on: it carries no data
 *                   worth reading, and passing it would invite someone to.
 * @returns {function} unsubscribe — safe to call more than once
 */
export const subscribeToHubActivity = (centreId, onActivity) => {
  if (!centreId) return () => {};

  const channel = supabase
    .channel(`hub-activity:${centreId}`)
    .on(
      'postgres_changes',
      {
        event:  '*',
        schema: 'public',
        table:  'hub_activity',
        filter: `budget_centre_id=eq.${centreId}`,
      },
      () => { onActivity?.(); },
    )
    .subscribe((status, err) => {
      // CHANNEL_ERROR / TIMED_OUT are recoverable and retried by realtime-js.
      // Log rather than surface: freshness degrades to the foreground refetch and
      // pull-to-refresh, which is a slower app, not a broken one.
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('[realtime.service] hub_activity channel', status, err?.message || '');
      }
    });

  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    supabase.removeChannel(channel);
  };
};
