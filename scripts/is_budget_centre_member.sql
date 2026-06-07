-- =============================================================================
-- is_budget_centre_member.sql
--
-- SOURCE-OF-TRUTH ONLY — DO NOT RE-RUN unless rebuilding the database.
-- This function ALREADY EXISTS in production. It was created by hand in the
-- Supabase SQL Editor during early development and was never committed to the
-- repo. The body below was extracted verbatim from production via
-- pg_get_functiondef() on 2026-06-05 so the repo holds the authoritative copy
-- (migration prep + future replay).
--
-- WHAT THIS DOES
--   is_budget_centre_member(centre_id uuid) RETURNS boolean
--     • True if the calling user (auth.uid()) is an active, non-deleted member
--       of the given hub.
--     • LANGUAGE sql, STABLE, SECURITY DEFINER — an RLS PREDICATE HELPER. RLS
--       policies call it as is_budget_centre_member(budget_centre_id) to gate
--       reads/writes. SECURITY DEFINER lets it read budget_centre_members
--       without recursing through that table's own RLS.
--
-- MIGRATION RISK IF LOST: ~18 RLS policies reference this helper. If it is
-- missing on a fresh project, those policies fail to create and member-scoped
-- data isolation collapses. This MUST exist before its dependent policies.
--
-- NOTE on GRANT: not part of pg_get_functiondef output. RLS helpers are usually
-- executable via PUBLIC implicitly, but the explicit grant below is the standard
-- Supabase pattern and is included defensively for faithful replay.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.is_budget_centre_member(centre_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select exists (
    select 1
    from public.budget_centre_members
    where budget_centre_id = centre_id
      and user_id          = auth.uid()
      and deleted_at       is null
  );
$function$;

-- RLS helper — called in policy USING/WITH CHECK clauses by any authenticated
-- user hitting a guarded table. Standard Supabase grant (likely implicit via PUBLIC).
GRANT EXECUTE ON FUNCTION public.is_budget_centre_member(uuid) TO authenticated;

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n int;
BEGIN
  -- (a) Exists with the expected (uuid) signature returning boolean.
  SELECT count(*) INTO v_n FROM pg_proc p
    JOIN pg_type t ON t.oid = p.prorettype
    WHERE p.proname = 'is_budget_centre_member'
      AND pg_get_function_identity_arguments(p.oid) = 'centre_id uuid'
      AND t.typname = 'bool';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: is_budget_centre_member(uuid) returning boolean not found (got %)', v_n; END IF;

  -- (b) It is SECURITY DEFINER.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'is_budget_centre_member' AND prosecdef IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: is_budget_centre_member is not SECURITY DEFINER'; END IF;

  -- (c) It is STABLE (provolatile = 's').
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'is_budget_centre_member' AND provolatile = 's';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: is_budget_centre_member is not STABLE'; END IF;

  -- (d) Source table present with the columns the predicate touches.
  SELECT count(*) INTO v_n FROM information_schema.columns
    WHERE table_name = 'budget_centre_members' AND table_schema = 'public'
      AND column_name IN ('budget_centre_id', 'user_id', 'deleted_at');
  IF v_n <> 3 THEN RAISE EXCEPTION 'FAIL: budget_centre_members missing budget_centre_id/user_id/deleted_at'; END IF;

  RAISE NOTICE 'is_budget_centre_member OK: (uuid)->boolean installed (STABLE, SECURITY DEFINER).';
END $$;

COMMIT;
