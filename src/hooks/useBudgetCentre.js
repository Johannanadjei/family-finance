/**
 * useBudgetCentre.js
 *
 * Loads the active budget centre, its categories, and its members from Supabase.
 * This is the entry point for all centre-specific data.
 *
 * STATE MACHINE:
 *   loading         → fetching from Supabase
 *   needsOnboarding → user has no budget centres yet
 *   ready           → centre + categories + members loaded
 *   error           → fetch failed
 *
 * ARCHITECTURE:
 *   - centre + categories + members passed to BudgetCentreProvider in App.jsx
 *   - useFinance receives the full centre object
 *   - Supabase is the only source — no localStorage, no constants
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase }                                                          from '../lib/supabase';
import { addCategory as addCategoryService }                                  from '../services/categories.service';
import { getCurrentMonth } from '../lib/finance';

const fetchCentre = async () => {
  const { data, error } = await supabase
    .from('budget_centres')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return { data, error };
};

const fetchCategories = async (centreId) => {
  const { data, error } = await supabase
    .from('budget_categories')
    .select('*')
    .eq('budget_centre_id', centreId)
    .eq('month', getCurrentMonth())
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });
  return { data: data || [], error };
};

const fetchMembers = async (centreId) => {
  const { data, error } = await supabase
    .from('budget_centre_members')
    .select('*, users(id, name, email, avatar_url)')
    .eq('budget_centre_id', centreId)
    .is('deleted_at', null);
  return { data: data || [], error };
};

export function useBudgetCentre(user) {
  const [centre,          setCentre]          = useState(null);
  const [categories,      setCategories]      = useState([]);
  const [members,         setMembers]         = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [error,           setError]           = useState(null);

  const load = useCallback(async () => {
    if (!user) {
      setCentre(null);
      setCategories([]);
      setMembers([]);
      setLoading(false);
      setNeedsOnboarding(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data: centreData, error: centreErr } = await fetchCentre();

    if (centreErr) {
      console.error('[useBudgetCentre] centre fetch error:', centreErr.message);
      setError(centreErr.message);
      setLoading(false);
      return;
    }

    if (!centreData) {
      setNeedsOnboarding(true);
      setCentre(null);
      setCategories([]);
      setMembers([]);
      setLoading(false);
      return;
    }

    // Resume detection — centre exists but has no categories for current month
    // This happens if a previous onboarding write partially failed
    const [catResult, memberResult] = await Promise.all([
      fetchCategories(centreData.id),
      fetchMembers(centreData.id),
    ]);

    if (catResult.error) {
      console.error('[useBudgetCentre] categories fetch error:', catResult.error.message);
    }
    if (memberResult.error) {
      console.error('[useBudgetCentre] members fetch error:', memberResult.error.message);
    }

    if (catResult.data.length === 0) {
      // Centre exists but no categories — resume onboarding
      setNeedsOnboarding(true);
      setCentre(centreData);
      setCategories([]);
      setMembers(memberResult.data);
      setLoading(false);
      return;
    }

    setCentre(centreData);
    setCategories(catResult.data);
    setMembers(memberResult.data);
    setNeedsOnboarding(false);
    setLoading(false);
  }, [user]);



  useEffect(() => {
    load();
  }, [load]);

  const onOnboardingComplete = useCallback(() => {
    load();
  }, [load]);

  const addCategory = async (category) => {
    const id = centre?.id;
    if (!id) return { error: new Error('No active centre') };
    const { data, error } = await addCategoryService(id, category);
    if (error) return { error };
    setCategories(prev => [...prev, data]);
    return { data, error: null };
  };

  return {
    centre,
    centreId:       centre?.id   || null,
    categories,
    members,
    loading,
    needsOnboarding,
    error,
    addCategory,
    onOnboardingComplete,
    reload: load,
  };
}
