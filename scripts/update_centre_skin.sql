-- =============================================================================
-- update_centre_skin.sql
--
-- NEW WORK — TO BE RUN ONCE in the Supabase SQL Editor (not yet applied to prod).
-- Ships WITH its feature commit (the skin gate, SKN01). Run it before that commit
-- reaches main. Idempotent (CREATE OR REPLACE + re-issued GRANT), transactional.
--
-- WHAT THIS ADDS
--   update_centre_skin(p_centre_id uuid, p_skin_id text) RETURNS budget_centres
--     • SECURITY DEFINER — runs as owner; auth.uid() is still the calling user.
--     • Server-side SKIN gate: a FREE hub may only use 'family_warmth'. Any other
--       skin raises SQLSTATE 'SKN01' (matches HUB01/MEM01/CAT01). The client greys
--       the locked chips, but THIS is the real enforcement — the previous skin write
--       was a direct UPDATE under owner-only RLS with no tier check (DevTools hole).
--     • Authz: caller must be the hub OWNER or an active FULL_ACCESS member — the
--       same set that sees the Theme picker (can('settings')). This also fixes a
--       latent no-op where full_access members saw the picker but their direct
--       UPDATE silently failed under the owner-only RLS policy.
--     • Tier resolves from the hub's OWNER (budget_centres.owner_id → subscriptions),
--       NOT auth.uid(): the hub's plan is the owner's plan, even when a full_access
--       co-owner makes the change. Mirrors create_hub's subscription query.
--     • Skin VALIDITY is trusted to the client (D4): we enforce the tier rule only,
--       not the full skin catalogue. applyTheme() falls back to family_warmth for any
--       unknown key, so a bad value degrades gracefully and the SQL stays decoupled
--       from the JS THEMES list (no migration per new skin).
--
--   JavaScript call (services/centres.service.js):
--     supabase.rpc('update_centre_skin', { p_centre_id, p_skin_id })
--
-- Why SECURITY DEFINER (CLAUDE.md §9.6): the gate validates against the subscriptions
-- tier of a DIFFERENT user (the owner) than the caller — a cross-user/cross-table
-- check RLS cannot express cleanly. An RPC is the established pattern.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.update_centre_skin(
  p_centre_id uuid,
  p_skin_id   text
)
RETURNS public.budget_centres
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid;
  v_owner  uuid;
  v_tier   text;
  v_centre public.budget_centres%ROWTYPE;
BEGIN
  -- 1. Require an authenticated session.
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated: must be signed in to change a hub skin';
  END IF;

  -- 2. Minimal validation — a blank skin is rejected; catalogue validity is the
  --    client's job (D4). applyTheme() falls back to family_warmth for unknown keys.
  IF btrim(coalesce(p_skin_id, '')) = '' THEN
    RAISE EXCEPTION 'skin id is required';
  END IF;

  -- 3. Resolve the hub + its owner. A missing/soft-deleted hub is not found.
  SELECT owner_id INTO v_owner
  FROM   budget_centres
  WHERE  id = p_centre_id
    AND  deleted_at IS NULL;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'hub not found: %', p_centre_id;
  END IF;

  -- 4. Authz: caller is the OWNER or an active FULL_ACCESS member (the can('settings')
  --    set). Standard members never reach here (they don't see the Theme picker).
  IF v_user <> v_owner AND NOT EXISTS (
    SELECT 1
    FROM   budget_centre_members bcm
    WHERE  bcm.budget_centre_id = p_centre_id
      AND  bcm.user_id          = v_user
      AND  bcm.role             IN ('owner', 'full_access')
      AND  bcm.deleted_at       IS NULL
  ) THEN
    RAISE EXCEPTION 'not authorised to change this hub''s skin';
  END IF;

  -- 5. Resolve the OWNER's tier (NOT the caller's). Mirrors resolveSubscription():
  --    an active, non-expired row yields its tier; no such row → free.
  SELECT s.tier INTO v_tier
  FROM   subscriptions s
  WHERE  s.user_id = v_owner
    AND  s.deleted_at IS NULL
    AND  s.status = 'active'
    AND  (s.current_period_end IS NULL OR s.current_period_end > now())
  ORDER BY s.created_at DESC
  LIMIT 1;
  v_tier := COALESCE(v_tier, 'free');

  -- 6. Enforce the tier rule. FREE → family_warmth only. The client maps SKN01 to
  --    the friendly upgrade copy + opens the UpgradeModal.
  IF v_tier = 'free' AND p_skin_id <> 'family_warmth' THEN
    RAISE EXCEPTION 'skin requires Pro: %', p_skin_id
      USING ERRCODE = 'SKN01';
  END IF;

  -- 7. Apply the change and return the updated row.
  UPDATE budget_centres
  SET    skin_id = p_skin_id
  WHERE  id = p_centre_id
  RETURNING * INTO v_centre;

  RETURN v_centre;
END;
$$;

-- Any authenticated user may call it; the in-function authz + tier gate are the guard.
GRANT EXECUTE ON FUNCTION public.update_centre_skin(uuid, text) TO authenticated;

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n int;
BEGIN
  -- (a) update_centre_skin exists with the expected 2-arg signature.
  SELECT count(*) INTO v_n FROM pg_proc
    WHERE proname = 'update_centre_skin'
      AND pg_get_function_identity_arguments(oid) = 'p_centre_id uuid, p_skin_id text';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: update_centre_skin(uuid,text) not found (got %)', v_n; END IF;

  -- (b) It is SECURITY DEFINER.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'update_centre_skin' AND prosecdef IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: update_centre_skin is not SECURITY DEFINER'; END IF;

  -- (c) authenticated has EXECUTE.
  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
    WHERE routine_name = 'update_centre_skin' AND grantee = 'authenticated' AND privilege_type = 'EXECUTE';
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: authenticated lacks EXECUTE on update_centre_skin'; END IF;

  -- (d) Dependencies present: subscriptions table + the columns the gate/update touch.
  SELECT count(*) INTO v_n FROM information_schema.columns
    WHERE table_name = 'budget_centres' AND column_name IN ('owner_id', 'skin_id', 'deleted_at');
  IF v_n <> 3 THEN RAISE EXCEPTION 'FAIL: budget_centres missing owner_id/skin_id/deleted_at'; END IF;
  SELECT count(*) INTO v_n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscriptions';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: subscriptions table missing (run migrate_19 first)'; END IF;

  RAISE NOTICE 'update_centre_skin OK: installed (SECURITY DEFINER, owner/full_access authz, owner-tier SKN01 gate).';
END $$;

COMMIT;
