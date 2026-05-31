/**
 * services/income.service.js
 *
 * All Supabase read/write operations for income_sources.
 *
 * RULES:
 * - Every select filters deleted_at is null
 * - Every select filters budget_centre_id
 * - Every delete is soft — sets deleted_at = now()
 * - Validation runs before every insert/update
 * - Never throws — always returns { data, error }
 */

import { supabase } from '../lib/supabase';
import { validateIncomeSource, validateAmount, validateDate, validateCurrency } from '../lib/validation';

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Fetch active income sources. Month-scoped (Phase 2A): pass a 'YYYY-MM' month
 * for one month; omit it for every month (Settings' all-months view).
 */
export const getIncomeSources = async (centreId, month) => {
  let query = supabase
    .from('income_sources')
    .select('*')
    .eq('budget_centre_id', centreId)
    .is('deleted_at', null);

  if (month) query = query.eq('month', month);

  const { data, error } = await query.order('created_at', { ascending: true });

  if (error) console.error('[income.service] getIncomeSources error:', error.message);
  // Never mask a failure as []: error → data null; success → always an array. See CLAUDE.md §12.
  return { data: error ? null : (data || []), error };
};

/**
 * Fetch a single income source by ID.
 */
export const getIncomeSourceById = async (sourceId) => {
  const { data, error } = await supabase
    .from('income_sources')
    .select('*')
    .eq('id', sourceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) console.error('[income.service] getIncomeSourceById error:', error.message);
  return { data, error };
};

// ── Mutations ─────────────────────────────────────────────────────────────────

/** Add a new income source. `source` is validated (month required) before insert. */
export const addIncomeSource = async (centreId, source) => {
  let validated;
  try {
    validated = validateIncomeSource(source);
  } catch (e) {
    console.error('[income.service] addIncomeSource validation error:', e.message);
    return { data: null, error: e };
  }

  const { data, error } = await supabase
    .from('income_sources')
    .insert({
      budget_centre_id: centreId,
      ...validated,
    })
    .select()
    .single();

  if (error) console.error('[income.service] addIncomeSource error:', error.message);
  return { data, error };
};

/** Bulk insert income sources — used during onboarding / hub creation. */
export const bulkAddIncomeSources = async (centreId, sources) => {
  const rows = [];

  for (const source of sources) {
    try {
      const validated = validateIncomeSource(source);
      rows.push({ budget_centre_id: centreId, ...validated });
    } catch (e) {
      console.error('[income.service] bulkAddIncomeSources validation error:', e.message, source);
      return { data: null, error: e };
    }
  }

  const { data, error } = await supabase
    .from('income_sources')
    .insert(rows)
    .select();

  if (error) console.error('[income.service] bulkAddIncomeSources error:', error.message);
  return { data: data || [], error };
};

/**
 * Update an income source's label, icon, expected amount, or pay day.
 *
 * @param {string} sourceId
 * @param {Partial<{ label, icon, expected_amount, currency, pay_day, pay_day_type, notes }>} updates
 */
export const updateIncomeSource = async (sourceId, updates) => {
  const cleaned = {};

  try {
    if (updates.label           !== undefined) cleaned.label           = updates.label.trim();
    if (updates.icon            !== undefined) cleaned.icon            = updates.icon || '💰';
    if (updates.expected_amount !== undefined) cleaned.expected_amount = Math.round(Math.max(0, Number(updates.expected_amount) || 0));
    if (updates.currency        !== undefined) cleaned.currency        = validateCurrency(updates.currency);
    if (updates.pay_day         !== undefined) cleaned.pay_day         = updates.pay_day ? Math.min(31, Math.max(1, parseInt(updates.pay_day))) : null;
    if (updates.pay_day_type    !== undefined) {
      const VALID = ['fixed_date', 'last_working_day', 'flexible'];
      cleaned.pay_day_type = VALID.includes(updates.pay_day_type) ? updates.pay_day_type : 'flexible';
    }
    if (updates.notes !== undefined) cleaned.notes = typeof updates.notes === 'string' ? updates.notes.trim() : '';
    if (updates.month !== undefined) {
      if (!/^\d{4}-\d{2}$/.test(updates.month)) throw new Error('month must be YYYY-MM format');
      cleaned.month = updates.month;
    }
  } catch (e) {
    console.error('[income.service] updateIncomeSource validation error:', e.message);
    return { data: null, error: e };
  }

  const { data, error } = await supabase
    .from('income_sources')
    .update(cleaned)
    .eq('id', sourceId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) console.error('[income.service] updateIncomeSource error:', error.message);
  return { data, error };
};

/**
 * Mark an income source as received.
 * Creates the income transaction separately in transactions.service.js.
 *
 * @param {string} sourceId
 * @param {number} receivedAmount
 * @param {string} actualPayDate — 'YYYY-MM-DD'
 */
export const markReceived = async (sourceId, receivedAmount, actualPayDate) => {
  let amount, date;
  try {
    amount = validateAmount(receivedAmount);
    date   = validateDate(actualPayDate);
  } catch (e) {
    console.error('[income.service] markReceived validation error:', e.message);
    return { data: null, error: e };
  }

  const { data, error } = await supabase
    .from('income_sources')
    .update({
      received:        true,
      received_amount: amount,
      actual_pay_date: date,
    })
    .eq('id', sourceId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) console.error('[income.service] markReceived error:', error.message);
  return { data, error };
};

/**
 * Mark an income source as pending — undo a received marking.
 *
 * @param {string} sourceId
 */
export const markPending = async (sourceId) => {
  const { data, error } = await supabase
    .from('income_sources')
    .update({
      received:        false,
      received_amount: 0,
      actual_pay_date: null,
    })
    .eq('id', sourceId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) console.error('[income.service] markPending error:', error.message);
  return { data, error };
};

/**
 * Update expected amount for an income source.
 *
 * @param {string} sourceId
 * @param {number} newAmount
 */
export const updateExpectedAmount = async (sourceId, newAmount, extras = {}) => {
  let amount;
  try {
    amount = validateAmount(newAmount);
  } catch (e) {
    console.error('[income.service] updateExpectedAmount validation error:', e.message);
    return { data: null, error: e };
  }

  const update = { expected_amount: amount };
  if (extras.pay_day_type !== undefined) {
    const VALID = ['fixed_date', 'last_working_day', 'flexible'];
    update.pay_day_type = VALID.includes(extras.pay_day_type) ? extras.pay_day_type : 'flexible';
  }
  if (extras.pay_day !== undefined) {
    update.pay_day = extras.pay_day ? Math.min(31, Math.max(1, parseInt(extras.pay_day))) : null;
  }

  const { data, error } = await supabase
    .from('income_sources')
    .update(update)
    .eq('id', sourceId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) console.error('[income.service] updateExpectedAmount error:', error.message);
  return { data, error };
};

/**
 * Soft delete an income source.
 */
export const deleteIncomeSource = async (sourceId) => {
  const { error } = await supabase
    .from('income_sources')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', sourceId);

  if (error) console.error('[income.service] deleteIncomeSource error:', error.message);
  return { error };
};
