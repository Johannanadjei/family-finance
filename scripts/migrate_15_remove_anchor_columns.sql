-- =============================================================================
-- migrate_15_remove_anchor_columns.sql
--
-- Phase A of the anchor pivot — REMOVE the budget-cycle anchor-types scaffolding
-- introduced in Commit 14b. The anchor model (calendar / fixed_day / last_working_day
-- / last_day_of_month) was judged overengineered after lived-use testing: the app is
-- about budgeting, not about when someone gets paid. Budget periods become user-driven
-- in Phase B (create_budget_period). See docs/engineering-decisions.md.
--
-- DROPS (all IF EXISTS — idempotent, safe to re-run):
--   1. create_cycle_by_anchor(uuid, text, smallint, date, text)  — RPC wrapper
--   2. cycle_anchored_day(text, smallint, date)                  — anchor helper
--   3. budget_centres_cycle_anchor_type_chk / _day_chk           — CHECK constraints
--   4. budget_centres.cycle_anchor_type / cycle_anchor_day       — columns
--
-- KEPT (do NOT drop — Phase B and audit history depend on them):
--   • cycle_majority_name(date, date)   — server twin still used by Phase B naming
--   • budget_cycles.anchor_type         — historical/audit column on a DIFFERENT table
--   • budget_cycles table + all its rows, cycle_id stamping triggers, GiST no-overlap
--     constraint, soft-delete columns — untouched.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️  DO NOT RUN YET. Per the branch-model promotion plan, this migration is
-- COMMITTED to dev alongside the Phase A code but is NOT executed in Supabase until
-- the dev → staging → main promotion. Running it now would drop objects that the
-- code still live on `main` references (createCycleByAnchor / the anchor columns),
-- breaking production. Execution order at promotion time:
--   1. Run this SQL in Supabase   2. dev → staging   3. verify on staging
--   4. staging → main             5. production updates
-- ─────────────────────────────────────────────────────────────────────────────
--
-- This migration SELF-VERIFIES: a single transaction with a final assertion block
-- that RAISES (rolling everything back) if any expected post-state is wrong, plus a
-- budget_cycles row-count guard. Atomic — it either fully applies or fully aborts.
-- =============================================================================

BEGIN;

-- Safety guard: capture budget_cycles row count BEFORE any drop (transaction-local).
-- Column/function drops never touch budget_cycles rows; this asserts that invariant.
DO $$
BEGIN
  PERFORM set_config('ff.bc_count_before', (SELECT count(*) FROM budget_cycles)::text, true);
END $$;

-- 1. RPC wrapper (depends on cycle_anchored_day — drop it first).
DROP FUNCTION IF EXISTS create_cycle_by_anchor(uuid, text, smallint, date, text);

-- 2. Anchor boundary helper.
DROP FUNCTION IF EXISTS cycle_anchored_day(text, smallint, date);

-- 3. CHECK constraints (explicit drop before the columns — idempotent).
ALTER TABLE budget_centres DROP CONSTRAINT IF EXISTS budget_centres_cycle_anchor_type_chk;
ALTER TABLE budget_centres DROP CONSTRAINT IF EXISTS budget_centres_cycle_anchor_day_chk;

-- 4. Columns.
ALTER TABLE budget_centres DROP COLUMN IF EXISTS cycle_anchor_type;
ALTER TABLE budget_centres DROP COLUMN IF EXISTS cycle_anchor_day;

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_before bigint := current_setting('ff.bc_count_before')::bigint;
  v_after  bigint;
  v_n      int;
BEGIN
  -- (a) cycle_anchor_type column gone
  SELECT count(*) INTO v_n FROM information_schema.columns
    WHERE table_name = 'budget_centres' AND column_name = 'cycle_anchor_type';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: budget_centres.cycle_anchor_type still present'; END IF;

  -- (b) cycle_anchor_day column gone
  SELECT count(*) INTO v_n FROM information_schema.columns
    WHERE table_name = 'budget_centres' AND column_name = 'cycle_anchor_day';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: budget_centres.cycle_anchor_day still present'; END IF;

  -- (c) CHECK constraints gone
  SELECT count(*) INTO v_n FROM pg_constraint
    WHERE conname IN ('budget_centres_cycle_anchor_type_chk', 'budget_centres_cycle_anchor_day_chk');
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: anchor CHECK constraint(s) still present'; END IF;

  -- (d) create_cycle_by_anchor function gone
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'create_cycle_by_anchor';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: create_cycle_by_anchor still present'; END IF;

  -- (e) cycle_anchored_day function gone
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'cycle_anchored_day';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: cycle_anchored_day still present'; END IF;

  -- (f) cycle_majority_name STILL exists (KEPT for Phase B)
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'cycle_majority_name';
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: cycle_majority_name was dropped — it must be KEPT'; END IF;

  -- (g) budget_cycles.anchor_type STILL exists (KEPT — different table, audit history)
  SELECT count(*) INTO v_n FROM information_schema.columns
    WHERE table_name = 'budget_cycles' AND column_name = 'anchor_type';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: budget_cycles.anchor_type missing — it must be KEPT'; END IF;

  -- (h) budget_cycles row count unchanged
  SELECT count(*) INTO v_after FROM budget_cycles;
  IF v_before <> v_after THEN
    RAISE EXCEPTION 'FAIL: budget_cycles row count changed during migration: % -> %', v_before, v_after;
  END IF;

  RAISE NOTICE 'migrate_15 OK: anchor scaffolding dropped; cycle_majority_name + budget_cycles.anchor_type kept; budget_cycles rows unchanged (%).', v_after;
END $$;

COMMIT;

-- ── Manual verification (optional — run after COMMIT to eyeball the post-state) ──
--   SELECT count(*) FROM information_schema.columns
--     WHERE table_name='budget_centres' AND column_name IN ('cycle_anchor_type','cycle_anchor_day');   -- 0
--   SELECT count(*) FROM pg_constraint
--     WHERE conname IN ('budget_centres_cycle_anchor_type_chk','budget_centres_cycle_anchor_day_chk'); -- 0
--   SELECT proname FROM pg_proc WHERE proname IN ('create_cycle_by_anchor','cycle_anchored_day');      -- 0 rows
--   SELECT proname FROM pg_proc WHERE proname = 'cycle_majority_name';                                 -- 1 row (KEPT)
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='budget_cycles' AND column_name='anchor_type';                                  -- 1 row (KEPT)
