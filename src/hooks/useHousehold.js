/**
 * useHousehold.js
 *
 * Fetches and manages the household context for the authenticated user.
 * Loads both the household config AND budget categories in a single fetch.
 *
 * ARCHITECTURE:
 *   - This is the entry point for all household data
 *   - household + categories are passed to HouseholdProvider in App.jsx
 *   - useFinance receives the full household object (not just householdId)
 *   - Supabase is the only source of truth — no localStorage, no constants
 *
 * STATE MACHINE:
 *   loading         → fetching from Supabase
 *   needsOnboarding → user has no household yet
 *   ready           → household + categories loaded, app can render
 *   error           → fetch failed
 */

import { useState, useEffect, useCallback } from 'react';
import { getHousehold } from '../services/households.service';
import { getBudgetCategories } from '../services/categories.service';

export function useHousehold(user) {
  const [household,       setHousehold]       = useState(null);
  const [categories,      setCategories]      = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [error,           setError]           = useState(null);

  const fetchHousehold = useCallback(async () => {
    if (!user) {
      setHousehold(null);
      setCategories([]);
      setLoading(false);
      setNeedsOnboarding(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Load household and categories in parallel
    const { data: householdData, error: householdErr } = await getHousehold();

    if (householdErr && householdErr.code !== 'PGRST116') {
      setError(householdErr.message);
      setLoading(false);
      return;
    }

    if (!householdData) {
      setNeedsOnboarding(true);
      setHousehold(null);
      setCategories([]);
      setLoading(false);
      return;
    }

    // Household found — load categories in parallel
    const { data: categoryData, error: catErr } = await getBudgetCategories(householdData.id);
    if (catErr) console.error("[useHousehold] categories fetch error:", catErr.message);

    setHousehold(householdData);
    setCategories(categoryData || []);
    setNeedsOnboarding(false);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchHousehold();
  }, [fetchHousehold]);

  const onOnboardingComplete = useCallback(() => {
    fetchHousehold();
  }, [fetchHousehold]);

  return {
    household,
    householdId:    household?.id     || null,
    categories,
    loading,
    needsOnboarding,
    error,
    onOnboardingComplete,
  };
}
