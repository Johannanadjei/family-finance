-- authenticate_guest.sql
--
-- Paste this entire file into the Supabase SQL Editor and click Run.
-- PREREQUISITE: migrate_27_guest_sessions.sql (creates the guest_sessions table).
--
-- What this function does:
--   1. Looks up the guest by ID (must be active and not deleted)
--   2. Rejects immediately if a lockout is still active
--   3. Compares the incoming SHA-256 hex hash against the stored hash
--      (plain text equality — the client pre-hashes with SHA-256, the DB
--       stores SHA-256, so the comparison is just: pin_hash = p_pin_hash)
--   4. Wrong PIN → increments attempt_count; locks for 15 min after 5 failures
--   5. Correct PIN → resets attempt_count/locked_until, MINTS A SESSION TOKEN,
--      returns session data
--
-- Returns one row with columns:
--   status             text   — 'ok' | 'wrong_pin' | 'locked'
--   id                 uuid   — guest id (null unless status = 'ok')
--   name               text   — guest display name (null unless status = 'ok')
--   allowed_categories text[] — categories guest may log against
--   budget_centre_id   uuid   — the centre this guest belongs to
--   session_token      text   — opaque write credential (null unless status = 'ok')
--
-- MODIFICATION (2026-07-30) — SESSION TOKENS, P0-B of the pre-launch hardening
-- batch. Pairs with migrate_27_guest_sessions.sql + submit_guest_transaction.sql.
--   THE GAP: this function was the ONLY place the PIN was checked, but
--   submit_guest_transaction never required proof of having passed it — it took
--   (guest_id, centre_id) alone. get_centre_guests hands guest ids to `anon` so the
--   login picker can render, so guest ids are semi-public BY DESIGN and could never
--   be authorization. Result: anyone with a guest link could write expenses into a
--   live hub without a PIN, and the 15-minute lockout protected nothing on the
--   write path because the write path never consulted it.
--   THE FIX: a correct PIN now mints a random token, stored here as sha256 hex and
--   returned in the clear exactly once. submit_guest_transaction requires it. This
--   function becomes the only way to obtain one, so the brute-force protection
--   (attempt_count + locked_until, unchanged below) now covers writes too.
--
--   TOKEN CONSTRUCTION: two gen_random_uuid()s concatenated with hyphens stripped —
--   64 hex chars, 244 bits of entropy. Deliberately NOT gen_random_bytes(): that is
--   pgcrypto, which Supabase installs into the `extensions` schema, and this
--   function runs with SET search_path = public, so the call would fail to resolve.
--   gen_random_uuid() and sha256() are both CORE Postgres. Same reason
--   convert_to(...,'UTF8') is used rather than a text::bytea cast — Postgres has no
--   direct text→bytea cast for a text-typed value, only for a literal.
--
--   RETURN TYPE CHANGED (added session_token), so the old function is DROPped first
--   — CREATE OR REPLACE cannot change a RETURNS TABLE signature. Guest login is
--   unavailable only between the DROP and the CREATE in the same editor run.
--
--   EXPIRY: 12 hours. A guest logging the household's shopping re-enters a 4-digit
--   PIN at most once a day; a longer window would leave a write credential sitting
--   in sessionStorage for no benefit. The client treats an expired token as
--   "re-enter your PIN" rather than as an error.

-- Wrapped in a transaction so the verify block at the foot is a real gate: if any
-- assertion RAISEs (including "guest_sessions missing — run migrate_27 first"), the
-- DROP + CREATE rolls back and guest login is left exactly as it was.
BEGIN;

DROP FUNCTION IF EXISTS authenticate_guest(uuid, text);

CREATE OR REPLACE FUNCTION authenticate_guest(
  p_guest_id  uuid,
  p_pin_hash  text
)
RETURNS TABLE (
  status             text,
  id                 uuid,
  name               text,
  allowed_categories text[],
  budget_centre_id   uuid,
  session_token      text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest              guest_users%ROWTYPE;
  v_new_attempt_count  integer;
  v_token              text;
BEGIN

  -- 1. Fetch the guest row
  SELECT *
  INTO   v_guest
  FROM   guest_users
  WHERE  guest_users.id         = p_guest_id
    AND  guest_users.is_active  = true
    AND  guest_users.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'wrong_pin'::text, NULL::uuid, NULL::text, NULL::text[], NULL::uuid, NULL::text;
    RETURN;
  END IF;

  -- 2. Check active lockout
  IF v_guest.locked_until IS NOT NULL AND v_guest.locked_until > NOW() THEN
    RETURN QUERY SELECT 'locked'::text, NULL::uuid, NULL::text, NULL::text[], NULL::uuid, NULL::text;
    RETURN;
  END IF;

  -- 3. Compare PIN hash — plain text equality, both sides are SHA-256 hex
  IF v_guest.pin_hash <> p_pin_hash THEN
    v_new_attempt_count := v_guest.attempt_count + 1;

    UPDATE guest_users
    SET    attempt_count = v_new_attempt_count,
           locked_until  = CASE
                             WHEN v_new_attempt_count >= 5
                             THEN NOW() + INTERVAL '15 minutes'
                             ELSE NULL
                           END
    WHERE  guest_users.id = p_guest_id;

    RETURN QUERY SELECT 'wrong_pin'::text, NULL::uuid, NULL::text, NULL::text[], NULL::uuid, NULL::text;
    RETURN;
  END IF;

  -- 4. PIN correct — reset lockout counters
  UPDATE guest_users
  SET    attempt_count = 0,
         locked_until  = NULL
  WHERE  guest_users.id = p_guest_id;

  -- 4b. Opportunistic sweep of expired sessions (2026-07-30). Keeps the table
  --     self-maintaining with no cron: every successful login clears dead rows.
  --     Cheap — idx_guest_sessions_expires_at backs it.
  DELETE FROM guest_sessions WHERE expires_at < NOW();

  -- 4c. Mint the write credential. Only the sha256 hex is persisted, so the raw
  --     token exists in the clear exactly once — in this response.
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  INSERT INTO guest_sessions (guest_id, token_hash, expires_at)
  VALUES (
    v_guest.id,
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    NOW() + INTERVAL '12 hours'
  );

  -- 5. Return session data + the token
  RETURN QUERY
  SELECT 'ok'::text,
         v_guest.id,
         v_guest.name,
         v_guest.allowed_categories,
         v_guest.budget_centre_id,
         v_token;

END;
$$;

-- Grant execution to the anon key (guest portal, no Supabase Auth session)
-- and to authenticated users (owner testing from the dashboard)
GRANT EXECUTE ON FUNCTION authenticate_guest(uuid, text) TO anon, authenticated;

-- ── Verification — self-asserting; any failure RAISES (added 2026-07-30) ──────
DO $$
DECLARE
  v_n   int;
  v_src text;
BEGIN
  -- (a) Exactly one overload, with the expected signature.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'authenticate_guest';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: % authenticate_guest overloads exist — the pre-session version must be dropped', v_n; END IF;

  -- (b) SECURITY DEFINER — it reads pin_hash and writes guest_sessions past RLS.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'authenticate_guest' AND prosecdef IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: authenticate_guest is not SECURITY DEFINER'; END IF;

  -- (c) The session_token OUT column exists — the client reads it by name.
  SELECT count(*) INTO v_n FROM information_schema.parameters
   WHERE specific_schema = 'public' AND specific_name LIKE 'authenticate_guest%'
     AND parameter_name = 'session_token' AND parameter_mode = 'OUT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: authenticate_guest has no session_token OUT column'; END IF;

  -- (d) It actually mints a session, and stores only a hash.
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'authenticate_guest';
  IF v_src NOT LIKE '%guest_sessions%' THEN RAISE EXCEPTION 'FAIL: authenticate_guest never writes guest_sessions'; END IF;
  IF v_src NOT LIKE '%sha256%'         THEN RAISE EXCEPTION 'FAIL: authenticate_guest stores a token without hashing it'; END IF;

  -- (e) The brute-force protection survived this edit — it is now the ONLY thing
  --     standing between anon and a write credential.
  IF v_src NOT LIKE '%attempt_count%' THEN RAISE EXCEPTION 'FAIL: authenticate_guest lost its attempt counter'; END IF;
  IF v_src NOT LIKE '%locked_until%'  THEN RAISE EXCEPTION 'FAIL: authenticate_guest lost its lockout'; END IF;

  -- (f) MUST-PASS: anon holds EXECUTE — the portal has no auth session.
  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
   WHERE routine_name = 'authenticate_guest' AND grantee = 'anon' AND privilege_type = 'EXECUTE';
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: anon lacks EXECUTE on authenticate_guest — guest login would break'; END IF;

  -- (g) The table it depends on exists (run migrate_27 first).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'guest_sessions'
  ) THEN RAISE EXCEPTION 'FAIL: guest_sessions missing — run migrate_27_guest_sessions.sql first'; END IF;

  RAISE NOTICE 'authenticate_guest OK: single overload, SECURITY DEFINER, mints hashed 244-bit session token, lockout preserved, anon EXECUTE intact.';
END $$;

COMMIT;
