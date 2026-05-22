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
import { supabase }                          from '../lib/supabase';
import { addCategory as addCategoryService, updateCategory as updateCategoryService, deleteCategory as deleteCategoryService } from '../services/categories.service';
import { updateCentre as updateCentreService } from '../services/centres.service';
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

  const updateCentre = useCallback(async (updates) => {
    const id = centre?.id;
    if (!id) return { error: new Error('No active centre') };
    const prev = centre;
    setCentre(c => ({ ...c, ...updates }));
    const { data, error } = await updateCentreService(id, updates);
    if (error) {
      setCentre(prev);
      console.error('[useBudgetCentre] updateCentre rollback:', error.message);
      return { error };
    }
    setCentre(data);
    return { data, error: null };
  }, [centre]);

  const updateCategory = useCallback(async (categoryId, updates) => {
    const prevCategories = categories;
    setCategories(cats => cats.map(c => c.id === categoryId ? { ...c, ...updates } : c));
    const { data, error } = await updateCategoryService(categoryId, updates);
    if (error) {
      setCategories(prevCategories);
      console.error('[useBudgetCentre] updateCategory rollback:', error.message);
      return { error };
    }
    setCategories(cats => cats.map(c => c.id === categoryId ? data : c));
    return { data, error: null };
  }, [categories]);

  const deleteCategory = useCallback(async (categoryId) => {
    const prevCategories = categories;
    setCategories(cats => cats.filter(c => c.id !== categoryId));
    const { error } = await deleteCategoryService(categoryId);
    if (error) {
      setCategories(prevCategories);
      console.error('[useBudgetCentre] deleteCategory rollback:', error.message);
      return { error };
    }
    return { error: null };
  }, [categories]);

  return {
    centre,
    centreId:       centre?.id   || null,
    categories,
    members,
    loading,
    needsOnboarding,
    error,
    addCategory,
    updateCentre,
    updateCategory,
    deleteCategory,
    onOnboardingComplete,
    reload: load,
  };
}
