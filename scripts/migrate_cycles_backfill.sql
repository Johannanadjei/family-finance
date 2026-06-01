-- =============================================================================
-- migrate_cycles_backfill.sql
--
-- Commit 2b of the Budget Cycles project — backfill cycle_id (IRREVERSIBLE GATE #1).
--
-- Per v1.2 F2: atomic (single BEGIN/COMMIT), fail-loud (RAISE EXCEPTION pre/post),
-- so any anomaly rolls back the ENTIRE migration — cycle inserts included.
--
-- PREREQUISITE: run migrate_cycles_fk_columns.sql FIRST (this file UPDATEs cycle_id,
-- which that file creates). A pre-flight guard below aborts if the columns are absent.
--
-- Run ONCE in the Supabase SQL editor. NOT idempotent by design: the pre-flight
-- aborts if budget_cycles is non-empty, so a second run fails loud rather than
-- duplicating cycles.
--
-- Expected outcome: 22 cycles created, all live rows assigned cycle_id, 0 live orphans.
--
-- ── ROLLBACK (manual; only BEFORE any Commit 3+ code reads cycle_id) ──────────
--   UPDATE transactions      SET cycle_id = NULL;
--   UPDATE income_sources    SET cycle_id = NULL;
--   UPDATE budget_categories SET cycle_id = NULL;
--   DELETE FROM budget_cycles;
-- After a successful COMMIT this is the only way back. Once Commit 3+ ships code
-- that reads cycle_id, treat the backfill as permanent.
-- =============================================================================

BEGIN;

-- =============================================================================
-- PRE-FLIGHT: verify safe-to-run conditions (any failure aborts the whole tx).
-- =============================================================================
DO $$
DECLARE
  tx_col bool; in_col bool; cat_col bool;
  null_months_income int;
  null_months_categories int;
  existing_cycles int;
BEGIN
  -- (b) Columns must exist — i.e. migrate_cycles_fk_columns.sql has been run.
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='transactions' AND column_name='cycle_id') INTO tx_col;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='income_sources' AND column_name='cycle_id') INTO in_col;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='budget_categories' AND column_name='cycle_id') INTO cat_col;
  IF NOT (tx_col AND in_col AND cat_col) THEN
    RAISE EXCEPTION 'cycle_id columns missing — run migrate_cycles_fk_columns.sql first';
  END IF;

  -- No NULL months in live data (a NULL month has no cycle to attach to).
  SELECT count(*) INTO null_months_income
  FROM income_sources WHERE deleted_at IS NULL AND month IS NULL;
  SELECT count(*) INTO null_months_categories
  FROM budget_categories WHERE deleted_at IS NULL AND month IS NULL;

  -- Table must be empty (single-run guard against duplication).
  SELECT count(*) INTO existing_cycles FROM budget_cycles;

  RAISE NOTICE 'PRE-FLIGHT: % NULL-month income, % NULL-month categories, % existing cycles',
    null_months_income, null_months_categories, existing_cycles;

  IF null_months_income > 0 OR null_months_categories > 0 THEN
    RAISE EXCEPTION 'NULL months in live data (income=%, categories=%) — fix before backfill',
      null_months_income, null_months_categories;
  END IF;

  IF existing_cycles > 0 THEN
    RAISE EXCEPTION 'budget_cycles is not empty (% rows) — backfill must run on a clean table',
      existing_cycles;
  END IF;
END $$;

-- =============================================================================
-- STEP 1: create one calendar cycle per distinct (centre, month) across all
--         live data sources (income ∪ categories ∪ transactions). Seeding from
--         transactions too guarantees every live tx gets a cycle.
-- =============================================================================
INSERT INTO budget_cycles (id, budget_centre_id, name, start_date, end_date, anchor_type)
SELECT gen_random_uuid(),
       bc.budget_centre_id,
       to_char((bc.month || '-01')::date, 'FMMonth YYYY'),
       (bc.month || '-01')::date,
       ((bc.month || '-01')::date + interval '1 month' - interval '1 day')::date,
       'calendar'
FROM (
  SELECT budget_centre_id, month                      FROM income_sources    WHERE deleted_at IS NULL AND month IS NOT NULL
  UNION
  SELECT budget_centre_id, month                      FROM budget_categories WHERE deleted_at IS NULL AND month IS NOT NULL
  UNION
  SELECT budget_centre_id, to_char(date, 'YYYY-MM')   FROM transactions      WHERE deleted_at IS NULL AND date  IS NOT NULL
) bc;

-- =============================================================================
-- STEP 2: backfill income_sources.cycle_id (live AND soft-deleted — audit symmetry).
-- =============================================================================
UPDATE income_sources i
SET    cycle_id = c.id
FROM   budget_cycles c
WHERE  i.budget_centre_id = c.budget_centre_id
  AND  i.month            = to_char(c.start_date, 'YYYY-MM')
  AND  i.month   IS NOT NULL
  AND  i.cycle_id IS NULL;

-- =============================================================================
-- STEP 3: backfill budget_categories.cycle_id (live AND soft-deleted).
-- =============================================================================
UPDATE budget_categories cat
SET    cycle_id = c.id
FROM   budget_cycles c
WHERE  cat.budget_centre_id = c.budget_centre_id
  AND  cat.month            = to_char(c.start_date, 'YYYY-MM')
  AND  cat.month   IS NOT NULL
  AND  cat.cycle_id IS NULL;

-- =============================================================================
-- STEP 4: backfill transactions.cycle_id by date containment. Cycles are
--         non-overlapping calendar months, so each date matches exactly one.
-- =============================================================================
UPDATE transactions t
SET    cycle_id = c.id
FROM   budget_cycles c
WHERE  t.budget_centre_id = c.budget_centre_id
  AND  t.date BETWEEN c.start_date AND c.end_date
  AND  t.cycle_id IS NULL;

-- =============================================================================
-- POST-FLIGHT: no live row may be left unattributed (any failure aborts the tx).
-- =============================================================================
DO $$
DECLARE
  cycles_created int;
  orphan_live_tx int;
  orphan_live_income int;
  orphan_live_cat int;
BEGIN
  SELECT count(*) INTO cycles_created FROM budget_cycles;

  SELECT count(*) INTO orphan_live_tx
  FROM transactions WHERE deleted_at IS NULL AND cycle_id IS NULL AND date IS NOT NULL;

  SELECT count(*) INTO orphan_live_income
  FROM income_sources WHERE deleted_at IS NULL AND cycle_id IS NULL;

  SELECT count(*) INTO orphan_live_cat
  FROM budget_categories WHERE deleted_at IS NULL AND cycle_id IS NULL;

  RAISE NOTICE 'POST-FLIGHT: % cycles created; orphans: % live tx, % live income, % live cat',
    cycles_created, orphan_live_tx, orphan_live_income, orphan_live_cat;

  IF orphan_live_tx > 0 OR orphan_live_income > 0 OR orphan_live_cat > 0 THEN
    RAISE EXCEPTION 'Live orphans after backfill: % tx, % income, % cat. Aborting.',
      orphan_live_tx, orphan_live_income, orphan_live_cat;
  END IF;

  RAISE NOTICE 'SUCCESS: backfill complete. % cycles, all live rows assigned.', cycles_created;
END $$;

COMMIT;

-- =============================================================================
-- Optional verification (run separately after COMMIT):
--   SELECT count(*) AS total_cycles FROM budget_cycles;                 -- expect 22
--   SELECT count(*) AS live_orphan_tx FROM transactions
--     WHERE deleted_at IS NULL AND cycle_id IS NULL AND date IS NOT NULL;  -- expect 0
--   SELECT name, start_date, end_date FROM budget_cycles ORDER BY budget_centre_id, start_date;
-- =============================================================================
