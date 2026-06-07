-- =============================================================================
-- handle_new_user.sql
--
-- SOURCE-OF-TRUTH ONLY — DO NOT RE-RUN unless rebuilding the database.
-- This function and its trigger ALREADY EXIST in production. They were created
-- by hand in the Supabase SQL Editor during early development and were never
-- committed to the repo. The bodies below were extracted verbatim from
-- production via pg_get_functiondef() + pg_get_triggerdef() on 2026-06-05 so the
-- repo holds the authoritative copy (migration prep + future replay).
--
-- WHAT THIS DOES
--   handle_new_user() RETURNS trigger
--     • Fires AFTER INSERT on auth.users (one row per new signup).
--     • Seeds public.users (id, email, name) — name resolves from auth metadata
--       full_name, else the email local-part.
--     • Seeds public.user_preferences (user_id) with defaults.
--     • LANGUAGE plpgsql, SECURITY DEFINER — must run as owner to write into
--       public.* in response to an auth.users insert.
--
--   Trigger: on_auth_user_created — AFTER INSERT ON auth.users FOR EACH ROW.
--
-- MIGRATION RISK IF LOST: new signups would never get a public.users profile row
-- or a user_preferences row — the app would treat every new account as broken.
--
-- NOTE: creating a trigger on auth.users requires owner/elevated privileges (the
-- Supabase SQL Editor runs with them). DROP TRIGGER IF EXISTS makes the re-create
-- idempotent. No GRANT is needed — a trigger function is invoked by the trigger,
-- not called by client roles.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.users (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  insert into public.user_preferences (user_id)
  values (new.id);
  return new;
end;
$function$;

-- Trigger wiring on auth.users (idempotent re-create).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n int;
BEGIN
  -- (a) handle_new_user exists, returns trigger.
  SELECT count(*) INTO v_n FROM pg_proc p
    JOIN pg_type t ON t.oid = p.prorettype
    WHERE p.proname = 'handle_new_user' AND t.typname = 'trigger';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: handle_new_user() trigger function not found (got %)', v_n; END IF;

  -- (b) It is SECURITY DEFINER.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'handle_new_user' AND prosecdef IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: handle_new_user is not SECURITY DEFINER'; END IF;

  -- (c) The trigger is wired onto auth.users.
  SELECT count(*) INTO v_n FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE tg.tgname = 'on_auth_user_created' AND n.nspname = 'auth' AND c.relname = 'users';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: on_auth_user_created trigger missing on auth.users'; END IF;

  -- (d) Target tables present with the columns the function writes.
  SELECT count(*) INTO v_n FROM information_schema.columns
    WHERE table_name = 'users' AND table_schema = 'public' AND column_name IN ('id', 'email', 'name');
  IF v_n <> 3 THEN RAISE EXCEPTION 'FAIL: public.users missing id/email/name'; END IF;
  SELECT count(*) INTO v_n FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND table_schema = 'public' AND column_name = 'user_id';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: public.user_preferences missing user_id'; END IF;

  RAISE NOTICE 'handle_new_user OK: function + on_auth_user_created trigger installed (SECURITY DEFINER).';
END $$;

COMMIT;
