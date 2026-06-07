-- =============================================================================
-- rls_user_preferences.sql
--
-- SOURCE-OF-TRUTH ONLY — DO NOT RE-RUN unless rebuilding the database.
-- These 3 RLS policies ALREADY EXIST in production. They were created by hand in
-- the Supabase SQL Editor during early development and were never committed. The
-- definitions below were extracted verbatim from production via pg_policies on
-- 2026-06-05 so the repo holds the authoritative copy (migration prep + replay).
--
-- POLICIES (table: public.user_preferences, all PERMISSIVE, roles = public)
--   user_preferences_insert  INSERT  WITH CHECK (user_id = auth.uid())
--   user_preferences_select  SELECT  USING      (user_id = auth.uid())
--   user_preferences_update  UPDATE  USING      (user_id = auth.uid())
--
-- Self-scoped (no helper functions) — each user sees only their own row.
--
-- MIGRATION RISK IF LOST: one user's UI prefs visible/writable by others.
-- =============================================================================
BEGIN;

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_preferences_insert ON public.user_preferences;
CREATE POLICY user_preferences_insert ON public.user_preferences
  FOR INSERT TO public
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_preferences_select ON public.user_preferences;
CREATE POLICY user_preferences_select ON public.user_preferences
  FOR SELECT TO public
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_preferences_update ON public.user_preferences;
CREATE POLICY user_preferences_update ON public.user_preferences
  FOR UPDATE TO public
  USING (user_id = auth.uid());

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
    WHERE nsp.nspname = 'public' AND c.relname = 'user_preferences' AND c.relrowsecurity IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: RLS not enabled on user_preferences'; END IF;

  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='user_preferences' AND policyname='user_preferences_insert' AND cmd='INSERT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: user_preferences_insert (INSERT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='user_preferences' AND policyname='user_preferences_select' AND cmd='SELECT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: user_preferences_select (SELECT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='user_preferences' AND policyname='user_preferences_update' AND cmd='UPDATE';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: user_preferences_update (UPDATE) missing'; END IF;

  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='user_preferences';
  IF v_n <> 3 THEN RAISE EXCEPTION 'FAIL: expected 3 policies on user_preferences, found %', v_n; END IF;

  RAISE NOTICE 'rls_user_preferences OK: RLS enabled + 3 policies installed.';
END $$;

COMMIT;
