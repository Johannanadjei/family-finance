-- =============================================================================
-- migrate_20_income_currency_backfill.sql
--
-- One-shot DATA backfill: align income_sources.currency with the owning hub's
-- currency. The hub (budget_centres.currency) is the single source of truth for
-- how money is displayed — every amount on the Payday screen is formatted with
-- the hub's fmt(), regardless of what income_sources.currency stores.
--
-- WHY THIS EXISTS: income_sources carried a per-row currency that could diverge
-- from the hub two ways — (a) the onboarding StepIncome per-stream currency
-- selector let users pick any of the 8 currencies independent of the hub, and
-- (b) changing a hub's currency (centres.service updateCentre) never cascaded to
-- existing income rows. IncomeCard rendered that stale value as a label
-- ("EUR · Day 25") above amounts formatted in the hub currency ("GHS 50,000") —
-- a pure display mismatch, no amount was ever wrong.
--
-- The accompanying code change makes the hub authoritative: the per-stream
-- selector is removed (new rows always seed from the hub) and IncomeCard no
-- longer renders the row currency. This migration fixes the EXISTING rows so the
-- two stay consistent. Run order: this migration FIRST in the DB, THEN deploy
-- the code.
--
-- SCOPE: data only. Adds/drops nothing. No schema change, no function, no RLS.
--   Touches only income_sources rows where currency <> the hub currency.
--
-- IDEMPOTENT: re-running updates nothing the second time (the currency <> guard
--   makes the UPDATE a no-op once aligned). Safe to run repeatedly.
--
-- NOTE: transactions.currency has the same vestigial-column shape but is never
--   rendered as a label today (amounts use hub fmt), so it is intentionally left
--   untouched here — out of scope for this fix.
-- =============================================================================

-- ── 1. PREVIEW — run this first, eyeball the affected rows ────────────────────
-- (Read-only; safe to run any number of times before the UPDATE.)
SELECT i.id,
       i.label,
       i.currency       AS row_currency,
       c.currency       AS hub_currency,
       c.id             AS budget_centre_id
FROM   income_sources i
JOIN   budget_centres c ON c.id = i.budget_centre_id
WHERE  i.currency <> c.currency
  AND  i.deleted_at IS NULL
ORDER  BY c.id, i.label;

-- ── 2. BACKFILL ──────────────────────────────────────────────────────────────
UPDATE income_sources i
SET    currency = c.currency
FROM   budget_centres c
WHERE  i.budget_centre_id = c.id
  AND  i.currency <> c.currency
  AND  i.deleted_at IS NULL;

-- ── 3. SELF-VERIFY — assert zero live mismatches remain ───────────────────────
DO $$
DECLARE
  v_remaining integer;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM   income_sources i
  JOIN   budget_centres c ON c.id = i.budget_centre_id
  WHERE  i.currency <> c.currency
    AND  i.deleted_at IS NULL;

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'FAIL: % live income_sources still mismatch their hub currency', v_remaining;
  END IF;

  RAISE NOTICE 'OK: all live income_sources currencies aligned with their hub';
END;
$$;
