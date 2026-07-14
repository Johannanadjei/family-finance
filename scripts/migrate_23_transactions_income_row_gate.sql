-- =============================================================================
-- migrate_23_transactions_income_row_gate.sql   (F1 RLS audit — Migration B)
--
-- FIXES: `standard` members can read income-type transactions over direct REST.
--
-- PREREQUISITE: can_view_income.sql MUST be applied first.
-- ORDER:        apply AFTER migrate_22 (same audit, same client companion fix).
--
-- ── THE BUG ──────────────────────────────────────────────────────────────────
-- transactions_select_member gated SELECT on is_budget_centre_member() — membership
-- only, no role check. Standard members could read every transaction in the hub,
-- including type='income' rows (which markReceived writes on every payday confirm).
--
-- Proven empirically 2026-07-12 against a live standard-member session
-- (stage1-fixture-mem-cap-member, hub 0d3ccc2e-…): the standard member read back the
-- full income transaction (amount 5000 GHS, category "Salary"), identical to the owner.
--
-- ── WHY THIS IS A ROW-LEVEL FILTER, NOT A TABLE-LEVEL GATE ───────────────────
-- Unlike income_sources (whole table = income), `transactions` is a MIXED table:
-- standard members legitimately read AND write their own expenses — it is the core
-- thing their role exists to do. So this policy cannot deny the table; it must deny
-- the income ROWS and leave expense rows fully readable.
--
-- SAFE TO FILTER ON `type` — verified before writing this migration:
--   • 374 rows, 0 nulls, 0 values outside ('income','expense')
--   • transactions_type_check is convalidated=true, CHECK (type IN ('income','expense'))
-- A row is therefore always exactly one of the two; there is no third state that
-- could slip through the OR below.
--
-- ── PERMISSIVE OR ────────────────────────────────────────────────────────────
-- transactions_select_owner (creator, via budget_centres.owner_id) is left UNTOUCHED
-- and independently grants the creator every row — correct, and the reason this
-- policy does not need an owner branch of its own. full_access is NOT the creator,
-- so it reaches income rows through can_view_income() below.
--
-- ROLLBACK: restore the old definition with
--   CREATE OR REPLACE ... USING (is_budget_centre_member(budget_centre_id));
-- (the pre-migration text is preserved in rls_transactions.sql).
--
-- ── APPLIED TO PRODUCTION 2026-07-13 ─────────────────────────────────────────
-- Ran in the Supabase SQL editor: "Success, no rows returned" — all assertions
-- passed. Verified empirically the same day against live fixture sessions:
--   standard  income_sources 0 | tx income 0 | tx expense 1 (UNMOVED) | tx ALL 1
--   owner     income_sources 1 | tx income 1 | tx expense 1           | tx ALL 2
-- The standard session now reads ONLY the 250 expense row; the 5000 income row is
-- gone. The owner control still reads both. F1 read-side leak: CLOSED.
-- =============================================================================
BEGIN;

-- Membership still required for ANY row (unchanged isolation between hubs).
-- On top of that: expense rows are readable by every member; income rows require
-- a role with viewIncome — the DB mirror of roles.js PERMISSIONS.
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

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n    int;
  v_qual text;
BEGIN
  -- (a) The helper this policy depends on exists.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'can_view_income';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: can_view_income() missing — apply can_view_income.sql first'; END IF;

  -- (b) The `type` column is still constrained to the two values this policy assumes.
  --     If a third type is ever added, an unclassified row would be readable by
  --     standard members only if it is literally 'expense' — but a NULL or new value
  --     would be DENIED, which is fail-closed and safe. We assert anyway so the
  --     assumption is loud rather than implicit.
  SELECT count(*) INTO v_n FROM pg_constraint
    WHERE conname = 'transactions_type_check' AND convalidated IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: transactions_type_check missing or not validated'; END IF;

  -- (c) The policy exists and carries BOTH the membership gate and the type/role branch.
  SELECT qual INTO v_qual FROM pg_policies
    WHERE schemaname='public' AND tablename='transactions' AND policyname='transactions_select_member';
  IF v_qual IS NULL                            THEN RAISE EXCEPTION 'FAIL: transactions_select_member missing'; END IF;
  IF v_qual NOT LIKE '%is_budget_centre_member%' THEN RAISE EXCEPTION 'FAIL: transactions_select_member lost its membership gate — CROSS-HUB LEAK (qual: %)', v_qual; END IF;
  IF v_qual NOT LIKE '%can_view_income%'         THEN RAISE EXCEPTION 'FAIL: transactions_select_member has no role branch — income leak still open (qual: %)', v_qual; END IF;
  IF v_qual NOT LIKE '%expense%'                 THEN RAISE EXCEPTION 'FAIL: transactions_select_member has no expense branch — standard members would lose expense reads (qual: %)', v_qual; END IF;

  -- (d) No OTHER permissive SELECT policy grants membership-only read back.
  --     _select_owner is expected (creator-scoped, correct). Anything else gating on
  --     bare is_budget_centre_member would re-open the income leak via the permissive OR.
  SELECT count(*) INTO v_n FROM pg_policies
    WHERE schemaname='public' AND tablename='transactions' AND cmd='SELECT'
      AND permissive = 'PERMISSIVE'
      AND policyname NOT IN ('transactions_select_member', 'transactions_select_owner')
      AND qual LIKE '%is_budget_centre_member%';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: % other permissive SELECT policy/policies still grant membership-only read — leak remains open', v_n; END IF;

  -- (e) Policy count unchanged at 4.
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='transactions';
  IF v_n <> 4 THEN RAISE EXCEPTION 'FAIL: expected 4 policies on transactions, found %', v_n; END IF;

  RAISE NOTICE 'migrate_23 OK: transactions SELECT is row-aware — expense readable by all members; income requires owner/full_access.';
END $$;

COMMIT;

-- ── AFTER APPLYING: update the source-of-truth replay file ───────────────────
-- rls_transactions.sql documented the OLD membership-only definition; a database
-- rebuilt from it would silently reintroduce the leak.
-- DONE 2026-07-13 — rls_transactions.sql now matches this migration and carries
-- self-verify assertions for all three load-bearing clauses (membership gate,
-- expense branch, can_view_income branch).

-- ── STILL OPEN AFTER THIS MIGRATION (tracked separately) ─────────────────────
-- transactions_insert / transactions_update and income_sources_insert / _update all
-- still gate on bare is_budget_centre_member(). A standard member can therefore still
-- WRITE an income row, even though after this migration they cannot read it back.
-- F1 is a READ-side fix. The write-side gap is a separate finding.
