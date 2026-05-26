/**
 * services/invites.service.js
 *
 * All Supabase read/write for centre_invites.
 * Never throws — always returns { data, error }.
 */

import { supabase } from '../lib/supabase';

/**
 * Create a new pending invite for a hub.
 * Guards against duplicate pending invites and existing members.
 *
 * @param {{ centreId, email, role, invitedBy }} opts
 * @returns {{ data, error }}
 */
export const createInvite = async ({ centreId, email, role, invitedBy }) => {
  const normalised = email.trim().toLowerCase();

  // Duplicate pending invite check
  const { data: existing, error: dupErr } = await supabase
    .from('centre_invites')
    .select('id')
    .eq('budget_centre_id', centreId)
    .eq('invited_email', normalised)
    .eq('status', 'pending')
    .maybeSingle();

  if (dupErr) {
    console.error('[invites.service] createInvite dup check error:', dupErr.message);
    return { data: null, error: dupErr };
  }
  if (existing) {
    return { data: null, error: new Error('A pending invite already exists for this email.') };
  }

  // Existing active member check — filter by email via inner join
  const { data: existingMember, error: memErr } = await supabase
    .from('budget_centre_members')
    .select('id, users!inner(email)')
    .eq('budget_centre_id', centreId)
    .eq('users.email', normalised)
    .is('deleted_at', null)
    .maybeSingle();

  if (memErr) {
    console.error('[invites.service] createInvite member check error:', memErr.message);
    return { data: null, error: memErr };
  }
  if (existingMember) {
    return { data: null, error: new Error('This person is already a member of this hub.') };
  }

  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  const { data: invite, error } = await supabase
    .from('centre_invites')
    .insert({
      budget_centre_id: centreId,
      invited_email:    normalised,
      role,
      invited_by:       invitedBy,
      expires_at:       new Date(Date.now() + sevenDaysMs).toISOString(),
    })
    .select()
    .single();

  if (error) console.error('[invites.service] createInvite insert error:', error.message);
  return { data: invite, error };
};

/**
 * Fetch a pending, non-expired invite by its token.
 * Joins the hub name for display in JoinView.
 *
 * @param {string} token
 * @returns {{ data, error }}
 */
export const getInviteByToken = async (token) => {
  const { data, error } = await supabase
    .from('centre_invites')
    .select('*, budget_centres(id, name, icon, currency)')
    .eq('token', token)
    .eq('status', 'pending')
    .maybeSingle();

  if (error) console.error('[invites.service] getInviteByToken error:', error.message);
  return { data, error };
};

/**
 * Fetch all invites for a hub (any status) — for the MembersSection list.
 *
 * @param {string} centreId
 * @returns {{ data, error }}
 */
export const getHubInvites = async (centreId) => {
  const { data, error } = await supabase
    .from('centre_invites')
    .select('*')
    .eq('budget_centre_id', centreId)
    .order('created_at', { ascending: false });

  if (error) console.error('[invites.service] getHubInvites error:', error.message);
  return { data: data || [], error };
};

/**
 * Cancel a pending invite by ID.
 *
 * @param {string} inviteId
 * @returns {{ error }}
 */
export const cancelInvite = async (inviteId) => {
  const { error } = await supabase
    .from('centre_invites')
    .update({ status: 'cancelled' })
    .eq('id', inviteId)
    .eq('status', 'pending');

  if (error) console.error('[invites.service] cancelInvite error:', error.message);
  return { error };
};

/**
 * Accept an invite via SECURITY DEFINER RPC.
 * All validation and writes happen server-side in a single transaction.
 * The caller must be signed in — auth.uid() is used server-side for the user ID.
 *
 * @param {{ token }} opts
 * @returns {{ data: { centreId }, error }}
 */
export const acceptInvite = async ({ token, name = '' }) => {
  const { data, error } = await supabase.rpc('accept_invite', { p_token: token, p_name: name });
  if (error) {
    console.error('[invites.service] acceptInvite error:', error.message);
    return { data: null, error };
  }
  return { data: { centreId: data?.centreId }, error: null };
};
