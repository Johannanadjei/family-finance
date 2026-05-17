/**
 * transactions.service.js
 *
 * All Supabase read/write operations for transactions.
 * Pure async functions — no React, no state, no side effects.
 *
 * ARCHITECTURE NOTE:
 * Every transaction — whether from the main app or guest portal —
 * flows through addTransaction(). This is the single write path.
 *
 * SUPABASE SYNC POINT: Replaces localStorage ff_transactions key.
 */

import { supabase } from '../lib/supabase';

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Fetch all active transactions for a household, newest first.
 * @param {string} householdId
 * @returns {{ data: object[]|null, error: object|null }}
 */
export const getTransactions = async (householdId) => {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  return { data: data || null, error };
};

/**
 * Fetch transactions filtered by week.
 * @param {string} householdId
 * @param {string} week — e.g. 'Week 1'
 * @returns {{ data: object[]|null, error: object|null }}
 */
export const getTransactionsByWeek = async (householdId, week) => {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('household_id', householdId)
    .eq('week', week)
    .is('deleted_at', null)
    .order('date', { ascending: false });

  return { data: data || null, error };
};

/**
 * Fetch transactions filtered by date range.
 * @param {string} householdId
 * @param {string} from — ISO date string 'YYYY-MM-DD'
 * @param {string} to   — ISO date string 'YYYY-MM-DD'
 * @returns {{ data: object[]|null, error: object|null }}
 */
export const getTransactionsByDateRange = async (householdId, from, to) => {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('household_id', householdId)
    .gte('date', from)
    .lte('date', to)
    .is('deleted_at', null)
    .order('date', { ascending: false });

  return { data: data || null, error };
};

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Add a new transaction. Works for both main app and guest portal.
 * category_id is optional — if omitted, treated as variable spending.
 *
 * @param {string} householdId
 * @param {{
 *   date:          string,
 *   week:          string,
 *   type:          'income'|'expense',
 *   category_id?:  string,
 *   category_name: string,
 *   description?:  string,
 *   amount:        number,
 *   submitted_by?: string,
 *   source:        'main_app'|'guest_portal',
 * }} tx
 * @returns {{ data: object|null, error: object|null }}
 */
export const addTransaction = async (householdId, tx) => {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      household_id:  householdId,
      created_by:    user?.id || null,
      date:          tx.date,
      week:          tx.week,
      type:          tx.type,
      category_id:   tx.category_id   || null,
      category_name: tx.category_name,
      description:   tx.description   || '',
      amount:        tx.amount,
      submitted_by:  tx.submitted_by  || null,
      source:        tx.source        || 'main_app',
    })
    .select()
    .single();

  return { data: data || null, error };
};

/**
 * Soft delete a transaction (sets deleted_at).
 * @param {string} transactionId
 * @returns {{ error: object|null }}
 */
export const deleteTransaction = async (transactionId) => {
  const { error } = await supabase
    .from('transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', transactionId);

  return { error };
};

/**
 * Update a transaction's description or amount.
 * @param {string} transactionId
 * @param {Partial<{ description: string, amount: number, category_name: string, category_id: string }>} updates
 * @returns {{ data: object|null, error: object|null }}
 */
export const updateTransaction = async (transactionId, updates) => {
  const { data, error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('id', transactionId)
    .is('deleted_at', null)
    .select()
    .single();

  return { data: data || null, error };
};
