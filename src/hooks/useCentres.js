/**
 * hooks/useCentres.js
 *
 * Loads all budget centres the current user belongs to,
 * and the user's plan tier (free | pro).
 * Used by SidePanel for hub switching and creation gating.
 * Reloads when user changes.
 */

import { useState, useEffect, useCallback } from 'react';
import { getCentres, getUserPlan }          from '../services/centres.service';

export function useCentres(user) {
  const [centres, setCentres] = useState([]);
  const [plan,    setPlan]    = useState('free');
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    if (!user) {
      setCentres([]);
      setPlan('free');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const [centresResult, planResult] = await Promise.all([
      getCentres(),
      getUserPlan(),
    ]);

    if (centresResult.error) {
      console.error('[useCentres] load error:', centresResult.error.message);
      setError(centresResult.error.message);
    } else {
      setCentres(centresResult.data || []);
    }
    setPlan(planResult.data || 'free');
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  return { centres, plan, loading, error, reload: load };
}
