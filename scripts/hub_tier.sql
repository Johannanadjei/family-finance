-- =============================================================================
-- hub_tier.sql
--
-- WHAT THIS DOES
--   hub_tier(p_centre_id uuid) RETURNS text  -- 'free' | 'pro'
--     Resolves a hub's EFFECTIVE plan tier: the tier of the hub's OWNER
--     (budget_centres.owner_id → subscriptions), never the caller's own tier.
--
-- WHY IT EXISTS — DISPLAY CORRECTNESS ONLY
--   The server already enforces every hub-scoped cap against the OWNER's tier:
--     • create_category      (CAT01)  create_category.sql:102-112
--     • create_invite        (MEM01)  create_invite.sql:95-105
--     • update_centre_skin   (SKN01)  update_centre_skin.sql:87-95
--   …but the CLIENT was gating on the VIEWER's tier (App.jsx userPlan =
--   useSubscription().tier). The two disagree for every non-owner member, which
--   produced a matched pair of bugs:
--     a. FALSE CAP  — a member of a PAID hub saw "10 of 10", a hidden history
--                     window and PRO badges, while the server would have accepted
--                     the write. The hub was paid for; the client nagged anyway.
--     b. PAY-FOR-NOTHING — the same member was offered a Paystack button whose
--                     purchase attaches to THEIR user_id, which no cap RPC ever
--                     reads. Real charge, zero effect on the hub.
--   This function gives the client the same number the RPCs use, so the displayed
--   cap state matches the enforced one.
--
--   NOT AN ENFORCEMENT BOUNDARY. It grants nothing and gates no write. Removing
--   it would degrade the UI, not open a hole. The direct-write cap bypass and the
--   history REST leak are a SEPARATE, still-open RLS sweep — this file is not it,
--   and must not be cited as closing them.
--
--   Note hub creation is deliberately NOT in scope: create_hub (create_hub.sql:68-76)
--   resolves the CALLER's tier, because a hub you create is one you will own. The
--   HubFooter hub cap therefore keeps reading the viewer's tier and keeps its
--   Paystack CTA for everyone — correct, not an oversight.
--
-- SECURITY
--   • SECURITY DEFINER: must read a subscriptions row belonging to ANOTHER user
--     (the owner). subscriptions RLS is own-row-only, so a plain select returns
--     nothing for a member and would silently resolve every hub to 'free' — the
--     false-cap bug in a different costume.
--   • MEMBERSHIP-GATED: reuses is_budget_centre_member(), so a caller can only ask
--     about a hub they actually belong to. Without this, any authenticated user
--     could enumerate centre_ids and read the billing status of strangers.
--   • MINIMAL DISCLOSURE: returns a single tier string. Never the subscription row,
--     the Paystack ids, the amount, the period dates, or the owner's identity.
--   • Intended for `authenticated` callers, so Supabase's default ACL is correct
--     here — this is NOT a service_role-only RPC (CLAUDE.md §9.6 lockdown does not
--     apply; that section's REVOKE dance is for revenue writers like
--     apply_subscription_event).
--
--   JavaScript call (services/subscriptions.service.js):
--     supabase.rpc('hub_tier', { p_centre_id })
--
-- TIER RESOLUTION mirrors services/subscriptions.service.resolveSubscription and
-- the three gate RPCs verbatim: an active, non-expired, non-deleted row → its
-- tier; anything else → 'free'. A cancel-at-period-end row stays 'pro' until
-- current_period_end passes. Keep all five in sync.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.hub_tier(p_centre_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_tier  text;
BEGIN
  -- 1. Null guard — no hub, no tier. 'free' is the safe default everywhere.
  IF p_centre_id IS NULL THEN
    RETURN 'free';
  END IF;

  -- 2. Authz: the caller must be an active member of this hub. Reuses the
  --    existing RLS predicate helper so the membership definition can never
  --    drift from the ~18 policies that already depend on it.
  IF NOT public.is_budget_centre_member(p_centre_id) THEN
    RAISE EXCEPTION 'not a member of this hub'
      USING ERRCODE = '42501';   -- insufficient_privilege
  END IF;

  -- 3. The hub's owner. A deleted hub resolves to no owner → 'free'.
  SELECT bc.owner_id
    INTO v_owner
    FROM budget_centres bc
   WHERE bc.id = p_centre_id
     AND bc.deleted_at IS NULL;

  IF v_owner IS NULL THEN
    RETURN 'free';
  END IF;

  -- 4. The owner's live tier. Mirrors resolveSubscription(): active, non-expired
  --    row → its tier; else free.
  SELECT s.tier
    INTO v_tier
    FROM subscriptions s
   WHERE s.user_id = v_owner
     AND s.deleted_at IS NULL
     AND s.status = 'active'
     AND (s.current_period_end IS NULL OR s.current_period_end > now())
   ORDER BY s.created_at DESC
   LIMIT 1;

  RETURN COALESCE(v_tier, 'free');
END;
$$;

-- Called by every signed-in member to render their own hub's cap state.
--
-- The REVOKE is not redundant: Supabase's pg_default_acl grants EXECUTE on every
-- new public-schema function DIRECTLY to anon as well as authenticated (CLAUDE.md
-- §9.6). An anon caller would fail closed anyway — no auth.uid() means
-- is_budget_centre_member() is false and they hit the 42501 above — but relying on
-- the authz gate to cover a grant we never wanted is weaker than not granting it.
-- Signed-out callers have no hub to render caps for, so anon is revoked outright.
REVOKE EXECUTE ON FUNCTION public.hub_tier(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.hub_tier(uuid) TO   authenticated;

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n int;
BEGIN
  -- (a) Exists with the expected (uuid) signature returning text.
  SELECT count(*) INTO v_n FROM pg_proc p
    JOIN pg_type t ON t.oid = p.prorettype
    WHERE p.proname = 'hub_tier'
      AND pg_get_function_identity_arguments(p.oid) = 'p_centre_id uuid'
      AND t.typname = 'text';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: hub_tier(uuid) returning text not found (got %)', v_n; END IF;

  -- (b) SECURITY DEFINER — the whole point is reading another user's subscription row.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'hub_tier' AND prosecdef IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: hub_tier is not SECURITY DEFINER'; END IF;

  -- (c) STABLE (provolatile = 's') — read-only, safe to call per render.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'hub_tier' AND provolatile = 's';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: hub_tier is not STABLE'; END IF;

  -- (d) search_path pinned — SECURITY DEFINER without it is a hijack vector.
  SELECT count(*) INTO v_n FROM pg_proc
    WHERE proname = 'hub_tier' AND 'search_path=public' = ANY(proconfig);
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: hub_tier does not pin search_path=public'; END IF;

  -- (e) authenticated can execute (every member renders their own hub's caps).
  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
    WHERE routine_name = 'hub_tier' AND grantee = 'authenticated' AND privilege_type = 'EXECUTE';
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: authenticated lacks EXECUTE on hub_tier'; END IF;

  -- (e2) anon does NOT have execute. Supabase's default ACL grants it directly, so
  --      this asserts the REVOKE above actually took (§9.6 — the same gap that was
  --      caught during the apply_subscription_event rollout).
  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
    WHERE routine_name = 'hub_tier' AND grantee = 'anon' AND privilege_type = 'EXECUTE';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: anon still holds EXECUTE on hub_tier (default ACL not revoked)'; END IF;

  -- (f) Dependencies present: the membership helper + every column the body reads.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'is_budget_centre_member';
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: is_budget_centre_member missing (authz gate would not compile)'; END IF;

  SELECT count(*) INTO v_n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscriptions';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: subscriptions table missing (run migrate_19 first)'; END IF;

  SELECT count(*) INTO v_n FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND table_schema = 'public'
      AND column_name IN ('user_id', 'tier', 'status', 'current_period_end', 'deleted_at', 'created_at');
  IF v_n <> 6 THEN RAISE EXCEPTION 'FAIL: subscriptions missing a column hub_tier reads (got %)', v_n; END IF;

  SELECT count(*) INTO v_n FROM information_schema.columns
    WHERE table_name = 'budget_centres' AND table_schema = 'public'
      AND column_name IN ('owner_id', 'deleted_at');
  IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL: budget_centres missing owner_id/deleted_at'; END IF;

  RAISE NOTICE 'hub_tier OK: (uuid)->text installed (STABLE, SECURITY DEFINER, membership-gated, owner-tier).';
END $$;

COMMIT;
