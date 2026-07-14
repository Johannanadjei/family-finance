-- =============================================================================
-- migrate_22_income_sources_role_gate.sql   (F1 RLS audit — Migration A)
--
-- FIXES: `standard` members can read income_sources over direct REST.
--
-- PREREQUISITE: can_view_income.sql MUST be applied first.
-- COMPANION:    ships WITH the client fix (HomeView spare-money gate +
--               AddTransactionSheet from_spare gate). Applying this migration
--               WITHOUT the client fix leaves a standard member's Home showing a
--               large negative "Spare Money" figure — see the migration note below.
--
-- ── THE BUG ──────────────────────────────────────────────────────────────────
-- income_sources_select_member gated SELECT on is_budget_centre_member(), which
-- checks membership ONLY — no role check. Standard members were therefore granted
-- read on every income source in their hub.
--
-- Proven empirically 2026-07-12 against a live standard-member session
-- (stage1-fixture-mem-cap-member, hub 0d3ccc2e-…): the standard member read back
-- `salary / 5000 GHS`, row-count identical to the owner's. The UI hid it; REST did not.
--
-- ── WHY BOTH SELECT POLICIES MATTER ──────────────────────────────────────────
-- income_sources carries TWO permissive SELECT policies, and permissive policies
-- are OR'd. Tightening only _select_member would be pointless if _select_owner
-- granted the row back. It does not: _select_owner keys off budget_centres.owner_id
-- (the hub creator) and is false for standard. So _select_member is the only grant
-- path a standard member has, and closing it closes the leak.
--
-- _select_owner is left UNTOUCHED — it is the creator's independent grant and
-- remains correct.
--
-- ── WHY NOT JUST DROP _select_member ─────────────────────────────────────────
-- `full_access` members are NOT covered by _select_owner (they are not the creator)
-- and legitimately may see income. Dropping _select_member would lock them out.
-- It must become role-AWARE, not disappear.
--
-- ROLLBACK: restore the old definition with
--   CREATE OR REPLACE ... USING (is_budget_centre_member(budget_centre_id));
-- (the pre-migration text is preserved in rls_income_sources.sql).
--
-- ── APPLIED TO PRODUCTION 2026-07-13 ─────────────────────────────────────────
-- Ran in the Supabase SQL editor: "Success, no rows returned" — all assertions
-- passed. Verified empirically the same day: the standard fixture session's
-- income_sources read went 1 row -> [], while the owner control still returned
-- `salary / 5000 / GHS`.
-- =============================================================================
BEGIN;

-- Role-aware SELECT: owner + full_access only. Standard is denied.
-- can_view_income() implies membership, so this is strictly narrower than the
-- policy it replaces — it can only ever remove access, never add it.
DROP POLICY IF EXISTS income_sources_select_member ON public.income_sources;
CREATE POLICY income_sources_select_member ON public.income_sources
  FOR SELECT TO public
  USING (can_view_income(budget_centre_id));

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n    int;
  v_qual text;
BEGIN
  -- (a) The helper this policy depends on exists.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'can_view_income';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: can_view_income() missing — apply can_view_income.sql first'; END IF;

  -- (b) The policy exists and now gates on can_view_income, NOT is_budget_centre_member.
  SELECT qual INTO v_qual FROM pg_policies
    WHERE schemaname='public' AND tablename='income_sources' AND policyname='income_sources_select_member';
  IF v_qual IS NULL              THEN RAISE EXCEPTION 'FAIL: income_sources_select_member missing'; END IF;
  IF v_qual NOT LIKE '%can_view_income%' THEN RAISE EXCEPTION 'FAIL: income_sources_select_member does not gate on can_view_income (qual: %)', v_qual; END IF;
  IF v_qual LIKE '%is_budget_centre_member%' THEN RAISE EXCEPTION 'FAIL: income_sources_select_member STILL gates on is_budget_centre_member — the leak is open (qual: %)', v_qual; END IF;

  -- (c) No OTHER permissive SELECT policy grants membership-only read back.
  --     _select_owner is expected and allowed; anything else gating on
  --     is_budget_centre_member would re-open the hole via the permissive OR.
  SELECT count(*) INTO v_n FROM pg_policies
    WHERE schemaname='public' AND tablename='income_sources' AND cmd='SELECT'
      AND permissive = 'PERMISSIVE'
      AND policyname <> 'income_sources_select_member'
      AND qual LIKE '%is_budget_centre_member%';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: % other permissive SELECT policy/policies still gate on is_budget_centre_member — leak remains open', v_n; END IF;

  -- (d) Policy count unchanged at 4 — we replaced one, added none, dropped none.
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='income_sources';
  IF v_n <> 4 THEN RAISE EXCEPTION 'FAIL: expected 4 policies on income_sources, found %', v_n; END IF;

  RAISE NOTICE 'migrate_22 OK: income_sources SELECT is role-aware (owner + full_access); standard denied.';
END $$;

COMMIT;

-- ── AFTER APPLYING: update the source-of-truth replay file ───────────────────
-- rls_income_sources.sql documented the OLD membership-only definition; a database
-- rebuilt from it would silently reintroduce the leak.
-- DONE 2026-07-13 — rls_income_sources.sql now matches this migration and carries a
-- self-verify assertion that fails loudly if a rebuild ever reverts _select_member.
