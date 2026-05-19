/**
 * hooks/useCentres.js
 *
 * Loads all budget centres the current user belongs to.
 * Used by SidePanel to show centre switcher.
 * Reloads when user changes.
 */

import { useState, useEffect, useCallback } from 'react';
import { getCentres } from '../services/centres.service';

export function useCentres(user) {
  const [centres, setCentres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    if (!user) { setCentres([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: err } = await getCentres();
    if (err) {
      console.error('[useCentres] load error:', err.message);
      setError(err.message);
    } else {
      setCentres(data || []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  return { centres, loading, error, reload: load };
}
