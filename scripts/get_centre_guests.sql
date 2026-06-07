-- =============================================================================
-- get_centre_guests.sql
--
-- SOURCE-OF-TRUTH ONLY — DO NOT RE-RUN unless rebuilding the database.
-- This function ALREADY EXISTS in production. It was created by hand in the
-- Supabase SQL Editor during early development and was never committed to the
-- repo. The body below was extracted verbatim from production via
-- pg_get_functiondef() on 2026-06-05 so the repo holds the authoritative copy
-- (migration prep + future replay into a fresh project).
--
-- WHAT THIS DOES
--   get_centre_guests(p_centre_id uuid)
--     RETURNS TABLE(id uuid, name text, budget_centre_id uuid)
--     • Lists the ACTIVE, non-deleted guest_users rows for one hub.
--     • Returns only (id, name, budget_centre_id) — no pin_hash, no lockout
--       fields, no allowed_categories. Safe to expose to the anon key.
--     • LANGUAGE sql, SECURITY DEFINER — the guest login portal calls this with
--       the anon key (no Supabase Auth session yet) to render the guest picker,
--       so it must bypass RLS on guest_users for this narrow, read-only slice.
--     • Ordered by created_at ASC (stable picker order).
--
--   JavaScript call (services/guests.service.js):
--     supabase.rpc('get_centre_guests', { p_centre_id: centreId })
--
-- Why SECURITY DEFINER:
--   guest_users carries PIN hashes and lockout state; its RLS denies the anon
--   key direct SELECT. This function runs as the DB owner and projects ONLY the
--   three non-sensitive columns, so the guest portal can list names without ever
--   touching the protected columns.
--
-- Note: the body is reproduced exactly as production emitted it
-- ($function$ quoting, SET search_path TO 'public', inline RETURNS TABLE). The
-- trailing GRANT is NOT part of pg_get_functiondef output — it mirrors the
-- anon+authenticated grant on the sibling guest RPCs (authenticate_guest,
-- submit_guest_transaction) and the "readable by anon key" service-layer note.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.get_centre_guests(p_centre_id uuid)
 RETURNS TABLE(id uuid, name text, budget_centre_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, name, budget_centre_id
  FROM   guest_users
  WHERE  budget_centre_id = p_centre_id
    AND  is_active   = true
    AND  deleted_at  IS NULL
  ORDER BY created_at ASC;
$function$;

-- Guest login portal calls this with the anon key (no auth session); owners may
-- also call it from the authenticated dashboard. Mirrors the sibling guest RPCs.
GRANT EXECUTE ON FUNCTION public.get_centre_guests(uuid) TO anon, authenticated;

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n int;
BEGIN
  -- (a) get_centre_guests exists with the expected 1-arg signature.
  SELECT count(*) INTO v_n FROM pg_proc
    WHERE proname = 'get_centre_guests'
      AND pg_get_function_identity_arguments(oid) = 'p_centre_id uuid';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: get_centre_guests(uuid) not found (got %)', v_n; END IF;

  -- (b) It is SECURITY DEFINER.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'get_centre_guests' AND prosecdef IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: get_centre_guests is not SECURITY DEFINER'; END IF;

  -- (c) Returns exactly the three non-sensitive columns (no PIN/lockout leakage).
  SELECT count(*) INTO v_n FROM information_schema.parameters
    WHERE specific_name LIKE 'get_centre_guests%'
      AND parameter_mode = 'OUT'
      AND parameter_name IN ('id', 'name', 'budget_centre_id');
  IF v_n <> 3 THEN RAISE EXCEPTION 'FAIL: get_centre_guests OUT columns are not exactly (id,name,budget_centre_id) (got %)', v_n; END IF;

  -- (d) Source table present with the columns the filter touches.
  SELECT count(*) INTO v_n FROM information_schema.columns
    WHERE table_name = 'guest_users' AND column_name IN ('is_active', 'deleted_at', 'budget_centre_id');
  IF v_n <> 3 THEN RAISE EXCEPTION 'FAIL: guest_users missing is_active/deleted_at/budget_centre_id'; END IF;

  -- (e) anon and authenticated both hold EXECUTE.
  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
    WHERE routine_name = 'get_centre_guests' AND grantee IN ('anon', 'authenticated') AND privilege_type = 'EXECUTE';
  IF v_n < 2 THEN RAISE EXCEPTION 'FAIL: anon/authenticated lack EXECUTE on get_centre_guests (got %)', v_n; END IF;

  RAISE NOTICE 'get_centre_guests OK: (uuid) installed (SECURITY DEFINER, anon+authenticated EXECUTE, 3 non-sensitive OUT columns).';
END $$;

COMMIT;
