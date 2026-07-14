-- =============================================================================
-- rls_transactions.sql
--
-- SOURCE-OF-TRUTH ONLY — DO NOT RE-RUN unless rebuilding the database.
-- These 4 RLS policies ALREADY EXIST in production. They were created by hand in
-- the Supabase SQL Editor during early development and were never committed. The
-- definitions below were extracted verbatim from production via pg_policies on
-- 2026-06-05 so the repo holds the authoritative copy (migration prep + replay).
--
-- ── UPDATED 2026-07-13 (F1 RLS audit — read-side fix) ────────────────────────
-- transactions_select_member NO LONGER gates on bare is_budget_centre_member().
-- It is now a ROW-LEVEL filter, applied to production as
-- migrate_23_transactions_income_row_gate.sql. This file has been updated to match.
--
-- Unlike income_sources (whole table = income), `transactions` is a MIXED table:
-- standard members legitimately read their own expenses — it is the core thing
-- their role exists to do. So the policy keeps the membership gate (hub isolation)
-- and adds a row branch: expense rows readable by every member; income rows require
-- a role with viewIncome. All three clauses are load-bearing —
--   • drop is_budget_centre_member → CROSS-HUB LEAK
--   • drop the expense branch      → standard members lose expense reads (regression)
--   • drop can_view_income         → the F1 income leak is back
--
-- Proven empirically: 2026-07-12 a live `standard` session read back the full
-- 5000 GHS income transaction; 2026-07-13 the same session reads ONLY the expense
-- row, while the owner still reads both. A rebuild from the OLD definition would
-- silently reintroduce the leak.
--
-- POLICIES (table: public.transactions, all PERMISSIVE, roles = public)
--   transactions_insert        INSERT  WITH CHECK is_budget_centre_member(budget_centre_id)
--   transactions_select_member SELECT  USING      is_budget_centre_member(budget_centre_id)
--                                                 AND (type = 'expense'
--                                                      OR can_view_income(budget_centre_id))  ← F1
--   transactions_select_owner  SELECT  USING      is_budget_centre_owner(budget_centre_id)
--   transactions_update        UPDATE  USING      is_budget_centre_member(budget_centre_id)
--
-- Depends on is_budget_centre_member / is_budget_centre_owner (committed 9a92591)
-- AND on can_view_income (scripts/can_view_income.sql) — all three helper
-- functions MUST exist before these policies are created.
--
-- Filtering on `type` is safe: transactions_type_check is convalidated,
-- CHECK (type IN ('income','expense')) — a row is always exactly one of the two,
-- and any future third value would be DENIED to standard (fail-closed).
--
-- MIGRATION RISK IF LOST: data-isolation collapse on the core ledger — any user
-- could read/write any hub's transactions.
--
-- KNOWN GAP (tracked, NOT fixed here): _insert and _update still gate on bare
-- is_budget_centre_member(), so a `standard` member can still WRITE an income
-- transaction they can no longer read back. F1 was a READ-side fix; the write side
-- is a separate open finding.
-- =============================================================================
BEGIN;

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transactions_insert ON public.transactions;
CREATE POLICY transactions_insert ON public.transactions
  FOR INSERT TO public
  WITH CHECK (is_budget_centre_member(budget_centre_id));

-- F1 (2026-07-13): membership still required for ANY row (hub isolation unchanged).
-- On top of that: expense rows readable by every member; income rows require a role
-- with viewIncome — the DB mirror of roles.js PERMISSIONS.
DROP POLICY IF EXISTS transactions_select_member ON public.transactions;
CREATE POLICY transactions_select_member ON public.transactions
  FOR SELECT TO public
  USING (
    is_budget_centre_member(budget_centre_id)
    AND (
      type = 'expense'
      OR can_view_income(budget_centre_id)
    )
  );

DROP POLICY IF EXISTS transactions_select_owner ON public.transactions;
CREATE POLICY transactions_select_owner ON public.transactions
  FOR SELECT TO public
  USING (is_budget_centre_owner(budget_centre_id));

DROP POLICY IF EXISTS transactions_update ON public.transactions;
CREATE POLICY transactions_update ON public.transactions
  FOR UPDATE TO public
  USING (is_budget_centre_member(budget_centre_id));

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n    int;
  v_qual text;
BEGIN
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
    WHERE nsp.nspname = 'public' AND c.relname = 'transactions' AND c.relrowsecurity IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: RLS not enabled on transactions'; END IF;

  -- F1: the role-aware helper must exist, or _select_member above could not have been created.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'can_view_income';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: can_view_income() missing — apply scripts/can_view_income.sql first'; END IF;

  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='transactions' AND policyname='transactions_insert'        AND cmd='INSERT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: transactions_insert (INSERT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='transactions' AND policyname='transactions_select_member' AND cmd='SELECT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: transactions_select_member (SELECT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='transactions' AND policyname='transactions_select_owner'  AND cmd='SELECT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: transactions_select_owner (SELECT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='transactions' AND policyname='transactions_update'        AND cmd='UPDATE';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: transactions_update (UPDATE) missing'; END IF;

  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='transactions';
  IF v_n <> 4 THEN RAISE EXCEPTION 'FAIL: expected 4 policies on transactions, found %', v_n; END IF;

  -- F1 regression guard: a rebuild MUST keep all three clauses of _select_member.
  SELECT qual INTO v_qual FROM pg_policies
    WHERE schemaname='public' AND tablename='transactions' AND policyname='transactions_select_member';
  IF v_qual NOT LIKE '%is_budget_centre_member%' THEN RAISE EXCEPTION 'FAIL: transactions_select_member lost its membership gate — CROSS-HUB LEAK (qual: %)', v_qual; END IF;
  IF v_qual NOT LIKE '%can_view_income%'         THEN RAISE EXCEPTION 'FAIL: transactions_select_member has no role branch — F1 income leak REINTRODUCED (qual: %)', v_qual; END IF;
  IF v_qual NOT LIKE '%expense%'                 THEN RAISE EXCEPTION 'FAIL: transactions_select_member has no expense branch — standard members lose expense reads (qual: %)', v_qual; END IF;

  RAISE NOTICE 'rls_transactions OK: RLS enabled + 4 policies installed (SELECT is row-aware, F1).';
END $$;

COMMIT;
