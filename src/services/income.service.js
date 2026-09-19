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

/** Fetch ALL active income sources for a centre. Deliberately unscoped: callers slice
 * by cycle_id client-side (sliceByCycle), income's only period key. The old 'YYYY-MM'
 * month filter (Phase 2A) is gone — a month cannot name a period. */
export const getIncomeSources = async (centreId) => {
  const { data, error } = await supabase
    .from('income_sources')
    .select('*')
    .eq('budget_centre_id', centreId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) console.error('[income.service] getIncomeSources error:', error.message);
  // Never mask a failure as []: error → data null; success → always an array. See CLAUDE.md §12.
  return { data: error ? null : (data || []), error };
};

// ── Mutations ─────────────────────────────────────────────────────────────────

// Every income write is period-keyed. Refuse a missing cycleId without touching the
// database, mirroring the transactions.service CYC02 guard.
const cycleIdRequired = (fn) => {
  const error = new Error(`${fn} requires a cycleId (CYC02)`);
  console.error(`[income.service] ${fn} error:`, error.message);
  return { data: null, error };
};

/** Add a new income source. `source` is validated (month required) before insert.
 * `cycleId` is REQUIRED — income's only period key; the caller derives `source.month`
 * from that same cycle. */
export const addIncomeSource = async (centreId, source, cycleId) => {
  if (!cycleId) return cycleIdRequired('addIncomeSource');
  let validated;
  try {
    validated = validateIncomeSource(source);
  } catch (e) {
    console.error('[income.service] addIncomeSource validation error:', e.message);
    return { data: null, error: e };
  }

  const { data, error } = await supabase
    .from('income_sources')
    .insert({ budget_centre_id: centreId, ...validated, cycle_id: cycleId })
    .select()
    .single();

  if (error) console.error('[income.service] addIncomeSource error:', error.message);
  return { data, error };
};

/** Bulk insert income sources — onboarding / hub creation. `cycleId` is REQUIRED: both
 * callers create the hub's first period BEFORE this call and bail out if that fails. */
export const bulkAddIncomeSources = async (centreId, sources, cycleId) => {
  if (!cycleId) return cycleIdRequired('bulkAddIncomeSources');
  const rows = [];
  for (const source of sources) {
    try {
      const validated = validateIncomeSource(source);
      rows.push({ budget_centre_id: centreId, ...validated, cycle_id: cycleId });
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
 * Mark an income source received — IDEMPOTENT, server-side (#4b).
 *
 * Wraps the mark_income_received SECURITY DEFINER RPC (scripts/migrate_31…sql),
 * replacing a client-side two-phase write whose insert was unconditional: a second
 * call — two taps, a retry, a second device — created a SECOND income transaction,
 * which is how one hub's income read double in production. The server now UPDATEs
 * the live income transaction for this source+cycle if one exists and INSERTs only
 * if not, both tables in one transaction.
 *
 * @param {string} actualPayDate — 'YYYY-MM-DD'; clamped into the period server-side
 * @returns {Promise<{ data: object|null, error: any }>} data.created=false when idempotent.
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

  const { data, error } = await supabase.rpc('mark_income_received', {
    p_source_id: sourceId,
    p_amount:    amount,
    p_date:      date,
  });

  if (error) { console.error('[income.service] markReceived error:', error.message); return { data: null, error }; }
  return { data, error: null };
};

/** Mark an income source as pending — undo a received marking. */
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

/** Update the expected amount, plus optional pay_day_type / pay_day, for a source. */
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

/** Move an income source to another budget period. cycle_id AND month go in ONE
 * statement: the trigger is scoped to UPDATE OF month, so a cycle_id-only update
 * would never fire it (leaving month stale); both together fire it and reach the
 * Commit-12 trust branch, which honours the explicit cycle_id instead of re-resolving
 * from the new month. NOT an RPC (CLAUDE.md §9.6) — budget_centre_id is unchanged, so
 * income_sources_update gates both images with can_view_income() on the same hub.
 * Twin of transactions.moveTransactionToCycle. */
export const moveIncomeSourceToCycle = async (sourceId, cycleId, month) => {
  if (!cycleId || !month) {
    const error = new Error('moveIncomeSourceToCycle requires a target cycleId and month (CYC02)');
    console.error('[income.service] moveIncomeSourceToCycle validation error:', error.message);
    return { data: null, error };
  }

  const { data, error } = await supabase
    .from('income_sources')
    .update({ cycle_id: cycleId, month })
    .eq('id', sourceId)
    .is('deleted_at', null)
    .select()
    .maybeSingle();

  if (error) console.error('[income.service] moveIncomeSourceToCycle error:', error.message);
  return { data, error };
};

/** Soft delete an income source. */
export const deleteIncomeSource = async (sourceId) => {
  const { error } = await supabase
    .from('income_sources')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', sourceId);

  if (error) console.error('[income.service] deleteIncomeSource error:', error.message);
  return { error };
};
