-- submit_guest_transaction.sql
--
-- Paste this entire file into the Supabase SQL Editor and click Run.
-- PREREQUISITES: migrate_27_guest_sessions.sql, then authenticate_guest.sql.
--
-- What this function does:
--   0. Validates the caller's guest SESSION TOKEN (minted by authenticate_guest)
--   1. Verifies the guest exists, is active, and belongs to the given centre
--   2. If the guest has restricted categories (allowed_categories is non-empty),
--      the submitted category must be in that list
--   3. Looks up the category_id by name for this centre (nullable — stored for
--      display even when the category row is not found)
--   4. Inserts the transaction as source = 'guest_portal', type = 'expense',
--      logged_by_user_id = NULL (no Supabase Auth session for guests)
--   5. Returns the new transaction UUID
--
-- Column mapping from the JavaScript call:
--   p_guest_id      → submitted_by_guest_id, logged_by_name, submitted_by_name
--   p_centre_id     → budget_centre_id
--   p_amount        → amount  (rounded to integer)
--   p_category_name → category_name + category_id lookup
--   p_description   → description
--   p_date          → date (cast to date)
--   p_week          → week  ('Week 1' … 'Week 5', computed client-side)
--   p_currency      → IGNORED. The hub (budget_centres.currency) is the single
--                     source of truth for display currency; the stored tx
--                     currency is resolved server-side from the centre so a stale
--                     shared guest link (?cur=…) can never stamp a divergent
--                     value. The param is kept for backward compatibility with
--                     already-deployed clients that still send it.
--   p_session_token → REQUIRED write credential; see below.
--
-- MODIFICATION (2026-07-30) — REQUIRE A GUEST SESSION, P0-B of the pre-launch
-- hardening batch. Pairs with migrate_27_guest_sessions.sql + authenticate_guest.sql.
--   THE GAP: this function authorized writes on (p_guest_id, p_centre_id) alone —
--   no proof the caller had ever passed a PIN. get_centre_guests is granted to
--   `anon` and returns guest ids so the login picker can render, and the portal URL
--   (?guest=1&c=<centreId>) is a link people share. So the id pair was effectively
--   public, and anyone holding a guest link could POST unlimited expenses into a
--   live hub. The PIN, its attempt counter and its 15-minute lockout all guarded
--   authenticate_guest — a function an attacker simply never had to call.
--   THE FIX: step 0 below requires a session token minted by authenticate_guest,
--   looked up by sha256 hash and checked for expiry AND for belonging to this same
--   guest. Rejects with SQLSTATE 'GST01' so the client can say "session expired,
--   re-enter your PIN" instead of showing a database error.
--
--   ⚠️ THE DROP BELOW IS LOAD-BEARING, NOT TIDINESS. Adding a 9th parameter creates
--   a NEW signature; PostgREST resolves an RPC by the argument names it is given, so
--   leaving the 8-arg version installed would leave the token-less path fully
--   callable and this entire fix cosmetic. The old overload is dropped explicitly
--   and the verify block asserts exactly ONE overload survives.
--
--   ORDER OF CHECKS: session first, then the guest row. The guest check is still
--   load-bearing and NOT redundant — it is the revocation path. Deactivating or
--   soft-deleting a guest must kill writes immediately even while an unexpired
--   token is still in that guest's sessionStorage.

-- Wrapped in a transaction so the verify block at the foot is a real gate — in
-- particular the "exactly ONE overload" assertion. A half-applied state here would
-- leave the token-less 8-arg function callable, which is the finding itself.
BEGIN;

DROP FUNCTION IF EXISTS submit_guest_transaction(uuid, uuid, numeric, text, text, text, text, text);

CREATE OR REPLACE FUNCTION submit_guest_transaction(
  p_guest_id       uuid,
  p_centre_id      uuid,
  p_amount         numeric,
  p_category_name  text,
  p_description    text,
  p_date           text,
  p_week           text,
  p_currency       text,
  p_session_token  text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest        guest_users%ROWTYPE;
  v_category_id  uuid;
  v_tx_id        uuid;
  v_cat_name     text;
  v_currency     text;
  v_session_id   uuid;
BEGIN

  -- 0. Validate the guest session (2026-07-30). No token, no write — the PIN is
  --    enforced here, not only at login. Looked up by hash (the raw token is never
  --    stored) and bound to THIS guest, so a token minted for one guest cannot be
  --    replayed as another. No parameter has a DEFAULT, so an omitted token is a
  --    missing-function error rather than a silent NULL.
  IF p_session_token IS NULL OR btrim(p_session_token) = '' THEN
    RAISE EXCEPTION 'guest_session_invalid: a valid guest session is required'
      USING ERRCODE = 'GST01';
  END IF;

  SELECT gs.id
  INTO   v_session_id
  FROM   guest_sessions gs
  WHERE  gs.token_hash = encode(sha256(convert_to(p_session_token, 'UTF8')), 'hex')
    AND  gs.guest_id   = p_guest_id
    AND  gs.expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'guest_session_invalid: guest session is missing, expired, or not for this guest'
      USING ERRCODE = 'GST01';
  END IF;

  -- 1. Validate guest: must be active, not deleted, and belong to this centre.
  --    Still required after the session check — this is the REVOCATION path (an
  --    owner deactivating a guest must stop writes even with a live token).
  SELECT *
  INTO   v_guest
  FROM   guest_users
  WHERE  guest_users.id               = p_guest_id
    AND  guest_users.budget_centre_id = p_centre_id
    AND  guest_users.is_active        = true
    AND  guest_users.deleted_at       IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'guest_not_found: guest % not found or not active for centre %',
      p_guest_id, p_centre_id;
  END IF;

  -- 2. Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: amount must be greater than zero';
  END IF;

  -- 3. Normalise category name
  v_cat_name := TRIM(COALESCE(NULLIF(TRIM(p_category_name), ''), 'Other'));

  -- 4. Category access check
  --    If the guest has a restricted category list, the submitted category
  --    must appear in it. An empty array means all categories are allowed.
  IF COALESCE(cardinality(v_guest.allowed_categories), 0) > 0 THEN
    IF NOT (v_cat_name = ANY(v_guest.allowed_categories)) THEN
      RAISE EXCEPTION 'category_not_allowed: % is not in guest allowed_categories',
        v_cat_name;
    END IF;
  END IF;

  -- 5. Look up category_id by name for this centre (most recent month wins)
  --    NULL is acceptable — category_name is always stored for display
  SELECT bc.id
  INTO   v_category_id
  FROM   budget_categories bc
  WHERE  bc.budget_centre_id = p_centre_id
    AND  bc.name             = v_cat_name
    AND  bc.deleted_at       IS NULL
  ORDER BY bc.month DESC
  LIMIT 1;

  -- 5b. Resolve the display currency from the hub — authoritative source of truth.
  --     p_currency is ignored (see header): a stale guest link must never stamp a
  --     currency that diverges from the centre. Falls back to 'GHS' defensively.
  SELECT COALESCE(c.currency, 'GHS')
  INTO   v_currency
  FROM   budget_centres c
  WHERE  c.id = p_centre_id;

  -- 6. Insert the transaction
  INSERT INTO transactions (
    budget_centre_id,
    amount,
    category_name,
    category_id,
    description,
    date,
    week,
    currency,
    type,
    source,
    logged_by_user_id,
    logged_by_name,
    submitted_by_guest_id,
    submitted_by_name
  )
  VALUES (
    p_centre_id,
    ROUND(p_amount),                              -- integer amount
    v_cat_name,
    v_category_id,                                -- NULL if no matching category row
    COALESCE(NULLIF(TRIM(p_description), ''), ''),
    p_date::date,
    p_week,
    v_currency,                                   -- hub currency, NOT p_currency
    'expense',
    'guest_portal',
    NULL,                                         -- no Supabase Auth session for guests
    v_guest.name,                                 -- logged_by_name  = guest display name
    p_guest_id,                                   -- submitted_by_guest_id
    v_guest.name                                  -- submitted_by_name
  )
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;

END;
$$;

-- Grant execution to the anon key (guest portal has no Supabase Auth session)
-- and to authenticated users (owner testing from the dashboard).
-- NOTE the 9-arg signature — the 8-arg (token-less) function was dropped above.
GRANT EXECUTE ON FUNCTION submit_guest_transaction(uuid, uuid, numeric, text, text, text, text, text, text)
  TO anon, authenticated;

-- ── Verification — self-asserting; any failure RAISES (added 2026-07-30) ──────
DO $$
DECLARE
  v_n   int;
  v_src text;
BEGIN
  -- (a) THE CRITICAL ASSERTION: exactly ONE overload. If the 8-arg token-less
  --     version survived, PostgREST would still resolve a call that omits the
  --     token and the whole fix would be cosmetic.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'submit_guest_transaction';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: % submit_guest_transaction overloads exist — the token-less 8-arg version is still callable', v_n; END IF;

  -- (b) …and it is the 9-arg one that takes the session token.
  SELECT count(*) INTO v_n FROM pg_proc
   WHERE proname = 'submit_guest_transaction'
     AND pg_get_function_identity_arguments(oid) =
         'p_guest_id uuid, p_centre_id uuid, p_amount numeric, p_category_name text, p_description text, p_date text, p_week text, p_currency text, p_session_token text';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: submit_guest_transaction does not have the expected 9-arg signature'; END IF;

  -- (c) No parameter has a DEFAULT — an omitted token must be a resolution error,
  --     never a silent NULL that slips past the guard.
  SELECT pronargdefaults INTO v_n FROM pg_proc WHERE proname = 'submit_guest_transaction';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: submit_guest_transaction has % defaulted parameter(s) — the token must be mandatory', v_n; END IF;

  -- (d) SECURITY DEFINER (the guest has no auth session at all).
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'submit_guest_transaction' AND prosecdef IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: submit_guest_transaction is not SECURITY DEFINER'; END IF;

  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'submit_guest_transaction';

  -- (e) The session check is present and hashed.
  IF v_src NOT LIKE '%guest_sessions%' THEN RAISE EXCEPTION 'FAIL: submit_guest_transaction never checks guest_sessions — token-less writes still accepted'; END IF;
  IF v_src NOT LIKE '%sha256%'         THEN RAISE EXCEPTION 'FAIL: submit_guest_transaction compares a raw token instead of its hash'; END IF;
  IF v_src NOT LIKE '%GST01%'          THEN RAISE EXCEPTION 'FAIL: submit_guest_transaction has no GST01 raise — the client cannot detect an expired session'; END IF;

  -- (f) The pre-existing guards all survived this edit. Each is load-bearing:
  --     is_active/deleted_at is the REVOCATION path, allowed_categories is the
  --     per-guest scope, and the hub currency resolution stops a stale link
  --     stamping a divergent currency.
  IF v_src NOT LIKE '%is_active%'           THEN RAISE EXCEPTION 'FAIL: lost the guest is_active check (revocation path)'; END IF;
  IF v_src NOT LIKE '%deleted_at%'          THEN RAISE EXCEPTION 'FAIL: lost the guest deleted_at check (revocation path)'; END IF;
  IF v_src NOT LIKE '%allowed_categories%'  THEN RAISE EXCEPTION 'FAIL: lost the allowed_categories scope check'; END IF;
  IF v_src NOT LIKE '%invalid_amount%'      THEN RAISE EXCEPTION 'FAIL: lost the amount validation'; END IF;
  IF v_src NOT LIKE '%budget_centres%'      THEN RAISE EXCEPTION 'FAIL: lost the hub currency resolution'; END IF;

  -- (g) MUST-PASS: anon holds EXECUTE on the NEW signature — the portal has no
  --     auth session, so a missing grant breaks every legitimate guest submit.
  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
   WHERE routine_name = 'submit_guest_transaction'
     AND grantee = 'anon' AND privilege_type = 'EXECUTE';
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: anon lacks EXECUTE on submit_guest_transaction — guest submits would break'; END IF;

  -- (h) The table it depends on exists (run migrate_27 first).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'guest_sessions'
  ) THEN RAISE EXCEPTION 'FAIL: guest_sessions missing — run migrate_27_guest_sessions.sql first'; END IF;

  RAISE NOTICE 'submit_guest_transaction OK: single 9-arg overload (token-less version dropped), mandatory hashed session check (GST01), revocation + category + currency guards intact, anon EXECUTE present.';
END $$;

COMMIT;
