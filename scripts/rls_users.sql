-- =============================================================================
-- rls_users.sql
--
-- SOURCE-OF-TRUTH ONLY — DO NOT RE-RUN unless rebuilding the database.
-- These 4 RLS policies ALREADY EXIST in production. They were created by hand in
-- the Supabase SQL Editor during early development and were never committed. The
-- definitions below were extracted verbatim from production via pg_policies on
-- 2026-06-05 so the repo holds the authoritative copy (migration prep + replay).
--
-- POLICIES (table: public.users, all PERMISSIVE)
--   users_insert_own        INSERT  roles=public         WITH CHECK (id = auth.uid())
--   users_select_own        SELECT  roles=public         USING      (id = auth.uid())
--   users_update_own        UPDATE  roles=public         USING      (id = auth.uid())
--   users_select_hub_members SELECT roles=authenticated  USING      (see below)
--     → lets a signed-in user read the profile rows of people who share at least
--       one hub with them (the member list / attribution joins). NOTE the role is
--       'authenticated' (NOT public) — match the TO clause exactly on replay.
--
-- MIGRATION RISK IF LOST: PII (names, emails) on public.users would be visible
-- across hubs / to the wrong users, or self-access would break entirely.
-- =============================================================================
BEGIN;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_insert_own ON public.users;
CREATE POLICY users_insert_own ON public.users
  FOR INSERT TO public
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users
  FOR SELECT TO public
  USING (id = auth.uid());

DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users
  FOR UPDATE TO public
  USING (id = auth.uid());

-- Authenticated-only: read the profiles of users who share a hub with the caller.
DROP POLICY IF EXISTS users_select_hub_members ON public.users;
CREATE POLICY users_select_hub_members ON public.users
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM budget_centre_members me
        JOIN budget_centre_members them
          ON them.budget_centre_id = me.budget_centre_id
      WHERE me.user_id = auth.uid()
        AND me.deleted_at IS NULL
        AND them.user_id = users.id
        AND them.deleted_at IS NULL
    )
  );

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
    WHERE nsp.nspname = 'public' AND c.relname = 'users' AND c.relrowsecurity IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: RLS not enabled on users'; END IF;

  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='users' AND policyname='users_insert_own' AND cmd='INSERT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: users_insert_own (INSERT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='users' AND policyname='users_select_own' AND cmd='SELECT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: users_select_own (SELECT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='users' AND policyname='users_update_own' AND cmd='UPDATE';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: users_update_own (UPDATE) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='users' AND policyname='users_select_hub_members' AND cmd='SELECT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: users_select_hub_members (SELECT) missing'; END IF;

  -- Role check: hub_members must be authenticated-only, the other three public.
  SELECT count(*) INTO v_n FROM pg_policies
    WHERE schemaname='public' AND tablename='users' AND policyname='users_select_hub_members'
      AND roles = '{authenticated}';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: users_select_hub_members is not roles={authenticated}'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies
    WHERE schemaname='public' AND tablename='users'
      AND policyname IN ('users_insert_own','users_select_own','users_update_own')
      AND roles = '{public}';
  IF v_n <> 3 THEN RAISE EXCEPTION 'FAIL: the three self-scoped users policies are not all roles={public} (got %)', v_n; END IF;

  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='users';
  IF v_n <> 4 THEN RAISE EXCEPTION 'FAIL: expected 4 policies on users, found %', v_n; END IF;

  RAISE NOTICE 'rls_users OK: RLS enabled + 4 policies installed (3 public self-scoped + 1 authenticated hub-members).';
END $$;

COMMIT;
