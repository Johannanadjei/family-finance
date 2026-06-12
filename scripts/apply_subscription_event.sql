-- =============================================================================
-- apply_subscription_event.sql
--
-- NEW WORK — TO BE RUN ONCE in the Supabase SQL Editor (not yet applied to prod).
-- Ships WITH the Paystack MVP backend commit (Commit 1). Run it before that commit
-- reaches main. Idempotent (CREATE OR REPLACE + re-issued GRANT), transactional.
--
-- WHAT THIS ADDS
--   apply_subscription_event(p_event_type, p_user_id, p_email, p_subscription_id,
--                            p_customer_id, p_plan_code, p_paystack_status,
--                            p_plan_interval, p_period_start, p_period_end) RETURNS json
--     • SECURITY DEFINER — the SINGLE writer of the subscriptions table. Revenue state
--       is server-authoritative and never client-writable (CLAUDE.md §9.6 / migrate_19
--       has own-row SELECT only, no write policy). Only the Paystack webhook — running
--       as service_role — calls this.
--     • EXECUTE granted to service_role ONLY. authenticated/anon are explicitly revoked,
--       so a signed-in user can never call it from the client to self-upgrade.
--     • Atomic find-or-create upsert. Idempotency lives in SQL: replaying the same event
--       converges to the same row (no duplicates) thanks to the partial unique indexes
--       on (user_id) WHERE status='active' and (paystack_subscription_id).
--
--   JavaScript call (api/paystack/webhook.js, service-role client):
--     supabase.rpc('apply_subscription_event', { p_event_type, p_user_id, ... })
--
-- EVENT → STATE MAP (the only four events the webhook forwards):
--   charge.success         → tier='pro', status='active'   (first charge OR a renewal)
--   subscription.create    → tier='pro', status='active'   (reinforces; binds sub id)
--   invoice.payment_failed → status='past_due'             (tier preserved)
--   subscription.disable   → status='canceled'             (tier preserved)
-- We never write tier='free'. Downgrade is IMPLICIT: resolveSubscription() (and the
-- owner-tier reads in accept_invite/update_centre_skin/create_invite) already treat any
-- non-active status — or an elapsed current_period_end — as free.
--
-- IDENTITY: p_user_id (from the Paystack metadata we stamped at checkout) is primary.
-- p_email is a defensive fallback that matches auth.users when metadata is absent
-- (e.g. a subscription.* event that doesn't echo our metadata). (Open question O6.)
--
-- plan_interval is canonical 'monthly' | 'annual' (matches the migrate_19 CHECK and
-- lib/pricing.js). The caller passes it already in that form — no mapping here.
--
-- Why SECURITY DEFINER (CLAUDE.md §9.6): the write target (subscriptions) has NO client
-- write policy by design, and resolving the user may require reading auth.users — both
-- need elevated privileges. An RPC is the established pattern (HUB01/MEM01/CAT01/SKN01).
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.apply_subscription_event(
  p_event_type      text,
  p_user_id         uuid,
  p_email           text,
  p_subscription_id text,
  p_customer_id     text,
  p_plan_code       text,
  p_paystack_status text,
  p_plan_interval   text,
  p_period_start    timestamptz,
  p_period_end      timestamptz
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      uuid;
  v_existing  subscriptions%ROWTYPE;
  v_found     boolean := false;
  v_activates boolean;
  v_status    text;
  v_new_tier  text;
  v_new_end   timestamptz;
  v_row_id    uuid;
BEGIN
  -- 1. Map the event → normalized status. Unknown events are rejected: the webhook
  --    already whitelists, so reaching here with anything else is a contract breach.
  CASE p_event_type
    WHEN 'charge.success'         THEN v_status := 'active';   v_activates := true;
    WHEN 'subscription.create'    THEN v_status := 'active';   v_activates := true;
    WHEN 'invoice.payment_failed' THEN v_status := 'past_due'; v_activates := false;
    WHEN 'subscription.disable'   THEN v_status := 'canceled'; v_activates := false;
    ELSE
      RAISE EXCEPTION 'unhandled_event: %', p_event_type;
  END CASE;

  -- 2. Resolve the user. Primary: the metadata user_id stamped at checkout.
  --    Fallback: match auth.users by email (case-insensitive).
  v_user := p_user_id;
  IF v_user IS NULL AND p_email IS NOT NULL THEN
    SELECT id INTO v_user FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
  END IF;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'no_user: cannot resolve a user from metadata user_id or email';
  END IF;

  -- 3. Locate the target row. Prefer an exact paystack_subscription_id match (the durable
  --    key once a subscription exists); else fall back to the user's most-recent live row.
  IF p_subscription_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM subscriptions
      WHERE paystack_subscription_id = p_subscription_id AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1;
    v_found := FOUND;
  END IF;

  IF NOT v_found THEN
    SELECT * INTO v_existing FROM subscriptions
      WHERE user_id = v_user AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1;
    v_found := FOUND;
  END IF;

  -- 4a. No existing row. Only an ACTIVATING event creates one — we never materialize a
  --     phantom canceled/past_due row for a subscription we never recorded as active.
  IF NOT v_found THEN
    IF NOT v_activates THEN
      RETURN json_build_object('action', 'skipped_no_row', 'event', p_event_type);
    END IF;

    INSERT INTO subscriptions (
      user_id, tier, status, paystack_status,
      paystack_subscription_id, paystack_customer_id, paystack_plan_code,
      plan_interval, current_period_start, current_period_end
    ) VALUES (
      v_user, 'pro', v_status, p_paystack_status,
      p_subscription_id, p_customer_id, p_plan_code,
      p_plan_interval, p_period_start, p_period_end
    )
    RETURNING id INTO v_row_id;

    RETURN json_build_object('action', 'inserted', 'id', v_row_id, 'event', p_event_type);
  END IF;

  -- 4b. Existing row → converge. COALESCE preserves prior values when this event omits
  --     them (e.g. a charge.success that carries no subscription_id won't null the one a
  --     prior subscription.create set). The period end only ever moves FORWARD (GREATEST)
  --     so out-of-order webhook delivery never shortens an active period.
  v_new_tier := CASE WHEN v_activates THEN 'pro' ELSE v_existing.tier END;
  v_new_end  := CASE
                  WHEN p_period_end IS NULL                  THEN v_existing.current_period_end
                  WHEN v_existing.current_period_end IS NULL THEN p_period_end
                  ELSE GREATEST(v_existing.current_period_end, p_period_end)
                END;

  UPDATE subscriptions SET
    tier                     = v_new_tier,
    status                   = v_status,
    paystack_status          = COALESCE(p_paystack_status, paystack_status),
    paystack_subscription_id = COALESCE(p_subscription_id, paystack_subscription_id),
    paystack_customer_id     = COALESCE(p_customer_id, paystack_customer_id),
    paystack_plan_code       = COALESCE(p_plan_code, paystack_plan_code),
    plan_interval            = COALESCE(p_plan_interval, plan_interval),
    current_period_start     = COALESCE(p_period_start, current_period_start),
    current_period_end       = v_new_end,
    updated_at               = now()
  WHERE id = v_existing.id;

  RETURN json_build_object('action', 'updated', 'id', v_existing.id, 'event', p_event_type);
END;
$$;

-- Revenue writes are service_role ONLY. Lock the function down, then grant the single
-- role the webhook authenticates as.
--
-- IMPORTANT (Supabase default ACL): REVOKE ... FROM PUBLIC is NOT sufficient. Supabase
-- ships a pg_default_acl that grants EXECUTE on every new public function DIRECTLY to
-- `anon` and `authenticated` — those grants are not inherited via PUBLIC, so revoking
-- PUBLIC alone leaves them intact (assertion (d) below caught exactly this). We must
-- REVOKE from authenticated and anon explicitly so no signed-in client can self-upgrade.
REVOKE ALL ON FUNCTION public.apply_subscription_event(text,uuid,text,text,text,text,text,text,timestamptz,timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_subscription_event(text,uuid,text,text,text,text,text,text,timestamptz,timestamptz) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.apply_subscription_event(text,uuid,text,text,text,text,text,text,timestamptz,timestamptz) TO service_role;

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n   int;
  v_sig text := 'public.apply_subscription_event(text,uuid,text,text,text,text,text,text,timestamptz,timestamptz)';
BEGIN
  -- (a) function exists with the expected 10-arg signature.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'apply_subscription_event' AND pronargs = 10;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: apply_subscription_event(10 args) not found (got %)', v_n; END IF;

  -- (b) it is SECURITY DEFINER.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'apply_subscription_event' AND prosecdef IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: apply_subscription_event is not SECURITY DEFINER'; END IF;

  -- (c) service_role HAS execute.
  IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE')
    THEN RAISE EXCEPTION 'FAIL: service_role lacks EXECUTE on apply_subscription_event'; END IF;

  -- (d) authenticated and anon must NOT have execute (no client self-upgrade path).
  IF has_function_privilege('authenticated', v_sig, 'EXECUTE')
    THEN RAISE EXCEPTION 'FAIL: authenticated must NOT have EXECUTE on apply_subscription_event'; END IF;
  IF has_function_privilege('anon', v_sig, 'EXECUTE')
    THEN RAISE EXCEPTION 'FAIL: anon must NOT have EXECUTE on apply_subscription_event'; END IF;

  -- (e) dependency present: the subscriptions table (migrate_19).
  SELECT count(*) INTO v_n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscriptions';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: subscriptions table missing (run migrate_19 first)'; END IF;

  RAISE NOTICE 'apply_subscription_event OK: installed (SECURITY DEFINER, service_role-only EXECUTE, idempotent upsert).';
END $$;

COMMIT;
