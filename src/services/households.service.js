/**
 * households.service.js
 *
 * All Supabase read/write operations for households and household members.
 * Pure async functions — no React, no state, no side effects.
 *
 * ARCHITECTURE NOTE:
 * These functions are the only place in the app that talks to Supabase
 * for household data. Components and hooks call these functions only.
 *
 * SUPABASE SYNC POINT: All functions here replace localStorage reads/writes
 * for household and member data.
 */

import { supabase } from '../lib/supabase';

// ── Households ────────────────────────────────────────────────────────────────

/**
 * Fetch the household the current user belongs to.
 * Returns the first household found (users belong to one household in MVP).
 * @returns {{ data: object|null, error: object|null }}
 */
export const getHousehold = async () => {
  const { data, error } = await supabase
    .from('households')
    .select(`
      *,
      household_members (
        id,
        user_id,
        role,
        joined_at
      )
    `)
    .is('deleted_at', null)
    .limit(1)
    .single();

  return { data: data || null, error };
};

/**
 * Create a new household and add the current user as owner.
 * Called during onboarding.
 * @param {{ name: string, currency: string, monthly_income: number, surplus_target: number, adults_count: number, children_count: number }} opts
 * @returns {{ data: object|null, error: object|null }}
 */
export const createHousehold = async (opts) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: new Error('Not authenticated') };

  const { data: household, error: householdError } = await supabase
    .from('households')
    .insert({
      name:           opts.name,
      currency:       opts.currency || 'GHS',
      monthly_income: opts.monthly_income || 0,
      surplus_target: opts.surplus_target || 0,
      adults_count:   opts.adults_count   || 1,
      children_count: opts.children_count || 0,
      owner_id:       user.id,
      plan:           'free',
    })
    .select()
    .single();

  if (householdError) return { data: null, error: householdError };

  // Add the creator as owner member
  const { error: memberError } = await supabase
    .from('household_members')
    .insert({
      household_id: household.id,
      user_id:      user.id,
      role:         'owner',
    });

  if (memberError) return { data: null, error: memberError };

  return { data: household, error: null };
};

/**
 * Update household settings.
 * @param {string} householdId
 * @param {Partial<{ name: string, currency: string, monthly_income: number, surplus_target: number, adults_count: number, children_count: number }>} updates
 * @returns {{ data: object|null, error: object|null }}
 */
export const updateHousehold = async (householdId, updates) => {
  const { data, error } = await supabase
    .from('households')
    .update(updates)
    .eq('id', householdId)
    .is('deleted_at', null)
    .select()
    .single();

  return { data: data || null, error };
};

/**
 * Soft delete a household (sets deleted_at).
 * Only callable by the owner — enforced by RLS.
 * @param {string} householdId
 * @returns {{ error: object|null }}
 */
export const deleteHousehold = async (householdId) => {
  const { error } = await supabase
    .from('households')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', householdId);

  return { error };
};

// ── Household Members ─────────────────────────────────────────────────────────

/**
 * Fetch all active members of a household.
 * @param {string} householdId
 * @returns {{ data: object[]|null, error: object|null }}
 */
export const getHouseholdMembers = async (householdId) => {
  const { data, error } = await supabase
    .from('household_members')
    .select('*')
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .order('joined_at', { ascending: true });

  return { data: data || null, error };
};

/**
 * Add a member to a household.
 * @param {string} householdId
 * @param {string} userId
 * @param {'owner'|'admin'|'member'|'readonly'} role
 * @returns {{ data: object|null, error: object|null }}
 */
export const addHouseholdMember = async (householdId, userId, role = 'member') => {
  const { data, error } = await supabase
    .from('household_members')
    .insert({ household_id: householdId, user_id: userId, role })
    .select()
    .single();

  return { data: data || null, error };
};

/**
 * Remove a member from a household (soft delete).
 * @param {string} memberId
 * @returns {{ error: object|null }}
 */
export const removeHouseholdMember = async (memberId) => {
  const { error } = await supabase
    .from('household_members')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', memberId);

  return { error };
};
