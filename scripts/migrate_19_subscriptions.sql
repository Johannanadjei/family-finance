-- =============================================================================
-- migrate_19_subscriptions.sql
--
-- Pro subscription foundation — the subscriptions table only.
-- ZERO app behaviour change at the gate level: NO feature gate reads this table
-- yet (gates ship in later commits). The foundation code (subscriptions.service,
-- useSubscription, useIsPro) reads it the moment it lands, but with no Pro rows
-- present every user resolves to 'free' — identical to today.
--
-- Source of truth for plan tier: a row here. No row → free (Approach 1). This
-- supersedes the old users.plan read (centres.service.getUserPlan, removed in the
-- same commit). users.plan is NOT touched here — this migration is strictly
-- additive so it is safe to run anytime (single shared Supabase project).
--
-- Run this entire file in the Supabase SQL editor in one go.
-- Safe to re-run — all DDL uses IF EXISTS / IF NOT EXISTS guards and the whole
-- migration is wrapped in a transaction (atomic: any failure rolls back cleanly).
--
-- Order:
--   1. subscriptions table + named CHECK constraints
--   2. indexes (user lookup, one-active-per-user, unique paystack sub id)
--   3. RLS: owner reads own row; NO client write policy (service-role webhook only)
--   4. self-verification DO block (raises EXCEPTION → whole migration rolls back)
-- =============================================================================

BEGIN;

-- 1. New table. Writes come exclusively from the Paystack webhook handler running
--    as service-role (which bypasses RLS). `status` is the normalized value the app
--    reasons about; `paystack_status` is the raw Paystack string for audit/debug.
CREATE TABLE IF NOT EXISTS subscriptions (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier                     text        NOT NULL CONSTRAINT subscriptions_tier_check
                                         CHECK (tier IN ('free', 'pro')),
  status                   text        NOT NULL CONSTRAINT subscriptions_status_check
                                         CHECK (status IN ('active', 'canceled', 'past_due', 'incomplete')),
  paystack_status          text,       -- raw Paystack status, debug/audit only
  paystack_subscription_id text,
  paystack_customer_id     text,
  paystack_plan_code       text,
  plan_interval            text        CONSTRAINT subscriptions_interval_check
                                         CHECK (plan_interval IS NULL OR plan_interval IN ('monthly', 'annual')),
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean     NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  deleted_at               timestamptz
);

-- 2. Indexes.
--    a. hot read path — fetch the caller's live subscription.
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id
  ON subscriptions(user_id) WHERE deleted_at IS NULL;

--    b. at most one ACTIVE row per user. Non-active rows may accumulate; the webhook
--       UPDATEs the existing row rather than inserting duplicates (see service note).
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_active
  ON subscriptions(user_id) WHERE deleted_at IS NULL AND status = 'active';

--    c. a Paystack subscription id maps to exactly one row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_paystack_sub_id
  ON subscriptions(paystack_subscription_id) WHERE paystack_subscription_id IS NOT NULL;

-- 3. RLS — users read ONLY their own row. There is deliberately NO INSERT/UPDATE/
--    DELETE policy: revenue state must never be client-writable (CLAUDE.md §9.6).
--    The Paystack webhook handler writes as service-role, which bypasses RLS.
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscriptions_select_own ON subscriptions;
CREATE POLICY subscriptions_select_own ON subscriptions FOR SELECT
  USING (user_id = auth.uid() AND deleted_at IS NULL);

-- 4. Self-verification. Any failed assertion RAISES inside the transaction, so the
--    whole migration rolls back cleanly — you never land a half-applied schema.
DO $$
BEGIN
  -- table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscriptions'
  ) THEN RAISE EXCEPTION 'verify failed: subscriptions table missing'; END IF;

  -- RLS enabled
  IF NOT (
    SELECT relrowsecurity FROM pg_class WHERE oid = 'public.subscriptions'::regclass
  ) THEN RAISE EXCEPTION 'verify failed: RLS not enabled on subscriptions'; END IF;

  -- own-row SELECT policy present
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscriptions'
    AND policyname = 'subscriptions_select_own'
  ) THEN RAISE EXCEPTION 'verify failed: subscriptions_select_own policy missing'; END IF;

  -- all three indexes present
  IF (
    SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'subscriptions'
    AND indexname IN (
      'idx_subscriptions_user_id',
      'idx_subscriptions_user_active',
      'idx_subscriptions_paystack_sub_id'
    )
  ) <> 3 THEN RAISE EXCEPTION 'verify failed: expected 3 subscriptions indexes'; END IF;

  -- named CHECK constraints present
  IF (
    SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass AND contype = 'c'
    AND conname IN (
      'subscriptions_tier_check',
      'subscriptions_status_check',
      'subscriptions_interval_check'
    )
  ) <> 3 THEN RAISE EXCEPTION 'verify failed: expected 3 named CHECK constraints'; END IF;

  RAISE NOTICE 'migrate_19 verify OK: subscriptions table, RLS, policy, 3 indexes, 3 CHECKs';
END $$;

COMMIT;

-- =============================================================================
-- Post-commit spot checks (optional — run after COMMIT to eyeball the result):
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'subscriptions' ORDER BY ordinal_position;
--
--   SELECT polname, cmd FROM pg_policies WHERE tablename = 'subscriptions';
--   SELECT indexname FROM pg_indexes WHERE tablename = 'subscriptions';
-- =============================================================================
