/**
 * services/invites.service.js
 *
 * All Supabase read/write for centre_invites.
 * Never throws — always returns { data, error }.
 */

import { supabase } from '../lib/supabase';

/** Friendly, user-facing copy for a plan member-cap rejection (MEM01). */
const MEMBER_CAP_MESSAGE =
  "You've reached your hub's member limit. Free hubs can have 2 members (you + 1 invited). Upgrade to Pro for up to 15 members per hub.";

/** Friendly copy for a server-side invite identity-binding rejection (INV01). */
const INVITE_EMAIL_MISMATCH_MESSAGE =
  'This invite was sent to a different email address. Sign in with the invited account to accept it.';

/**
 * Create a new pending invite for a hub.
 *
 * Delegates to the create_invite SECURITY DEFINER RPC (scripts/create_invite.sql),
 * which (a) re-implements the hub-manager authorization RLS used to enforce, (b)
 * enforces the per-tier member cap server-side using the OWNER's tier — rejecting
 * with SQLSTATE 'MEM01' if active members + non-expired pending invites are at the
 * limit — and (c) guards duplicate pending invites and existing members atomically.
 * The client-side gate (MembersSection) is UX only; this RPC is the real enforcement.
 *
 * On a cap rejection the returned Error carries `error.code === 'MEM01'` so callers
 * can open the upgrade modal and/or show MEMBER_CAP_MESSAGE. (Mirrors HUB01.)
 *
 * @param {{ centreId, email, role }} opts — invitedBy is auth.uid() server-side
 * @returns {{ data, error }}
 */
export const createInvite = async ({ centreId, email, role }) => {
  const { data, error } = await supabase.rpc('create_invite', {
    p_centre_id:     centreId,
    p_invited_email: email,
    p_role:          role,
  });

  if (error) {
    if (error.code === 'MEM01') {
      // Plan cap hit — map to friendly copy + keep the code so callers can react.
      const capErr = new Error(MEMBER_CAP_MESSAGE);
      capErr.code = 'MEM01';
      console.error('[invites.service] createInvite cap reached (MEM01)');
      return { data: null, error: capErr };
    }
    console.error('[invites.service] createInvite RPC error:', error.message);
    return { data: null, error };
  }

  return { data, error: null };
};

/**
 * Fetch a pending, non-expired invite by its token — for JoinView.
 *
 * Delegates to the get_invite_by_token SECURITY DEFINER RPC
 * (scripts/migrate_26_invite_token_scope.sql) instead of selecting the table.
 * This is a SECURITY boundary, not a refactor: the old table read relied on a
 * policy that granted every pending invite to PUBLIC (anon included) and left the
 * token-scoping to this client filter. RLS cannot see a WHERE clause, so the token
 * must arrive as an RPC ARGUMENT to be a real constraint. The RPC also projects
 * only what JoinView renders and never returns the token itself.
 *
 * Callable without a session (anon holds EXECUTE) — /join is pre-auth by design.
 *
 * Returns the same shape the previous select produced —
 * { role, invited_email, expires_at, budget_centres: { id, name, icon, currency } }
 * — so JoinView needs no change. `data` is null for an unknown, malformed,
 * non-pending or expired token; those cases are indistinguishable by design.
 *
 * @param {string} token
 * @returns {{ data, error }}
 */
export const getInviteByToken = async (token) => {
  const { data, error } = await supabase.rpc('get_invite_by_token', { p_token: token });

  if (error) {
    console.error('[invites.service] getInviteByToken error:', error.message);
    return { data: null, error };
  }

  return { data: data ?? null, error: null };
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
 * The RPC binds acceptance to the invitee's identity: it compares the caller's
 * auth email against the invite's invited_email and rejects a mismatch with
 * SQLSTATE 'INV01' (scripts/accept_invite.sql). JoinView already blocks that case
 * client-side via its wrongEmail phase, so INV01 only surfaces when the UI is
 * bypassed — we map it to friendly copy anyway rather than leaking a raw DB message.
 *
 * @param {{ token }} opts
 * @returns {{ data: { centreId }, error }}
 */
export const acceptInvite = async ({ token, name = '' }) => {
  const { data, error } = await supabase.rpc('accept_invite', { p_token: token, p_name: name });
  if (error) {
    if (error.code === 'INV01') {
      const mismatchErr = new Error(INVITE_EMAIL_MISMATCH_MESSAGE);
      mismatchErr.code = 'INV01';
      console.error('[invites.service] acceptInvite email mismatch (INV01)');
      return { data: null, error: mismatchErr };
    }
    console.error('[invites.service] acceptInvite error:', error.message);
    return { data: null, error };
  }
  return { data: { centreId: data?.centreId }, error: null };
};
