-- =============================================================================
-- rls_budget_categories.sql
--
-- SOURCE-OF-TRUTH ONLY — DO NOT RE-RUN unless rebuilding the database.
-- These 4 RLS policies ALREADY EXIST in production. They were created by hand in
-- the Supabase SQL Editor during early development and were never committed. The
-- definitions below were extracted verbatim from production via pg_policies on
-- 2026-06-05 so the repo holds the authoritative copy (migration prep + replay).
--
-- POLICIES (table: public.budget_categories, all PERMISSIVE, roles = public)
--   budget_categories_insert        INSERT  WITH CHECK is_budget_centre_member(budget_centre_id)
--   budget_categories_select_member SELECT  USING      is_budget_centre_member(budget_centre_id)
--   budget_categories_select_owner  SELECT  USING      is_budget_centre_owner(budget_centre_id)
--   budget_categories_update        UPDATE  USING      is_budget_centre_member(budget_centre_id)
--
-- Depends on is_budget_centre_member / is_budget_centre_owner (committed 9a92591) —
-- those helper functions MUST exist before these policies are created.
--
-- MIGRATION RISK IF LOST: data-isolation collapse — any user could read/write any
-- hub's budget categories.
-- =============================================================================
BEGIN;

ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_categories_insert ON public.budget_categories;
CREATE POLICY budget_categories_insert ON public.budget_categories
  FOR INSERT TO public
  WITH CHECK (is_budget_centre_member(budget_centre_id));

DROP POLICY IF EXISTS budget_categories_select_member ON public.budget_categories;
CREATE POLICY budget_categories_select_member ON public.budget_categories
  FOR SELECT TO public
  USING (is_budget_centre_member(budget_centre_id));

DROP POLICY IF EXISTS budget_categories_select_owner ON public.budget_categories;
CREATE POLICY budget_categories_select_owner ON public.budget_categories
  FOR SELECT TO public
  USING (is_budget_centre_owner(budget_centre_id));

DROP POLICY IF EXISTS budget_categories_update ON public.budget_categories;
CREATE POLICY budget_categories_update ON public.budget_categories
  FOR UPDATE TO public
  USING (is_budget_centre_member(budget_centre_id));

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
    WHERE nsp.nspname = 'public' AND c.relname = 'budget_categories' AND c.relrowsecurity IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: RLS not enabled on budget_categories'; END IF;

  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='budget_categories' AND policyname='budget_categories_insert'        AND cmd='INSERT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: budget_categories_insert (INSERT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='budget_categories' AND policyname='budget_categories_select_member' AND cmd='SELECT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: budget_categories_select_member (SELECT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='budget_categories' AND policyname='budget_categories_select_owner'  AND cmd='SELECT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: budget_categories_select_owner (SELECT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='budget_categories' AND policyname='budget_categories_update'        AND cmd='UPDATE';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: budget_categories_update (UPDATE) missing'; END IF;

  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='budget_categories';
  IF v_n <> 4 THEN RAISE EXCEPTION 'FAIL: expected 4 policies on budget_categories, found %', v_n; END IF;

  RAISE NOTICE 'rls_budget_categories OK: RLS enabled + 4 policies installed.';
END $$;

COMMIT;
