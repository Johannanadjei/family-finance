-- =============================================================================
-- migrate_24_transactions_write_gate.sql   (F1 RLS audit — Migration C, WRITE side)
--
-- FIXES: `standard` members can INSERT and UPDATE income-type transactions over
--        direct REST, despite migrate_23 making those rows unreadable to them.
--
-- PREREQUISITE: can_view_income.sql MUST be applied first.
-- ORDER:        apply AFTER migrate_23. Pairs with migrate_25 (income_sources
--               write side) — apply both or neither; they close ONE finding.
-- CLIENT:       no client change. The UI never issues these writes from a standard
--               session — markReceived (the only income-transaction writer) is
--               reachable only from PaydayView, which is already role-gated, and
--               AddTransactionSheet only ever writes type='expense'. This migration
--               closes the REST path, not a UI path.
--
-- ── THE BUG ──────────────────────────────────────────────────────────────────
-- migrate_23 closed the READ side: a standard member can no longer SELECT income
-- transactions. The WRITE side was left open and tracked as a separate finding.
-- Both write policies gate on bare is_budget_centre_member() — membership only, no
-- role check. So a standard member can still:
--
--   (a) INSERT type='income' rows     — fabricate household income
--   (d) UPDATE any income row BLINDLY — rewrite amounts; see below
--
-- Re-confirmed live via pg_policies 2026-07-16: both inserts carry a bare
-- is_budget_centre_member with_check; both updates have with_check NULL.
--
-- ── WHY (d) IS WORSE THAN (a) ────────────────────────────────────────────────
-- transactions_update has USING (is_budget_centre_member(...)) and WITH CHECK NULL.
-- Given no WITH CHECK on an UPDATE policy, Postgres falls back to the USING
-- expression for the row's NEW value. So "no rule" is really "membership-only rule":
-- a standard member can rewrite the amount, type, category or budget_centre_id of a
-- row they cannot read, and the write succeeds.
--
-- That is a BLIND write — RLS filters the SELECT but not the UPDATE, so the attacker
-- cannot see the row they just overwrote. It is an INTEGRITY compromise, not a
-- confidentiality one: a forged or altered income row corrupts the OWNER's
-- spare-money figure, budget calculations and activity feed, and the member who did
-- it sees nothing. A quiet attack against someone else's view of their own money.
--
-- ── READ THIS BEFORE YOU TRY TO REPRODUCE (d) — THE VECTOR IS NOT WHAT IT LOOKS ──
-- The obvious reproduction FAILS, and the failure is misleading, not reassuring:
--
--   UPDATE transactions SET type='income' WHERE id = <an expense you own>;
--     -> ERROR 42501 "new row violates row-level security policy for table transactions"
--
-- That looks like the hole is already closed. It is not. The WHERE clause is what
-- rejected it, and it rejected it via a policy that has nothing to do with writes:
--
--   * Per the UPDATE reference page, you need SELECT privilege on any column whose
--     value is READ in an expression or condition. `WHERE id = ...` reads a column,
--     so the statement's RTE requires ACL_SELECT.
--   * Per "Policies Applied by Command Type", the UPDATE row under "SELECT/ALL policy
--     USING" reads "Existing & new rows", footnoted "if read access is required".
--     (rowsecurity.c: get_row_security_policies() adds the CMD_SELECT policies as
--     WCO_RLS_UPDATE_CHECK with force_using=true when requiredPerms includes ACL_SELECT.)
--   * So a WHERE-qualified UPDATE gets migrate_23's TYPE-AWARE SELECT policy applied
--     to its POST-IMAGE. type='income' is unreadable to a standard member -> 42501.
--
-- An attacker deletes six characters and the protection evaporates:
--
--   UPDATE transactions SET type='income';        -- no WHERE, constant SET
--     -> reads NO column -> ACL_SELECT NOT required -> the SELECT policies are never
--        added -> only transactions_update's bare-membership USING (as securityQual)
--        and its inherited membership-only post-image check remain -> ACCEPTED.
--
-- PROVEN, not theorised: scripts/f1_t4b_diag.sql, 2026-07-16, as a real standard
-- member against this database — the unqualified UPDATE was ACCEPTED and transmuted
-- every transaction in the hub (ROW_COUNT 2 = the full row count admitted by USING).
-- Rolled back; nothing persisted. The WHERE-qualified form was rejected in the same
-- session. Same user, same rows, same policies — only the WHERE differed.
--
-- ── THEREFORE: WHY AN *EXPLICIT* WITH CHECK, AND WHY INHERITING USING IS NOT ENOUGH ──
-- The accidental protection above is CONDITIONAL on the attacker's statement shape.
-- It engages only when the statement happens to require SELECT permission, and the
-- attacker chooses that. It is not a security control; it is a coincidence, and
-- relying on it means relying on the attacker to write an inefficient query.
--
-- The WITH CHECK written below is UNCONDITIONAL. It is attached to the UPDATE policy
-- itself, so it is evaluated against the post-image of EVERY update regardless of
-- requiredPerms, WHERE clause, RETURNING, or statement shape. That is the entire
-- reason this migration exists and the reason the inherited USING fallback — which
-- is membership-only, and which a standard member satisfies — cannot substitute for it.
--
-- COROLLARY FOR ANY FUTURE PROBE: a WHERE-qualified test of this path reports a FALSE
-- "already safe" and always will. Test the unqualified form. See the T2/T4 annotations
-- in scripts/f1_write_probe.sql, which were originally written with this exact error.
--
-- ── THE FIX ──────────────────────────────────────────────────────────────────
-- Mirror migrate_23's read-side predicate onto both write policies, and give the
-- UPDATE policy an EXPLICIT WITH CHECK so the post-image is checked against the same
-- rule as the pre-image.
--
-- USING vs WITH CHECK on the UPDATE — both load-bearing, NOT redundant:
--   • USING      gates the row as it EXISTS  → a standard member cannot touch an
--                                              income row at all.
--   • WITH CHECK gates the row as it BECOMES → a standard member cannot transmute
--                                              their own expense INTO an income row
--                                              (type='expense' passes USING; the
--                                              post-image type='income' fails CHECK).
-- Without the WITH CHECK the second path is a privilege escalation that survives the
-- USING gate. It also re-gates budget_centre_id on the post-image: is_budget_centre_member
-- on the NEW row blocks moving a transaction into a hub you don't belong to.
--
-- ── SOFT DELETE RUNS THROUGH THIS POLICY ─────────────────────────────────────
-- There is no DELETE policy on transactions — deletes are soft (set deleted_at), so
-- they are UPDATEs and are gated here. Tightening _update therefore also stops a
-- standard member soft-deleting an income transaction. Intended.
--
-- ── SAFE TO FILTER ON `type` ─────────────────────────────────────────────────
-- Same basis as migrate_23: transactions_type_check is convalidated,
-- CHECK (type IN ('income','expense')). A row is always exactly one of the two, and
-- any future third value is DENIED to standard on both read and write — fail-closed.
-- Asserted below so the assumption stays loud rather than implicit.
--
-- ── PERMISSIVE OR ────────────────────────────────────────────────────────────
-- Unlike SELECT, there is no _insert_owner / _update_owner on this table —
-- transactions_insert and transactions_update are the ONLY write grants, so no
-- permissive sibling can OR the restriction away. The creator reaches income writes
-- through can_view_income() (role='owner'), not a separate owner policy. Verified
-- live 2026-07-16: 4 policies, all PERMISSIVE {public}, no anon, no cmd='ALL'.
--
-- ROLLBACK: restore the old definitions with
--   CREATE POLICY transactions_insert ... WITH CHECK (is_budget_centre_member(budget_centre_id));
--   CREATE POLICY transactions_update ... USING      (is_budget_centre_member(budget_centre_id));
-- (pre-migration text preserved in migrate_23's header policy list). NOTE: rolling
-- back reopens the blind-write path.
--
-- ── STATUS: APPLIED TO PRODUCTION 2026-07-16 — AFTER-PROOF PENDING ───────────
-- Written 2026-07-16 against live pg_policies output confirming all four write
-- policies still gated on bare is_budget_centre_member(). APPLIED the same day:
-- "Success, no rows returned", and the self-verifying DO block below passed (it
-- RAISEs and rolls back the whole transaction on any failed assertion, so a clean
-- apply IS the assertion set passing).
--
-- CONFIRMED LIVE via scripts/f1_writecheck_diag.sql after the apply: all four write
-- policies now report EXPLICIT non-NULL with_check —
--   transactions_update    with_check = is_budget_centre_member AND (type='expense'
--                                       OR can_view_income)
--   transactions_insert    with_check type-aware
-- (income_sources pair confirmed in the same grid; see migrate_25.)
--
-- STILL PENDING — the behavioural AFTER-proof. The policy text being correct is not
-- the same as the attack being closed. Re-run scripts/f1_t4b_diag.sql UNCHANGED: the
-- unqualified UPDATE was ACCEPTED (ROW_COUNT 2 = every row in the hub) before this
-- migration, and must now be REJECTED 42501. That ACCEPTED->REJECTED flip on an
-- identical statement is the ONLY direct evidence this migration's UPDATE half works
-- — f1_write_probe.sql's T4 cannot show it, being masked by the read policy in both
-- phases. Until that flip is observed, this fix is verified on paper, not in fact.
-- =============================================================================
BEGIN;

-- INSERT: membership still required for ANY row (hub isolation unchanged). On top
-- of that: expense rows insertable by every member; income rows require a role with
-- viewIncome — the DB mirror of roles.js PERMISSIONS.
--
-- INTENTIONAL COUPLING — "log income" deliberately shares the "view income"
-- predicate. can_view_income() is REUSED here from the read side (migrate_22/23) by
-- design, not coincidence: a member who may not SEE income may not CREATE it either.
-- One role rule governs both sides, so they cannot drift into a state where a member
-- writes what they cannot read — exactly the state migrate_23 left behind and this
-- migration ends. If viewIncome's meaning ever splits from "may write income", this
-- policy must stop sharing the helper and get its own; do NOT quietly widen
-- can_view_income() to accommodate a write case, as that silently widens the read
-- policies too.
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

-- UPDATE: the same predicate on BOTH the pre-image (USING) and the post-image
-- (WITH CHECK). The explicit WITH CHECK is the point of this migration — without it
-- Postgres reuses USING for the post-image, which (i) let a standard member flip an
-- expense into an income row, and (ii) made every income-row UPDATE a blind write.
--
-- INTENTIONAL COUPLING — as above: can_view_income() is shared with the read-side
-- policies on purpose. Same rule, both directions.
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
  -- (a) The helper both policies depend on exists.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'can_view_income';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: can_view_income() missing — apply can_view_income.sql first'; END IF;

  -- (b) The `type` column is still constrained to the two values these policies assume.
  SELECT count(*) INTO v_n FROM pg_constraint
    WHERE conname = 'transactions_type_check' AND convalidated IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: transactions_type_check missing or not validated'; END IF;

  -- (c) INSERT policy: exists, and its WITH CHECK carries all three clauses.
  SELECT with_check INTO v_check FROM pg_policies
    WHERE schemaname='public' AND tablename='transactions' AND policyname='transactions_insert';
  IF v_check IS NULL                              THEN RAISE EXCEPTION 'FAIL: transactions_insert missing or has no WITH CHECK'; END IF;
  IF v_check NOT LIKE '%is_budget_centre_member%' THEN RAISE EXCEPTION 'FAIL: transactions_insert lost its membership gate — CROSS-HUB WRITE (with_check: %)', v_check; END IF;
  IF v_check NOT LIKE '%can_view_income%'         THEN RAISE EXCEPTION 'FAIL: transactions_insert has no role branch — standard members can still forge income (with_check: %)', v_check; END IF;
  IF v_check NOT LIKE '%expense%'                 THEN RAISE EXCEPTION 'FAIL: transactions_insert has no expense branch — standard members would lose expense writes (with_check: %)', v_check; END IF;

  -- (d) UPDATE policy: exists, and USING carries all three clauses.
  SELECT qual, with_check INTO v_qual, v_check FROM pg_policies
    WHERE schemaname='public' AND tablename='transactions' AND policyname='transactions_update';
  IF v_qual IS NULL                              THEN RAISE EXCEPTION 'FAIL: transactions_update missing'; END IF;
  IF v_qual NOT LIKE '%is_budget_centre_member%' THEN RAISE EXCEPTION 'FAIL: transactions_update lost its membership gate — CROSS-HUB WRITE (qual: %)', v_qual; END IF;
  IF v_qual NOT LIKE '%can_view_income%'         THEN RAISE EXCEPTION 'FAIL: transactions_update has no role branch — standard members can still edit income rows (qual: %)', v_qual; END IF;
  IF v_qual NOT LIKE '%expense%'                 THEN RAISE EXCEPTION 'FAIL: transactions_update has no expense branch — standard members would lose expense edits (qual: %)', v_qual; END IF;

  -- (e) THE SPECIFIC HOLE THIS MIGRATION CLOSES — asserted on its own, and FIRST,
  --     before any text match on with_check. A NULL with_check is not "no rule":
  --     Postgres silently falls back to USING for the post-image, which is what made
  --     the expense→income transmute and the blind write possible. A guard that only
  --     checked USING would PASS while leaving the blind path wide open — and a
  --     LIKE test against NULL yields NULL, not true, so `NOT LIKE` on a NULL
  --     with_check would NOT raise either. Only an explicit IS NULL test catches it.
  IF v_check IS NULL THEN
    RAISE EXCEPTION 'FAIL: transactions_update has NULL with_check — the BLIND-WRITE path is OPEN. Postgres falls back to USING for the post-image, so a standard member can transmute an expense into an income row and rewrite rows they cannot read. This is the exact hole migrate_24 exists to close.';
  END IF;
  IF v_check NOT LIKE '%is_budget_centre_member%' THEN RAISE EXCEPTION 'FAIL: transactions_update WITH CHECK lost its membership gate — a row can be moved into a foreign hub (with_check: %)', v_check; END IF;
  IF v_check NOT LIKE '%can_view_income%'         THEN RAISE EXCEPTION 'FAIL: transactions_update WITH CHECK has no role branch — expense can still be transmuted into income (with_check: %)', v_check; END IF;
  IF v_check NOT LIKE '%expense%'                 THEN RAISE EXCEPTION 'FAIL: transactions_update WITH CHECK has no expense branch — standard members would lose expense edits (with_check: %)', v_check; END IF;

  -- (f) No OTHER permissive write policy grants membership-only write back.
  --     Permissive policies OR together, so one stale sibling defeats both fixes
  --     above. cmd='ALL' is included deliberately: an ALL policy applies to INSERT
  --     and UPDATE too, and a cmd-specific query would miss that OR-trap.
  SELECT count(*) INTO v_n FROM pg_policies
    WHERE schemaname='public' AND tablename='transactions'
      AND cmd IN ('INSERT', 'UPDATE', 'ALL')
      AND permissive = 'PERMISSIVE'
      AND policyname NOT IN ('transactions_insert', 'transactions_update')
      AND (COALESCE(qual, '')       LIKE '%is_budget_centre_member%'
        OR COALESCE(with_check, '') LIKE '%is_budget_centre_member%');
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: % other permissive write policy/policies still grant membership-only write — the OR-trap reopens the hole', v_n; END IF;

  -- (g) Policy count unchanged at 4 — we replaced two, added none, dropped none.
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='transactions';
  IF v_n <> 4 THEN RAISE EXCEPTION 'FAIL: expected 4 policies on transactions, found %', v_n; END IF;

  RAISE NOTICE 'migrate_24 OK: transactions writes are row-aware — expense writable by all members; income requires owner/full_access. UPDATE post-image now explicitly checked (blind-write path closed).';
END $$;

COMMIT;

-- ── AFTER APPLYING: update the source-of-truth replay file ───────────────────
-- rls_transactions.sql documented the OLD membership-only write definitions and its
-- header carried a "KNOWN GAP" note describing this very hole. A database rebuilt
-- from it would silently reintroduce the blind write.
-- DONE 2026-07-16 — rls_transactions.sql now matches these definitions, the KNOWN GAP
-- note is gone, and its verify block carries the same with_check IS NOT NULL guard.
-- Its header's "Applied to production as migrate_24_transactions_write_gate.sql" line
-- is accurate as of the 2026-07-16 apply.
