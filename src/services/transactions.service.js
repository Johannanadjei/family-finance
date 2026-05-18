/**
 * services/transactions.service.js
 *
 * All Supabase read/write operations for transactions.
 *
 * RULES:
 * - Every select filters deleted_at is null
 * - Every select filters budget_centre_id
 * - Every delete is soft — sets deleted_at = now()
 * - Validation runs before every insert/update
 * - logged_by_user_id and logged_by_name always recorded on insert
 * - Never throws — always returns { data, error }
 */

import { supabase } from '../lib/supabase';
import { validateTransaction, validateString } from '../lib/validation';

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Fetch all active transactions for a budget centre.
 * Ordered by date descending — most recent first.
 *
 * @param {string} centreId
 */
export const getTransactions = async (centreId) => {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('budget_centre_id', centreId)
    .is('deleted_at', null)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) console.error('[transactions.service] getTransactions error:', error.message);
  return { data: data || [], error };
};

/**
 * Fetch transactions for a specific month.
 *
 * @param {string} centreId
 * @param {string} month — 'YYYY-MM'
 */
export const getTransactionsByMonth = async (centreId, month) => {
  const from = month + '-01';
  const to   = new Date(new Date(from).setMonth(new Date(from).getMonth() + 1) - 1)
    .toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('budget_centre_id', centreId)
    .gte('date', from)
    .lte('date', to)
    .is('deleted_at', null)
    .order('date', { ascending: false });

  if (error) console.error('[transactions.service] getTransactionsByMonth error:', error.message);
  return { data: data || [], error };
};

/**
 * Fetch a single transaction by ID.
 */
export const getTransactionById = async (transactionId) => {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', transactionId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) console.error('[transactions.service] getTransactionById error:', error.message);
  return { data, error };
};

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Add a new transaction.
 * Always records logged_by_user_id and logged_by_name.
 *
 * @param {string} centreId
 * @param {object} tx — transaction data
 */
export const addTransaction = async (centreId, tx) => {
  const { data: { user } } = await supabase.auth.getUser();

  let validated;
  try {
    validated = validateTransaction({
      ...tx,
      logged_by_name: tx.logged_by_name || user?.user_metadata?.full_name || user?.email || '',
    });
  } catch (e) {
    console.error('[transactions.service] addTransaction validation error:', e.message);
    return { data: null, error: e };
  }

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      budget_centre_id:      centreId,
      ...validated,
      logged_by_user_id:     user?.id    || null,
      category_id:           tx.category_id || null,
      submitted_by_guest_id: tx.submitted_by_guest_id || null,
      submitted_by_name:     tx.submitted_by_name     || '',
    })
    .select()
    .single();

  if (error) console.error('[transactions.service] addTransaction error:', error.message);
  return { data, error };
};

/**
 * Update a transaction's description, amount, or category.
 *
 * @param {string} transactionId
 * @param {Partial<{ description, amount, category_name, category_id }>} updates
 */
export const updateTransaction = async (transactionId, updates) => {
  const cleaned = {};

  try {
    if (updates.description   !== undefined) cleaned.description   = typeof updates.description === 'string' ? updates.description.trim() : '';
    if (updates.amount        !== undefined) cleaned.amount        = Math.round(Math.max(0, Number(updates.amount)));
    if (updates.category_name !== undefined) cleaned.category_name = validateString(updates.category_name, 'category_name');
    if (updates.category_id   !== undefined) cleaned.category_id   = updates.category_id || null;
  } catch (e) {
    console.error('[transactions.service] updateTransaction validation error:', e.message);
    return { data: null, error: e };
  }

  const { data, error } = await supabase
    .from('transactions')
    .update(cleaned)
    .eq('id', transactionId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) console.error('[transactions.service] updateTransaction error:', error.message);
  return { data, error };
};

/**
 * Soft delete a transaction.
 */
export const deleteTransaction = async (transactionId) => {
  const { error } = await supabase
    .from('transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', transactionId);

  if (error) console.error('[transactions.service] deleteTransaction error:', error.message);
  return { error };
};
