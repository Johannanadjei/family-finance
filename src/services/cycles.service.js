/**
 * services/cycles.service.js
 *
 * All Supabase read/write operations for budget_cycles (Budget Cycles, Commit 3).
 *
 * RULES:
 * - Every select filters deleted_at is null
 * - Every select filters budget_centre_id (except getCycleById, which is keyed by id)
 * - Never throws — always returns { data, error }
 * - Reads that return a list never mask a failure as [] (CLAUDE.md §12)
 * - Cross-user/privileged write (create) goes through a SECURITY DEFINER RPC (§9.6),
 *   never a direct client insert — see scripts/migrate_14b_anchor.sql.
 */

import { supabase } from '../lib/supabase';

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Fetch all active cycles for a centre, newest first.
 *
 * @param {string} centreId
 * @returns {Promise<{ data: object[]|null, error: any }>}
 */
export const getCyclesForCentre = async (centreId) => {
  const { data, error } = await supabase
    .from('budget_cycles')
    .select('*')
    .eq('budget_centre_id', centreId)
    .is('deleted_at', null)
    .order('start_date', { ascending: false });

  if (error) console.error('[cycles.service] getCyclesForCentre error:', error.message);
  // Never mask a failure as []: error → data null; success → always an array. See CLAUDE.md §12.
  return { data: error ? null : (data || []), error };
};

/**
 * Fetch the cycle containing a given date, or null if none covers it.
 * `date` is a 'YYYY-MM-DD' string (DATE type, no timezone — per v1.2 A3).
 *
 * @param {string} centreId
 * @param {string} date — 'YYYY-MM-DD'
 * @returns {Promise<{ data: object|null, error: any }>}
 */
export const getCycleForDate = async (centreId, date) => {
  const { data, error } = await supabase
    .from('budget_cycles')
    .select('*')
    .eq('budget_centre_id', centreId)
    .lte('start_date', date)
    .gte('end_date', date)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) console.error('[cycles.service] getCycleForDate error:', error.message);
  return { data, error };
};

/**
 * Fetch a single cycle by id (null if not found or soft-deleted).
 *
 * @param {string} cycleId
 * @returns {Promise<{ data: object|null, error: any }>}
 */
export const getCycleById = async (cycleId) => {
  const { data, error } = await supabase
    .from('budget_cycles')
    .select('*')
    .eq('id', cycleId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) console.error('[cycles.service] getCycleById error:', error.message);
  return { data, error };
};

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Create a user-driven budget period (Phase B replacement for createCycleByAnchor).
 * Wraps the create_budget_period SECURITY DEFINER RPC (scripts/migrate_16…sql):
 * the server gates on owner/full_access role, validates the range, falls back to
 * cycle_majority_name when name is blank, and traps overlap as the CYC01 SQLSTATE.
 *
 * @param {string} centreId
 * @param {{ name?: string|null, startDate: string, endDate: string }} period
 *        startDate / endDate are 'YYYY-MM-DD' strings (DATE type).
 * @returns {Promise<{ data: object|null, error: any }>} the created cycle row, or error.
 */
export const createBudgetPeriod = async (centreId, { name = null, startDate, endDate }) => {
  const { data, error } = await supabase.rpc('create_budget_period', {
    p_centre_id:  centreId,
    p_name:       name,
    p_start_date: startDate,
    p_end_date:   endDate,
  });

  if (error) { console.error('[cycles.service] createBudgetPeriod error:', error.message); return { data: null, error }; }
  return { data, error: null };
};
