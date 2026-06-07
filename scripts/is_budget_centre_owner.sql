-- =============================================================================
-- is_budget_centre_owner.sql
--
-- SOURCE-OF-TRUTH ONLY — DO NOT RE-RUN unless rebuilding the database.
-- This function ALREADY EXISTS in production. It was created by hand in the
-- Supabase SQL Editor during early development and was never committed to the
-- repo. The body below was extracted verbatim from production via
-- pg_get_functiondef() on 2026-06-05 so the repo holds the authoritative copy
-- (migration prep + future replay).
--
-- WHAT THIS DOES
--   is_budget_centre_owner(centre_id uuid) RETURNS boolean
--     • True if the calling user (auth.uid()) is the owner of the given,
--       non-deleted hub.
--     • LANGUAGE sql, STABLE, SECURITY DEFINER — an RLS PREDICATE HELPER. RLS
--       policies call it as is_budget_centre_owner(budget_centre_id) to gate
--       owner-only operations. SECURITY DEFINER lets it read budget_centres
--       without recursing through that table's own RLS.
--
-- MIGRATION RISK IF LOST: ~18 RLS policies reference this and its sibling helper
-- is_budget_centre_member. If missing on a fresh project those policies fail to
-- create and owner-scoped access control collapses. MUST exist before its
-- dependent policies.
--
-- NOTE on GRANT: not part of pg_get_functiondef output. RLS helpers are usually
-- executable via PUBLIC implicitly, but the explicit grant below is the standard
-- Supabase pattern and is included defensively for faithful replay.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.is_budget_centre_owner(centre_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select exists (
    select 1
    from public.budget_centres
    where id         = centre_id
      and owner_id   = auth.uid()
      and deleted_at is null
  );
$function$;

-- RLS helper — called in policy USING/WITH CHECK clauses by any authenticated
-- user hitting a guarded table. Standard Supabase grant (likely implicit via PUBLIC).
GRANT EXECUTE ON FUNCTION public.is_budget_centre_owner(uuid) TO authenticated;

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n int;
BEGIN
  -- (a) Exists with the expected (uuid) signature returning boolean.
  SELECT count(*) INTO v_n FROM pg_proc p
    JOIN pg_type t ON t.oid = p.prorettype
    WHERE p.proname = 'is_budget_centre_owner'
      AND pg_get_function_identity_arguments(p.oid) = 'centre_id uuid'
      AND t.typname = 'bool';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: is_budget_centre_owner(uuid) returning boolean not found (got %)', v_n; END IF;

  -- (b) It is SECURITY DEFINER.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'is_budget_centre_owner' AND prosecdef IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: is_budget_centre_owner is not SECURITY DEFINER'; END IF;

  -- (c) It is STABLE (provolatile = 's').
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'is_budget_centre_owner' AND provolatile = 's';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: is_budget_centre_owner is not STABLE'; END IF;

  -- (d) Source table present with the columns the predicate touches.
  SELECT count(*) INTO v_n FROM information_schema.columns
    WHERE table_name = 'budget_centres' AND table_schema = 'public'
      AND column_name IN ('id', 'owner_id', 'deleted_at');
  IF v_n <> 3 THEN RAISE EXCEPTION 'FAIL: budget_centres missing id/owner_id/deleted_at'; END IF;

  RAISE NOTICE 'is_budget_centre_owner OK: (uuid)->boolean installed (STABLE, SECURITY DEFINER).';
END $$;

COMMIT;
