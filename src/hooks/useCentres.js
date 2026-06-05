/**
 * hooks/useCentres.js
 *
 * Loads all budget centres the current user belongs to and archived centres
 * (is_archived = true, not deleted). Used by SidePanel for hub switching and
 * restore. Reloads when user changes.
 *
 * Plan tier is NOT loaded here — it moved to useSubscription (subscriptions
 * table source of truth). The old getUserPlan(users.plan) read was removed.
 */

import { useState, useEffect, useCallback } from 'react';
import { getCentres, getArchivedCentres } from '../services/centres.service';
import { waitForSession } from '../lib/auth';

export function useCentres(user) {
  const [centres,         setCentres]         = useState([]);
  const [archivedCentres, setArchivedCentres] = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(null);

  const load = useCallback(async () => {
    if (!user) {
      setCentres([]);
      setArchivedCentres([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    // Auth-readiness gate — keep cold-load hub queries off a stale token.
    const { error: sessionErr } = await waitForSession();
    if (sessionErr) {
      console.error('[useCentres] session not ready:', sessionErr.message);
      setError(sessionErr.message);
      setLoading(false);
      return;
    }

    const [centresResult, archivedResult] = await Promise.all([
      getCentres(),
      getArchivedCentres(),
    ]);

    if (centresResult.error) {
      console.error('[useCentres] load error:', centresResult.error.message);
      setError(centresResult.error.message);
    } else {
      setCentres(centresResult.data || []);
    }
    setArchivedCentres(archivedResult.data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  return { centres, archivedCentres, loading, error, reload: load };
}
