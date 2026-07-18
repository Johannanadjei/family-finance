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
-- ── UPDATED 2026-07-16 (F1 RLS audit — WRITE-side fix) ───────────────────────
-- transactions_insert and transactions_update NO LONGER gate on bare
-- is_budget_centre_member() either. Applied to production as
-- migrate_24_transactions_write_gate.sql; this file has been updated to match, and
-- the "KNOWN GAP" note that used to sit here is GONE because the gap is closed.
--
-- The write side carries the SAME predicate as the read side, deliberately (see the
-- intentional-coupling comments on the policies below). Two things to preserve:
--
--   1. transactions_update now has an EXPLICIT WITH CHECK. It is NOT redundant with
--      USING. Given no WITH CHECK, Postgres falls back to the USING expression for
--      the row's NEW value — so a NULL with_check silently made the post-image rule
--      "membership only". That let a standard member transmute their own expense
--      into an income row (type='expense' passes USING; the post-image was never
--      re-checked) and rewrite income rows they could not read — a BLIND write, an
--      integrity compromise rather than a confidentiality one. Confirmed live
--      2026-07-16 before the fix: with_check was NULL.
--   2. Soft deletes are UPDATEs (there is no DELETE policy), so _update also governs
--      a standard member soft-deleting an income transaction. Intended.
--
-- POLICIES (table: public.transactions, all PERMISSIVE, roles = public)
--   transactions_insert        INSERT  WITH CHECK is_budget_centre_member(budget_centre_id)
--                                                 AND (type = 'expense'
--                                                      OR can_view_income(budget_centre_id))  ← F1 write
--   transactions_select_member SELECT  USING      is_budget_centre_member(budget_centre_id)
--                                                 AND (type = 'expense'
--                                                      OR can_view_income(budget_centre_id))  ← F1 read
--   transactions_select_owner  SELECT  USING      is_budget_centre_owner(budget_centre_id)
--   transactions_update        UPDATE  USING      is_budget_centre_member(budget_centre_id)
--                                                 AND (type = 'expense'
--                                                      OR can_view_income(budget_centre_id))  ← F1 write
--                                      WITH CHECK <same as USING>                             ← F1 write
--
-- Depends on is_budget_centre_member / is_budget_centre_owner (committed 9a92591)
-- AND on can_view_income (scripts/can_view_income.sql) — all three helper
-- functions MUST exist before these policies are created.
--
-- Filtering on `type` is safe: transactions_type_check is convalidated,
-- CHECK (type IN ('income','expense')) — a row is always exactly one of the two,
-- and any future third value would be DENIED to standard on both read and write
-- (fail-closed).
--
-- MIGRATION RISK IF LOST: data-isolation collapse on the core ledger — any user
-- could read/write any hub's transactions.
-- =============================================================================
BEGIN;

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- F1 write (2026-07-16): membership still required for ANY row (hub isolation
-- unchanged). On top of that: expense rows insertable by every member; income rows
-- require a role with viewIncome.
--
-- INTENTIONAL COUPLING — "log income" deliberately shares the "view income"
-- predicate with the SELECT policy below. One role rule governs read and write, so
-- they cannot drift into a state where a member writes what they cannot read. If
-- viewIncome's meaning ever splits from "may write income", this policy must get its
-- own helper — do NOT widen can_view_income() for a write case, as that silently
-- widens the read policies too.
DROP POLICY IF EXISTS transactions_insert ON public.transactions;
CREATE POLICY transactions_insert ON public.transactions
  FOR INSERT TO public
  WITH CHECK (
    is_budget_centre_member(budget_centre_id)
    AND (
      type = 'expense'
      OR can_view_income(budget_centre_id)
    )
  );

-- F1 read (2026-07-13): membership still required for ANY row (hub isolation unchanged).
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

-- F1 write (2026-07-16): same predicate on BOTH the pre-image (USING) and the
-- post-image (WITH CHECK). The WITH CHECK is load-bearing and NOT redundant —
-- without it Postgres reuses USING for the post-image, which let a standard member
-- flip an expense into an income row and made income-row UPDATEs blind writes.
--
-- INTENTIONAL COUPLING — as above: shared with the read side on purpose.
DROP POLICY IF EXISTS transactions_update ON public.transactions;
CREATE POLICY transactions_update ON public.transactions
  FOR UPDATE TO public
  USING (
    is_budget_centre_member(budget_centre_id)
    AND (
      type = 'expense'
      OR can_view_income(budget_centre_id)
    )
  )
  WITH CHECK (
    is_budget_centre_member(budget_centre_id)
    AND (
      type = 'expense'
      OR can_view_income(budget_centre_id)
    )
  );

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n     int;
  v_qual  text;
  v_check text;
BEGIN
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
    WHERE nsp.nspname = 'public' AND c.relname = 'transactions' AND c.relrowsecurity IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: RLS not enabled on transactions'; END IF;

  -- F1: the role-aware helper must exist, or the policies above could not have been created.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'can_view_income';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: can_view_income() missing — apply scripts/can_view_income.sql first'; END IF;

  -- F1 write: the `type` column is still constrained to the two values the policies assume.
  SELECT count(*) INTO v_n FROM pg_constraint
    WHERE conname = 'transactions_type_check' AND convalidated IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: transactions_type_check missing or not validated'; END IF;

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

  -- F1 read regression guard: a rebuild MUST keep all three clauses of _select_member.
  SELECT qual INTO v_qual FROM pg_policies
    WHERE schemaname='public' AND tablename='transactions' AND policyname='transactions_select_member';
  IF v_qual NOT LIKE '%is_budget_centre_member%' THEN RAISE EXCEPTION 'FAIL: transactions_select_member lost its membership gate — CROSS-HUB LEAK (qual: %)', v_qual; END IF;
  IF v_qual NOT LIKE '%can_view_income%'         THEN RAISE EXCEPTION 'FAIL: transactions_select_member has no role branch — F1 income leak REINTRODUCED (qual: %)', v_qual; END IF;
  IF v_qual NOT LIKE '%expense%'                 THEN RAISE EXCEPTION 'FAIL: transactions_select_member has no expense branch — standard members lose expense reads (qual: %)', v_qual; END IF;

  -- F1 write regression guard (INSERT): a rebuild MUST keep all three clauses.
  SELECT with_check INTO v_check FROM pg_policies
    WHERE schemaname='public' AND tablename='transactions' AND policyname='transactions_insert';
  IF v_check IS NULL                              THEN RAISE EXCEPTION 'FAIL: transactions_insert has no WITH CHECK — unrestricted INSERT'; END IF;
  IF v_check NOT LIKE '%is_budget_centre_member%' THEN RAISE EXCEPTION 'FAIL: transactions_insert lost its membership gate — CROSS-HUB WRITE (with_check: %)', v_check; END IF;
  IF v_check NOT LIKE '%can_view_income%'         THEN RAISE EXCEPTION 'FAIL: transactions_insert has no role branch — F1 write leak REINTRODUCED, standard members can forge income (with_check: %)', v_check; END IF;
  IF v_check NOT LIKE '%expense%'                 THEN RAISE EXCEPTION 'FAIL: transactions_insert has no expense branch — standard members lose expense writes (with_check: %)', v_check; END IF;

  -- F1 write regression guard (UPDATE): USING clauses.
  SELECT qual, with_check INTO v_qual, v_check FROM pg_policies
    WHERE schemaname='public' AND tablename='transactions' AND policyname='transactions_update';
  IF v_qual NOT LIKE '%is_budget_centre_member%' THEN RAISE EXCEPTION 'FAIL: transactions_update lost its membership gate — CROSS-HUB WRITE (qual: %)', v_qual; END IF;
  IF v_qual NOT LIKE '%can_view_income%'         THEN RAISE EXCEPTION 'FAIL: transactions_update has no role branch — F1 write leak REINTRODUCED, standard members can edit income rows (qual: %)', v_qual; END IF;
  IF v_qual NOT LIKE '%expense%'                 THEN RAISE EXCEPTION 'FAIL: transactions_update has no expense branch — standard members lose expense edits (qual: %)', v_qual; END IF;

  -- F1 write regression guard (UPDATE): the post-image check. Asserted NON-NULL on
  -- its own and BEFORE any text match — a NULL with_check is not "no rule", Postgres
  -- falls back to USING for the post-image, and `NOT LIKE` against NULL yields NULL
  -- rather than true, so a text-only guard would pass while the blind-write path is
  -- open. This is the exact hole migrate_24 closed; a rebuild must not reopen it.
  IF v_check IS NULL THEN
    RAISE EXCEPTION 'FAIL: transactions_update has NULL with_check — the BLIND-WRITE path is REINTRODUCED. Postgres falls back to USING for the post-image, letting a standard member transmute an expense into an income row and rewrite rows they cannot read.';
  END IF;
  IF v_check NOT LIKE '%is_budget_centre_member%' THEN RAISE EXCEPTION 'FAIL: transactions_update WITH CHECK lost its membership gate — a row can be moved into a foreign hub (with_check: %)', v_check; END IF;
  IF v_check NOT LIKE '%can_view_income%'         THEN RAISE EXCEPTION 'FAIL: transactions_update WITH CHECK has no role branch — expense can be transmuted into income (with_check: %)', v_check; END IF;
  IF v_check NOT LIKE '%expense%'                 THEN RAISE EXCEPTION 'FAIL: transactions_update WITH CHECK has no expense branch — standard members lose expense edits (with_check: %)', v_check; END IF;

  RAISE NOTICE 'rls_transactions OK: RLS enabled + 4 policies installed (SELECT and both writes row-aware, F1 read + write).';
END $$;

COMMIT;
