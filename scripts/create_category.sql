-- =============================================================================
-- create_category.sql
--
-- NEW WORK — TO BE RUN ONCE in the Supabase SQL Editor (not yet applied to prod).
-- Like create_hub.sql / create_invite.sql, this is a brand-new RPC that ships WITH
-- its feature commit (the category-cap gate). Run it before that commit reaches
-- main. Idempotent (CREATE OR REPLACE + re-issued GRANT), transactional.
--
-- WHAT THIS ADDS
--   create_category(p_centre_id, p_cycle_id, p_name, p_icon, p_budget_amount,
--                   p_month, p_is_fixed, p_sort_order)
--     RETURNS budget_categories
--     • SECURITY DEFINER — runs as owner; auth.uid() is still the calling user.
--     • RE-IMPLEMENTS the "budget_categories_insert" RLS policy that SECURITY
--       DEFINER bypasses: the caller must be an active MEMBER of the hub. Note this
--       is broader than create_invite's owner/full_access check — categories are
--       addable by any member (incl. standard), matching the existing RLS.
--     • Server-side PLAN CAP gate: counts active categories IN THE SAME CYCLE and
--       rejects with SQLSTATE 'CAT01' if one more would exceed the tier limit
--       (Free = 10 per budget period, Pro = unlimited).
--     • PER-CYCLE SCOPE (Decision D1): the cap is "10 categories per budget period",
--       NOT 10 per hub across all history. Categories are cycle-scoped rows (each
--       cycle gets its own copies via rollforward), so the count filters cycle_id.
--       NULL-cycle fallback (legacy / pre-cycle path): count by (centre, month).
--     • OWNER-TIER, NOT CALLER-TIER: the cap belongs to whoever PAYS — the hub
--       owner. A standard member adding to a Pro hub must get the Pro (unlimited)
--       limit. Resolve the tier from budget_centres.owner_id → subscriptions.
--       (Same trap as the member cap — Phase 1 §D.)
--     • ADVISORY LOCK (Decision D6): pg_advisory_xact_lock serialises concurrent
--       adds on the same cycle so two requests can't both pass the count at limit-1
--       and land at limit+1. Auto-released at COMMIT/ROLLBACK. Shares the
--       'create_category:' lock namespace with create_categories_bulk so a manual
--       add and a rollforward on the SAME cycle serialise against each other.
--
--   JavaScript call (services/categories.service.js):
--     supabase.rpc('create_category', { p_centre_id, p_cycle_id, p_name, p_icon,
--                                       p_budget_amount, p_month, p_is_fixed, p_sort_order })
--
-- Why SECURITY DEFINER (CLAUDE.md §9.6): the cap must be enforced server-side (the
-- client gate is only UX), the count + insert must be atomic to be race-proof, and
-- the owner-tier lookup reads a subscriptions row the caller may not own.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.create_category(
  p_centre_id     uuid,
  p_cycle_id      uuid,
  p_name          text,
  p_icon          text    DEFAULT '📦',
  p_budget_amount numeric DEFAULT 0,
  p_month         text    DEFAULT NULL,
  p_is_fixed      boolean DEFAULT false,
  p_sort_order    int     DEFAULT NULL
)
RETURNS public.budget_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid;
  v_owner  uuid;
  v_tier   text;
  v_limit  int;
  v_count  int;
  v_amount numeric;
  v_row    public.budget_categories%ROWTYPE;
BEGIN
  -- 1. Require an authenticated session.
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated: must be signed in to add a category';
  END IF;

  -- 2. Minimal server-side validation (the client also validates).
  IF btrim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'category name is required';
  END IF;
  v_amount := greatest(0, round(coalesce(p_budget_amount, 0)));

  -- 3. Authorization — re-implements the budget_categories_insert RLS policy that
  --    SECURITY DEFINER bypasses. Any active MEMBER of THIS hub may add a category
  --    (broader than create_invite's owner/full_access — matches existing RLS).
  IF NOT EXISTS (
    SELECT 1 FROM budget_centre_members bcm
    WHERE  bcm.budget_centre_id = p_centre_id
      AND  bcm.user_id          = v_user
      AND  bcm.deleted_at       IS NULL
  ) THEN
    RAISE EXCEPTION 'not_authorized: only hub members can add categories';
  END IF;

  -- 4. Advisory lock — serialise concurrent adds on the same cycle (or centre+month
  --    on the legacy NULL-cycle path) so the count+insert below is race-proof.
  --    Shared namespace with create_categories_bulk.
  PERFORM pg_advisory_xact_lock(
    hashtext('create_category:' || coalesce(p_cycle_id::text, p_centre_id::text || ':' || coalesce(p_month, '')))
  );

  -- 5. Resolve the OWNER's tier (NOT the caller's). The cap is the payer's.
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

  -- 6. Tier → category limit. HARDCODED from src/lib/plans.js
  --    (FREE_LIMITS.maxCategoriesPerHub = 10, PRO_LIMITS = Infinity ↔ 2147483647
  --    sentinel). Keep in sync.
  v_limit := CASE WHEN v_tier = 'pro' THEN 2147483647 ELSE 10 END;

  -- 7. Count active categories IN THE SAME CYCLE (per-period scope, Decision D1).
  --    NULL cycle → fall back to the (centre, month) slice so the legacy path can't
  --    bypass the cap (WHERE cycle_id = NULL matches zero rows).
  IF p_cycle_id IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM   budget_categories
    WHERE  cycle_id = p_cycle_id
      AND  deleted_at IS NULL;
  ELSE
    SELECT count(*) INTO v_count
    FROM   budget_categories
    WHERE  budget_centre_id = p_centre_id
      AND  month = p_month
      AND  deleted_at IS NULL;
  END IF;

  -- 8. Enforce the cap. The client maps CAT01 to the friendly upgrade copy.
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'category limit reached: % of % for tier %', v_count, v_limit, v_tier
      USING ERRCODE = 'CAT01';
  END IF;

  -- 9. Insert. Pass cycle_id only when non-null so the resolve_cycle_id trigger
  --    still resolves it from month on the legacy path (don't force a NULL).
  INSERT INTO budget_categories (budget_centre_id, name, icon, budget_amount, month, is_fixed, sort_order, cycle_id)
  VALUES (
    p_centre_id,
    btrim(p_name),
    coalesce(nullif(btrim(coalesce(p_icon, '')), ''), '📦'),
    v_amount,
    p_month,
    coalesce(p_is_fixed, false),
    coalesce(p_sort_order, 0),
    p_cycle_id
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Any authenticated user may call it; the in-function authz + cap are the real gates.
GRANT EXECUTE ON FUNCTION public.create_category(uuid, uuid, text, text, numeric, text, boolean, int) TO authenticated;

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n int;
BEGIN
  -- (a) create_category exists with the expected 8-arg signature.
  SELECT count(*) INTO v_n FROM pg_proc
    WHERE proname = 'create_category'
      AND pg_get_function_identity_arguments(oid) = 'p_centre_id uuid, p_cycle_id uuid, p_name text, p_icon text, p_budget_amount numeric, p_month text, p_is_fixed boolean, p_sort_order integer';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: create_category(...) not found with expected signature (got %)', v_n; END IF;

  -- (b) It is SECURITY DEFINER.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'create_category' AND prosecdef IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: create_category is not SECURITY DEFINER'; END IF;

  -- (c) authenticated has EXECUTE.
  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
    WHERE routine_name = 'create_category' AND grantee = 'authenticated' AND privilege_type = 'EXECUTE';
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: authenticated lacks EXECUTE on create_category'; END IF;

  -- (d) Dependencies present: subscriptions table, budget_centres.owner_id, budget_categories.cycle_id.
  SELECT count(*) INTO v_n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscriptions';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: subscriptions table missing (run migrate_19 first)'; END IF;
  SELECT count(*) INTO v_n FROM information_schema.columns
    WHERE table_name = 'budget_centres' AND column_name = 'owner_id';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: budget_centres.owner_id missing'; END IF;
  SELECT count(*) INTO v_n FROM information_schema.columns
    WHERE table_name = 'budget_categories' AND column_name = 'cycle_id';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: budget_categories.cycle_id missing'; END IF;

  RAISE NOTICE 'create_category OK: installed (SECURITY DEFINER, owner-tier CAT01 cap, per-cycle count, advisory lock).';
END $$;

COMMIT;
