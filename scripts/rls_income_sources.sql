-- =============================================================================
-- rls_income_sources.sql
--
-- SOURCE-OF-TRUTH ONLY — DO NOT RE-RUN unless rebuilding the database.
-- These 4 RLS policies ALREADY EXIST in production. They were created by hand in
-- the Supabase SQL Editor during early development and were never committed. The
-- definitions below were extracted verbatim from production via pg_policies on
-- 2026-06-05 so the repo holds the authoritative copy (migration prep + replay).
--
-- ── UPDATED 2026-07-13 (F1 RLS audit — read-side fix) ────────────────────────
-- income_sources_select_member NO LONGER gates on is_budget_centre_member().
-- It now gates on can_view_income(), applied to production as
-- migrate_22_income_sources_role_gate.sql. This file has been updated to match.
--
-- DO NOT revert _select_member to is_budget_centre_member(): that helper checks
-- MEMBERSHIP ONLY, with no role check, which let `standard` members read every
-- income source in their hub over direct REST. Proven empirically 2026-07-12
-- (a live standard session read back `salary / 5000 GHS`) and re-proven closed
-- 2026-07-13 (same session now reads []). A repo rebuild from the OLD definition
-- would silently reintroduce that leak.
--
-- POLICIES (table: public.income_sources, all PERMISSIVE, roles = public)
--   income_sources_insert        INSERT  WITH CHECK is_budget_centre_member(budget_centre_id)
--   income_sources_select_member SELECT  USING      can_view_income(budget_centre_id)   ← F1
--   income_sources_select_owner  SELECT  USING      is_budget_centre_owner(budget_centre_id)
--   income_sources_update        UPDATE  USING      is_budget_centre_member(budget_centre_id)
--
-- Depends on is_budget_centre_member / is_budget_centre_owner (committed 9a92591)
-- AND on can_view_income (scripts/can_view_income.sql) — all three helper
-- functions MUST exist before these policies are created.
--
-- MIGRATION RISK IF LOST: data-isolation collapse on financial data — any user
-- could read/write any hub's income sources.
--
-- KNOWN GAP (tracked, NOT fixed here): _insert and _update still gate on bare
-- is_budget_centre_member(), so a `standard` member can still WRITE an income
-- source they can no longer read back. F1 was a READ-side fix; the write side is
-- a separate open finding.
-- =============================================================================
BEGIN;

ALTER TABLE public.income_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS income_sources_insert ON public.income_sources;
CREATE POLICY income_sources_insert ON public.income_sources
  FOR INSERT TO public
  WITH CHECK (is_budget_centre_member(budget_centre_id));

-- F1 (2026-07-13): role-aware — owner + full_access only; `standard` is denied.
-- can_view_income() implies membership, so this is strictly narrower than the
-- membership-only predicate it replaced.
DROP POLICY IF EXISTS income_sources_select_member ON public.income_sources;
CREATE POLICY income_sources_select_member ON public.income_sources
  FOR SELECT TO public
  USING (can_view_income(budget_centre_id));

DROP POLICY IF EXISTS income_sources_select_owner ON public.income_sources;
CREATE POLICY income_sources_select_owner ON public.income_sources
  FOR SELECT TO public
  USING (is_budget_centre_owner(budget_centre_id));

DROP POLICY IF EXISTS income_sources_update ON public.income_sources;
CREATE POLICY income_sources_update ON public.income_sources
  FOR UPDATE TO public
  USING (is_budget_centre_member(budget_centre_id));

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n    int;
  v_qual text;
BEGIN
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
    WHERE nsp.nspname = 'public' AND c.relname = 'income_sources' AND c.relrowsecurity IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: RLS not enabled on income_sources'; END IF;

  -- F1: the role-aware helper must exist, or _select_member above could not have been created.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'can_view_income';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: can_view_income() missing — apply scripts/can_view_income.sql first'; END IF;

  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='income_sources' AND policyname='income_sources_insert'        AND cmd='INSERT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: income_sources_insert (INSERT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='income_sources' AND policyname='income_sources_select_member' AND cmd='SELECT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: income_sources_select_member (SELECT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='income_sources' AND policyname='income_sources_select_owner'  AND cmd='SELECT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: income_sources_select_owner (SELECT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='income_sources' AND policyname='income_sources_update'        AND cmd='UPDATE';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: income_sources_update (UPDATE) missing'; END IF;

  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='income_sources';
  IF v_n <> 4 THEN RAISE EXCEPTION 'FAIL: expected 4 policies on income_sources, found %', v_n; END IF;

  -- F1 regression guard: a rebuild MUST NOT leave _select_member membership-only.
  SELECT qual INTO v_qual FROM pg_policies
    WHERE schemaname='public' AND tablename='income_sources' AND policyname='income_sources_select_member';
  IF v_qual NOT LIKE '%can_view_income%'     THEN RAISE EXCEPTION 'FAIL: income_sources_select_member does not gate on can_view_income — F1 income leak REINTRODUCED (qual: %)', v_qual; END IF;
  IF v_qual LIKE '%is_budget_centre_member%' THEN RAISE EXCEPTION 'FAIL: income_sources_select_member STILL gates on is_budget_centre_member — F1 income leak REINTRODUCED (qual: %)', v_qual; END IF;

  RAISE NOTICE 'rls_income_sources OK: RLS enabled + 4 policies installed (SELECT is role-aware, F1).';
END $$;

COMMIT;
