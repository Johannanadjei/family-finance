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

// 'YYYY-MM-DD' guard for createCycleByAnchor's reference date. Mirrors the RPC's
// DATE type. Inlined here — extract to lib/validation only when a second caller needs it.
const DATE_REGEX   = /^\d{4}-\d{2}-\d{2}$/;
const ANCHOR_TYPES = ['calendar', 'fixed_day', 'last_working_day', 'last_day_of_month'];

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
 * Create the next cycle for a hub via the SECURITY DEFINER RPC. The RPC authorizes
 * the caller, computes the cycle range CONTAINING the reference date from the hub
 * anchor, forward-only clamps to the latest existing cycle, maps the anchor
 * vocabulary, and returns the full cycle row (see scripts/migrate_14b_anchor.sql).
 *
 * `params` is the shape returned by lib/cycles.computeNextCycleParams — the extra
 * computed fields (start_date/end_date) are ignored here; the RPC re-derives them.
 *
 * Overlap with an existing cycle surfaces as error.code === 'CYC01'.
 *
 * @param {string} centreId
 * @param {{ anchor_type: string, anchor_day: number|null, reference_date: string, name?: string }} params
 * @returns {Promise<{ data: object|null, error: any }>}
 */
export const createCycleByAnchor = async (centreId, { anchor_type, anchor_day, reference_date, name } = {}) => {
  if (!ANCHOR_TYPES.includes(anchor_type)) {
    const error = new Error(`Invalid anchor type: ${anchor_type}`);
    console.error('[cycles.service] createCycleByAnchor validation error:', error.message);
    return { data: null, error };
  }
  if (!DATE_REGEX.test(reference_date)) {
    const error = new Error(`Invalid reference date: ${reference_date}, expected YYYY-MM-DD`);
    console.error('[cycles.service] createCycleByAnchor validation error:', error.message);
    return { data: null, error };
  }

  const { data, error } = await supabase.rpc('create_cycle_by_anchor', {
    p_centre_id:      centreId,
    p_anchor_type:    anchor_type,
    p_anchor_day:     anchor_type === 'fixed_day' ? (anchor_day ?? null) : null,
    p_reference_date: reference_date,
    p_name:           name ?? null,
  });

  if (error) console.error('[cycles.service] createCycleByAnchor error:', error.message);
  return { data, error };
};
