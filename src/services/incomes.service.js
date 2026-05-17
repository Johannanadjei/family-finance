/**
 * incomes.service.js
 *
 * All Supabase read/write operations for income sources.
 * Pure async functions — no React, no state, no side effects.
 *
 * SUPABASE SYNC POINT: Replaces in-memory INITIAL_INCOMES from mockData.js.
 */

import { supabase } from '../lib/supabase';

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Fetch all active income sources for a household.
 * @param {string} householdId
 * @returns {{ data: object[]|null, error: object|null }}
 */
export const getIncomeSources = async (householdId) => {
  const { data, error } = await supabase
    .from('income_sources')
    .select('*')
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  return { data: data || null, error };
};

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Add a new income source to a household.
 * @param {string} householdId
 * @param {{
 *   label:           string,
 *   expected_amount: number,
 *   pay_day?:        number,
 *   pay_day_type:    'fixed_date'|'last_working_day',
 *   icon?:           string,
 *   notes?:          string,
 * }} source
 * @returns {{ data: object|null, error: object|null }}
 */
export const addIncomeSource = async (householdId, source) => {
  const { data, error } = await supabase
    .from('income_sources')
    .insert({
      household_id:    householdId,
      label:           source.label,
      expected_amount: source.expected_amount,
      pay_day:         source.pay_day         || null,
      pay_day_type:    source.pay_day_type    || 'fixed_date',
      icon:            source.icon            || '👤',
      notes:           source.notes           || '',
      received:        false,
      received_amount: 0,
    })
    .select()
    .single();

  return { data: data || null, error };
};

/**
 * Mark an income source as received.
 * @param {string} incomeId
 * @param {number} receivedAmount
 * @param {string} actualPayDate — ISO date string 'YYYY-MM-DD'
 * @returns {{ data: object|null, error: object|null }}
 */
export const markIncomeReceived = async (incomeId, receivedAmount, actualPayDate) => {
  const { data, error } = await supabase
    .from('income_sources')
    .update({
      received:        true,
      received_amount: receivedAmount,
      actual_pay_date: actualPayDate,
    })
    .eq('id', incomeId)
    .is('deleted_at', null)
    .select()
    .single();

  return { data: data || null, error };
};

/**
 * Mark an income source as pending (undo received).
 * @param {string} incomeId
 * @returns {{ data: object|null, error: object|null }}
 */
export const markIncomePending = async (incomeId) => {
  const { data, error } = await supabase
    .from('income_sources')
    .update({
      received:        false,
      received_amount: 0,
      actual_pay_date: null,
    })
    .eq('id', incomeId)
    .is('deleted_at', null)
    .select()
    .single();

  return { data: data || null, error };
};

/**
 * Update the expected amount for an income source.
 * GOOGLE SHEETS SYNC POINT: syncExpectedIncomeToSpreadsheet(incomeId, newAmount)
 * @param {string} incomeId
 * @param {number} newAmount
 * @returns {{ data: object|null, error: object|null }}
 */
export const updateExpectedAmount = async (incomeId, newAmount) => {
  const { data, error } = await supabase
    .from('income_sources')
    .update({ expected_amount: newAmount })
    .eq('id', incomeId)
    .is('deleted_at', null)
    .select()
    .single();

  return { data: data || null, error };
};

/**
 * Soft delete an income source.
 * @param {string} incomeId
 * @returns {{ error: object|null }}
 */
export const deleteIncomeSource = async (incomeId) => {
  const { error } = await supabase
    .from('income_sources')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', incomeId);

  return { error };
};
