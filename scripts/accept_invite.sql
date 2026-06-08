-- accept_invite.sql
--
-- Paste this entire file into the Supabase SQL Editor and click Run.
--
-- Changes from previous version (2026-05-26):
--   - Adds p_name TEXT DEFAULT '' parameter.
--   - Name resolution priority: p_name → auth metadata full_name → email prefix.
--   - Upserts public.users with the resolved name in the same transaction.
--   - Old accept_invite(uuid) overload is dropped first — different Postgres signature,
--     CREATE OR REPLACE alone would not replace it, leaving an ambiguous overload.
--
-- Why SECURITY DEFINER:
--   The invitee is not yet a member of the hub, so direct RLS policies on
--   budget_centre_members and centre_invites would block the write. Running
--   as the DB owner bypasses RLS for the writes while still validating the
--   caller via auth.uid(). The auth.users read is only available with elevated privileges.
--
-- JavaScript call:
--   supabase.rpc('accept_invite', { p_token: token, p_name: name })
--   p_name defaults to '' — safe to omit for sign-in users (RPC falls back to metadata).
--
-- MODIFICATION (2026-06-07) — member-cap backstop (ships with the member-cap gate):
--   Adds a server-side MEM01 count guard between the already-member check and the
--   member INSERT. This is the RACE-PROOF BACKSTOP, not the primary gate — the
--   primary issuance gate is create_invite (which counts active + pending_non_expired
--   and blocks the link from ever being generated past the cap).
--   • ASYMMETRIC COUNT (by design): this RPC counts ACTIVE MEMBERS ONLY — not
--     pending invites. The pending→active conversion of the invite being accepted is
--     net-zero, and expired invites are already rejected at the validation step
--     below, so counting actual members is the true ceiling. (Decision D8.)
--   • OWNER-TIER, NOT INVITEE-TIER: here auth.uid() is the INVITEE. The cap belongs
--     to the hub OWNER (the payer). Resolve the tier from the invite's hub →
--     budget_centres.owner_id → subscriptions, NEVER from auth.uid(). (Phase 1 §D trap.)
--   All pre-existing logic (auth, invite validation, already_member, status update,
--   users upsert, return shape) is preserved.

DROP FUNCTION IF EXISTS accept_invite(uuid);

CREATE OR REPLACE FUNCTION accept_invite(p_token uuid, p_name text DEFAULT '')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite    centre_invites%ROWTYPE;
  v_user_id   uuid;
  v_member_id uuid;
  v_name      text;
  v_owner     uuid;
  v_tier      text;
  v_limit     int;
  v_active    int;
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

  -- 3b. Member-cap backstop (MEM01). Race-proof ceiling — counts ACTIVE MEMBERS
  --     ONLY (the invite being accepted converts pending→active, net-zero; expired
  --     invites were already rejected at step 2). Tier is the OWNER's, not the
  --     invitee's (auth.uid() here is the invitee). HARDCODED from src/lib/plans.js
  --     (Free maxMembersPerHub = 2, Pro = 15). Keep in sync with create_invite.sql.
  SELECT bc.owner_id INTO v_owner
  FROM   budget_centres bc
  WHERE  bc.id = v_invite.budget_centre_id;

  SELECT s.tier INTO v_tier
  FROM   subscriptions s
  WHERE  s.user_id = v_owner
    AND  s.deleted_at IS NULL
    AND  s.status = 'active'
    AND  (s.current_period_end IS NULL OR s.current_period_end > now())
  ORDER BY s.created_at DESC
  LIMIT 1;
  v_tier  := COALESCE(v_tier, 'free');
  v_limit := CASE WHEN v_tier = 'pro' THEN 15 ELSE 2 END;

  SELECT count(*) INTO v_active
  FROM   budget_centre_members m
  WHERE  m.budget_centre_id = v_invite.budget_centre_id
    AND  m.deleted_at IS NULL;

  IF v_active >= v_limit THEN
    RAISE EXCEPTION 'member limit reached: % of % for tier %', v_active, v_limit, v_tier
      USING ERRCODE = 'MEM01';
  END IF;

  -- 4. Insert the member row
  INSERT INTO budget_centre_members (budget_centre_id, user_id, role)
  VALUES (v_invite.budget_centre_id, v_user_id, v_invite.role)
  RETURNING id INTO v_member_id;

  -- 5. Mark invite accepted
  UPDATE centre_invites
  SET    status = 'accepted'
  WHERE  id = v_invite.id;

  -- 6. Resolve display name: caller-supplied → auth metadata → email prefix.
  --    Priority: explicit name from client (sign-up path) beats auth metadata
  --    which beats the email prefix fallback.
  SELECT COALESCE(
    NULLIF(TRIM(p_name), ''),
    NULLIF(TRIM(au.raw_user_meta_data->>'full_name'), ''),
    split_part(au.email, '@', 1)
  )
  INTO v_name
  FROM auth.users au
  WHERE au.id = v_user_id;

  -- 7. Upsert public.users with the resolved name.
  --    ON CONFLICT: only overwrite if the existing name is NULL or blank.
  --    A real existing name (profile previously set by the user) is preserved.
  INSERT INTO public.users (id, name, email)
  SELECT v_user_id, v_name, au.email
  FROM   auth.users au
  WHERE  au.id = v_user_id
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name
    WHERE public.users.name IS NULL OR TRIM(public.users.name) = '';

  -- 8. Return context the client needs to set the active centre
  RETURN json_build_object(
    'centreId', v_invite.budget_centre_id,
    'memberId', v_member_id
  );

END;
$$;

-- Only authenticated users may accept invites.
GRANT EXECUTE ON FUNCTION accept_invite(uuid, text) TO authenticated;
