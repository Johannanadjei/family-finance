-- migrate_income_source_fk.sql
--
-- Adds a durable foreign key from income transactions to their income source,
-- replacing the fragile string match (category_name === income.label) that
-- orphaned transactions on every label edit and left them as data debris on
-- every source delete. See docs/engineering-decisions.md (income-source-fk).
--
-- Run ONCE in the Supabase SQL Editor, IN ORDER, BEFORE deploying the code
-- change. Steps 1–4 are idempotent (safe to re-run). Run STEP 2 (dry-run) and
-- eyeball the counts before running STEP 3 (backfill).
--
-- Deploy order (must hold):
--   1. Run this migration (column nullable → old code keeps working untouched).
--   2. Verify STEP 2 counts look sane (unmatched count is expected to cover
--      manually-logged income; a HIGH unmatched count among salary-style txs
--      means STOP and investigate before STEP 3).
--   3. Deploy the code change (markReceived writes the FK, markPending matches
--      by FK, edit/delete reconcile the linked tx).
--
-- Why ON DELETE SET NULL (not CASCADE):
--   The app never hard-deletes (soft delete via deleted_at), so this FK action
--   is a defensive backstop that rarely fires. SET NULL preserves the income
--   transaction as an audit record if a source row is ever hard-deleted;
--   CASCADE would destroy that history. The operative delete path is the
--   two-phase soft-delete in useFinance.deleteIncomeSource.
--
-- Backfill discriminator:
--   markReceived writes  category_name = <label>  AND  description = <label> || ' received'.
--   Manually-logged income (FAB / AddTransactionSheet) shares source='main_app'
--   but does NOT carry the ' received' description, so it is correctly left
--   unlinked (income_source_id NULL). Sources sharing a label within one centre
--   are ambiguous and are also left NULL (NOT EXISTS guard below).
--
-- Rollback:
--   ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_income_source_id_fkey;
--   DROP INDEX   IF EXISTS idx_transactions_income_source_id;
--   ALTER TABLE  transactions DROP COLUMN     IF EXISTS income_source_id;
--   (Only drop the column AFTER reverting any deployed code that reads it.
--    A nullable column is inert to old code, so leaving it in place is also safe.)

-- ── STEP 1 — add the column (nullable; no constraint yet) ────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS income_source_id uuid;

-- ── STEP 2 — DRY RUN: preview the backfill before mutating anything ──────────
-- Run this SELECT on its own first. Expectation: `would_link` covers the
-- markReceived-style income txs; `unmatched` covers manual income + ambiguous.
-- A large `unmatched` among rows whose description ends in ' received' is the
-- signal to STOP and investigate.
SELECT
  count(*) FILTER (WHERE t.type = 'income' AND t.deleted_at IS NULL)                                AS income_txs_total,
  count(*) FILTER (
    WHERE t.type = 'income' AND t.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM income_sources s
        WHERE s.budget_centre_id = t.budget_centre_id
          AND s.deleted_at IS NULL
          AND t.category_name = s.label
          AND t.description    = s.label || ' received'
          AND NOT EXISTS (
            SELECT 1 FROM income_sources s2
            WHERE s2.budget_centre_id = s.budget_centre_id
              AND s2.label = s.label AND s2.deleted_at IS NULL AND s2.id <> s.id
          )
      )
  )                                                                                                 AS would_link,
  count(*) FILTER (
    WHERE t.type = 'income' AND t.deleted_at IS NULL
      AND t.description LIKE '% received'
      AND NOT EXISTS (
        SELECT 1 FROM income_sources s
        WHERE s.budget_centre_id = t.budget_centre_id
          AND s.deleted_at IS NULL
          AND t.category_name = s.label
          AND t.description    = s.label || ' received'
      )
  )                                                                                                 AS received_style_unmatched
FROM transactions t;

-- ── STEP 3 — backfill (only unambiguous markReceived-style matches) ──────────
UPDATE transactions t
SET    income_source_id = s.id
FROM   income_sources s
WHERE  t.budget_centre_id = s.budget_centre_id
  AND  t.type             = 'income'
  AND  t.income_source_id IS NULL
  AND  t.deleted_at       IS NULL
  AND  s.deleted_at       IS NULL
  AND  t.category_name    = s.label
  AND  t.description       = s.label || ' received'
  -- skip ambiguous: same label maps to >1 live source in the same centre
  AND  NOT EXISTS (
         SELECT 1 FROM income_sources s2
         WHERE s2.budget_centre_id = s.budget_centre_id
           AND s2.label = s.label AND s2.deleted_at IS NULL AND s2.id <> s.id
       );

-- ── STEP 4 — add the FK constraint + lookup index (idempotent) ───────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_income_source_id_fkey'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_income_source_id_fkey
      FOREIGN KEY (income_source_id) REFERENCES income_sources(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_income_source_id
  ON transactions(income_source_id);
