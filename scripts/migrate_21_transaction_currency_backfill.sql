-- =============================================================================
-- migrate_21_transaction_currency_backfill.sql
--
-- One-shot DATA backfill: align transactions.currency with the owning hub's
-- currency. The hub (budget_centres.currency) is the single source of truth for
-- how money is displayed — every amount on every screen is formatted with the
-- hub's fmt(), regardless of what transactions.currency stores.
--
-- WHY THIS EXISTS: transactions carried a per-row currency that could diverge
-- from the hub three ways — (a) changing a hub's currency (centres.service
-- updateCentre) never cascaded to existing transaction rows, (b) historical
-- income transactions stamped income_sources.currency back when that per-row
-- value could itself diverge (pre-migrate_20), and (c) a stale shared guest link
-- (?cur=…) could pass an old currency to submit_guest_transaction. Nothing in the
-- UI renders transactions.currency as a label, so no amount was ever wrong — it
-- is a pure stored-data hygiene mismatch, the exact twin of the income_sources
-- fix in migrate_20.
--
-- The accompanying code changes make the hub authoritative at WRITE time so the
-- drift cannot re-accumulate: markReceived stamps the hub currency (no longer the
-- vestigial income_sources.currency), and submit_guest_transaction resolves the
-- currency server-side from the centre and ignores its p_currency param. This
-- migration fixes the EXISTING rows so the two stay consistent. Run order: this
-- migration FIRST in the DB (after the RPC rewrite), THEN deploy the code.
--
-- SCOPE: data only. Adds/drops nothing. No schema change, no function, no RLS.
--   Touches only transactions rows where currency <> the hub currency.
--
-- IDEMPOTENT: re-running updates nothing the second time (the currency <> guard
--   makes the UPDATE a no-op once aligned). Safe to run repeatedly.
-- =============================================================================

-- ── 1. PREVIEW — run this first, eyeball the affected rows ────────────────────
-- (Read-only; safe to run any number of times before the UPDATE.)
SELECT t.id,
       t.category_name,
       t.date,
       t.currency       AS row_currency,
       c.currency       AS hub_currency,
       c.id             AS budget_centre_id
FROM   transactions t
JOIN   budget_centres c ON c.id = t.budget_centre_id
WHERE  t.currency <> c.currency
  AND  t.deleted_at IS NULL
ORDER  BY c.id, t.date;

-- ── 2. BACKFILL ──────────────────────────────────────────────────────────────
UPDATE transactions t
SET    currency = c.currency
FROM   budget_centres c
WHERE  t.budget_centre_id = c.id
  AND  t.currency <> c.currency
  AND  t.deleted_at IS NULL;

-- ── 3. SELF-VERIFY — assert zero live mismatches remain ───────────────────────
DO $$
DECLARE
  v_remaining integer;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM   transactions t
  JOIN   budget_centres c ON c.id = t.budget_centre_id
  WHERE  t.currency <> c.currency
    AND  t.deleted_at IS NULL;

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'FAIL: % live transactions still mismatch their hub currency', v_remaining;
  END IF;

  RAISE NOTICE 'OK: all live transactions currencies aligned with their hub';
END;
$$;
