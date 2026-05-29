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
 */
export const addCategory = async (centreId, category) => {
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
    })
    .select()
    .single();

  if (error) console.error('[categories.service] addCategory error:', error.message);
  return { data, error };
};

/**
 * Bulk insert categories — used during onboarding.
 *
 * @param {string} centreId
 * @param {Array} categories
 */
export const bulkAddCategories = async (centreId, categories) => {
  const rows = [];

  for (const cat of categories) {
    try {
      const validated = validateCategory(cat);
      rows.push({
        budget_centre_id: centreId,
        ...validated,
        is_fixed: cat.is_fixed ?? true,
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

/**
 * Copy categories from one month to the next.
 * Used at the start of each new month to carry forward the budget plan.
 *
 * @param {string} centreId
 * @param {string} fromMonth — 'YYYY-MM'
 * @param {string} toMonth   — 'YYYY-MM'
 */
export const copyCategoriesToMonth = async (centreId, fromMonth, toMonth) => {
  const { data: existing, error: fetchErr } = await getCategories(centreId, fromMonth);

  if (fetchErr) return { data: null, error: fetchErr };
  if (!existing.length) return { data: [], error: null };

  const rows = existing.map(({ id, created_at, updated_at, deleted_at, ...cat }) => ({
    ...cat,
    month: toMonth,
  }));

  const { data, error } = await supabase
    .from('budget_categories')
    .insert(rows)
    .select();

  if (error) console.error('[categories.service] copyCategoriesToMonth error:', error.message);
  return { data: data || [], error };
};
