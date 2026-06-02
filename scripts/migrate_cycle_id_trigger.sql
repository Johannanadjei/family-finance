-- =============================================================================
-- migrate_cycle_id_trigger.sql
--
-- Commit 10 of the Budget Cycles project — stamp cycle_id at the storage layer.
--
-- WHAT THIS DOES
--   A BEFORE INSERT OR UPDATE trigger on transactions, budget_categories, and
--   income_sources auto-resolves cycle_id from the row's keying column:
--     - transactions:      the cycle whose [start_date, end_date] contains `date`
--     - budget_categories: the cycle whose start_date month == `month` ('YYYY-MM')
--     - income_sources:    the cycle whose start_date month == `month` ('YYYY-MM')
--   If no live cycle matches, it raises SQLSTATE 'CYC02' and the write is rejected.
--
-- WHY A TRIGGER (not client-side resolution)
--   The invariant — "cycle_id always equals the id of the cycle containing this
--   row's date/month" — is enforced at the lowest layer. It cannot be bypassed by
--   any insert path: the React services, the guest-portal RPC (submit_guest_-
--   transaction), future webhooks, admin SQL, or a maintainer who forgets. JS code
--   never sets cycle_id; the trigger owns it. (See docs/engineering-decisions.md,
--   Commit 10 entry, for the Way-1-vs-Way-2 reasoning.)
--
--   >>> If you are reading the JS services/hooks and cannot find where cycle_id is
--   >>> set: it is NOT set in JS. This trigger sets it. That is by design.
--
-- INSERT *AND* UPDATE COVERAGE
--   The trigger fires on INSERT and on UPDATE OF the keying column only
--   (UPDATE OF date / UPDATE OF month). Editing a transaction's date from June to
--   May, or an income source's month, re-resolves cycle_id so it can never drift
--   stale. The UPDATE path is live today via income.service.updateIncomeSource.
--
-- THE TG_OP-AWARE SHORT-CIRCUIT (read before "fixing" the weird-looking guard)
--   The skip-if-already-set guard is gated on TG_OP = 'INSERT'. On INSERT, an
--   explicitly-supplied cycle_id is honoured (manual override / backfill). On
--   UPDATE the guard must NOT short-circuit: NEW.cycle_id is the row's PREVIOUS
--   value and is therefore always populated — an ungated guard would return early
--   every time and silently make the UPDATE coverage a no-op (June→May edit leaves
--   cycle_id pointing at June). This was caught in Phase 3 by tracing the UPDATE
--   path. The guard's shape is deliberate; do not generalise it to UPDATE.
--
-- SECURITY DEFINER (mirrors create_calendar_cycle, Commit 3)
--   The trigger's job is data integrity, not authorization. Authorization happens
--   at row-level RLS on the target table — once an INSERT/UPDATE is permitted, the
--   trigger must ALWAYS be able to find the cycle, regardless of whether the caller
--   can SELECT budget_cycles under their own RLS. DEFINER guarantees that for every
--   path including the anon guest RPC. SET search_path = public per the same pattern.
--
-- NULL keying column = STRICT (raise CYC02)
--   Verified in Phase 3: no legitimate runtime path inserts a NULL date or NULL
--   month (lib/validation.js enforces YYYY-MM-DD / YYYY-MM on every service insert;
--   the guest RPC inserts a required p_date). A NULL-keyed live financial row is
--   itself a bug, so we surface it rather than silently leave cycle_id NULL.
--
-- Run this entire file in the Supabase SQL editor in one go, BEFORE the backfill
-- (scripts/migrate_backfill_cycle_ids.sql). Safe to re-run — CREATE OR REPLACE on
-- the function and DROP TRIGGER IF EXISTS before each CREATE TRIGGER.
--
-- ── ROLLBACK (safe pre-Commit-13; the month columns still exist) ──────────────
--   DROP TRIGGER IF EXISTS auto_resolve_cycle_id_transactions      ON transactions;
--   DROP TRIGGER IF EXISTS auto_resolve_cycle_id_budget_categories ON budget_categories;
--   DROP TRIGGER IF EXISTS auto_resolve_cycle_id_income_sources    ON income_sources;
--   DROP FUNCTION IF EXISTS resolve_cycle_id();
--   (After Commit 13 drops the month columns the trigger becomes irreplaceable.)
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION resolve_cycle_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle_id uuid;
BEGIN
  -- Short-circuit ONLY on INSERT when cycle_id was explicitly provided (manual
  -- override / backfill). On UPDATE the guard must NOT fire — the trigger fires
  -- only when the keying column actually changed (UPDATE OF date/month), and
  -- NEW.cycle_id is the row's previous (always-populated) value, so an ungated
  -- guard would return early and never re-resolve. See file header.
  IF TG_OP = 'INSERT' AND NEW.cycle_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'transactions' THEN
    IF NEW.date IS NULL THEN
      RAISE EXCEPTION 'Cannot resolve cycle_id: transaction date is NULL'
        USING ERRCODE = 'CYC02';
    END IF;

    SELECT id INTO v_cycle_id
    FROM budget_cycles
    WHERE budget_centre_id = NEW.budget_centre_id
      AND NEW.date BETWEEN start_date AND end_date
      AND deleted_at IS NULL
    LIMIT 1;   -- the no_overlapping_cycles GiST constraint guarantees <= 1 live match

    IF v_cycle_id IS NULL THEN
      RAISE EXCEPTION 'No cycle exists containing date % in centre %',
        NEW.date, NEW.budget_centre_id
        USING ERRCODE = 'CYC02';
    END IF;

  ELSIF TG_TABLE_NAME IN ('budget_categories', 'income_sources') THEN
    IF NEW.month IS NULL THEN
      RAISE EXCEPTION 'Cannot resolve cycle_id: % month is NULL', TG_TABLE_NAME
        USING ERRCODE = 'CYC02';
    END IF;

    SELECT id INTO v_cycle_id
    FROM budget_cycles
    WHERE budget_centre_id = NEW.budget_centre_id
      AND to_char(start_date, 'YYYY-MM') = NEW.month
      AND deleted_at IS NULL
    LIMIT 1;

    IF v_cycle_id IS NULL THEN
      RAISE EXCEPTION 'No cycle exists for month % in centre %',
        NEW.month, NEW.budget_centre_id
        USING ERRCODE = 'CYC02';
    END IF;
  END IF;

  NEW.cycle_id := v_cycle_id;
  RETURN NEW;
END;
$$;

-- Triggers — INSERT always; UPDATE only when the keying column is in the SET list.
-- DROP-IF-EXISTS first so the file is safe to re-run.
DROP TRIGGER IF EXISTS auto_resolve_cycle_id_transactions ON transactions;
CREATE TRIGGER auto_resolve_cycle_id_transactions
  BEFORE INSERT OR UPDATE OF date ON transactions
  FOR EACH ROW EXECUTE FUNCTION resolve_cycle_id();

DROP TRIGGER IF EXISTS auto_resolve_cycle_id_budget_categories ON budget_categories;
CREATE TRIGGER auto_resolve_cycle_id_budget_categories
  BEFORE INSERT OR UPDATE OF month ON budget_categories
  FOR EACH ROW EXECUTE FUNCTION resolve_cycle_id();

DROP TRIGGER IF EXISTS auto_resolve_cycle_id_income_sources ON income_sources;
CREATE TRIGGER auto_resolve_cycle_id_income_sources
  BEFORE INSERT OR UPDATE OF month ON income_sources
  FOR EACH ROW EXECUTE FUNCTION resolve_cycle_id();

COMMIT;

-- =============================================================================
-- Manual validation (run AFTER this file, AFTER the backfill, in the SQL editor):
--
--   -- INSERT auto-stamps cycle_id (use a centre + date inside an existing cycle):
--   INSERT INTO transactions (budget_centre_id, amount, category_name, date, week,
--                             currency, type, source, logged_by_name)
--   VALUES ('<centre>'::uuid, 100, 'Test', '2026-06-15', 'Week 3', 'GBP',
--           'expense', 'manual_test', 'tester')
--   RETURNING id, date, cycle_id;            -- cycle_id should be non-null
--
--   -- UPDATE re-resolves when date moves to another cycle:
--   UPDATE transactions SET date = '2026-05-15' WHERE id = '<the row above>'
--   RETURNING date, cycle_id;                -- cycle_id should change to May's cycle
--
--   -- Out-of-range date is rejected with SQLSTATE CYC02:
--   INSERT INTO transactions (budget_centre_id, amount, category_name, date, week,
--                             currency, type, source, logged_by_name)
--   VALUES ('<centre>'::uuid, 100, 'Test', '1999-01-01', 'Week 1', 'GBP',
--           'expense', 'manual_test', 'tester');   -- expect ERROR ... CYC02
-- =============================================================================
