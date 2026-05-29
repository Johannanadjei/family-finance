/**
 * hooks/useCentres.js
 *
 * Loads all budget centres the current user belongs to,
 * archived centres (is_archived = true, not deleted),
 * and the user's plan tier (free | pro).
 * Used by SidePanel for hub switching, creation gating, and restore.
 * Reloads when user changes.
 */

import { useState, useEffect, useCallback } from 'react';
import { getCentres, getArchivedCentres, getUserPlan } from '../services/centres.service';
import { waitForSession } from '../lib/auth';

export function useCentres(user) {
  const [centres,         setCentres]         = useState([]);
  const [archivedCentres, setArchivedCentres] = useState([]);
  const [plan,            setPlan]            = useState('free');
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(null);

  const load = useCallback(async () => {
    if (!user) {
      setCentres([]);
      setArchivedCentres([]);
      setPlan('free');
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

    const [centresResult, archivedResult, planResult] = await Promise.all([
      getCentres(),
      getArchivedCentres(),
      getUserPlan(),
    ]);

    if (centresResult.error) {
      console.error('[useCentres] load error:', centresResult.error.message);
      setError(centresResult.error.message);
    } else {
      setCentres(centresResult.data || []);
    }
    setArchivedCentres(archivedResult.data || []);
    setPlan(planResult.data || 'free');
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  return { centres, archivedCentres, plan, loading, error, reload: load };
}
