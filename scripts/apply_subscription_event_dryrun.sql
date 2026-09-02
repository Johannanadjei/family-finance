-- =============================================================================
-- apply_subscription_event_dryrun.sql
--
-- BEHAVIOURAL TEST for apply_subscription_event — run in the Supabase SQL editor
-- AFTER applying apply_subscription_event.sql. Proves the cancellation-fairness
-- rules actually hold against the real function on the real schema, which the
-- structural DO block inside that file cannot do (it asserts signature/ACL only).
--
-- SAFE BY CONSTRUCTION. The whole file is one transaction ending in ROLLBACK, so
-- every row it writes is discarded. It touches ONLY the `subscriptions` table, only
-- for a single automatically-chosen test account that HAS NO SUBSCRIPTION ROWS
-- (so it can never disturb a paying customer's record), and it never calls Paystack
-- — no money moves, nothing is cancelled anywhere, and running it twice changes
-- nothing. This is the same discipline as f3_erasure_runbook.sql: everything runs,
-- everything is asserted, everything is thrown away.
--
-- There is no Docker/pgTAP harness in this repo (npm test covers JS only), so this
-- file IS the test for the SQL half of the cancel flow. Re-run it after any edit to
-- apply_subscription_event.sql.
--
-- WHAT IT PROVES (9 scenarios, each asserted; any failure RAISES and rolls back):
--   S1  not_renew, period open   → stays ACTIVE, cancel flag set, end untouched
--   S2  disable,   period open   → stays ACTIVE, cancel flag set   ← the fairness fix
--   S3  disable,   period passed → canceled
--   S4  disable,   NULL end      → canceled   ← the unbounded-Pro trap stays shut
--   S5  not_renew, no row        → skipped_no_row, still zero rows
--   S6  charge after not_renew   → re-activated, cancel flag CLEARED, end moved on
--   S7  payment_failed on a wound-down row → past_due, cancel flag PRESERVED
--   S8  charge.success, no row   → inserts pro/active/uncancelled
--   S9  disable inside a paid period on a past_due row → active (they paid through it)
--
-- Every scenario also asserts the READER VERDICT — the exact predicate
-- resolveSubscription()/hub_tier()/create_hub/create_invite/create_category/
-- create_categories_bulk/update_centre_skin/accept_invite all evaluate:
--     status = 'active' AND (current_period_end IS NULL OR current_period_end > now())
-- That is what makes "no reader changes needed" a tested claim rather than an
-- assertion in a comment.
--
-- HOW TO READ THE OUTPUT: the final SELECT prints one row per scenario with the
-- resulting status, cancel flag and reader verdict. If you got that far, all nine
-- assertions passed — a failure aborts before the SELECT with the scenario name in
-- the error message.
-- =============================================================================
BEGIN;

CREATE TEMP TABLE dryrun_log (
  seq        int,
  scenario   text,
  action     text,
  status     text,
  cancel_flag boolean,
  period_end timestamptz,
  reader_tier text
) ON COMMIT DROP;

DO $$
DECLARE
  v_user     uuid;
  v_future   timestamptz := now() + interval '18 days';
  v_past     timestamptz := now() - interval '2 days';
  v_row      subscriptions%ROWTYPE;
  v_res      json;
  v_reader   text;
  v_count    int;
BEGIN
  -- ── Pick a test account: any auth user with NO subscriptions rows. Everything
  --    below is rolled back, but choosing a subscription-free account means we are
  --    never even transiently rewriting a real customer's billing row.
  SELECT u.id INTO v_user
  FROM auth.users u
  WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id)
  ORDER BY u.created_at
  LIMIT 1;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'no test account available: every auth.users row already has a subscriptions row';
  END IF;
  RAISE NOTICE 'dry run using user %', v_user;

  -- ═══ S1 — not_renew while the period is open: the customer keeps what they paid for.
  DELETE FROM subscriptions WHERE user_id = v_user;
  INSERT INTO subscriptions (user_id, tier, status, paystack_subscription_id,
                             plan_interval, current_period_end, cancel_at_period_end)
  VALUES (v_user, 'pro', 'active', 'SUB_dryrun_1', 'monthly', v_future, false);

  v_res := apply_subscription_event('subscription.not_renew', v_user, NULL, 'SUB_dryrun_1',
                                    NULL, NULL, 'non-renewing', NULL, NULL, v_future);
  SELECT * INTO v_row FROM subscriptions WHERE user_id = v_user;
  v_reader := CASE WHEN v_row.status = 'active'
                    AND (v_row.current_period_end IS NULL OR v_row.current_period_end > now())
                   THEN v_row.tier ELSE 'free' END;

  IF v_row.status <> 'active'      THEN RAISE EXCEPTION 'S1 FAIL: status is % (expected active — mid-period cancel must not drop access)', v_row.status; END IF;
  IF v_row.cancel_at_period_end IS NOT TRUE THEN RAISE EXCEPTION 'S1 FAIL: cancel_at_period_end not set'; END IF;
  IF v_row.tier <> 'pro'           THEN RAISE EXCEPTION 'S1 FAIL: tier is % (expected pro)', v_row.tier; END IF;
  IF v_row.current_period_end <> v_future THEN RAISE EXCEPTION 'S1 FAIL: period end moved'; END IF;
  IF v_reader <> 'pro'             THEN RAISE EXCEPTION 'S1 FAIL: readers would see % (expected pro)', v_reader; END IF;
  INSERT INTO dryrun_log VALUES (1, 'not_renew, period open', v_res->>'action', v_row.status, v_row.cancel_at_period_end, v_row.current_period_end, v_reader);

  -- ═══ S2 — disable while the period is open: same treatment (THE FAIRNESS FIX).
  DELETE FROM subscriptions WHERE user_id = v_user;
  INSERT INTO subscriptions (user_id, tier, status, paystack_subscription_id,
                             plan_interval, current_period_end, cancel_at_period_end)
  VALUES (v_user, 'pro', 'active', 'SUB_dryrun_2', 'monthly', v_future, false);

  v_res := apply_subscription_event('subscription.disable', v_user, NULL, 'SUB_dryrun_2',
                                    NULL, NULL, 'complete', NULL, NULL, NULL);
  SELECT * INTO v_row FROM subscriptions WHERE user_id = v_user;
  v_reader := CASE WHEN v_row.status = 'active'
                    AND (v_row.current_period_end IS NULL OR v_row.current_period_end > now())
                   THEN v_row.tier ELSE 'free' END;

  IF v_row.status <> 'active'      THEN RAISE EXCEPTION 'S2 FAIL: status is % (expected active — this is the mid-period drop bug)', v_row.status; END IF;
  IF v_row.cancel_at_period_end IS NOT TRUE THEN RAISE EXCEPTION 'S2 FAIL: cancel_at_period_end not set'; END IF;
  IF v_reader <> 'pro'             THEN RAISE EXCEPTION 'S2 FAIL: readers would see % (expected pro)', v_reader; END IF;
  INSERT INTO dryrun_log VALUES (2, 'disable, period open', v_res->>'action', v_row.status, v_row.cancel_at_period_end, v_row.current_period_end, v_reader);

  -- ═══ S3 — disable after the period has elapsed: genuinely over.
  DELETE FROM subscriptions WHERE user_id = v_user;
  INSERT INTO subscriptions (user_id, tier, status, paystack_subscription_id,
                             plan_interval, current_period_end, cancel_at_period_end)
  VALUES (v_user, 'pro', 'active', 'SUB_dryrun_3', 'monthly', v_past, true);

  v_res := apply_subscription_event('subscription.disable', v_user, NULL, 'SUB_dryrun_3',
                                    NULL, NULL, 'complete', NULL, NULL, NULL);
  SELECT * INTO v_row FROM subscriptions WHERE user_id = v_user;
  v_reader := CASE WHEN v_row.status = 'active'
                    AND (v_row.current_period_end IS NULL OR v_row.current_period_end > now())
                   THEN v_row.tier ELSE 'free' END;

  IF v_row.status <> 'canceled'    THEN RAISE EXCEPTION 'S3 FAIL: status is % (expected canceled)', v_row.status; END IF;
  IF v_reader <> 'free'            THEN RAISE EXCEPTION 'S3 FAIL: readers would see % (expected free)', v_reader; END IF;
  INSERT INTO dryrun_log VALUES (3, 'disable, period elapsed', v_res->>'action', v_row.status, v_row.cancel_at_period_end, v_row.current_period_end, v_reader);

  -- ═══ S4 — disable on a NULL-period row: must NOT stay active (unbounded Pro trap).
  DELETE FROM subscriptions WHERE user_id = v_user;
  INSERT INTO subscriptions (user_id, tier, status, paystack_subscription_id,
                             plan_interval, current_period_end, cancel_at_period_end)
  VALUES (v_user, 'pro', 'active', 'SUB_dryrun_4', 'monthly', NULL, false);

  v_res := apply_subscription_event('subscription.disable', v_user, NULL, 'SUB_dryrun_4',
                                    NULL, NULL, 'complete', NULL, NULL, NULL);
  SELECT * INTO v_row FROM subscriptions WHERE user_id = v_user;
  v_reader := CASE WHEN v_row.status = 'active'
                    AND (v_row.current_period_end IS NULL OR v_row.current_period_end > now())
                   THEN v_row.tier ELSE 'free' END;

  IF v_row.status <> 'canceled'    THEN RAISE EXCEPTION 'S4 FAIL: status is % — a NULL period end would grant Pro forever', v_row.status; END IF;
  IF v_reader <> 'free'            THEN RAISE EXCEPTION 'S4 FAIL: readers would see % (expected free)', v_reader; END IF;
  INSERT INTO dryrun_log VALUES (4, 'disable, NULL period end', v_res->>'action', v_row.status, v_row.cancel_at_period_end, v_row.current_period_end, v_reader);

  -- ═══ S5 — not_renew with no row at all: no phantom row is materialized.
  DELETE FROM subscriptions WHERE user_id = v_user;

  v_res := apply_subscription_event('subscription.not_renew', v_user, NULL, 'SUB_dryrun_5',
                                    NULL, NULL, 'non-renewing', NULL, NULL, v_future);
  SELECT count(*) INTO v_count FROM subscriptions WHERE user_id = v_user;

  IF v_res->>'action' <> 'skipped_no_row' THEN RAISE EXCEPTION 'S5 FAIL: action is % (expected skipped_no_row)', v_res->>'action'; END IF;
  IF v_count <> 0                  THEN RAISE EXCEPTION 'S5 FAIL: % phantom row(s) created', v_count; END IF;
  INSERT INTO dryrun_log VALUES (5, 'not_renew, no row', v_res->>'action', NULL, NULL, NULL, 'free');

  -- ═══ S6 — they resubscribe (or a renewal lands) after winding down: flag clears.
  DELETE FROM subscriptions WHERE user_id = v_user;
  INSERT INTO subscriptions (user_id, tier, status, paystack_subscription_id,
                             plan_interval, current_period_end, cancel_at_period_end)
  VALUES (v_user, 'pro', 'active', 'SUB_dryrun_6', 'monthly', v_future, true);

  v_res := apply_subscription_event('charge.success', v_user, NULL, 'SUB_dryrun_6',
                                    NULL, NULL, 'success', 'monthly', now(), now() + interval '1 month');
  SELECT * INTO v_row FROM subscriptions WHERE user_id = v_user;
  v_reader := CASE WHEN v_row.status = 'active'
                    AND (v_row.current_period_end IS NULL OR v_row.current_period_end > now())
                   THEN v_row.tier ELSE 'free' END;

  IF v_row.status <> 'active'      THEN RAISE EXCEPTION 'S6 FAIL: status is % (expected active)', v_row.status; END IF;
  IF v_row.cancel_at_period_end IS NOT FALSE THEN RAISE EXCEPTION 'S6 FAIL: cancel_at_period_end still set after a new charge'; END IF;
  IF v_row.current_period_end <= v_future THEN RAISE EXCEPTION 'S6 FAIL: period end did not move forward'; END IF;
  IF v_reader <> 'pro'             THEN RAISE EXCEPTION 'S6 FAIL: readers would see % (expected pro)', v_reader; END IF;
  INSERT INTO dryrun_log VALUES (6, 'charge after not_renew', v_res->>'action', v_row.status, v_row.cancel_at_period_end, v_row.current_period_end, v_reader);

  -- ═══ S7 — a failed charge says nothing about cancellation intent: flag survives.
  DELETE FROM subscriptions WHERE user_id = v_user;
  INSERT INTO subscriptions (user_id, tier, status, paystack_subscription_id,
                             plan_interval, current_period_end, cancel_at_period_end)
  VALUES (v_user, 'pro', 'active', 'SUB_dryrun_7', 'monthly', v_future, true);

  v_res := apply_subscription_event('invoice.payment_failed', v_user, NULL, 'SUB_dryrun_7',
                                    NULL, NULL, 'failed', NULL, NULL, NULL);
  SELECT * INTO v_row FROM subscriptions WHERE user_id = v_user;
  v_reader := CASE WHEN v_row.status = 'active'
                    AND (v_row.current_period_end IS NULL OR v_row.current_period_end > now())
                   THEN v_row.tier ELSE 'free' END;

  IF v_row.status <> 'past_due'    THEN RAISE EXCEPTION 'S7 FAIL: status is % (expected past_due)', v_row.status; END IF;
  IF v_row.cancel_at_period_end IS NOT TRUE THEN RAISE EXCEPTION 'S7 FAIL: cancel_at_period_end was clobbered'; END IF;
  IF v_reader <> 'free'            THEN RAISE EXCEPTION 'S7 FAIL: readers would see % (expected free — past_due is not active)', v_reader; END IF;
  INSERT INTO dryrun_log VALUES (7, 'payment_failed, flag preserved', v_res->>'action', v_row.status, v_row.cancel_at_period_end, v_row.current_period_end, v_reader);

  -- ═══ S8 — regression: the ordinary first-charge insert path is unchanged.
  DELETE FROM subscriptions WHERE user_id = v_user;

  v_res := apply_subscription_event('charge.success', v_user, NULL, 'SUB_dryrun_8',
                                    'CUS_x', 'PLN_x', 'success', 'annual', now(), now() + interval '1 year');
  SELECT * INTO v_row FROM subscriptions WHERE user_id = v_user;
  v_reader := CASE WHEN v_row.status = 'active'
                    AND (v_row.current_period_end IS NULL OR v_row.current_period_end > now())
                   THEN v_row.tier ELSE 'free' END;

  IF v_res->>'action' <> 'inserted' THEN RAISE EXCEPTION 'S8 FAIL: action is % (expected inserted)', v_res->>'action'; END IF;
  IF v_row.tier <> 'pro' OR v_row.status <> 'active' THEN RAISE EXCEPTION 'S8 FAIL: new row is %/%', v_row.tier, v_row.status; END IF;
  IF v_row.cancel_at_period_end IS NOT FALSE THEN RAISE EXCEPTION 'S8 FAIL: new row starts cancelled'; END IF;
  IF v_reader <> 'pro'              THEN RAISE EXCEPTION 'S8 FAIL: readers would see % (expected pro)', v_reader; END IF;
  INSERT INTO dryrun_log VALUES (8, 'charge.success, no row (insert)', v_res->>'action', v_row.status, v_row.cancel_at_period_end, v_row.current_period_end, v_reader);

  -- ═══ S9 — disable on a past_due row whose paid period is still open. The customer
  --          paid through that date, so access is restored for the remainder. Asserted
  --          so the behaviour is deliberate and visible, not an accident of ordering.
  DELETE FROM subscriptions WHERE user_id = v_user;
  INSERT INTO subscriptions (user_id, tier, status, paystack_subscription_id,
                             plan_interval, current_period_end, cancel_at_period_end)
  VALUES (v_user, 'pro', 'past_due', 'SUB_dryrun_9', 'monthly', v_future, false);

  v_res := apply_subscription_event('subscription.disable', v_user, NULL, 'SUB_dryrun_9',
                                    NULL, NULL, 'complete', NULL, NULL, NULL);
  SELECT * INTO v_row FROM subscriptions WHERE user_id = v_user;
  v_reader := CASE WHEN v_row.status = 'active'
                    AND (v_row.current_period_end IS NULL OR v_row.current_period_end > now())
                   THEN v_row.tier ELSE 'free' END;

  IF v_row.status <> 'active'      THEN RAISE EXCEPTION 'S9 FAIL: status is % (expected active for the paid remainder)', v_row.status; END IF;
  IF v_row.cancel_at_period_end IS NOT TRUE THEN RAISE EXCEPTION 'S9 FAIL: cancel_at_period_end not set'; END IF;
  INSERT INTO dryrun_log VALUES (9, 'disable on past_due, period open', v_res->>'action', v_row.status, v_row.cancel_at_period_end, v_row.current_period_end, v_reader);

  RAISE NOTICE 'ALL 9 SCENARIOS PASSED — nothing committed.';
END $$;

SELECT seq, scenario, action, status, cancel_flag, period_end, reader_tier
FROM dryrun_log ORDER BY seq;

-- ═════════════════════════════════════════════════════════════════════════════
-- This is a TEST. Leave the next line as ROLLBACK — everything above ran and is
-- now discarded. There is no "real run" variant of this file.
-- ═════════════════════════════════════════════════════════════════════════════
ROLLBACK;
