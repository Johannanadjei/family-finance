-- =============================================================================
-- migrate_17_year_constraint.sql
--
-- Phase 2 follow-up to the anchor pivot — adds the CURRENT-YEAR constraint to the
-- user-driven budget-period creator. A full CREATE OR REPLACE of create_budget_period
-- (migrate_16) with ONE new validation step: both p_start_date and p_end_date must
-- fall within the current calendar year. This is a PRODUCT/UX constraint, not a data-
-- integrity invariant, so it lives in the RPC — NOT a table CHECK. A CHECK would
-- permanently forbid cross-year periods at the schema level and block any future
-- Pro/Premium long-range-planning tier without a fresh migration to drop it. The RPC
-- is the single write path for periods, so RPC-level enforcement is sufficient.
--
-- WHAT CHANGES vs migrate_16
--   • NEW step 2b: reject when EXTRACT(YEAR FROM start/end) <> the current UTC year.
--     Raises a machine-detectable SQLSTATE 'CYC03' (parallels the 'CYC01' overlap
--     contract), so the client can show the specific inline message
--     "Periods must be within {year}". UTC year (now() AT TIME ZONE 'UTC') matches
--     the client's getToday() = new Date().toISOString().slice(0,10) convention —
--     no server-local-timezone drift.
--   • Everything else is byte-identical to migrate_16 (owner/full_access gate, range
--     validation, server-authoritative name fallback, anchor_type='custom', GiST
--     overlap → CYC01).
--
-- The December year-rollover edge (today + 1 month crosses into next year) is handled
-- CLIENT-SIDE by disabling quick-create; this constraint is the server twin that also
-- blocks a custom Jan-next-year period. Cross-year planning is an explicit non-goal
-- for the MVP (majority of users budget month-to-month).
--
-- DEPENDS ON (must already exist — KEPT by migrate_15, installed by migrate_16):
--   • create_budget_period(uuid,text,date,date)        (migrate_16)
--   • cycle_majority_name(date, date)                  (migrate_14b; KEPT by 15)
--   • budget_cycles + no_overlapping_cycles GiST       (migrate_cycles_schema)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️  DO NOT RUN YET. Per the branch-model promotion plan this migration is COMMITTED
-- to dev alongside the Phase 2 code but is NOT executed in Supabase until promotion.
-- Run order:  1. migrate_15  2. migrate_16  3. migrate_17 (this file)  4. dev → staging
--   5. verify on staging  6. staging → main  7. production updates.
-- Running it before migrate_16 fails the self-verify (create_budget_period absent).
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
  v_year  int;
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

  -- 2b. Year constraint (Phase 2): both ends must fall within the current calendar
  --     year. UTC "now" matches the client's getToday() (toISOString) so there is no
  --     server-local-timezone disagreement on which year is "current". CYC03 is the
  --     machine-detectable twin of the client-side isWithinCurrentYear gate.
  v_year := EXTRACT(YEAR FROM (now() AT TIME ZONE 'UTC'))::int;
  IF EXTRACT(YEAR FROM p_start_date)::int <> v_year
     OR EXTRACT(YEAR FROM p_end_date)::int <> v_year THEN
    RAISE EXCEPTION 'Budget periods must fall within the current year (%)', v_year
      USING ERRCODE = 'CYC03';
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

  -- (c) The CYC03 year check is present in the function body (guards against an
  --     accidental re-run of migrate_16 clobbering this constraint).
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'create_budget_period' AND prosrc LIKE '%CYC03%';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: create_budget_period missing the CYC03 year check'; END IF;

  -- (d) Dependency present: cycle_majority_name (KEPT by migrate_15).
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'cycle_majority_name';
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: cycle_majority_name missing — run migrate_15/14b first'; END IF;

  -- (e) Dependency present: the no-overlap GiST constraint.
  SELECT count(*) INTO v_n FROM pg_constraint WHERE conname = 'no_overlapping_cycles';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: no_overlapping_cycles constraint missing'; END IF;

  -- (f) authenticated has EXECUTE on the function.
  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
    WHERE routine_name = 'create_budget_period' AND grantee = 'authenticated' AND privilege_type = 'EXECUTE';
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: authenticated lacks EXECUTE on create_budget_period'; END IF;

  RAISE NOTICE 'migrate_17 OK: create_budget_period now enforces the current-year constraint (CYC03).';
END $$;

COMMIT;

-- =============================================================================
-- Manual verification (optional — run on a TEST hub after COMMIT; inserts real rows).
-- =============================================================================
-- A. Same-year happy path (assuming current year 2026):
--   SELECT name FROM create_budget_period('<test-hub-id>'::uuid, NULL, '2026-09-01', '2026-09-30');
--   -- expect 'September 2026'
--
-- B. Cross-year start → CYC03:
--   SELECT * FROM create_budget_period('<test-hub-id>'::uuid, NULL, '2027-01-01', '2027-01-31');
--   -- expect ERROR SQLSTATE 'CYC03' — 'Budget periods must fall within the current year (2026)'
--
-- C. Straddles the boundary (Dec 2026 → Jan 2027) → CYC03:
--   SELECT * FROM create_budget_period('<test-hub-id>'::uuid, NULL, '2026-12-15', '2027-01-15');
--   -- expect ERROR SQLSTATE 'CYC03'
-- =============================================================================
