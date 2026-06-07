-- =============================================================================
-- rls_transactions.sql
--
-- SOURCE-OF-TRUTH ONLY — DO NOT RE-RUN unless rebuilding the database.
-- These 4 RLS policies ALREADY EXIST in production. They were created by hand in
-- the Supabase SQL Editor during early development and were never committed. The
-- definitions below were extracted verbatim from production via pg_policies on
-- 2026-06-05 so the repo holds the authoritative copy (migration prep + replay).
--
-- POLICIES (table: public.transactions, all PERMISSIVE, roles = public)
--   transactions_insert        INSERT  WITH CHECK is_budget_centre_member(budget_centre_id)
--   transactions_select_member SELECT  USING      is_budget_centre_member(budget_centre_id)
--   transactions_select_owner  SELECT  USING      is_budget_centre_owner(budget_centre_id)
--   transactions_update        UPDATE  USING      is_budget_centre_member(budget_centre_id)
--
-- Depends on is_budget_centre_member / is_budget_centre_owner (committed 9a92591) —
-- those helper functions MUST exist before these policies are created.
--
-- MIGRATION RISK IF LOST: data-isolation collapse on the core ledger — any user
-- could read/write any hub's transactions.
-- =============================================================================
BEGIN;

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transactions_insert ON public.transactions;
CREATE POLICY transactions_insert ON public.transactions
  FOR INSERT TO public
  WITH CHECK (is_budget_centre_member(budget_centre_id));

DROP POLICY IF EXISTS transactions_select_member ON public.transactions;
CREATE POLICY transactions_select_member ON public.transactions
  FOR SELECT TO public
  USING (is_budget_centre_member(budget_centre_id));

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
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
    WHERE nsp.nspname = 'public' AND c.relname = 'transactions' AND c.relrowsecurity IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: RLS not enabled on transactions'; END IF;

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

  RAISE NOTICE 'rls_transactions OK: RLS enabled + 4 policies installed.';
END $$;

COMMIT;
