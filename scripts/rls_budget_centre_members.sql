-- =============================================================================
-- rls_budget_centre_members.sql
--
-- SOURCE-OF-TRUTH ONLY — DO NOT RE-RUN unless rebuilding the database.
-- These 4 RLS policies ALREADY EXIST in production. They were created by hand in
-- the Supabase SQL Editor during early development and were never committed. The
-- definitions below were extracted verbatim from production via pg_policies on
-- 2026-06-05 so the repo holds the authoritative copy (migration prep + replay).
--
-- POLICIES (table: public.budget_centre_members, all PERMISSIVE, roles = public)
--   budget_centre_members_insert        INSERT  WITH CHECK is_budget_centre_owner(budget_centre_id)
--   budget_centre_members_select        SELECT  USING      is_budget_centre_member(budget_centre_id)
--   budget_centre_members_select_owner  SELECT  USING      is_budget_centre_owner(budget_centre_id)
--   budget_centre_members_update        UPDATE  USING      is_budget_centre_owner(budget_centre_id)
--
-- Depends on is_budget_centre_member / is_budget_centre_owner (committed 9a92591) —
-- those helper functions MUST exist before these policies are created.
--
-- MIGRATION RISK IF LOST: security gap on the membership table itself — the table
-- the is_budget_centre_member helper reads to gate every other table. Without
-- these, hub membership (who can join / see / modify members) is unguarded.
-- =============================================================================
BEGIN;

ALTER TABLE public.budget_centre_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_centre_members_insert ON public.budget_centre_members;
CREATE POLICY budget_centre_members_insert ON public.budget_centre_members
  FOR INSERT TO public
  WITH CHECK (is_budget_centre_owner(budget_centre_id));

DROP POLICY IF EXISTS budget_centre_members_select ON public.budget_centre_members;
CREATE POLICY budget_centre_members_select ON public.budget_centre_members
  FOR SELECT TO public
  USING (is_budget_centre_member(budget_centre_id));

DROP POLICY IF EXISTS budget_centre_members_select_owner ON public.budget_centre_members;
CREATE POLICY budget_centre_members_select_owner ON public.budget_centre_members
  FOR SELECT TO public
  USING (is_budget_centre_owner(budget_centre_id));

DROP POLICY IF EXISTS budget_centre_members_update ON public.budget_centre_members;
CREATE POLICY budget_centre_members_update ON public.budget_centre_members
  FOR UPDATE TO public
  USING (is_budget_centre_owner(budget_centre_id));

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
    WHERE nsp.nspname = 'public' AND c.relname = 'budget_centre_members' AND c.relrowsecurity IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: RLS not enabled on budget_centre_members'; END IF;

  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='budget_centre_members' AND policyname='budget_centre_members_insert'       AND cmd='INSERT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: budget_centre_members_insert (INSERT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='budget_centre_members' AND policyname='budget_centre_members_select'       AND cmd='SELECT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: budget_centre_members_select (SELECT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='budget_centre_members' AND policyname='budget_centre_members_select_owner' AND cmd='SELECT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: budget_centre_members_select_owner (SELECT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='budget_centre_members' AND policyname='budget_centre_members_update'       AND cmd='UPDATE';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: budget_centre_members_update (UPDATE) missing'; END IF;

  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='budget_centre_members';
  IF v_n <> 4 THEN RAISE EXCEPTION 'FAIL: expected 4 policies on budget_centre_members, found %', v_n; END IF;

  RAISE NOTICE 'rls_budget_centre_members OK: RLS enabled + 4 policies installed.';
END $$;

COMMIT;
