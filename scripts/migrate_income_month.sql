-- migrate_income_month.sql
--
-- Phase 2A — month-scopes income_sources. Each source row gains a `month`
-- ('YYYY-MM') so income becomes per-month (one row per source per month),
-- mirroring budget_categories.month. This is the FOUNDATION for the deferred
-- rollforward model (Commit 2). See docs/engineering-decisions.md (income-month-scoping).
--
-- It also resolves the income transactions left with income_source_id NULL by
-- the FK migration (the manual/one-off income that never had a source): each is
-- linked to a per-(hub, month) "Other Income" bucket source.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DEPLOY ORDER (must hold — STEP 6 is NOT reversible once old code is gone):
--
--   1. Run STEP 2 (pure SELECT — mutates nothing). Paste counts back for review.
--   2. After review: run STEP 1, then STEPS 3, 4, 5 (all leave `month` NULLABLE,
--      so pre-2A client code keeps inserting NULL-month rows without error).
--   3. DEPLOY the Phase 2A code (every income_sources insert now supplies `month`).
--   4. RE-RUN STEP 3 — mops up any NULL-month rows created in the gap between
--      step 2 and the deploy.
--   5. Run STEP 6 (SET NOT NULL + CHECK + index). Safe ONLY after the deploy,
--      because pre-2A code creates NULL-month rows that would violate NOT NULL.
--
-- This INVERTS the FK migration's ordering: there the column stayed nullable
-- forever so order was free; here STEP 6 hardens the column, so the new code
-- MUST be live first.
--
-- Rollback (only safe BEFORE STEP 6's SET NOT NULL):
--   DROP INDEX     IF EXISTS idx_income_sources_centre_month;
--   ALTER TABLE    income_sources DROP CONSTRAINT IF EXISTS income_sources_month_format;
--   ALTER TABLE    income_sources ALTER COLUMN month DROP NOT NULL;   -- if STEP 6 ran
--   ALTER TABLE    income_sources DROP COLUMN     IF EXISTS month;
--   -- The "Other Income" buckets (notes = '__one_off_bucket__') and the tx links
--   -- are data, not schema — drop them only if you also intend to revert the
--   -- backfill (and re-NULL the linked txs' income_source_id).
-- ─────────────────────────────────────────────────────────────────────────────


-- ── STEP 2 — DRY RUN (run FIRST, before STEP 1 — pure SELECT, no mutation) ────
-- 2a. Backfill counts. Expectation: null_income_txs_total = 22 (must match the
--     FK migration). buckets_to_create = unique (hub, month) tuples among them.
SELECT
  (SELECT count(*) FROM income_sources WHERE deleted_at IS NULL)                                  AS income_sources_total,
  (SELECT count(*) FROM income_sources s
     WHERE s.deleted_at IS NULL
       AND EXISTS (SELECT 1 FROM transactions t
                   WHERE t.income_source_id = s.id AND t.deleted_at IS NULL))                     AS with_linked_txs,
  (SELECT count(*) FROM income_sources s
     WHERE s.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM transactions t
                       WHERE t.income_source_id = s.id AND t.deleted_at IS NULL))                 AS without_linked_txs,
  (SELECT count(*) FROM transactions
     WHERE type = 'income' AND deleted_at IS NULL AND income_source_id IS NULL)                    AS null_income_txs_total,
  (SELECT count(*) FROM (
     SELECT DISTINCT budget_centre_id, to_char(date, 'YYYY-MM')
     FROM transactions
     WHERE type = 'income' AND deleted_at IS NULL AND income_source_id IS NULL) q)                 AS buckets_to_create,
  -- Sources that are soft-deleted (deleted_at NOT NULL). These ALSO get a month
  -- in STEP 3, because STEP 6's SET NOT NULL applies to every row, deleted or not.
  (SELECT count(*) FROM income_sources WHERE deleted_at IS NOT NULL)                              AS soft_deleted_sources;

-- 2b. NOT NULL audit — confirms every column STEP 4's bucket INSERT must supply.
--     In particular verify `currency` is NOT NULL (it is in the app; the INSERT
--     sets it from the hub). Surface any other NOT NULL column with no default
--     that the bucket INSERT does not already cover (label, icon, expected_amount,
--     received, received_amount, month, notes are set; pay_day/pay_day_type set).
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'income_sources'
ORDER BY ordinal_position;

-- 2c. Per-bucket preview — the exact (hub, month) groups STEP 4 will create, the
--     tx count, summed amount (→ received_amount), and the original categories
--     that collapse into each bucket (category_name is preserved on each tx).
SELECT
  budget_centre_id,
  to_char(date, 'YYYY-MM')        AS month,
  count(*)                        AS txs,
  sum(amount)                     AS total_amount,
  array_agg(DISTINCT category_name) AS collapsed_categories
FROM transactions
WHERE type = 'income' AND deleted_at IS NULL AND income_source_id IS NULL
GROUP BY 1, 2
ORDER BY 1, 2;


-- ── STEP 1 — add the column (nullable; no constraint yet; inert to old code) ──
ALTER TABLE income_sources
  ADD COLUMN IF NOT EXISTS month text;


-- ── STEP 3 — backfill EXISTING sources with a month ──────────────────────────
-- Month = the earliest linked (non-deleted) income tx's month; if a source has
-- no linked tx, fall back to its created_at month (the month it was set up in —
-- NOT the current month, which would misdate historical sources).
-- No deleted_at filter: soft-deleted rows must also get a month or STEP 6 fails.
-- Idempotent + re-runnable (the deploy-gap mop-up in DEPLOY ORDER step 4 re-runs
-- this): only touches rows still missing a month.
UPDATE income_sources s
SET month = COALESCE(
  (SELECT to_char(min(t.date), 'YYYY-MM')
     FROM transactions t
     WHERE t.income_source_id = s.id
       AND t.deleted_at IS NULL),
  to_char(s.created_at, 'YYYY-MM')
)
WHERE s.month IS NULL;


-- ── STEP 4 — create one "Other Income" bucket per (hub, month) ───────────────
-- Bug A: no `flexible` column (it never existed) — removed.
-- Bug B: currency pulled from the hub; icon defaulted to '💰' (else IncomeCard
--        renders an empty span and the row has no currency on a NOT NULL column).
-- Bug C: tagged with notes = '__one_off_bucket__' (a load-bearing marker used
--        ONLY for idempotency + STEP 5 linking — never matched on the human label
--        'Other Income', so a user's own source named "Other Income" is untouched).
--        NOT EXISTS guard on the marker replaces the inert ON CONFLICT DO NOTHING,
--        giving real idempotency (re-running creates no duplicates).
-- Bug D: received_amount = SUM(tx.amount) so current-month source-based
--        totalReceived stays consistent with the tx-based income total.
-- Point 6: pay_day_type = 'flexible' (not null) — semantically "no schedule",
--        avoids the IncomeCard "Day null" render, needs no validation carve-out.
INSERT INTO income_sources
  (id, budget_centre_id, label, icon, expected_amount, currency,
   month, received, received_amount, pay_day_type, pay_day, notes)
SELECT
  gen_random_uuid(),
  t.budget_centre_id,
  'Other Income',
  '💰',
  0,
  (SELECT bc.currency FROM budget_centres bc WHERE bc.id = t.budget_centre_id),
  to_char(t.date, 'YYYY-MM'),
  true,                       -- per Q2: these historical txs were already received
  sum(t.amount),             -- per Bug D: keeps source-based totalReceived honest
  'flexible',                -- per Point 6: one-off / ad-hoc, no fixed pay day
  null,
  '__one_off_bucket__'       -- per Bug C: idempotency + STEP 5 link marker
FROM transactions t
WHERE t.income_source_id IS NULL
  AND t.type        = 'income'
  AND t.deleted_at  IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM income_sources s
    WHERE s.budget_centre_id = t.budget_centre_id
      AND s.month            = to_char(t.date, 'YYYY-MM')
      AND s.notes            = '__one_off_bucket__'
      AND s.deleted_at       IS NULL
  )
GROUP BY t.budget_centre_id, to_char(t.date, 'YYYY-MM');


-- ── STEP 5 — link each NULL income tx to its (hub, month) bucket ─────────────
-- Matches on the marker + month, NOT the label (Bug C) — deterministic even if a
-- hub has a real user source called "Other Income". After this runs, the NULL set
-- is empty, which is what makes a full re-run of STEP 4 a no-op.
UPDATE transactions t
SET income_source_id = s.id
FROM income_sources s
WHERE t.income_source_id IS NULL
  AND t.type        = 'income'
  AND t.deleted_at  IS NULL
  AND s.budget_centre_id = t.budget_centre_id
  AND s.notes            = '__one_off_bucket__'
  AND s.month            = to_char(t.date, 'YYYY-MM')
  AND s.deleted_at       IS NULL;


-- ── STEP 6 — harden: NOT NULL + format CHECK + lookup index ──────────────────
-- RUN ONLY AFTER the Phase 2A code is deployed (see DEPLOY ORDER). Re-run STEP 3
-- immediately before this to mop up any NULL-month rows from the deploy gap.
ALTER TABLE income_sources
  ALTER COLUMN month SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'income_sources_month_format'
  ) THEN
    ALTER TABLE income_sources
      ADD CONSTRAINT income_sources_month_format CHECK (month ~ '^\d{4}-\d{2}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_income_sources_centre_month
  ON income_sources(budget_centre_id, month);
