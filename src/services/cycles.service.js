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

// NOTE: createCycleByAnchor (the anchor-types cycle-creation RPC wrapper) was
// removed in Phase A of the anchor pivot. Its user-driven replacement
// (create_budget_period) lands in Phase B. See engineering-decisions.md.
