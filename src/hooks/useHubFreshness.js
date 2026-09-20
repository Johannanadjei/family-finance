/**
 * hooks/useHubFreshness.js
 *
 * Multi-device freshness: brings the active hub up to date when the app comes
 * back to the foreground or the network returns.
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
 */

import { useEffect, useRef } from 'react';

export const STALE_AFTER_MS = 30_000;
export const DEBOUNCE_MS    = 500;

export function useHubFreshness({
  centreId,
  reloadHub,
  lastLoadedAt,
  enabled     = true,
  staleAfterMs = STALE_AFTER_MS,
  debounceMs   = DEBOUNCE_MS,
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
}
