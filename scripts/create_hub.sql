-- =============================================================================
-- create_hub.sql
--
-- NEW WORK — TO BE RUN ONCE in the Supabase SQL Editor (not yet applied to prod).
-- Unlike the source-of-truth files in this directory, this is a brand-new RPC that
-- ships WITH its feature commit (the hub-cap gate). Run it before that commit
-- reaches main. Idempotent (CREATE OR REPLACE + re-issued GRANT), transactional.
--
-- WHAT THIS ADDS
--   create_hub(p_name, p_currency, p_surplus_target, p_icon, p_type, p_skin_id)
--     RETURNS budget_centres
--     • SECURITY DEFINER — runs as owner; auth.uid() is still the calling user.
--     • Server-side PLAN CAP gate: counts the caller's OWNED, active, non-archived
--       hubs and rejects with SQLSTATE 'HUB01' if creating one more would exceed
--       the tier limit (Free = 1, Pro = 10). Owner-based: hubs the caller was
--       merely invited to do NOT count against their cap.
--     • ATOMIC: inserts the budget_centres row AND the owner budget_centre_members
--       row in one function body. If the member insert fails, the centre insert
--       rolls back — fixing the old client-side 2-insert orphan bug where a failed
--       member write left an owner-less centre behind.
--     • Tier resolution mirrors services/subscriptions.service.resolveSubscription:
--       an active, non-expired subscriptions row → that row's tier; otherwise free.
--
--   JavaScript call (services/centres.service.js):
--     supabase.rpc('create_hub', { p_name, p_currency, p_surplus_target, p_icon,
--                                  p_type, p_skin_id })
--
-- Why SECURITY DEFINER (CLAUDE.md §9.6): the cap must be enforced server-side
-- (the client gate is only UX), and the two-table insert must be atomic. Both
-- require running as owner with auth.uid() still identifying the caller.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.create_hub(
  p_name           text,
  p_currency       text,
  p_surplus_target numeric DEFAULT 0,
  p_icon           text    DEFAULT '🏠',
  p_type           text    DEFAULT 'family_home',
  p_skin_id        text    DEFAULT NULL
)
RETURNS public.budget_centres
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid;
  v_tier   text;
  v_limit  int;
  v_count  int;
  v_skin   text;
  v_centre public.budget_centres%ROWTYPE;
BEGIN
  -- 1. Require an authenticated session.
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated: must be signed in to create a hub';
  END IF;

  -- 2. Minimal server-side validation (the client also validates).
  IF btrim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'hub name is required';
  END IF;

  -- 3. Resolve the caller's tier. Mirrors resolveSubscription(): an active,
  --    non-expired row yields its tier; no such row → free (Approach 1).
  SELECT s.tier INTO v_tier
  FROM   subscriptions s
  WHERE  s.user_id = v_user
    AND  s.deleted_at IS NULL
    AND  s.status = 'active'
    AND  (s.current_period_end IS NULL OR s.current_period_end > now())
  ORDER BY s.created_at DESC
  LIMIT 1;
  v_tier := COALESCE(v_tier, 'free');

  -- 4. Tier → hub limit. HARDCODED from src/lib/plans.js
  --    (FREE_LIMITS.maxHubs = 1, PRO_LIMITS.maxHubs = 10). Keep in sync.
  v_limit := CASE WHEN v_tier = 'pro' THEN 10 ELSE 1 END;

  -- 5. Count the caller's OWNED, active, non-archived hubs (matches getCentres:
  --    deleted_at IS NULL AND is_archived = false). Owner-based by design.
  SELECT count(*) INTO v_count
  FROM   budget_centres
  WHERE  owner_id = v_user
    AND  deleted_at IS NULL
    AND  is_archived = false;

  -- 6. Enforce the cap. The client maps HUB01 to the friendly upgrade copy.
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'hub limit reached: % of % for tier %', v_count, v_limit, v_tier
      USING ERRCODE = 'HUB01';
  END IF;

  -- 6b. Skin gate (defense-in-depth for the create path). skin_id is listed in the
  --     INSERT below, so the table-level DEFAULT 'family_warmth' is BYPASSED when the
  --     caller passes NULL (defaults only apply to OMITTED columns) — that broke
  --     onboarding, which doesn't send a skin. COALESCE provides the server default.
  --     A FREE caller is then QUIETLY clamped to family_warmth (no SKN01): the skin
  --     here is hub-type-derived, not user-picked, so a silent override keeps the
  --     create flow clean. The update_centre_skin RPC raises SKN01 for user picks.
  v_skin := coalesce(p_skin_id, 'family_warmth');
  IF v_tier = 'free' AND v_skin <> 'family_warmth' THEN
    v_skin := 'family_warmth';
  END IF;

  -- 7. Atomic create: centre row + owner member row. A failure in either rolls
  --    back the whole function (no orphaned centre).
  INSERT INTO budget_centres (name, currency, surplus_target, icon, owner_id, type, skin_id)
  VALUES (
    btrim(p_name),
    p_currency,
    greatest(0, round(coalesce(p_surplus_target, 0))),
    coalesce(p_icon, '🏠'),
    v_user,
    coalesce(p_type, 'family_home'),
    v_skin
  )
  RETURNING * INTO v_centre;

  INSERT INTO budget_centre_members (budget_centre_id, user_id, role)
  VALUES (v_centre.id, v_user, 'owner');

  RETURN v_centre;
END;
$$;

-- Any authenticated user may call it; the in-function cap is the real gate.
GRANT EXECUTE ON FUNCTION public.create_hub(text, text, numeric, text, text, text) TO authenticated;

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n int;
BEGIN
  -- (a) create_hub exists with the expected 6-arg signature.
  SELECT count(*) INTO v_n FROM pg_proc
    WHERE proname = 'create_hub'
      AND pg_get_function_identity_arguments(oid) = 'p_name text, p_currency text, p_surplus_target numeric, p_icon text, p_type text, p_skin_id text';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: create_hub(text,text,numeric,text,text,text) not found (got %)', v_n; END IF;

  -- (b) It is SECURITY DEFINER.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'create_hub' AND prosecdef IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: create_hub is not SECURITY DEFINER'; END IF;

  -- (c) authenticated has EXECUTE.
  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
    WHERE routine_name = 'create_hub' AND grantee = 'authenticated' AND privilege_type = 'EXECUTE';
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: authenticated lacks EXECUTE on create_hub'; END IF;

  -- (d) Dependencies present: subscriptions table + the columns the gate/insert touch.
  SELECT count(*) INTO v_n FROM information_schema.columns
    WHERE table_name = 'budget_centres' AND column_name IN ('owner_id', 'is_archived', 'deleted_at');
  IF v_n <> 3 THEN RAISE EXCEPTION 'FAIL: budget_centres missing owner_id/is_archived/deleted_at'; END IF;
  SELECT count(*) INTO v_n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscriptions';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: subscriptions table missing (run migrate_19 first)'; END IF;

  RAISE NOTICE 'create_hub OK: installed (SECURITY DEFINER, owner-based HUB01 cap, atomic centre+member).';
END $$;

COMMIT;
