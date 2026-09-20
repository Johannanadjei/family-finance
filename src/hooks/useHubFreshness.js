/**
 * hooks/useHubFreshness.js
 *
 * Multi-device freshness: brings the active hub up to date when another member
 * changes something, when the app comes back to the foreground, or when the
 * network returns.
 *
 * WHY THIS EXISTS
 *   Hub data loaded exactly once per mount. A member's expense logged on their
 *   phone was invisible in another open session until the app was relaunched.
 *
 * THE RULES
 *   - Triggers: document visibilitychange → 'visible', and window 'online'.
 *   - Staleness gate: only refetch if the last CLEAN fetch is older than
 *     STALE_AFTER_MS. Tabbing away and straight back costs nothing.
 *   - Debounce: DEBOUNCE_MS trailing, so tab-flicker (visible → hidden → visible)
 *     coalesces into one refetch instead of one per event.
 *   - In-flight guard: a trigger that lands while a refetch is running is dropped,
 *     not queued. Two overlapping silent reloads would race each other's setState.
 *   - The staleness check runs at FIRE time, not schedule time, so a burst that
 *     starts inside the window but settles outside it still refreshes.
 *
 * The refetch itself is reloadHub() from useHubLoad — silent by construction, so
 * this hook can never blank the dashboard or turn a failed fetch into an empty one.
 *
 * Disabled (`enabled: false`) or with no hub, it registers no listeners at all.
 *
 * ── REALTIME (opt-in: `realtime: true`) ─────────────────────────────────────
 * A postgres_changes subscription on `hub_activity`, the contentless ticker from
 * scripts/migrate_33_hub_activity_realtime.sql, filtered to the active hub. Any
 * event → REALTIME_DEBOUNCE_MS → reloadHub(). The subscription is torn down and
 * re-opened whenever the hub changes, and removed on unmount.
 *
 * Realtime bypasses the staleness gate on purpose: an event means the server has
 * ALREADY changed, so "we fetched 4s ago" is exactly the case that needs the
 * refetch, not the case that can skip it. The debounce still coalesces a burst
 * (one bump per row, so a bulk category insert fires N events).
 *
 * It is OFF by default so a caller must opt in. The guest portal is the reason:
 * a guest has no Supabase Auth session to authorize a subscription with, and
 * nothing live to stream — see GuestPortal.jsx's header.
 */

import { useEffect, useRef } from 'react';
import { subscribeToHubActivity } from '../services/realtime.service';

export const STALE_AFTER_MS      = 30_000;
export const DEBOUNCE_MS         = 500;
export const REALTIME_DEBOUNCE_MS = 300;

export function useHubFreshness({
  centreId,
  reloadHub,
  lastLoadedAt,
  enabled      = true,
  realtime     = false,
  staleAfterMs = STALE_AFTER_MS,
  debounceMs   = DEBOUNCE_MS,
  realtimeDebounceMs = REALTIME_DEBOUNCE_MS,
}) {
  // Keep the latest reloadHub without re-registering listeners on every render.
  const reloadRef = useRef(reloadHub);
  reloadRef.current = reloadHub;

  useEffect(() => {
    if (!enabled || !centreId || !reloadRef.current) return undefined;

    let timer      = null;
    let inFlight   = false;
    let cancelled  = false;

    const fire = async () => {
      timer = null;
      if (cancelled || inFlight) return;
      if (Date.now() - (lastLoadedAt?.current || 0) < staleAfterMs) return;
      inFlight = true;
      // Catch, don't just finally: a rejecting reloadHub would escape this async
      // handler as an unhandled rejection. The failure itself is already reported
      // through the hub's `error` state; here we only have to release the guard.
      try { await reloadRef.current?.(); }
      catch (err) { console.error('[useHubFreshness] refresh failed:', err?.message || err); }
      finally { inFlight = false; }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(fire, debounceMs);
    };

    const onVisibility = () => { if (document.visibilityState === 'visible') schedule(); };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', schedule);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', schedule);
      if (timer) clearTimeout(timer);
    };
  }, [centreId, enabled, lastLoadedAt, staleAfterMs, debounceMs]);

  // ── Realtime ────────────────────────────────────────────────────────────────
  // Its own effect, keyed on the hub: a hub switch must tear the old channel down
  // before opening the new one, or the previous hub's traffic keeps refetching.
  useEffect(() => {
    if (!realtime || !enabled || !centreId) return undefined;

    let timer     = null;
    let inFlight  = false;
    let cancelled = false;

    const refresh = async () => {
      timer = null;
      if (cancelled || inFlight) return;
      inFlight = true;
      try { await reloadRef.current?.(); }
      catch (err) { console.error('[useHubFreshness] realtime refresh failed:', err?.message || err); }
      finally { inFlight = false; }
    };

    // No staleness gate here — see the header. An event IS the evidence of change.
    const unsubscribe = subscribeToHubActivity(centreId, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, realtimeDebounceMs);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [centreId, realtime, enabled, realtimeDebounceMs]);
}
