/**
 * services/members.service.js
 *
 * Supabase read/write for budget_centre_members.
 * Extracted from centres.service.js to keep files focused.
 */

import { supabase } from '../lib/supabase';

/**
 * Fetch all active members of a budget centre (includes user profile).
 */
export const getMembers = async (centreId) => {
  const { data, error } = await supabase
    .from('budget_centre_members')
    .select('*, users(id, name, email, avatar_url)')
    .eq('budget_centre_id', centreId)
    .is('deleted_at', null);

  if (error) console.error('[members.service] getMembers error:', error.message);
  // Never mask a failure as []: error → data null; success → always an array. See CLAUDE.md §12.
  return { data: error ? null : (data || []), error };
};

/**
 * Add a member to a budget centre by user ID.
 *
 * @param {string} centreId
 * @param {string} userId
 * @param {string} role — 'full_access' | 'standard' (never 'owner' via this path)
 */
export const addMember = async (centreId, userId, role = 'full_access') => {
  const { data, error } = await supabase
    .from('budget_centre_members')
    .insert({ budget_centre_id: centreId, user_id: userId, role })
    .select()
    .single();

  if (error) console.error('[members.service] addMember error:', error.message);
  return { data, error };
};

/**
 * Update a member's role.
 *
 * @param {string} memberId — budget_centre_members.id
 * @param {string} role — 'full_access' | 'standard'
 */
export const updateMemberRole = async (memberId, role) => {
  const { data, error } = await supabase
    .from('budget_centre_members')
    .update({ role })
    .eq('id', memberId)
    .select()
    .single();

  if (error) console.error('[members.service] updateMemberRole error:', error.message);
  return { data, error };
};

/**
 * Soft-delete a member from a budget centre.
 * Guards against removing the owner — that operation is never allowed.
 *
 * @param {string} memberId — budget_centre_members.id
 * @param {string} memberRole — current role of the member being removed
 */
export const removeMember = async (memberId, memberRole) => {
  if (memberRole === 'owner') {
    return { error: new Error('The hub owner cannot be removed. Delete or transfer the hub instead.') };
  }

  const { error } = await supabase
    .from('budget_centre_members')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', memberId);

  if (error) console.error('[members.service] removeMember error:', error.message);
  return { error };
};
