-- =============================================================================
-- create_invite.sql
--
-- NEW WORK — TO BE RUN ONCE in the Supabase SQL Editor (not yet applied to prod).
-- Like create_hub.sql, this is a brand-new RPC that ships WITH its feature commit
-- (the member-cap gate). Run it before that commit reaches main. Idempotent
-- (CREATE OR REPLACE + re-issued GRANT), transactional.
--
-- WHAT THIS ADDS
--   create_invite(p_centre_id, p_invited_email, p_role)
--     RETURNS centre_invites
--     • SECURITY DEFINER — runs as owner; auth.uid() is still the calling user.
--     • RE-IMPLEMENTS the "Hub managers can manage invites" authorization that RLS
--       used to enforce on the old direct INSERT. SECURITY DEFINER bypasses RLS, so
--       the function MUST check the caller is an active owner/full_access member of
--       the hub itself — otherwise any authenticated user could invite to any hub.
--     • Server-side PLAN CAP gate (the issuance gate — primary path): counts
--       active members + NON-EXPIRED pending invites and rejects with SQLSTATE
--       'MEM01' if one more invite would exceed the tier limit (Free = 2, Pro = 15).
--     • OWNER-TIER, NOT INVITER-TIER: the cap belongs to whoever PAYS — the hub
--       owner. A full_access member (who can invite but does not own the hub) must
--       not have their own tier consulted. Resolve the tier from
--       budget_centres.owner_id → subscriptions. (Phase 1 §D trap.)
--     • EXPIRED INVITES DO NOT HOLD A SLOT: pending-invite count and the duplicate
--       check both filter expires_at > now(). An expired-but-unswept invite frees
--       its slot; it can never be accepted (accept_invite rejects expired), so this
--       is race-safe.
--     • Preserves the two pre-existing guards the service used to do client-side,
--       now atomic & race-proof inside the txn: duplicate pending invite, and
--       "already a member".
--     • Tier resolution mirrors services/subscriptions.service.resolveSubscription
--       and create_hub.sql: an active, non-expired subscriptions row → that row's
--       tier; otherwise free.
--
--   JavaScript call (services/invites.service.js):
--     supabase.rpc('create_invite', { p_centre_id, p_invited_email, p_role })
--
-- Why SECURITY DEFINER (CLAUDE.md §9.6): the cap must be enforced server-side (the
-- client gate is only UX), the count + insert must be atomic to be race-proof, and
-- the owner-tier lookup reads a subscriptions row the caller may not own. All three
-- require running as owner with auth.uid() still identifying the caller.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.create_invite(
  p_centre_id     uuid,
  p_invited_email text,
  p_role          text
)
RETURNS public.centre_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    uuid;
  v_email   text;
  v_owner   uuid;
  v_tier    text;
  v_limit   int;
  v_active  int;
  v_pending int;
  v_invite  public.centre_invites%ROWTYPE;
BEGIN
  -- 1. Require an authenticated session.
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated: must be signed in to invite a member';
  END IF;

  -- 2. Normalise inputs.
  v_email := lower(btrim(coalesce(p_invited_email, '')));
  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'invalid_email: a valid email address is required';
  END IF;
  IF p_role NOT IN ('full_access', 'standard') THEN
    RAISE EXCEPTION 'invalid_role: role must be full_access or standard';
  END IF;

  -- 3. Authorization — re-implements the RLS "Hub managers can manage invites"
  --    policy that SECURITY DEFINER bypasses. Only an active owner / full_access
  --    member of THIS hub may invite.
  IF NOT EXISTS (
    SELECT 1 FROM budget_centre_members bcm
    WHERE  bcm.budget_centre_id = p_centre_id
      AND  bcm.user_id          = v_user
      AND  bcm.role             IN ('owner', 'full_access')
      AND  bcm.deleted_at       IS NULL
  ) THEN
    RAISE EXCEPTION 'not_authorized: only hub managers can invite members';
  END IF;

  -- 4. Resolve the OWNER's tier (NOT the caller's). The cap is the payer's.
  --    Mirrors resolveSubscription(): active, non-expired row → its tier; else free.
  SELECT bc.owner_id INTO v_owner FROM budget_centres bc WHERE bc.id = p_centre_id;

  SELECT s.tier INTO v_tier
  FROM   subscriptions s
  WHERE  s.user_id = v_owner
    AND  s.deleted_at IS NULL
    AND  s.status = 'active'
    AND  (s.current_period_end IS NULL OR s.current_period_end > now())
  ORDER BY s.created_at DESC
  LIMIT 1;
  v_tier := COALESCE(v_tier, 'free');

  -- 5. Tier → member limit. HARDCODED from src/lib/plans.js
  --    (FREE_LIMITS.maxMembersPerHub = 2, PRO_LIMITS.maxMembersPerHub = 15). Keep in sync.
  v_limit := CASE WHEN v_tier = 'pro' THEN 15 ELSE 2 END;

  -- 6. Count active members + NON-EXPIRED pending invites (the agreed formula).
  SELECT count(*) INTO v_active
  FROM   budget_centre_members m
  WHERE  m.budget_centre_id = p_centre_id
    AND  m.deleted_at IS NULL;

  SELECT count(*) INTO v_pending
  FROM   centre_invites i
  WHERE  i.budget_centre_id = p_centre_id
    AND  i.status     = 'pending'
    AND  i.expires_at > now();

  -- 7. Enforce the cap. The client maps MEM01 to the friendly upgrade copy.
  IF v_active + v_pending >= v_limit THEN
    RAISE EXCEPTION 'member limit reached: % of % for tier %', v_active + v_pending, v_limit, v_tier
      USING ERRCODE = 'MEM01';
  END IF;

  -- 8. Guard: no duplicate NON-EXPIRED pending invite for this email.
  IF EXISTS (
    SELECT 1 FROM centre_invites i
    WHERE  i.budget_centre_id = p_centre_id
      AND  i.invited_email    = v_email
      AND  i.status           = 'pending'
      AND  i.expires_at       > now()
  ) THEN
    RAISE EXCEPTION 'A pending invite already exists for this email.';
  END IF;

  -- 9. Guard: the invitee is not already an active member of this hub.
  IF EXISTS (
    SELECT 1
    FROM   budget_centre_members m
    JOIN   users u ON u.id = m.user_id
    WHERE  m.budget_centre_id = p_centre_id
      AND  lower(u.email)     = v_email
      AND  m.deleted_at       IS NULL
  ) THEN
    RAISE EXCEPTION 'This person is already a member of this hub.';
  END IF;

  -- 10. Insert the invite. token / status / expires_at / created_at use table
  --     defaults (expires_at = now() + interval '7 days').
  INSERT INTO centre_invites (budget_centre_id, invited_email, role, invited_by)
  VALUES (p_centre_id, v_email, p_role, v_user)
  RETURNING * INTO v_invite;

  RETURN v_invite;
END;
$$;

-- Any authenticated user may call it; the in-function authz + cap are the real gates.
GRANT EXECUTE ON FUNCTION public.create_invite(uuid, text, text) TO authenticated;

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n int;
BEGIN
  -- (a) create_invite exists with the expected 3-arg signature.
  SELECT count(*) INTO v_n FROM pg_proc
    WHERE proname = 'create_invite'
      AND pg_get_function_identity_arguments(oid) = 'p_centre_id uuid, p_invited_email text, p_role text';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: create_invite(uuid,text,text) not found (got %)', v_n; END IF;

  -- (b) It is SECURITY DEFINER.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'create_invite' AND prosecdef IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: create_invite is not SECURITY DEFINER'; END IF;

  -- (c) authenticated has EXECUTE.
  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
    WHERE routine_name = 'create_invite' AND grantee = 'authenticated' AND privilege_type = 'EXECUTE';
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: authenticated lacks EXECUTE on create_invite'; END IF;

  -- (d) Dependencies present: subscriptions table + budget_centres.owner_id.
  SELECT count(*) INTO v_n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscriptions';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: subscriptions table missing (run migrate_19 first)'; END IF;
  SELECT count(*) INTO v_n FROM information_schema.columns
    WHERE table_name = 'budget_centres' AND column_name = 'owner_id';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: budget_centres.owner_id missing'; END IF;

  RAISE NOTICE 'create_invite OK: installed (SECURITY DEFINER, owner-tier MEM01 cap, active+pending_non_expired count).';
END $$;

COMMIT;
