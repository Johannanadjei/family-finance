-- =============================================================================
-- rls_guest_users.sql
--
-- SOURCE-OF-TRUTH ONLY — DO NOT RE-RUN unless rebuilding the database.
-- These 3 RLS policies ALREADY EXIST in production. They were created by hand in
-- the Supabase SQL Editor during early development and were never committed. The
-- definitions below were extracted verbatim from production via pg_policies on
-- 2026-06-05 so the repo holds the authoritative copy (migration prep + replay).
--
-- POLICIES (table: public.guest_users, all PERMISSIVE, roles = public)
--   guest_users_insert  INSERT  WITH CHECK is_budget_centre_owner(budget_centre_id)
--   guest_users_select  SELECT  USING      is_budget_centre_owner(budget_centre_id)
--   guest_users_update  UPDATE  USING      is_budget_centre_owner(budget_centre_id)
--
-- Depends on is_budget_centre_owner (committed 9a92591) — that helper function
-- MUST exist before these policies are created.
--
-- NOTE: the anon guest portal does NOT read guest_users directly — it goes
-- through the SECURITY DEFINER RPCs get_centre_guests / authenticate_guest, which
-- bypass these policies. These policies gate the OWNER's direct table access.
--
-- MIGRATION RISK IF LOST: guest PIN hashes / lockout rows exposed across hubs.
-- =============================================================================
BEGIN;

ALTER TABLE public.guest_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS guest_users_insert ON public.guest_users;
CREATE POLICY guest_users_insert ON public.guest_users
  FOR INSERT TO public
  WITH CHECK (is_budget_centre_owner(budget_centre_id));

DROP POLICY IF EXISTS guest_users_select ON public.guest_users;
CREATE POLICY guest_users_select ON public.guest_users
  FOR SELECT TO public
  USING (is_budget_centre_owner(budget_centre_id));

DROP POLICY IF EXISTS guest_users_update ON public.guest_users;
CREATE POLICY guest_users_update ON public.guest_users
  FOR UPDATE TO public
  USING (is_budget_centre_owner(budget_centre_id));

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
    WHERE nsp.nspname = 'public' AND c.relname = 'guest_users' AND c.relrowsecurity IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: RLS not enabled on guest_users'; END IF;

  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='guest_users' AND policyname='guest_users_insert' AND cmd='INSERT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: guest_users_insert (INSERT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='guest_users' AND policyname='guest_users_select' AND cmd='SELECT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: guest_users_select (SELECT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='guest_users' AND policyname='guest_users_update' AND cmd='UPDATE';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: guest_users_update (UPDATE) missing'; END IF;

  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='guest_users';
  IF v_n <> 3 THEN RAISE EXCEPTION 'FAIL: expected 3 policies on guest_users, found %', v_n; END IF;

  RAISE NOTICE 'rls_guest_users OK: RLS enabled + 3 policies installed.';
END $$;

COMMIT;
