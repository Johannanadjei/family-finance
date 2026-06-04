-- =============================================================================
-- migrate_18_reset_budget_period.sql
--
-- Adds the user-driven RESET for a FUTURE budget period. A reset clears the period's
-- plan and activity WITHOUT deleting the period itself: it soft-deletes every
-- budget_category and transaction stamped with the cycle's id, leaving the
-- budget_cycles row untouched. After a reset the period is empty, so the existing
-- empty-state UX (Copy-from-previous / + Add category) takes over — no follow-up
-- assign-or-delete prompt (full wipe, simple UX, locked Phase 2).
--
-- WHY AN RPC (not client deletes): the wipe spans two tables and must be atomic and
-- authorised server-side. SECURITY DEFINER + an in-function owner/full_access gate is
-- the established write contract (matches create_budget_period, migrate_16) — never
-- fight RLS across tables. See CLAUDE.md §9.6.
--
-- CONTRACT
--   reset_budget_period(p_cycle_id uuid) RETURNS jsonb
--     {categories_reset: int, transactions_reset: int, cycle_id: uuid}
--   • SECURITY DEFINER, search_path=public. auth.uid() is still the calling user.
--   • Auth gate: caller must be an ACTIVE member (role IN ('owner','full_access'),
--     deleted_at IS NULL) of the cycle's budget_centre — the DB twin of
--     can(role,'manageCycles') in lib/roles.js. Raises SQLSTATE '42501' otherwise.
--   • FUTURE-ONLY: the cycle's start_date must be strictly after the current UTC date
--     (now() AT TIME ZONE 'UTC')::date — matching the client's getToday() convention
--     and the isFuture gate on the kebab. Resetting a past/current period raises the
--     friendly, machine-detectable SQLSTATE 'CYC04' (parallels CYC01 overlap / CYC03
--     year). The client maps it to an inline message; the UI also hides the control
--     for non-future periods, so CYC04 is belt-and-suspenders.
--   • The cycle row itself is NEVER modified (no delete, no date change).
--
-- DEPENDS ON (already present): budget_cycles, budget_categories, transactions — all
--   carrying cycle_id + deleted_at (Commit 10 trigger + backfill).
--
-- IDEMPOTENT: CREATE OR REPLACE; re-running soft-deletes nothing new (the deleted_at
--   IS NULL guards make the UPDATEs no-ops the second time) and returns zero counts.
--
-- PURELY ADDITIVE: introduces a NEW function, drops nothing. Safe to run anytime in
--   the single shared Supabase project — older main JS simply never calls it.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION reset_budget_period(
  p_cycle_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_centre uuid;
  v_start  date;
  v_today  date := (now() AT TIME ZONE 'UTC')::date;   -- matches client getToday()
  v_cat_n  int;
  v_tx_n   int;
BEGIN
  -- 1. Resolve the cycle (centre + start_date). Must exist and be live.
  SELECT budget_centre_id, start_date
    INTO v_centre, v_start
    FROM budget_cycles
   WHERE id = p_cycle_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Budget period % not found', p_cycle_id;
  END IF;

  -- 2. Authorize: caller must be an active owner / full_access member of the centre.
  --    SECURITY DEFINER bypasses RLS, so this in-function check IS the write gate.
  IF NOT EXISTS (
    SELECT 1 FROM budget_centre_members
    WHERE budget_centre_id = v_centre
      AND user_id          = auth.uid()
      AND role             IN ('owner', 'full_access')
      AND deleted_at       IS NULL
  ) THEN
    RAISE EXCEPTION 'User is not an owner or full-access member of this centre'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Future-only: a past or current period cannot be reset (strict > today, UTC).
  IF v_start <= v_today THEN
    RAISE EXCEPTION 'Cannot reset a past or current budget period'
      USING ERRCODE = 'CYC04';
  END IF;

  -- 4. Soft-delete the plan, then the activity. deleted_at IS NULL keeps it idempotent.
  UPDATE budget_categories SET deleted_at = now()
   WHERE cycle_id = p_cycle_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_cat_n = ROW_COUNT;

  UPDATE transactions SET deleted_at = now()
   WHERE cycle_id = p_cycle_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_tx_n = ROW_COUNT;

  -- 5. Return the counts (the cycle row is unchanged; client just refreshes cycles).
  RETURN jsonb_build_object(
    'categories_reset',   v_cat_n,
    'transactions_reset', v_tx_n,
    'cycle_id',           p_cycle_id
  );
END;
$$;

-- Any authenticated user may call it; the in-function role check is the real gate.
GRANT EXECUTE ON FUNCTION reset_budget_period(uuid) TO authenticated;

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n int;
BEGIN
  -- (a) reset_budget_period exists with the expected 1-arg signature.
  SELECT count(*) INTO v_n FROM pg_proc
    WHERE proname = 'reset_budget_period'
      AND pg_get_function_identity_arguments(oid) = 'p_cycle_id uuid';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: reset_budget_period(uuid) not found (got %)', v_n; END IF;

  -- (b) It is SECURITY DEFINER.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'reset_budget_period' AND prosecdef IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: reset_budget_period is not SECURITY DEFINER'; END IF;

  -- (c) The CYC04 future-only check is present in the function body.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'reset_budget_period' AND prosrc LIKE '%CYC04%';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: reset_budget_period missing the CYC04 future-only check'; END IF;

  -- (d) Target tables carry cycle_id + deleted_at (the columns the wipe touches).
  SELECT count(*) INTO v_n FROM information_schema.columns
    WHERE table_name = 'budget_categories' AND column_name IN ('cycle_id', 'deleted_at');
  IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL: budget_categories missing cycle_id/deleted_at'; END IF;
  SELECT count(*) INTO v_n FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name IN ('cycle_id', 'deleted_at');
  IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL: transactions missing cycle_id/deleted_at'; END IF;

  -- (e) authenticated has EXECUTE on the function.
  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
    WHERE routine_name = 'reset_budget_period' AND grantee = 'authenticated' AND privilege_type = 'EXECUTE';
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: authenticated lacks EXECUTE on reset_budget_period'; END IF;

  RAISE NOTICE 'migrate_18 OK: reset_budget_period(uuid) installed (SECURITY DEFINER, owner/full_access gate, CYC04 future-only).';
END $$;

COMMIT;

-- =============================================================================
-- Manual verification (optional — run on a TEST hub after COMMIT; mutates rows).
-- =============================================================================
-- A. Future period happy path (clears plan + activity, period row stays):
--   SELECT reset_budget_period('<future-cycle-id>'::uuid);
--   -- expect {"categories_reset": N, "transactions_reset": M, "cycle_id": "..."}
--
-- B. Past or current period → CYC04:
--   SELECT reset_budget_period('<current-cycle-id>'::uuid);
--   -- expect ERROR SQLSTATE 'CYC04' — 'Cannot reset a past or current budget period'
--
-- C. Non-member / standard role → 42501:
--   -- (as a standard member) SELECT reset_budget_period('<future-cycle-id>'::uuid);
--   -- expect ERROR SQLSTATE '42501'
