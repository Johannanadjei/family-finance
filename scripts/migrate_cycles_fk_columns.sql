-- =============================================================================
-- migrate_cycles_fk_columns.sql
--
-- Commit 2a of the Budget Cycles project — FK columns + indexes only.
-- Additive and INERT to existing code: the columns are nullable, so old code
-- (which never reads or writes cycle_id) keeps working untouched. No data is
-- changed here — the backfill is a separate file (migrate_cycles_backfill.sql).
--
-- Run this entire file in the Supabase SQL editor in one go, BEFORE the backfill.
-- Safe to re-run — all DDL uses IF EXISTS / IF NOT EXISTS guards.
--
-- Why ON DELETE SET NULL (not CASCADE): the app never hard-deletes (soft delete
-- via deleted_at), so this FK action is a defensive backstop. SET NULL preserves
-- the tx/income/category row as an audit record if a cycle is ever hard-deleted;
-- CASCADE would destroy that history. Mirrors migrate_income_source_fk.sql.
--
-- Rollback (only AFTER reverting any code that reads cycle_id; a nullable column
-- is inert to old code, so leaving it in place is also safe):
--   ALTER TABLE transactions      DROP CONSTRAINT IF EXISTS transactions_cycle_id_fkey;
--   ALTER TABLE income_sources    DROP CONSTRAINT IF EXISTS income_sources_cycle_id_fkey;
--   ALTER TABLE budget_categories DROP CONSTRAINT IF EXISTS budget_categories_cycle_id_fkey;
--   DROP INDEX IF EXISTS idx_transactions_cycle;
--   DROP INDEX IF EXISTS idx_income_sources_cycle;
--   DROP INDEX IF EXISTS idx_budget_categories_cycle;
--   ALTER TABLE transactions      DROP COLUMN IF EXISTS cycle_id;
--   ALTER TABLE income_sources    DROP COLUMN IF EXISTS cycle_id;
--   ALTER TABLE budget_categories DROP COLUMN IF EXISTS cycle_id;
-- =============================================================================

BEGIN;

-- 1. Add cycle_id columns (nullable; no constraint yet — added separately below).
ALTER TABLE transactions      ADD COLUMN IF NOT EXISTS cycle_id uuid;
ALTER TABLE income_sources    ADD COLUMN IF NOT EXISTS cycle_id uuid;
ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS cycle_id uuid;

-- 2. Add FK constraints separately (guarded via pg_constraint check — idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_cycle_id_fkey') THEN
    ALTER TABLE transactions ADD CONSTRAINT transactions_cycle_id_fkey
      FOREIGN KEY (cycle_id) REFERENCES budget_cycles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'income_sources_cycle_id_fkey') THEN
    ALTER TABLE income_sources ADD CONSTRAINT income_sources_cycle_id_fkey
      FOREIGN KEY (cycle_id) REFERENCES budget_cycles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_categories_cycle_id_fkey') THEN
    ALTER TABLE budget_categories ADD CONSTRAINT budget_categories_cycle_id_fkey
      FOREIGN KEY (cycle_id) REFERENCES budget_cycles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Lookup indexes on the new FK columns.
CREATE INDEX IF NOT EXISTS idx_transactions_cycle      ON transactions(cycle_id);
CREATE INDEX IF NOT EXISTS idx_income_sources_cycle    ON income_sources(cycle_id);
CREATE INDEX IF NOT EXISTS idx_budget_categories_cycle ON budget_categories(cycle_id);

-- 4. Verification — fail loud if any column is missing.
DO $$
DECLARE
  tx_col bool; in_col bool; cat_col bool;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='transactions' AND column_name='cycle_id') INTO tx_col;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='income_sources' AND column_name='cycle_id') INTO in_col;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_name='budget_categories' AND column_name='cycle_id') INTO cat_col;
  IF NOT (tx_col AND in_col AND cat_col) THEN
    RAISE EXCEPTION 'cycle_id columns missing after migration (tx=%, income=%, cat=%)',
      tx_col, in_col, cat_col;
  END IF;
  RAISE NOTICE 'FK columns OK: cycle_id present on transactions, income_sources, budget_categories';
END $$;

COMMIT;
