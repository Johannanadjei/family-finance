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

/** Friendly, user-facing copy for a plan category-cap rejection (CAT01). */
const CATEGORY_CAP_MESSAGE =
  "You've reached your hub's category limit for this period. Free hubs can have 10 categories per budget period. Upgrade to Pro for unlimited categories.";

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
 * Delegates to the create_category SECURITY DEFINER RPC (scripts/create_category.sql),
 * which enforces the per-tier category cap server-side using the OWNER's tier —
 * rejecting with SQLSTATE 'CAT01' (per-cycle scope: 10 per budget period for Free,
 * unlimited for Pro). The client gate (BudgetView/SettingsView) is UX only; this RPC
 * is the real enforcement. On a cap rejection the returned Error carries
 * `error.code === 'CAT01'` so callers can open the upgrade modal. (Mirrors HUB01/MEM01.)
 *
 * @param {string} centreId
 * @param {{ name, icon, budget_amount, month, is_fixed, sort_order }} category
 * @param {string} [cycleId] — passed as the RPC's p_cycle_id; the resolve_cycle_id
 *   trigger short-circuits on it. Omit it → null → trigger resolves from month.
 */
export const addCategory = async (centreId, category, cycleId) => {
  let validated;
  try {
    validated = validateCategory(category);
  } catch (e) {
    console.error('[categories.service] addCategory validation error:', e.message);
    return { data: null, error: e };
  }

  const { data, error } = await supabase.rpc('create_category', {
    p_centre_id:     centreId,
    p_cycle_id:      cycleId ?? null,
    p_name:          validated.name,
    p_icon:          validated.icon,
    p_budget_amount: validated.budget_amount,
    p_month:         validated.month,
    p_is_fixed:      category.is_fixed ?? true,
    p_sort_order:    validated.sort_order ?? 0,
  });

  if (error) {
    if (error.code === 'CAT01') {
      const capErr = new Error(CATEGORY_CAP_MESSAGE);
      capErr.code = 'CAT01';
      console.error('[categories.service] addCategory cap reached (CAT01)');
      return { data: null, error: capErr };
    }
    console.error('[categories.service] addCategory RPC error:', error.message);
    return { data: null, error };
  }

  return { data, error: null };
};

/**
 * Bulk insert categories — used during onboarding and budget rollforward.
 *
 * Delegates to the create_categories_bulk SECURITY DEFINER RPC
 * (scripts/create_categories_bulk.sql), which enforces the per-tier category cap on
 * the whole batch (existing_in_cycle + new <= owner-tier limit), rejecting with
 * SQLSTATE 'CAT01' if it would exceed. Routing onboarding + rollforward through this
 * RPC closes the bypass hole a direct bulk INSERT left open. Cap rejection → Error
 * with `error.code === 'CAT01'`.
 *
 * @param {string} centreId
 * @param {Array} categories
 * @param {string} [cycleId] — passed as the RPC's p_cycle_id (stamped onto every
 *   row). The bulk RPC requires a non-null cycle; both callers always have one.
 */
export const bulkAddCategories = async (centreId, categories, cycleId) => {
  const rows = [];

  for (const cat of categories) {
    try {
      const validated = validateCategory(cat);
      rows.push({
        ...validated,
        is_fixed: cat.is_fixed ?? true,
      });
    } catch (e) {
      console.error('[categories.service] bulkAddCategories validation error:', e.message, cat);
      return { data: null, error: e };
    }
  }

  const { data, error } = await supabase.rpc('create_categories_bulk', {
    p_centre_id:  centreId,
    p_cycle_id:   cycleId ?? null,
    p_categories: rows,
  });

  if (error) {
    if (error.code === 'CAT01') {
      const capErr = new Error(CATEGORY_CAP_MESSAGE);
      capErr.code = 'CAT01';
      console.error('[categories.service] bulkAddCategories cap reached (CAT01)');
      return { data: null, error: capErr };
    }
    console.error('[categories.service] bulkAddCategories RPC error:', error.message);
    return { data: null, error };
  }

  return { data: data || [], error: null };
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
