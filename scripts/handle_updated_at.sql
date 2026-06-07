-- =============================================================================
-- handle_updated_at.sql
--
-- SOURCE-OF-TRUTH ONLY — DO NOT RE-RUN unless rebuilding the database.
-- This function and its 7 triggers ALREADY EXIST in production. They were
-- created by hand in the Supabase SQL Editor during early development and were
-- never committed to the repo. The bodies below were extracted verbatim from
-- production via pg_get_functiondef() + pg_get_triggerdef() on 2026-06-05 so the
-- repo holds the authoritative copy (migration prep + future replay).
--
-- WHAT THIS DOES
--   handle_updated_at() RETURNS trigger
--     • Sets NEW.updated_at = now() on every row update.
--     • LANGUAGE plpgsql. NOT SECURITY DEFINER (runs as the updating user — it
--       only stamps a column on the row already being written).
--
--   Triggers — BEFORE UPDATE FOR EACH ROW on 7 public.* tables:
--     budget_categories, budget_centres, guest_users, income_sources,
--     transactions, user_preferences, users.
--
-- MIGRATION RISK IF LOST: updated_at would silently stop auto-bumping on all 7
-- tables — every audit/sort that relies on updated_at would quietly rot.
--
-- NOTE: DROP TRIGGER IF EXISTS before each CREATE makes the re-create idempotent.
-- No GRANT — a trigger function is invoked by the trigger, not by client roles.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- Trigger wiring on all 7 public.* tables (idempotent re-create).
DROP TRIGGER IF EXISTS budget_categories_updated_at ON public.budget_categories;
CREATE TRIGGER budget_categories_updated_at BEFORE UPDATE ON public.budget_categories FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS budget_centres_updated_at ON public.budget_centres;
CREATE TRIGGER budget_centres_updated_at BEFORE UPDATE ON public.budget_centres FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS guest_users_updated_at ON public.guest_users;
CREATE TRIGGER guest_users_updated_at BEFORE UPDATE ON public.guest_users FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS income_sources_updated_at ON public.income_sources;
CREATE TRIGGER income_sources_updated_at BEFORE UPDATE ON public.income_sources FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS transactions_updated_at ON public.transactions;
CREATE TRIGGER transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER user_preferences_updated_at BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n        int;
  v_fn_oid   oid;
  v_tbl      text;
  v_tables   text[] := ARRAY[
    'budget_categories', 'budget_centres', 'guest_users', 'income_sources',
    'transactions', 'user_preferences', 'users'
  ];
  v_trig     text;
BEGIN
  -- (a) handle_updated_at exists, returns trigger.
  SELECT p.oid INTO v_fn_oid FROM pg_proc p
    JOIN pg_type t ON t.oid = p.prorettype
    WHERE p.proname = 'handle_updated_at' AND t.typname = 'trigger';
  IF v_fn_oid IS NULL THEN RAISE EXCEPTION 'FAIL: handle_updated_at() trigger function not found'; END IF;

  -- (b) Exactly 7 triggers point at this function.
  SELECT count(*) INTO v_n FROM pg_trigger WHERE tgfoid = v_fn_oid AND NOT tgisinternal;
  IF v_n <> 7 THEN RAISE EXCEPTION 'FAIL: expected 7 handle_updated_at triggers, found %', v_n; END IF;

  -- (c) Each of the 7 tables has its BEFORE UPDATE trigger wired to this function.
  FOREACH v_tbl IN ARRAY v_tables LOOP
    v_trig := v_tbl || '_updated_at';
    SELECT count(*) INTO v_n FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
      WHERE tg.tgname = v_trig
        AND nsp.nspname = 'public'
        AND c.relname = v_tbl
        AND tg.tgfoid = v_fn_oid
        AND (tg.tgtype & 2) <> 0   -- TRIGGER_TYPE_BEFORE bit
        AND (tg.tgtype & 16) <> 0; -- TRIGGER_TYPE_UPDATE bit
    IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: % missing/wrong (expected 1 BEFORE UPDATE trigger on handle_updated_at, got %)', v_trig, v_n; END IF;
  END LOOP;

  RAISE NOTICE 'handle_updated_at OK: function + 7 BEFORE UPDATE triggers installed.';
END $$;

COMMIT;
