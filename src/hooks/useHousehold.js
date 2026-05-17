/**
 * useHousehold.js
 *
 * Fetches and manages the household context for the authenticated user.
 * This is the single source of truth for household identity in the app.
 *
 * ARCHITECTURE:
 *   App.jsx calls useHousehold(user) after auth resolves.
 *   If needsOnboarding is true → show OnboardingFlow.
 *   If household is loaded → pass householdId down to useFinance.
 *
 * STATE MACHINE:
 *   loading        → fetching household from Supabase
 *   needsOnboarding → user has no household yet
 *   household      → household data is ready, app can render
 *   error          → something went wrong fetching
 */

import { useState, useEffect, useCallback } from 'react';
import { getHousehold } from '../services/households.service';

export function useHousehold(user) {
  const [household,       setHousehold]       = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [error,           setError]           = useState(null);

  const fetchHousehold = useCallback(async () => {
    if (!user) {
      setHousehold(null);
      setLoading(false);
      setNeedsOnboarding(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await getHousehold();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 = no rows found (not an error — means needs onboarding)
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    if (!data) {
      // No household found — user needs to complete onboarding
      setNeedsOnboarding(true);
      setHousehold(null);
    } else {
      setHousehold(data);
      setNeedsOnboarding(false);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchHousehold();
  }, [fetchHousehold]);

  /**
   * Called after onboarding completes successfully.
   * Refreshes household data so the app can render the dashboard.
   */
  const onOnboardingComplete = useCallback(() => {
    fetchHousehold();
  }, [fetchHousehold]);

  return {
    household,
    householdId:    household?.id || null,
    loading,
    needsOnboarding,
    error,
    onOnboardingComplete,
  };
}
