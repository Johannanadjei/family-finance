-- =============================================================================
-- migrate_move_cycle_trigger.sql
--
-- Commit 12 of the Budget Cycles project — let a transaction be MOVED to another
-- cycle by writing cycle_id directly, while preserving its date.
--
-- WHAT THIS DOES
--   Amends the Commit-10 resolve_cycle_id() trigger function with a TG_OP='UPDATE'
--   branch, and WIDENS the transactions trigger's column scope so the branch can
--   actually fire:
--     BEFORE INSERT OR UPDATE OF date            (Commit 10 — date only)
--     BEFORE INSERT OR UPDATE OF date, cycle_id  (Commit 12 — date OR cycle_id)
--
-- WHY (the move-by-cycle_id decision — Path 2, NOT move-by-date)
--   "Move this transaction to June's budget" must preserve the transaction's real
--   date ("I bought groceries on May 31"). Date intent and budget intent are
--   distinct facts; re-homing by editing the date (Path 1) would destroy the date.
--   So the move writes cycle_id directly. But cycle_id is a trigger-owned derived
--   field (Commit 10) — the trigger would normally re-resolve it from date and
--   clobber the move. This branch tells the trigger: when the caller explicitly
--   changes cycle_id, TRUST them and do not re-resolve.
--
-- THE FOUR CASES (all handled correctly)
--   1. INSERT, cycle_id NULL          → resolve from date            (Commit 10)
--   2. INSERT, cycle_id set            → trust caller                 (Commit 10)
--   3. UPDATE OF date only             → re-resolve from new date     (Commit 10)
--      (cycle_id unchanged: OLD.cycle_id = NEW.cycle_id, branch falls through)
--   4. UPDATE where cycle_id changed   → trust caller, do NOT override (Commit 12)
--      (covers cycle_id-only moves AND combined date+cycle_id updates: a changed
--       cycle_id always wins, the date is never used to re-resolve)
--
-- WHY WIDEN THE COLUMN SCOPE (not leave it at UPDATE OF date)
--   With the trigger still scoped to UPDATE OF date, a cycle_id-only move would
--   simply not fire the trigger — the move would persist, but the new branch would
--   be unreachable DEAD CODE, and a future combined date+cycle_id UPDATE would fire
--   on `date` and silently re-resolve cycle_id from the date, discarding the move.
--   Widening to (date, cycle_id) makes the branch the single, explicit arbiter of
--   "caller set cycle_id → trust it" for every transactions UPDATE path.
--
-- SCOPE IS TRANSACTIONS-ONLY
--   Only the transactions trigger widens. budget_categories / income_sources keep
--   their UPDATE OF month scope — there is no move-category / move-income feature.
--   The shared function gains the branch, but for those tables a cycle_id-only
--   change never enters their UPDATE OF month list, so their behaviour is unchanged
--   (a month edit still re-resolves: cycle_id unchanged → branch falls through).
--
-- KNOWN LATENT INTERACTION (documented, out of scope for Commit 12)
--   A transaction moved to another cycle has cycle_id deliberately != the cycle of
--   its date. If a FUTURE date-edit path (the dead AddTransactionSheet edit flow,
--   revival logged separately) later fires UPDATE OF date with cycle_id unchanged,
--   case 3 re-resolves cycle_id from the date and silently reverts the move. This
--   is acceptable: editing the date is itself an intent change, and no date-edit
--   path is reachable in Commit 12. See docs/engineering-decisions.md (Commit 12).
--
-- SECURITY DEFINER, search_path, CYC02 strictness — all unchanged from Commit 10.
--
-- Run this entire file in the Supabase SQL editor in one go. Safe to re-run —
-- CREATE OR REPLACE on the function, DROP TRIGGER IF EXISTS before each CREATE.
--
-- ── ROLLBACK (restores the Commit-10 behaviour) ──────────────────────────────
--   Re-run scripts/migrate_cycle_id_trigger.sql (it CREATE-OR-REPLACEs the function
--   without the UPDATE branch and re-creates the transactions trigger at
--   BEFORE INSERT OR UPDATE OF date). The cycle_id values written by any move stay
--   put; only future re-resolution behaviour reverts.
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
  -- Case 2 — INSERT with an explicitly-provided cycle_id (manual override /
  -- backfill / the Commit-11.5 optimistic stamp): honour it, skip resolution.
  IF TG_OP = 'INSERT' AND NEW.cycle_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Case 4 (Commit 12) — UPDATE where the caller explicitly CHANGED cycle_id (a
  -- move). Trust the caller; do NOT re-resolve from date. IS DISTINCT FROM is
  -- null-safe and false when cycle_id is untouched (case 3: a date-only UPDATE
  -- leaves NEW.cycle_id = OLD.cycle_id, so this falls through to re-resolve).
  -- This branch is reachable for transactions only — its trigger fires on
  -- UPDATE OF (date, cycle_id); the categories/income triggers fire on
  -- UPDATE OF month, where cycle_id never changes within the SET list.
  IF TG_OP = 'UPDATE' AND OLD.cycle_id IS DISTINCT FROM NEW.cycle_id THEN
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

-- Transactions — INSERT always; UPDATE when EITHER date OR cycle_id is in the SET
-- list. The widened cycle_id scope (Commit 12) is what makes the move branch above
-- reachable. DROP-IF-EXISTS first so the file is safe to re-run.
DROP TRIGGER IF EXISTS auto_resolve_cycle_id_transactions ON transactions;
CREATE TRIGGER auto_resolve_cycle_id_transactions
  BEFORE INSERT OR UPDATE OF date, cycle_id ON transactions
  FOR EACH ROW EXECUTE FUNCTION resolve_cycle_id();

-- Categories / income — UNCHANGED (UPDATE OF month only). Re-created here so the
-- file is self-contained and the function swap above stays consistent with them.
DROP TRIGGER IF EXISTS auto_resolve_cycle_id_budget_categories ON budget_categories;
CREATE TRIGGER auto_resolve_cycle_id_budget_categories
  BEFORE INSERT OR UPDATE OF month ON budget_categories
  FOR EACH ROW EXECUTE FUNCTION resolve_cycle_id();

DROP TRIGGER IF EXISTS auto_resolve_cycle_id_income_sources ON income_sources;
CREATE TRIGGER auto_resolve_cycle_id_income_sources
  BEFORE INSERT OR UPDATE OF month ON income_sources
  FOR EACH ROW EXECUTE FUNCTION resolve_cycle_id();

COMMIT;

-- ── VERIFY (run after COMMIT; replace <centre> / <tx> with real ids) ─────────
--   -- A move re-homes cycle_id but PRESERVES the date:
--   UPDATE transactions SET cycle_id = '<other-cycle>'::uuid WHERE id = '<tx>'
--   RETURNING date, cycle_id;          -- cycle_id = the new cycle; date unchanged
--
--   -- A date-only edit still re-resolves cycle_id from the new date (case 3):
--   UPDATE transactions SET date = '2026-05-15' WHERE id = '<tx>'
--   RETURNING date, cycle_id;          -- cycle_id follows the date to May's cycle
--
--   -- A combined edit trusts the explicit cycle_id (case 4 — cycle_id wins):
--   UPDATE transactions SET date = '2026-05-15', cycle_id = '<june-cycle>'::uuid
--   WHERE id = '<tx>' RETURNING date, cycle_id;   -- cycle_id = June, NOT May
-- =============================================================================
