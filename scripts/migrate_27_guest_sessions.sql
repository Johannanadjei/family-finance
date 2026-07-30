-- =============================================================================
-- migrate_27_guest_sessions.sql   (P0-B — pre-launch hardening, 2026-07-30)
--
-- FIXES: the guest PIN gates LOGIN only. submit_guest_transaction takes
--        (guest_id, centre_id) and NO proof of authentication, while
--        get_centre_guests is granted to `anon` and hands out guest ids so the
--        portal can render its picker. Anyone holding a guest link — or any
--        centre id — can therefore POST unlimited expenses into a live hub
--        without ever passing a PIN.
--
-- ORDER: run this FIRST (it creates the table the two functions below need), then
--        re-run authenticate_guest.sql (mints a session), then
--        submit_guest_transaction.sql (requires one). Apply all three or none —
--        they close ONE finding.
--
-- ── WHY A SESSION TABLE AND NOT "JUST SEND THE PIN AGAIN" ────────────────────
-- Guest ids are SEMI-PUBLIC BY DESIGN: get_centre_guests projects them to anon so
-- the login picker can list "who are you?". So an id can never be authorization.
-- Re-sending the PIN hash on every submit would work, but it keeps a replayable
-- credential in the client for the whole session and gives the write path no
-- lockout of its own. A server-minted, expiring session token is the standard
-- shape: authenticate_guest already owns attempt-counting and the 15-minute
-- lockout, and it becomes the ONLY way to obtain one.
--
-- ── WHY token_hash AND NOT THE RAW TOKEN ─────────────────────────────────────
-- Storing the raw token would mean anything able to read this table (service_role,
-- a DB console, a future policy mistake) could hijack a live guest session. We
-- store encode(sha256(...), 'hex') instead.
--   • sha256() is CORE PostgreSQL (11+), NOT pgcrypto — deliberate. Supabase
--     installs pgcrypto into the `extensions` schema, and these functions run with
--     SET search_path = public, so a bare digest()/gen_random_bytes() call would
--     fail to resolve. Core sha256 + convert_to() has no such dependency.
--   • A plain hash (no salt, no KDF) is correct HERE and would be WRONG for a PIN:
--     the token is 244 bits of uniform randomness, so there is no small candidate
--     space to enumerate. The 4-digit app PIN is the opposite case (10k space) —
--     see the P3 note in docs/engineering-decisions.md.
--
-- ── REVOCATION ───────────────────────────────────────────────────────────────
-- Deactivating or deleting a guest kills their sessions without touching this
-- table: submit_guest_transaction re-checks is_active/deleted_at on the guest row
-- for every write. The FK is ON DELETE CASCADE for hard deletes; the app
-- soft-deletes, which the guest-row check covers.
--
-- ── NO RLS POLICIES, ON PURPOSE ──────────────────────────────────────────────
-- RLS is enabled and ZERO policies are created, so no client — anon or
-- authenticated — can read, insert or update this table. Both writers are
-- SECURITY DEFINER functions, which bypass RLS. Same posture as `subscriptions`
-- (CLAUDE.md §9.6): a credential store must never be client-reachable. The verify
-- block asserts the policy count is 0 — if a future migration adds one, it fails.
--
-- ADDITIVE / REVERSIBLE: creates one new table. No existing table, column or row
-- is touched. Rollback is DROP TABLE guest_sessions (plus reverting the two
-- functions); nothing is destructive.
-- =============================================================================

BEGIN;

-- 1. Guest session tokens. One row per successful PIN entry; multiple concurrent
--    rows per guest are allowed (a guest may use phone and tablet) and staleness
--    is bounded by expires_at rather than by forcing a single session.
CREATE TABLE IF NOT EXISTS guest_sessions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id   uuid        NOT NULL REFERENCES guest_users(id) ON DELETE CASCADE,
  token_hash text        NOT NULL UNIQUE,   -- sha256 hex of the token; raw token never stored
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes. token_hash's UNIQUE constraint already provides the lookup index —
--    the hot path is an equality probe on it. expires_at backs the opportunistic
--    cleanup sweep inside authenticate_guest.
CREATE INDEX IF NOT EXISTS idx_guest_sessions_expires_at ON guest_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_guest_id   ON guest_sessions(guest_id);

-- 3. RLS on, deliberately ZERO policies — RPC-only (see header).
ALTER TABLE guest_sessions ENABLE ROW LEVEL SECURITY;

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n int;
BEGIN
  -- (a) Table exists.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'guest_sessions'
  ) THEN RAISE EXCEPTION 'FAIL: guest_sessions table missing'; END IF;

  -- (b) RLS enabled.
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.guest_sessions'::regclass)
    THEN RAISE EXCEPTION 'FAIL: RLS not enabled on guest_sessions'; END IF;

  -- (c) THE SECURITY PROPERTY: zero policies, so no client can reach the table.
  --     A session token is a credential; it must be RPC-only.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'guest_sessions';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: guest_sessions has % policy/policies — it must be RPC-only', v_n; END IF;

  -- (d) token_hash is UNIQUE (one row per token; also the lookup index).
  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE conrelid = 'public.guest_sessions'::regclass AND contype = 'u';
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: guest_sessions.token_hash is not UNIQUE'; END IF;

  -- (e) FK to guest_users with ON DELETE CASCADE (hard-delete cleanup).
  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE conrelid = 'public.guest_sessions'::regclass
     AND contype = 'f' AND confdeltype = 'c';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: guest_sessions FK to guest_users missing or not ON DELETE CASCADE'; END IF;

  -- (f) sha256() is reachable as a CORE function under search_path=public. If this
  --     fails, the two functions cannot hash tokens and the batch must not proceed.
  IF encode(sha256(convert_to('probe', 'UTF8')), 'hex') IS NULL
    THEN RAISE EXCEPTION 'FAIL: core sha256() unavailable'; END IF;

  RAISE NOTICE 'migrate_27 OK: guest_sessions created (RLS on, ZERO policies, unique token_hash, CASCADE FK, core sha256 available).';
END $$;

COMMIT;

-- =============================================================================
-- NEXT: re-run scripts/authenticate_guest.sql then scripts/submit_guest_transaction.sql.
-- Until BOTH are re-run, submit still accepts token-less writes — the table alone
-- changes nothing. That is why the three files are one batch.
--
-- Post-batch checks with the anon key — BOTH directions:
--
-- MUST FAIL (the attack):
--   -- no session token at all: the 8-arg overload must no longer exist
--   POST /rest/v1/rpc/submit_guest_transaction {"p_guest_id":"…","p_centre_id":"…",
--        "p_amount":10,"p_category_name":"Food","p_description":"","p_date":"2026-07-30",
--        "p_week":"Week 5","p_currency":"GHS"}            -- expect: function not found
--   -- a made-up token
--   …with "p_session_token":"deadbeef"                     -- expect GST01
--   -- the session table itself must be unreadable
--   GET /rest/v1/guest_sessions?select=*                   -- expect zero rows / denied
--
-- MUST PASS (legitimate guest):
--   POST /rest/v1/rpc/authenticate_guest {"p_guest_id":"…","p_pin_hash":"<sha256 of PIN>"}
--     -- expect status 'ok' AND a 64-char session_token
--   POST /rest/v1/rpc/submit_guest_transaction {…, "p_session_token":"<that token>"}
--     -- expect a transaction uuid, and the row visible on the owner's dashboard
--   -- wrong PIN 5× must still lock the guest out for 15 minutes (lockout preserved)
-- =============================================================================
