/**
 * services/categories.service.js
 *
 * All Supabase read/write operations for budget_categories.
 *
 * RULES:
 * - Every select filters deleted_at is null
 * - Every select filters budget_centre_id
 * - Categories are always filtered by month
 * - Every delete is soft — sets deleted_at = now()
 * - Validation runs before every insert/update
 * - Never throws — always returns { data, error }
 */

import { supabase } from '../lib/supabase';
import { validateCategory } from '../lib/validation';
import { getCurrentMonth } from '../lib/finance';

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Fetch all active budget categories for a centre and month.
 * Defaults to current month.
 *
 * @param {string} centreId
 * @param {string} [month] — 'YYYY-MM' format, defaults to current month
 */
export const getCategories = async (centreId, month = getCurrentMonth()) => {
  const { data, error } = await supabase
    .from('budget_categories')
    .select('*')
    .eq('budget_centre_id', centreId)
    .eq('month', month)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

  if (error) console.error('[categories.service] getCategories error:', error.message);
  // Never mask a failure as []: error → data null; success → always an array. See CLAUDE.md §12.
  return { data: error ? null : (data || []), error };
};

/**
 * Fetch ALL active budget categories for a centre across every month.
 * Mirrors getIncomeSources (no month filter) — feeds useBudgetCentre's
 * allCategories, from which the current-month `categories` slice is derived.
 * Ordered month then sort_order so each month's slice stays sort_order-ascending.
 *
 * @param {string} centreId
 */
export const getAllCategories = async (centreId) => {
  const { data, error } = await supabase
    .from('budget_categories')
    .select('*')
    .eq('budget_centre_id', centreId)
    .is('deleted_at', null)
    .order('month', { ascending: false })
    .order('sort_order', { ascending: true });

  if (error) console.error('[categories.service] getAllCategories error:', error.message);
  // Never mask a failure as []: error → data null; success → always an array. See CLAUDE.md §12.
  return { data: error ? null : (data || []), error };
};

/**
 * Fetch a single category by ID.
 */
export const getCategoryById = async (categoryId) => {
  const { data, error } = await supabase
    .from('budget_categories')
    .select('*')
    .eq('id', categoryId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) console.error('[categories.service] getCategoryById error:', error.message);
  return { data, error };
};

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Add a single budget category.
 *
 * @param {string} centreId
 * @param {{ name, icon, budget_amount, month, is_fixed, sort_order }} category
 * @param {string} [cycleId] — stamped client-side (Commit 14a) when supplied; the
 *   resolve_cycle_id trigger short-circuits on it. Omit it → trigger resolves from month.
 */
export const addCategory = async (centreId, category, cycleId) => {
  let validated;
  try {
    validated = validateCategory(category);
  } catch (e) {
    console.error('[categories.service] addCategory validation error:', e.message);
    return { data: null, error: e };
  }

  const { data, error } = await supabase
    .from('budget_categories')
    .insert({
      budget_centre_id: centreId,
      ...validated,
      is_fixed: category.is_fixed ?? true,
      ...(cycleId && { cycle_id: cycleId }),
    })
    .select()
    .single();

  if (error) console.error('[categories.service] addCategory error:', error.message);
  return { data, error };
};

/**
 * Bulk insert categories — used during onboarding and budget rollforward.
 *
 * @param {string} centreId
 * @param {Array} categories
 * @param {string} [cycleId] — stamped when supplied (rollforward); onboarding omits
 *   it (no cycle exists yet) and the resolve_cycle_id trigger resolves from month.
 */
export const bulkAddCategories = async (centreId, categories, cycleId) => {
  const rows = [];

  for (const cat of categories) {
    try {
      const validated = validateCategory(cat);
      rows.push({
        budget_centre_id: centreId,
        ...validated,
        is_fixed: cat.is_fixed ?? true,
        ...(cycleId && { cycle_id: cycleId }),
      });
    } catch (e) {
      console.error('[categories.service] bulkAddCategories validation error:', e.message, cat);
      return { data: null, error: e };
    }
  }

  const { data, error } = await supabase
    .from('budget_categories')
    .insert(rows)
    .select();

  if (error) console.error('[categories.service] bulkAddCategories error:', error.message);
  return { data: data || [], error };
};

/**
 * Update a budget category's name, icon, budget amount, or sort order.
 *
 * @param {string} categoryId
 * @param {Partial<{ name, icon, budget_amount, sort_order }>} updates
 */
export const updateCategory = async (categoryId, updates) => {
  const cleaned = {};

  try {
    if (updates.name          !== undefined) cleaned.name          = updates.name.trim();
    if (updates.icon          !== undefined) cleaned.icon          = updates.icon || '💸';
    if (updates.budget_amount !== undefined) cleaned.budget_amount = Math.round(Math.max(0, Number(updates.budget_amount) || 0));
    if (updates.sort_order    !== undefined) cleaned.sort_order    = Number.isInteger(updates.sort_order) ? updates.sort_order : 0;
  } catch (e) {
    console.error('[categories.service] updateCategory validation error:', e.message);
    return { data: null, error: e };
  }

  const { data, error } = await supabase
    .from('budget_categories')
    .update(cleaned)
    .eq('id', categoryId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) console.error('[categories.service] updateCategory error:', error.message);
  return { data, error };
};

/**
 * Soft delete a budget category.
 */
export const deleteCategory = async (categoryId) => {
  const { error } = await supabase
    .from('budget_categories')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', categoryId);

  if (error) console.error('[categories.service] deleteCategory error:', error.message);
  return { error };
};
