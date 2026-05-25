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

  const { data: invite, error } = await supabase
    .from('centre_invites')
    .insert({
      budget_centre_id: centreId,
      invited_email:    normalised,
      role,
      invited_by:       invitedBy,
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
 * Accept an invite — inserts a member row and marks invite as accepted.
 * Both writes must succeed; if the member insert fails the invite stays pending.
 *
 * @param {{ token, userId }} opts
 * @returns {{ data, error }}
 */
export const acceptInvite = async ({ token, userId }) => {
  // Re-fetch invite to get centreId + role (validates it's still pending)
  const { data: invite, error: fetchErr } = await getInviteByToken(token);
  if (fetchErr) return { data: null, error: fetchErr };
  if (!invite)  return { data: null, error: new Error('Invite not found or already used.') };

  // Check invite hasn't expired (belt-and-suspenders — RLS also checks)
  if (new Date(invite.expires_at) < new Date()) {
    return { data: null, error: new Error('This invite has expired.') };
  }

  // Insert member row
  const { data: member, error: memberErr } = await supabase
    .from('budget_centre_members')
    .insert({
      budget_centre_id: invite.budget_centre_id,
      user_id:          userId,
      role:             invite.role,
    })
    .select()
    .single();

  if (memberErr) {
    console.error('[invites.service] acceptInvite member insert error:', memberErr.message);
    return { data: null, error: memberErr };
  }

  // Mark invite accepted
  const { error: acceptErr } = await supabase
    .from('centre_invites')
    .update({ status: 'accepted' })
    .eq('id', invite.id);

  if (acceptErr) {
    console.error('[invites.service] acceptInvite status update error:', acceptErr.message);
    // Member row was inserted — non-fatal, log and continue
  }

  return { data: { member, centreId: invite.budget_centre_id }, error: null };
};
