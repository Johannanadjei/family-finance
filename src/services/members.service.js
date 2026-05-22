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
  return { data: data || [], error };
};

/**
 * Add a member to a budget centre by user ID.
 */
export const addMember = async (centreId, userId) => {
  const { data, error } = await supabase
    .from('budget_centre_members')
    .insert({ budget_centre_id: centreId, user_id: userId, role: 'member' })
    .select()
    .single();

  if (error) console.error('[members.service] addMember error:', error.message);
  return { data, error };
};

/**
 * Soft-delete a member from a budget centre.
 */
export const removeMember = async (memberId) => {
  const { error } = await supabase
    .from('budget_centre_members')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', memberId);

  if (error) console.error('[members.service] removeMember error:', error.message);
  return { error };
};
