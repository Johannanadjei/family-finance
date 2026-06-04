-- =============================================================================
-- migrate_16_create_budget_period.sql
--
-- Phase B of the anchor pivot — the USER-DRIVEN budget-period creator. Replaces the
-- anchor-types create_cycle_by_anchor (dropped in migrate_15) with an explicit
-- start/end RPC: the user picks the window, the server just validates + inserts.
-- No anchor maths, no forward-only range march, no dual-basis reference clamp — the
-- caller's dates ARE the period. Overlap is caught by the existing GiST constraint,
-- not pre-empted. See docs/engineering-decisions.md (anchor pivot, Phase B).
--
-- WHAT THIS ADDS
--   create_budget_period(p_centre_id uuid, p_name text, p_start_date date,
--                        p_end_date date) RETURNS budget_cycles
--     • SECURITY DEFINER — runs as owner; auth.uid() is still the calling user.
--     • Auth gate: caller must be an ACTIVE member with role IN ('owner','full_access').
--       This is the DB twin of can(role,'manageCycles') in lib/roles.js and mirrors
--       the budget_cycles "Owners and full_access can manage cycles" RLS write policy.
--     • Validates p_start_date <= p_end_date (friendly error before the table CHECK).
--     • Name: SERVER-AUTHORITATIVE FALLBACK. A non-empty p_name is honoured; NULL/blank
--       falls back to cycle_majority_name(start, end) — the helper KEPT by migrate_15.
--     • Inserts anchor_type='custom' (the calendar/payday distinction is gone). The
--       cycle row's anchor_day stays NULL, satisfying the existing
--       "(anchor_type='payday') = (anchor_day IS NOT NULL)" CHECK trivially.
--     • Honours no_overlapping_cycles (GiST). Traps exclusion_violation and re-raises
--       the friendly, machine-detectable CYC01 SQLSTATE (same contract as 14b).
--
-- DEPENDS ON (must already exist — all created by earlier migrations, KEPT by 15):
--   • budget_cycles table + no_overlapping_cycles GiST constraint (migrate_cycles_schema)
--   • cycle_majority_name(date, date)  (migrate_14b_anchor; KEPT by migrate_15)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️  DO NOT RUN YET. Per the branch-model promotion plan this migration is COMMITTED
-- to dev alongside the Phase B code but is NOT executed in Supabase until promotion.
-- Run it RIGHT AFTER migrate_15 (which drops the old anchor scaffolding). Order:
--   1. Run migrate_15  2. Run migrate_16 (this file)  3. dev → staging
--   4. verify on staging  5. staging → main  6. production updates
-- Running it before migrate_15 is harmless (independent objects); running the CODE
-- before either is what breaks — the client expects create_budget_period to exist.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Idempotent (CREATE OR REPLACE + re-issued GRANT). Self-verifying: a final DO block
-- asserts the function exists with the right signature and that its dependencies are
-- present, RAISING (and rolling the whole TX back) on any miss. Atomic.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION create_budget_period(
  p_centre_id  uuid,
  p_name       text,
  p_start_date date,
  p_end_date   date
) RETURNS budget_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name  text;
  v_cycle budget_cycles;
BEGIN
  -- 1. Authorize: caller must be an active owner / full_access member of the centre.
  --    SECURITY DEFINER bypasses RLS, so this in-function check IS the write gate.
  IF NOT EXISTS (
    SELECT 1 FROM budget_centre_members
    WHERE budget_centre_id = p_centre_id
      AND user_id          = auth.uid()
      AND role             IN ('owner', 'full_access')
      AND deleted_at       IS NULL
  ) THEN
    RAISE EXCEPTION 'User is not an owner or full-access member of this centre'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Validate the range (defence-in-depth; the table CHECK end_date >= start_date
  --    would also catch it, but a clear message beats a constraint-name error).
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'start_date and end_date are required';
  END IF;
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'end_date (%) must be on or after start_date (%)', p_end_date, p_start_date;
  END IF;

  -- 3. Name: honour a non-empty client name; else the server-authoritative
  --    majority-month fallback (cycle_majority_name, KEPT by migrate_15).
  v_name := COALESCE(NULLIF(btrim(p_name), ''), cycle_majority_name(p_start_date, p_end_date));

  -- 4. Insert. anchor_type='custom', anchor_day NULL. The GiST exclusion constraint
  --    enforces no-overlap; trap it and re-raise the friendly CYC01 SQLSTATE.
  BEGIN
    INSERT INTO budget_cycles (budget_centre_id, name, start_date, end_date, anchor_type)
    VALUES (p_centre_id, v_name, p_start_date, p_end_date, 'custom')
    RETURNING * INTO v_cycle;
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'A budget period overlapping % – % already exists in this hub', p_start_date, p_end_date
        USING ERRCODE = 'CYC01';
  END;

  RETURN v_cycle;
END;
$$;

-- Any authenticated user may call it; the in-function role check is the real gate.
GRANT EXECUTE ON FUNCTION create_budget_period(uuid, text, date, date) TO authenticated;

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n int;
BEGIN
  -- (a) create_budget_period exists with the expected 4-arg signature.
  SELECT count(*) INTO v_n FROM pg_proc
    WHERE proname = 'create_budget_period'
      AND pg_get_function_identity_arguments(oid) = 'p_centre_id uuid, p_name text, p_start_date date, p_end_date date';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: create_budget_period(uuid,text,date,date) not found (got %)', v_n; END IF;

  -- (b) It is SECURITY DEFINER.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'create_budget_period' AND prosecdef IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: create_budget_period is not SECURITY DEFINER'; END IF;

  -- (c) Dependency present: cycle_majority_name (KEPT by migrate_15).
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'cycle_majority_name';
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: cycle_majority_name missing — run migrate_15/14b first'; END IF;

  -- (d) Dependency present: the no-overlap GiST constraint.
  SELECT count(*) INTO v_n FROM pg_constraint WHERE conname = 'no_overlapping_cycles';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: no_overlapping_cycles constraint missing'; END IF;

  -- (e) authenticated has EXECUTE on the new function.
  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
    WHERE routine_name = 'create_budget_period' AND grantee = 'authenticated' AND privilege_type = 'EXECUTE';
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: authenticated lacks EXECUTE on create_budget_period'; END IF;

  RAISE NOTICE 'migrate_16 OK: create_budget_period(uuid,text,date,date) installed (SECURITY DEFINER, owner/full_access gate, CYC01 overlap trap).';
END $$;

COMMIT;

-- =============================================================================
-- Manual verification (optional — run on a TEST hub after COMMIT; inserts real rows).
-- =============================================================================
-- A. Happy path — explicit name honoured:
--   SELECT id, name, start_date, end_date, anchor_type
--   FROM create_budget_period('<test-hub-id>'::uuid, 'Holiday Sprint', '2026-08-01', '2026-08-14');
--   -- expect anchor_type 'custom', name 'Holiday Sprint'
--
-- B. Name fallback — blank name → cycle_majority_name:
--   SELECT name FROM create_budget_period('<test-hub-id>'::uuid, NULL, '2026-09-01', '2026-09-30');
--   -- expect 'September 2026'
--
-- C. Overlap → CYC01 (run B first, then this overlapping range):
--   SELECT * FROM create_budget_period('<test-hub-id>'::uuid, NULL, '2026-09-15', '2026-10-15');
--   -- expect ERROR SQLSTATE 'CYC01'
--
-- D. Inverted range → friendly error:
--   SELECT * FROM create_budget_period('<test-hub-id>'::uuid, NULL, '2026-09-30', '2026-09-01');
--   -- expect ERROR 'end_date (2026-09-01) must be on or after start_date (2026-09-30)'
--
-- E. Non-member / standard role → 42501:
--   (call as a standard member or non-member) → ERROR 'User is not an owner or full-access member…'
-- =============================================================================
