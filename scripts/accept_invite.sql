-- accept_invite.sql
--
-- Paste this entire file into the Supabase SQL Editor and click Run.
--
-- What this function does:
--   1. Reads auth.uid() — the invitee must be signed in before calling
--   2. Validates the invite: token must match a pending, non-expired row
--   3. Guards against duplicate membership
--   4. Inserts the member row into budget_centre_members
--   5. Marks the invite as accepted
--   6. Returns { centreId, memberId } as JSON
--
-- Why SECURITY DEFINER:
--   The invitee is not yet a member of the hub, so direct RLS policies on
--   budget_centre_members and centre_invites would block the write. Running
--   as the DB owner bypasses RLS for the writes while still validating the
--   caller via auth.uid().
--
-- JavaScript call:
--   supabase.rpc('accept_invite', { p_token: token })
--   where token is the UUID string from the invite URL query parameter.

CREATE OR REPLACE FUNCTION accept_invite(p_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite    centre_invites%ROWTYPE;
  v_user_id   uuid;
  v_member_id uuid;
BEGIN

  -- 1. Require an authenticated session
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated: must be signed in to accept an invite';
  END IF;

  -- 2. Validate invite: pending and not expired
  SELECT *
  INTO   v_invite
  FROM   centre_invites
  WHERE  centre_invites.token      = p_token
    AND  centre_invites.status     = 'pending'
    AND  centre_invites.expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found: invite not found, already used, or expired';
  END IF;

  -- 3. Guard against duplicate membership
  IF EXISTS (
    SELECT 1 FROM budget_centre_members
    WHERE  budget_centre_id = v_invite.budget_centre_id
      AND  user_id          = v_user_id
      AND  deleted_at       IS NULL
  ) THEN
    RAISE EXCEPTION 'already_member: user is already a member of this hub';
  END IF;

  -- 4. Insert the member row
  INSERT INTO budget_centre_members (budget_centre_id, user_id, role)
  VALUES (v_invite.budget_centre_id, v_user_id, v_invite.role)
  RETURNING id INTO v_member_id;

  -- 5. Mark invite accepted
  UPDATE centre_invites
  SET    status = 'accepted'
  WHERE  id = v_invite.id;

  -- 6. Return context the client needs to set the active centre
  RETURN json_build_object(
    'centreId', v_invite.budget_centre_id,
    'memberId', v_member_id
  );

END;
$$;

-- Only authenticated users may accept invites — the invitee must be signed in.
GRANT EXECUTE ON FUNCTION accept_invite(uuid) TO authenticated;
