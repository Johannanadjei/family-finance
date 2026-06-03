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
import { warnOnEmptyColdLoad } from '../lib/auth';

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
  // Never mask a failure as []: error → data null; success → always an array. See CLAUDE.md §12.
  return { data: error ? null : (data || []), error };
};

/**
 * Fetch transactions for a specific cycle (Budget Cycles, Commit 11).
 *
 * Filters on cycle_id — the storage-layer invariant stamped by the Commit 10
 * trigger (scripts/migrate_cycle_id_trigger.sql) guarantees every live row carries
 * the id of the cycle containing its date, so this replaces the old date-range read.
 *
 * @param {string} centreId
 * @param {string} cycleId — budget_cycles.id
 */
export const getTransactionsByCycle = async (centreId, cycleId) => {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('budget_centre_id', centreId)
    .eq('cycle_id', cycleId)
    .is('deleted_at', null)
    .order('date', { ascending: false });

  if (error) console.error('[transactions.service] getTransactionsByCycle error:', error.message);
  if (!error) warnOnEmptyColdLoad('transactions', data);
  // Never mask a failure as []: error → data null; success → always an array. See CLAUDE.md §12.
  return { data: error ? null : (data || []), error };
};

/**
 * @deprecated Commit 11 — superseded by getTransactionsByCycle (cycle_id read).
 * Retained for one commit cycle; removed in the Commit 13 post-month-drop cleanup.
 * No live caller remains — useFinance reads by cycle. Do not wire into new code.
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
  if (!error) warnOnEmptyColdLoad('transactions', data);
  // Never mask a failure as []: error → data null; success → always an array. See CLAUDE.md §12.
  return { data: error ? null : (data || []), error };
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

  // Use .select() without .single() so a successful insert that RLS blocks
  // from reading back returns { data: [], error: null } rather than a PGRST116
  // error that would incorrectly trigger a rollback in the caller.
  const { data: rows, error } = await supabase
    .from('transactions')
    .insert({
      budget_centre_id:      centreId,
      ...validated,
      logged_by_user_id:     user?.id    || null,
      category_id:           tx.category_id || null,
      submitted_by_guest_id: tx.submitted_by_guest_id || null,
      submitted_by_name:     tx.submitted_by_name     || '',
    })
    .select();

  if (error) console.error('[transactions.service] addTransaction error:', error);
  return { data: rows?.[0] || null, error };
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
    if (updates.from_spare    !== undefined) cleaned.from_spare    = !!updates.from_spare;
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
 * Move a transaction to a different budget cycle (Commit 12).
 *
 * Writes cycle_id DIRECTLY, preserving the transaction's date — the move-by-cycle_id
 * decision (Path 2): "this May-31 expense belongs to June's budget" keeps the date
 * and only re-homes the budget assignment. The Commit-12 trigger branch
 * (scripts/migrate_move_cycle_trigger.sql) sees the explicit cycle_id change and
 * trusts it rather than re-resolving from date.
 *
 * Refuses a falsy cycleId before the write — a NULL cycle_id would orphan the row
 * from every cycle slice (the CYC02 invariant, client side). Returns the updated row.
 *
 * @param {string} transactionId
 * @param {string} cycleId — budget_cycles.id to move the transaction into
 */
export const moveTransactionToCycle = async (transactionId, cycleId) => {
  if (!cycleId) {
    const error = new Error('moveTransactionToCycle requires a target cycleId');
    console.error('[transactions.service] moveTransactionToCycle validation error:', error.message);
    return { data: null, error };
  }

  const { data, error } = await supabase
    .from('transactions')
    .update({ cycle_id: cycleId })
    .eq('id', transactionId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) console.error('[transactions.service] moveTransactionToCycle error:', error.message);
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
