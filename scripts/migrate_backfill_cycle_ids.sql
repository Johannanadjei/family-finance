-- =============================================================================
-- migrate_backfill_cycle_ids.sql
--
-- Commit 10 of the Budget Cycles project — one-shot backfill of NULL cycle_id rows.
--
-- WHY THIS EXISTS
--   The Commit 2b backfill (migrate_cycles_backfill.sql) stamped every row that
--   existed then. Commits 3–9 were JS-only and never wrote cycle_id, so any row the
--   app has inserted since 2b has cycle_id = NULL. This file fills those gaps.
--   From Commit 10 onward the trigger (migrate_cycle_id_trigger.sql) keeps every
--   NEW row stamped; this backfill closes the historical window.
--
-- PREREQUISITE / ORDER
--   Run migrate_cycle_id_trigger.sql FIRST, then this file. (Order is not strictly
--   required for correctness — these UPDATEs set cycle_id only, so the trigger's
--   UPDATE OF date / UPDATE OF month does NOT fire on them — but trigger-first means
--   new inserts are already stamped live while this mops up the old NULLs.)
--
-- JOIN LOGIC (verified against the proven Commit 2b backfill)
--   - transactions:      date containment, t.date BETWEEN c.start_date AND c.end_date
--   - budget_categories: to_char(c.start_date,'YYYY-MM') = cat.month
--   - income_sources:    to_char(c.start_date,'YYYY-MM') = i.month
--   All three add `c.deleted_at IS NULL` (cycles are soft-deletable now; the 2b
--   backfill omitted it only because cycles were freshly created) and a keying-column
--   NOT NULL guard. The no_overlapping_cycles GiST constraint guarantees at most one
--   live cycle per (centre, date), so each row matches exactly one cycle.
--
-- SCOPE
--   Small (a few-family household app; Commit 2b created 22 cycles total). A single
--   UPDATE per table is fine — no batching needed.
--
-- IDEMPOTENT: every UPDATE is gated on `cycle_id IS NULL`, so re-running is a no-op
-- once the rows are filled.
--
-- ── ROLLBACK (safe pre-Commit-13; reversible via the still-present month column) ──
--   -- Only the rows this run touched were NULL beforehand; to revert them:
--   UPDATE transactions      SET cycle_id = NULL WHERE source = '...';  -- (scope as needed)
--   In practice the backfill is treated as permanent once Commit 10 ships.
-- =============================================================================

BEGIN;

-- =============================================================================
-- PRE-FLIGHT: report the NULL-cycle_id backlog before touching anything.
-- =============================================================================
DO $$
DECLARE
  null_tx     int;
  null_cat    int;
  null_income int;
BEGIN
  SELECT count(*) INTO null_tx     FROM transactions      WHERE cycle_id IS NULL;
  SELECT count(*) INTO null_cat    FROM budget_categories WHERE cycle_id IS NULL;
  SELECT count(*) INTO null_income FROM income_sources    WHERE cycle_id IS NULL;
  RAISE NOTICE 'PRE-FLIGHT: NULL cycle_id rows — % transactions, % categories, % income_sources',
    null_tx, null_cat, null_income;
END $$;

-- =============================================================================
-- STEP 1: transactions — date containment.
-- =============================================================================
UPDATE transactions t
SET    cycle_id = c.id
FROM   budget_cycles c
WHERE  t.budget_centre_id = c.budget_centre_id
  AND  t.date BETWEEN c.start_date AND c.end_date
  AND  c.deleted_at IS NULL
  AND  t.cycle_id IS NULL;

-- =============================================================================
-- STEP 2: budget_categories — month string match.
-- =============================================================================
UPDATE budget_categories cat
SET    cycle_id = c.id
FROM   budget_cycles c
WHERE  cat.budget_centre_id = c.budget_centre_id
  AND  to_char(c.start_date, 'YYYY-MM') = cat.month
  AND  c.deleted_at IS NULL
  AND  cat.month   IS NOT NULL
  AND  cat.cycle_id IS NULL;

-- =============================================================================
-- STEP 3: income_sources — month string match.
-- =============================================================================
UPDATE income_sources i
SET    cycle_id = c.id
FROM   budget_cycles c
WHERE  i.budget_centre_id = c.budget_centre_id
  AND  to_char(c.start_date, 'YYYY-MM') = i.month
  AND  c.deleted_at IS NULL
  AND  i.month   IS NOT NULL
  AND  i.cycle_id IS NULL;

-- =============================================================================
-- POST-FLIGHT: no LIVE row with a keying value may be left unattributed.
-- (Soft-deleted rows whose cycle was hard-deleted, or NULL-month historical rows,
--  are tolerated — they are audit records, not live state.)
-- =============================================================================
DO $$
DECLARE
  orphan_live_tx     int;
  orphan_live_cat    int;
  orphan_live_income int;
BEGIN
  SELECT count(*) INTO orphan_live_tx
  FROM transactions
  WHERE deleted_at IS NULL AND cycle_id IS NULL AND date IS NOT NULL;

  SELECT count(*) INTO orphan_live_cat
  FROM budget_categories
  WHERE deleted_at IS NULL AND cycle_id IS NULL AND month IS NOT NULL;

  SELECT count(*) INTO orphan_live_income
  FROM income_sources
  WHERE deleted_at IS NULL AND cycle_id IS NULL AND month IS NOT NULL;

  RAISE NOTICE 'POST-FLIGHT: live orphans — % transactions, % categories, % income_sources',
    orphan_live_tx, orphan_live_cat, orphan_live_income;

  IF orphan_live_tx > 0 OR orphan_live_cat > 0 OR orphan_live_income > 0 THEN
    RAISE EXCEPTION 'Live orphans after backfill: % tx, % cat, % income. Aborting — a live row has a date/month with no covering cycle.',
      orphan_live_tx, orphan_live_cat, orphan_live_income;
  END IF;

  RAISE NOTICE 'SUCCESS: backfill complete. All live keyed rows have a cycle_id.';
END $$;

COMMIT;

-- =============================================================================
-- Verification (run separately after COMMIT — all three should return 0):
--   SELECT count(*) FROM transactions
--     WHERE deleted_at IS NULL AND cycle_id IS NULL AND date  IS NOT NULL;
--   SELECT count(*) FROM budget_categories
--     WHERE deleted_at IS NULL AND cycle_id IS NULL AND month IS NOT NULL;
--   SELECT count(*) FROM income_sources
--     WHERE deleted_at IS NULL AND cycle_id IS NULL AND month IS NOT NULL;
-- =============================================================================
