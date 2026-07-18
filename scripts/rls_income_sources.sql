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
-- ── UPDATED 2026-07-16 (F1 RLS audit — WRITE-side fix) ───────────────────────
-- income_sources_insert and income_sources_update NO LONGER gate on bare
-- is_budget_centre_member() either. Applied to production as
-- migrate_25_income_sources_write_gate.sql; this file has been updated to match, and
-- the "KNOWN GAP" note that used to sit here is GONE because the gap is closed.
--
-- income_sources is ENTIRELY income — there is no legitimate standard-member write
-- to it at all, so both write policies take the same whole-table role gate as the
-- read side, deliberately (see the intentional-coupling comments below). Three
-- things to preserve:
--
--   1. can_view_income() IMPLIES membership (it requires an active, non-deleted
--      member row AND role IN ('owner','full_access')), so these policies are
--      strictly NARROWER than the membership-only ones they replaced — they can only
--      remove access, never add it. Hub isolation is preserved without a separate
--      is_budget_centre_member gate. (rls_transactions.sql differs: it keeps an
--      explicit membership gate because its type='expense' branch must not be
--      reachable across hubs.)
--   2. income_sources_update now has an EXPLICIT WITH CHECK. It is NOT redundant
--      with USING. Given no WITH CHECK, Postgres falls back to the USING expression
--      for the row's NEW value — so a NULL with_check silently made the post-image
--      rule "membership only". A standard member could PATCH every source in the hub
--      (rewrite amount, flip received, retitle, soft-delete) without being able to
--      read the rows they were overwriting — a BLIND write, an integrity compromise
--      rather than a confidentiality one, and reachable against every row in the
--      table. Confirmed live 2026-07-16 before the fix: with_check was NULL.
--   3. Soft deletes are UPDATEs (there is no DELETE policy), so _update also governs
--      a standard member soft-deleting an income source. Intended.
--
-- DO NOT drop the write policies instead of narrowing them: `full_access` members
-- are not the hub creator and are covered by no owner policy, yet legitimately
-- manage income. Dropping would lock them out — same reasoning as the read side.
--
-- POLICIES (table: public.income_sources, all PERMISSIVE, roles = public)
--   income_sources_insert        INSERT  WITH CHECK can_view_income(budget_centre_id)   ← F1 write
--   income_sources_select_member SELECT  USING      can_view_income(budget_centre_id)   ← F1 read
--   income_sources_select_owner  SELECT  USING      is_budget_centre_owner(budget_centre_id)
--   income_sources_update        UPDATE  USING      can_view_income(budget_centre_id)   ← F1 write
--                                        WITH CHECK can_view_income(budget_centre_id)   ← F1 write
--
-- Depends on is_budget_centre_member / is_budget_centre_owner (committed 9a92591)
-- AND on can_view_income (scripts/can_view_income.sql) — the helpers MUST exist
-- before these policies are created. (is_budget_centre_member is no longer
-- referenced by this file's policies, but remains a prerequisite of the wider
-- rls_*.sql overlay.)
--
-- MIGRATION RISK IF LOST: data-isolation collapse on financial data — any user
-- could read/write any hub's income sources.
-- =============================================================================
BEGIN;

ALTER TABLE public.income_sources ENABLE ROW LEVEL SECURITY;

-- F1 write (2026-07-16): role-aware — owner + full_access only; `standard` denied.
-- Whole-table gate, no row branch: every row in income_sources IS income.
--
-- INTENTIONAL COUPLING — "log income" deliberately shares the "view income"
-- predicate with the SELECT policy below. One role rule governs read and write, so
-- they cannot drift into a state where a member writes what they cannot read. If
-- viewIncome's meaning ever splits from "may write income", this policy must get its
-- own helper — do NOT widen can_view_income() for a write case, as that silently
-- widens the read policies too.
DROP POLICY IF EXISTS income_sources_insert ON public.income_sources;
CREATE POLICY income_sources_insert ON public.income_sources
  FOR INSERT TO public
  WITH CHECK (can_view_income(budget_centre_id));

-- F1 read (2026-07-13): role-aware — owner + full_access only; `standard` is denied.
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

-- F1 write (2026-07-16): same predicate on BOTH the pre-image (USING) and the
-- post-image (WITH CHECK). USING closes the blind PATCH of existing sources; WITH
-- CHECK stops a source being moved into a hub where the caller lacks the role, and
-- is load-bearing rather than redundant — without it the post-image rule silently
-- falls back to USING, which is the hole itself.
--
-- INTENTIONAL COUPLING — as above: shared with the read side on purpose.
DROP POLICY IF EXISTS income_sources_update ON public.income_sources;
CREATE POLICY income_sources_update ON public.income_sources
  FOR UPDATE TO public
  USING (can_view_income(budget_centre_id))
  WITH CHECK (can_view_income(budget_centre_id));

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n     int;
  v_qual  text;
  v_check text;
BEGIN
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
    WHERE nsp.nspname = 'public' AND c.relname = 'income_sources' AND c.relrowsecurity IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: RLS not enabled on income_sources'; END IF;

  -- F1: the role-aware helper must exist, or the policies above could not have been created.
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

  -- F1 read regression guard: a rebuild MUST NOT leave _select_member membership-only.
  SELECT qual INTO v_qual FROM pg_policies
    WHERE schemaname='public' AND tablename='income_sources' AND policyname='income_sources_select_member';
  IF v_qual NOT LIKE '%can_view_income%'     THEN RAISE EXCEPTION 'FAIL: income_sources_select_member does not gate on can_view_income — F1 income leak REINTRODUCED (qual: %)', v_qual; END IF;
  IF v_qual LIKE '%is_budget_centre_member%' THEN RAISE EXCEPTION 'FAIL: income_sources_select_member STILL gates on is_budget_centre_member — F1 income leak REINTRODUCED (qual: %)', v_qual; END IF;

  -- F1 write regression guard (INSERT): must be role-gated, not membership-gated.
  SELECT with_check INTO v_check FROM pg_policies
    WHERE schemaname='public' AND tablename='income_sources' AND policyname='income_sources_insert';
  IF v_check IS NULL                          THEN RAISE EXCEPTION 'FAIL: income_sources_insert has no WITH CHECK — unrestricted INSERT'; END IF;
  IF v_check NOT LIKE '%can_view_income%'     THEN RAISE EXCEPTION 'FAIL: income_sources_insert does not gate on can_view_income — F1 write leak REINTRODUCED, standard members can forge income sources (with_check: %)', v_check; END IF;
  IF v_check LIKE '%is_budget_centre_member%' THEN RAISE EXCEPTION 'FAIL: income_sources_insert STILL references is_budget_centre_member — membership-only write, F1 write leak REINTRODUCED (with_check: %)', v_check; END IF;

  -- F1 write regression guard (UPDATE): USING clause.
  SELECT qual, with_check INTO v_qual, v_check FROM pg_policies
    WHERE schemaname='public' AND tablename='income_sources' AND policyname='income_sources_update';
  IF v_qual NOT LIKE '%can_view_income%'     THEN RAISE EXCEPTION 'FAIL: income_sources_update USING does not gate on can_view_income — F1 write leak REINTRODUCED, standard members can PATCH every source (qual: %)', v_qual; END IF;
  IF v_qual LIKE '%is_budget_centre_member%' THEN RAISE EXCEPTION 'FAIL: income_sources_update STILL references is_budget_centre_member — membership-only write, the blind PATCH is REINTRODUCED (qual: %)', v_qual; END IF;

  -- F1 write regression guard (UPDATE): the post-image check. Asserted NON-NULL on
  -- its own and BEFORE any text match — a NULL with_check is not "no rule", Postgres
  -- falls back to USING for the post-image, and `NOT LIKE` against NULL yields NULL
  -- rather than true, so a text-only guard would pass while the blind-write path is
  -- open. This is the exact hole migrate_25 closed; a rebuild must not reopen it.
  IF v_check IS NULL THEN
    RAISE EXCEPTION 'FAIL: income_sources_update has NULL with_check — the BLIND-WRITE path is REINTRODUCED. Postgres falls back to USING for the post-image, so the row a member is allowed to write is not checked against the role rule.';
  END IF;
  IF v_check NOT LIKE '%can_view_income%'     THEN RAISE EXCEPTION 'FAIL: income_sources_update WITH CHECK does not gate on can_view_income — a source can be written into a hub the caller lacks the role for (with_check: %)', v_check; END IF;
  IF v_check LIKE '%is_budget_centre_member%' THEN RAISE EXCEPTION 'FAIL: income_sources_update WITH CHECK STILL references is_budget_centre_member — membership-only post-image check (with_check: %)', v_check; END IF;

  RAISE NOTICE 'rls_income_sources OK: RLS enabled + 4 policies installed (SELECT and both writes role-aware, F1 read + write).';
END $$;

COMMIT;
