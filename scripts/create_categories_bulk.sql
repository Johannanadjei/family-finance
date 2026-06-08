-- =============================================================================
-- create_categories_bulk.sql
--
-- NEW WORK — TO BE RUN ONCE in the Supabase SQL Editor (not yet applied to prod).
-- Ships WITH the category-cap gate commit, alongside create_category.sql. Run it
-- before that commit reaches main. Idempotent (CREATE OR REPLACE + re-issued
-- GRANT), transactional.
--
-- WHAT THIS ADDS
--   create_categories_bulk(p_centre_id, p_cycle_id, p_categories jsonb)
--     RETURNS SETOF budget_categories
--     • The BULK counterpart of create_category — used by the two paths that insert
--       many categories at once: onboarding seed and budget rollforward (copy
--       previous period's categories into a new cycle). Both previously did a direct
--       client INSERT; routing them through this RPC closes the cap-bypass hole
--       (a free user could otherwise roll forward 13 categories past the 10 cap).
--     • SECURITY DEFINER, same auth / authz (active member) / owner-tier resolution
--       as create_category.
--     • Server-side PLAN CAP gate: validates existing_in_cycle + array_length
--       <= owner-tier limit, rejecting the WHOLE batch with SQLSTATE 'CAT01' if it
--       would exceed. Atomic — a single INSERT…SELECT, so no partial seeding.
--     • PER-CYCLE SCOPE (Decision D1): counts categories in p_cycle_id only.
--     • REQUIRES a non-null p_cycle_id: both bulk callers always have a real cycle
--       (onboarding creates the first cycle before seeding; rollforward refuses a
--       NULL-cycle insert with CYC02). Rejecting NULL here keeps the count
--       unambiguous (no per-row month fallback).
--     • ADVISORY LOCK (Decision D6): shares the 'create_category:' lock namespace
--       keyed on the cycle, so a bulk insert and a concurrent single add on the SAME
--       cycle serialise against each other. Auto-released at COMMIT/ROLLBACK.
--
--   p_categories is a JSON array of objects, each:
--     { name, icon, budget_amount, month, is_fixed, sort_order }
--
--   JavaScript call (services/categories.service.js):
--     supabase.rpc('create_categories_bulk', { p_centre_id, p_cycle_id, p_categories })
--
-- Why SECURITY DEFINER (CLAUDE.md §9.6): same as create_category — server-side cap,
-- atomic count+insert, owner-tier lookup across a subscriptions row the caller may
-- not own.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.create_categories_bulk(
  p_centre_id  uuid,
  p_cycle_id   uuid,
  p_categories jsonb
)
RETURNS SETOF public.budget_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid;
  v_owner    uuid;
  v_tier     text;
  v_limit    int;
  v_existing int;
  v_new      int;
BEGIN
  -- 1. Require an authenticated session.
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated: must be signed in to add categories';
  END IF;

  -- 2. Validate the payload shape.
  IF p_categories IS NULL OR jsonb_typeof(p_categories) <> 'array' THEN
    RAISE EXCEPTION 'invalid_payload: p_categories must be a JSON array';
  END IF;
  v_new := jsonb_array_length(p_categories);
  IF v_new = 0 THEN
    RETURN;   -- nothing to insert — empty set, not an error
  END IF;

  -- 3. A real cycle is required (see header). Both bulk callers always supply one.
  IF p_cycle_id IS NULL THEN
    RAISE EXCEPTION 'cycle required for bulk category insert (CYC02)';
  END IF;

  -- 4. Authorization — active member of THIS hub (matches budget_categories_insert RLS).
  IF NOT EXISTS (
    SELECT 1 FROM budget_centre_members bcm
    WHERE  bcm.budget_centre_id = p_centre_id
      AND  bcm.user_id          = v_user
      AND  bcm.deleted_at       IS NULL
  ) THEN
    RAISE EXCEPTION 'not_authorized: only hub members can add categories';
  END IF;

  -- 5. Advisory lock — serialise against concurrent adds on the same cycle. Shared
  --    namespace with create_category.
  PERFORM pg_advisory_xact_lock(hashtext('create_category:' || p_cycle_id::text));

  -- 6. Resolve the OWNER's tier (NOT the caller's).
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

  -- 7. Tier → category limit. HARDCODED from src/lib/plans.js
  --    (Free = 10, Pro = Infinity ↔ 2147483647 sentinel). Keep in sync.
  v_limit := CASE WHEN v_tier = 'pro' THEN 2147483647 ELSE 10 END;

  -- 8. Count existing categories in this cycle; reject the whole batch if the
  --    post-insert total would exceed the limit (> not >= — we add v_new rows).
  SELECT count(*) INTO v_existing
  FROM   budget_categories
  WHERE  cycle_id = p_cycle_id
    AND  deleted_at IS NULL;

  IF v_existing + v_new > v_limit THEN
    RAISE EXCEPTION 'category limit reached: % + % would exceed % for tier %', v_existing, v_new, v_limit, v_tier
      USING ERRCODE = 'CAT01';
  END IF;

  -- 9. Atomic bulk insert — one INSERT…SELECT over the array. All rows stamped with
  --    p_cycle_id. Returns the inserted rows.
  RETURN QUERY
  INSERT INTO budget_categories (budget_centre_id, name, icon, budget_amount, month, is_fixed, sort_order, cycle_id)
  SELECT p_centre_id,
         btrim(x.name),
         coalesce(nullif(btrim(coalesce(x.icon, '')), ''), '📦'),
         greatest(0, round(coalesce(x.budget_amount, 0))),
         x.month,
         coalesce(x.is_fixed, false),
         coalesce(x.sort_order, 0),
         p_cycle_id
  FROM jsonb_to_recordset(p_categories) AS x(
         name text, icon text, budget_amount numeric, month text, is_fixed boolean, sort_order int
       )
  RETURNING *;
END;
$$;

-- Any authenticated user may call it; the in-function authz + cap are the real gates.
GRANT EXECUTE ON FUNCTION public.create_categories_bulk(uuid, uuid, jsonb) TO authenticated;

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n int;
BEGIN
  -- (a) create_categories_bulk exists with the expected 3-arg signature.
  SELECT count(*) INTO v_n FROM pg_proc
    WHERE proname = 'create_categories_bulk'
      AND pg_get_function_identity_arguments(oid) = 'p_centre_id uuid, p_cycle_id uuid, p_categories jsonb';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: create_categories_bulk(uuid,uuid,jsonb) not found (got %)', v_n; END IF;

  -- (b) It is SECURITY DEFINER.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'create_categories_bulk' AND prosecdef IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: create_categories_bulk is not SECURITY DEFINER'; END IF;

  -- (c) authenticated has EXECUTE.
  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
    WHERE routine_name = 'create_categories_bulk' AND grantee = 'authenticated' AND privilege_type = 'EXECUTE';
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: authenticated lacks EXECUTE on create_categories_bulk'; END IF;

  -- (d) Dependencies present.
  SELECT count(*) INTO v_n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscriptions';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: subscriptions table missing (run migrate_19 first)'; END IF;
  SELECT count(*) INTO v_n FROM information_schema.columns
    WHERE table_name = 'budget_centres' AND column_name = 'owner_id';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: budget_centres.owner_id missing'; END IF;

  RAISE NOTICE 'create_categories_bulk OK: installed (SECURITY DEFINER, owner-tier CAT01 cap, per-cycle batch count, advisory lock).';
END $$;

COMMIT;
