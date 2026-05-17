/**
 * categories.service.js
 *
 * All Supabase read/write operations for budget categories.
 * Pure async functions — no React, no state, no side effects.
 *
 * SUPABASE SYNC POINT: Replaces FIXED_EXPENSES constant from constants/index.js.
 * In production, categories are household-specific and stored in Supabase.
 * The hardcoded FIXED_EXPENSES constant remains as a fallback for onboarding defaults.
 */

import { supabase } from '../lib/supabase';

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Fetch all active budget categories for a household, ordered by sort_order.
 * @param {string} householdId
 * @returns {{ data: object[]|null, error: object|null }}
 */
export const getBudgetCategories = async (householdId) => {
  const { data, error } = await supabase
    .from('budget_categories')
    .select('*')
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

  return { data: data || null, error };
};

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Add a new budget category.
 * @param {string} householdId
 * @param {{
 *   name:          string,
 *   icon?:         string,
 *   budget_amount: number,
 *   sort_order?:   number,
 *   is_fixed?:     boolean,
 * }} category
 * @returns {{ data: object|null, error: object|null }}
 */
export const addBudgetCategory = async (householdId, category) => {
  const { data, error } = await supabase
    .from('budget_categories')
    .insert({
      household_id:  householdId,
      name:          category.name,
      icon:          category.icon          || '💸',
      budget_amount: category.budget_amount || 0,
      sort_order:    category.sort_order    || 0,
      is_fixed:      category.is_fixed      ?? true,
    })
    .select()
    .single();

  return { data: data || null, error };
};

/**
 * Bulk insert categories — used during onboarding to seed defaults.
 * @param {string} householdId
 * @param {Array<{ name: string, icon: string, budget_amount: number, sort_order: number }>} categories
 * @returns {{ data: object[]|null, error: object|null }}
 */
export const bulkAddBudgetCategories = async (householdId, categories) => {
  const rows = categories.map(c => ({
    household_id:  householdId,
    name:          c.name,
    icon:          c.icon          || '💸',
    budget_amount: c.budget_amount || 0,
    sort_order:    c.sort_order    || 0,
    is_fixed:      c.is_fixed      ?? true,
  }));

  const { data, error } = await supabase
    .from('budget_categories')
    .insert(rows)
    .select();

  return { data: data || null, error };
};

/**
 * Update a budget category's name, icon, or budget amount.
 * @param {string} categoryId
 * @param {Partial<{ name: string, icon: string, budget_amount: number, sort_order: number }>} updates
 * @returns {{ data: object|null, error: object|null }}
 */
export const updateBudgetCategory = async (categoryId, updates) => {
  const { data, error } = await supabase
    .from('budget_categories')
    .update(updates)
    .eq('id', categoryId)
    .is('deleted_at', null)
    .select()
    .single();

  return { data: data || null, error };
};

/**
 * Soft delete a budget category.
 * @param {string} categoryId
 * @returns {{ error: object|null }}
 */
export const deleteBudgetCategory = async (categoryId) => {
  const { error } = await supabase
    .from('budget_categories')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', categoryId);

  return { error };
};
