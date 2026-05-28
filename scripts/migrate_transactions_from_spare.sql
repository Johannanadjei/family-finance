-- migrate_transactions_from_spare.sql
--
-- Adds the from_spare flag to the transactions table.
-- Run ONCE in the Supabase SQL Editor.
--
-- Semantics:
--   from_spare = false (default) → expense draws from BUDGET first; overflow
--                                  beyond fixedTotal auto-spills into spare.
--   from_spare = true            → expense draws DIRECTLY from spare; does
--                                  not consume budget, does not affect
--                                  Budget Health bar / budgetRemaining.
--
-- Default-false covers:
--   • all pre-existing rows (their semantics under the new model match the
--     old "draws from budget" behaviour exactly)
--   • the guest portal (submit_guest_transaction.sql does not set this column —
--     guests have no UI to choose pool)
--   • the markReceived income-tx insert in useFinance.js (income txs are never
--     from_spare; the default is correct)
--
-- Rollback: ALTER TABLE transactions DROP COLUMN from_spare;

ALTER TABLE transactions
ADD COLUMN from_spare boolean NOT NULL DEFAULT false;
