-- =============================================================================
-- migrate_25_income_sources_write_gate.sql   (F1 RLS audit — Migration D, WRITE side)
--
-- FIXES: `standard` members can INSERT and UPDATE income_sources over direct REST,
--        despite migrate_22 making those rows unreadable to them.
--
-- PREREQUISITE: can_view_income.sql MUST be applied first.
-- ORDER:        apply AFTER migrate_24. Pairs with it — apply both or neither;
--               they close ONE finding (the F1 write side).
-- CLIENT:       no client change. The UI never issues these writes from a standard
--               session — income-source create/edit and markReceived live in
--               PaydayView, which is already role-gated. This migration closes the
--               REST path, not a UI path.
--
-- ── THE BUG ──────────────────────────────────────────────────────────────────
-- migrate_22 closed the READ side: _select_member now gates on can_view_income(), so
-- a standard member reads []. The WRITE side was left open and tracked as a separate
-- finding. Both write policies gate on bare is_budget_centre_member() — membership
-- only, no role check. So a standard member can still:
--
--   (b) INSERT income sources        — fabricate expected household income
--   (c) UPDATE every source BLINDLY  — see below; the worst of the four paths
--
-- Re-confirmed live via pg_policies 2026-07-16: income_sources_insert carries a bare
-- is_budget_centre_member with_check; income_sources_update has with_check NULL.
--
-- ── WHY (c) IS THE WORST OF THE FOUR ─────────────────────────────────────────
-- income_sources_update has USING (is_budget_centre_member(...)) and WITH CHECK NULL.
-- Given no WITH CHECK on an UPDATE policy, Postgres falls back to the USING
-- expression for the row's NEW value. So "no rule" is really "membership-only rule".
--
-- Unlike transactions — a mixed table where the type branch still leaves standard
-- members their own expenses — income_sources is ENTIRELY income. There is no
-- legitimate standard-member write to it at all. Yet today a standard member can
-- rewrite every source in the hub: `amount`, `received`, the label, or soft-delete
-- it. Post-migrate_22 they cannot read the rows they are overwriting, so they cannot
-- even see the damage — and neither can the owner attribute it.
--
-- This is an INTEGRITY compromise, not a confidentiality one. income_sources drives
-- totalExpected / totalPending / spare-money on the OWNER's Home and Payday views;
-- a forged or zeroed source silently corrupts the household's picture of its own
-- money. Every row in the table is reachable, so it is DoS-grade, not just tamper.
--
-- ── THE VECTOR IS THE UNQUALIFIED UPDATE — A WHERE-QUALIFIED PATCH DOES NOT WORK ──
-- Be precise about this, because the obvious reproduction gives a FALSE all-clear:
--
--   UPDATE income_sources SET expected_amount = 1 WHERE id = <a source>;
--     -> 0 rows, NO error. Silently does nothing.
--
-- That is NOT income_sources_update protecting the row — its USING is bare
-- is_budget_centre_member, which a standard member satisfies. It is migrate_22's READ
-- policy: an UPDATE ... WHERE must READ the row to find it, so the SELECT policy is
-- applied to the existing row and filters it out of the UPDATE's view entirely. The
-- statement matches nothing. (Proven: f1_write_probe.sql T2, 2026-07-16 — 0 rows.
-- Under bare-membership USING alone it would have been 1 row, so the 0 IS the proof.)
--
-- Drop the WHERE and the read policy is never consulted:
--
--   UPDATE income_sources SET expected_amount = 1;   -- no WHERE, constant SET
--     -> reads NO column -> the statement does not require ACL_SELECT -> the SELECT
--        policies are never applied -> only the bare-membership USING remains -> EVERY
--        source in the hub is rewritten, unread and unseen.
--
-- Mechanism, for the reader who wants to verify rather than trust: the UPDATE
-- reference page requires SELECT privilege on any column read in an expression or
-- condition; "Policies Applied by Command Type" shows SELECT/ALL policy USING applying
-- to an UPDATE's "Existing & new rows" only "if read access is required". No column
-- read -> no ACL_SELECT -> no SELECT policy -> no accidental protection. Confirmed
-- empirically on the transactions twin: scripts/f1_t4b_diag.sql, 2026-07-16 — the
-- unqualified UPDATE was ACCEPTED against live data (rolled back, nothing persisted)
-- while the WHERE-qualified form was rejected in the same session.
--
-- This is why the EXPLICIT WITH CHECK below is load-bearing rather than tidy: it is
-- part of the UPDATE policy, so it is evaluated on every post-image no matter what
-- shape the statement takes. The accidental read-policy protection is conditional on
-- the attacker choosing to write a WHERE clause. That is not a control.
--
-- ── THE FIX ──────────────────────────────────────────────────────────────────
-- Gate BOTH write policies on can_view_income(), and give the UPDATE policy an
-- EXPLICIT WITH CHECK so the post-image is checked against the same rule as the
-- pre-image.
--
-- WHY NO SEPARATE is_budget_centre_member GATE — can_view_income() already requires
-- an active, non-deleted membership row (see can_view_income.sql) and additionally
-- checks role IN ('owner','full_access'). It IMPLIES membership, so these policies
-- are strictly NARROWER than the ones they replace: they can only ever remove write
-- access, never add it. Hub isolation is preserved, not weakened. This mirrors
-- migrate_22's read-side reasoning exactly. (transactions differs — migrate_24 keeps
-- an explicit membership gate there because its type='expense' branch must NOT be
-- reachable across hubs.)
--
-- USING vs WITH CHECK on the UPDATE — both load-bearing, NOT redundant:
--   • USING      gates the row as it EXISTS  → a standard member cannot touch any
--                                              source; this alone closes (c).
--   • WITH CHECK gates the row as it BECOMES → blocks a full_access member moving a
--                                              source into a hub where they lack the
--                                              role, since can_view_income() is
--                                              re-evaluated against the NEW
--                                              budget_centre_id.
-- The WITH CHECK is not merely belt-and-braces: without it the post-image rule is
-- silently the membership-only USING fallback, which is the hole itself.
--
-- ── SOFT DELETE RUNS THROUGH THIS POLICY ─────────────────────────────────────
-- There is no DELETE policy on income_sources — deletes are soft (set deleted_at),
-- so they are UPDATEs and are gated here. Tightening _update therefore also stops a
-- standard member soft-deleting an income source. Intended.
--
-- ── PERMISSIVE OR ────────────────────────────────────────────────────────────
-- There is no _insert_owner / _update_owner on this table — income_sources_insert
-- and income_sources_update are the ONLY write grants, so no permissive sibling can
-- OR the restriction away. (_select_owner exists but is SELECT-only and untouched;
-- the creator reaches writes through can_view_income() as role='owner'.) Verified
-- live 2026-07-16: 4 policies, all PERMISSIVE {public}, no anon, no cmd='ALL'.
--
-- ── WHY NOT JUST DROP THE WRITE POLICIES ─────────────────────────────────────
-- Same reasoning as migrate_22: `full_access` members are not the hub creator and
-- are not covered by any owner policy, yet they legitimately manage income. Dropping
-- the write policies would lock them out. The policies must become role-AWARE, not
-- disappear.
--
-- ROLLBACK: restore the old definitions with
--   CREATE POLICY income_sources_insert ... WITH CHECK (is_budget_centre_member(budget_centre_id));
--   CREATE POLICY income_sources_update ... USING      (is_budget_centre_member(budget_centre_id));
-- (pre-migration text preserved in migrate_22's header policy list). NOTE: rolling
-- back reopens the blind-write path.
--
-- ── STATUS: APPLIED TO PRODUCTION 2026-07-16 — AFTER-PROOF PENDING ───────────
-- Written 2026-07-16 against live pg_policies output confirming both write policies
-- still gated on bare is_budget_centre_member(). APPLIED the same day, after
-- migrate_24: "Success, no rows returned", and the self-verifying DO block below
-- passed (it RAISEs and rolls back the whole transaction on any failed assertion, so
-- a clean apply IS the assertion set passing).
--
-- CONFIRMED LIVE via scripts/f1_writecheck_diag.sql after the apply:
--   income_sources_update  EXPLICIT with_check = can_view_income(budget_centre_id)
--   income_sources_insert  EXPLICIT with_check = can_view_income(budget_centre_id)
--
-- STILL PENDING — the behavioural AFTER-proof. Correct policy text is not the same as
-- a closed attack. Note the shape of the proof differs from migrate_24's: because this
-- table's USING is now can_view_income, a standard member's unqualified
-- `UPDATE income_sources SET expected_amount = 1;` is expected to return 0 ROWS AND NO
-- ERROR — USING admits nothing, so the WITH CHECK is never reached. Silence is the
-- pass here. Do NOT read the absence of a 42501 as the fix having failed; that is the
-- USING gate working. (migrate_24's transactions twin DOES error, because its USING
-- still admits the member's own expense rows and the WITH CHECK then rejects the
-- income post-image. See f1_t4b_diag.sql.)
-- =============================================================================
BEGIN;

-- INSERT: role-aware — owner + full_access only; `standard` is denied. Whole-table
-- gate, no row branch: every row in income_sources IS income.
--
-- INTENTIONAL COUPLING — "log income" deliberately shares the "view income"
-- predicate. can_view_income() is REUSED here from the read side (migrate_22) by
-- design, not coincidence: a member who may not SEE income may not CREATE it either.
-- One role rule governs both sides, so they cannot drift into a state where a member
-- writes what they cannot read — exactly the state migrate_22 left behind and this
-- migration ends. If viewIncome's meaning ever splits from "may write income", this
-- policy must stop sharing the helper and get its own; do NOT quietly widen
-- can_view_income() to accommodate a write case, as that silently widens the read
-- policies too.
DROP POLICY IF EXISTS income_sources_insert ON public.income_sources;
CREATE POLICY income_sources_insert ON public.income_sources
  FOR INSERT TO public
  WITH CHECK (can_view_income(budget_centre_id));

-- UPDATE: the same predicate on BOTH the pre-image (USING) and the post-image
-- (WITH CHECK). The explicit WITH CHECK is the point of this migration — without it
-- Postgres reuses USING for the post-image, and the post-image rule silently becomes
-- membership-only. USING closes the blind PATCH of existing sources; WITH CHECK stops
-- a source being moved into a hub where the caller lacks the role.
--
-- INTENTIONAL COUPLING — as above: can_view_income() is shared with the read-side
-- policy on purpose. Same rule, both directions.
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
  -- (a) The helper both policies depend on exists.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'can_view_income';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: can_view_income() missing — apply can_view_income.sql first'; END IF;

  -- (b) INSERT policy: exists, gates on can_view_income, and no longer on bare
  --     is_budget_centre_member (which would be the un-migrated definition).
  SELECT with_check INTO v_check FROM pg_policies
    WHERE schemaname='public' AND tablename='income_sources' AND policyname='income_sources_insert';
  IF v_check IS NULL                          THEN RAISE EXCEPTION 'FAIL: income_sources_insert missing or has no WITH CHECK'; END IF;
  IF v_check NOT LIKE '%can_view_income%'     THEN RAISE EXCEPTION 'FAIL: income_sources_insert does not gate on can_view_income — standard members can still forge income sources (with_check: %)', v_check; END IF;
  IF v_check LIKE '%is_budget_centre_member%' THEN RAISE EXCEPTION 'FAIL: income_sources_insert STILL references is_budget_centre_member — membership-only write, the leak is open (with_check: %)', v_check; END IF;

  -- (c) UPDATE policy: exists, and USING gates on can_view_income.
  SELECT qual, with_check INTO v_qual, v_check FROM pg_policies
    WHERE schemaname='public' AND tablename='income_sources' AND policyname='income_sources_update';
  IF v_qual IS NULL                          THEN RAISE EXCEPTION 'FAIL: income_sources_update missing'; END IF;
  IF v_qual NOT LIKE '%can_view_income%'     THEN RAISE EXCEPTION 'FAIL: income_sources_update USING does not gate on can_view_income — standard members can still PATCH every source (qual: %)', v_qual; END IF;
  IF v_qual LIKE '%is_budget_centre_member%' THEN RAISE EXCEPTION 'FAIL: income_sources_update STILL references is_budget_centre_member — membership-only write, the blind PATCH is open (qual: %)', v_qual; END IF;

  -- (d) THE SPECIFIC HOLE THIS MIGRATION CLOSES — asserted on its own, and FIRST,
  --     before any text match on with_check. A NULL with_check is not "no rule":
  --     Postgres silently falls back to USING for the post-image, which is what made
  --     the blind write possible. A guard that only checked USING would PASS while
  --     leaving the post-image unchecked — and a LIKE test against NULL yields NULL,
  --     not true, so `NOT LIKE` on a NULL with_check would NOT raise either. Only an
  --     explicit IS NULL test catches it.
  IF v_check IS NULL THEN
    RAISE EXCEPTION 'FAIL: income_sources_update has NULL with_check — the BLIND-WRITE path is OPEN. Postgres falls back to USING for the post-image, so the row a member is allowed to write is not checked against the role rule. This is the exact hole migrate_25 exists to close.';
  END IF;
  IF v_check NOT LIKE '%can_view_income%'     THEN RAISE EXCEPTION 'FAIL: income_sources_update WITH CHECK does not gate on can_view_income — a source can be written into a hub the caller lacks the role for (with_check: %)', v_check; END IF;
  IF v_check LIKE '%is_budget_centre_member%' THEN RAISE EXCEPTION 'FAIL: income_sources_update WITH CHECK STILL references is_budget_centre_member — membership-only post-image check (with_check: %)', v_check; END IF;

  -- (e) No OTHER permissive write policy grants membership-only write back.
  --     Permissive policies OR together, so one stale sibling defeats both fixes
  --     above. cmd='ALL' is included deliberately: an ALL policy applies to INSERT
  --     and UPDATE too, and a cmd-specific query would miss that OR-trap.
  SELECT count(*) INTO v_n FROM pg_policies
    WHERE schemaname='public' AND tablename='income_sources'
      AND cmd IN ('INSERT', 'UPDATE', 'ALL')
      AND permissive = 'PERMISSIVE'
      AND policyname NOT IN ('income_sources_insert', 'income_sources_update')
      AND (COALESCE(qual, '')       LIKE '%is_budget_centre_member%'
        OR COALESCE(with_check, '') LIKE '%is_budget_centre_member%');
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: % other permissive write policy/policies still grant membership-only write — the OR-trap reopens the hole', v_n; END IF;

  -- (f) Policy count unchanged at 4 — we replaced two, added none, dropped none.
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='income_sources';
  IF v_n <> 4 THEN RAISE EXCEPTION 'FAIL: expected 4 policies on income_sources, found %', v_n; END IF;

  RAISE NOTICE 'migrate_25 OK: income_sources writes are role-aware (owner + full_access); standard denied. UPDATE post-image now explicitly checked (blind-PATCH path closed).';
END $$;

COMMIT;

-- ── AFTER APPLYING: update the source-of-truth replay file ───────────────────
-- rls_income_sources.sql documented the OLD membership-only write definitions and its
-- header carried a "KNOWN GAP" note describing this very hole. A database rebuilt
-- from it would silently reintroduce the blind PATCH.
-- DONE 2026-07-16 — rls_income_sources.sql now matches these definitions, the KNOWN
-- GAP note is gone, and its verify block carries the same with_check IS NOT NULL
-- guard. Its header's "Applied to production as migrate_25_income_sources_write_gate
-- .sql" line is accurate as of the 2026-07-16 apply.
