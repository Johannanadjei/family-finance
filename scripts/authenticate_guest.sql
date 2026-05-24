-- authenticate_guest.sql
--
-- Paste this entire file into the Supabase SQL Editor and click Run.
--
-- What this function does:
--   1. Looks up the guest by ID (must be active and not deleted)
--   2. Rejects immediately if a lockout is still active
--   3. Compares the incoming SHA-256 hex hash against the stored hash
--      (plain text equality — the client pre-hashes with SHA-256, the DB
--       stores SHA-256, so the comparison is just: pin_hash = p_pin_hash)
--   4. Wrong PIN → increments attempt_count; locks for 15 min after 5 failures
--   5. Correct PIN → resets attempt_count/locked_until, returns session data
--
-- Returns one row with columns:
--   status             text   — 'ok' | 'wrong_pin' | 'locked'
--   id                 uuid   — guest id (null unless status = 'ok')
--   name               text   — guest display name (null unless status = 'ok')
--   allowed_categories text[] — categories guest may log against
--   budget_centre_id   uuid   — the centre this guest belongs to

CREATE OR REPLACE FUNCTION authenticate_guest(
  p_guest_id  uuid,
  p_pin_hash  text
)
RETURNS TABLE (
  status             text,
  id                 uuid,
  name               text,
  allowed_categories text[],
  budget_centre_id   uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest              guest_users%ROWTYPE;
  v_new_attempt_count  integer;
BEGIN

  -- 1. Fetch the guest row
  SELECT *
  INTO   v_guest
  FROM   guest_users
  WHERE  guest_users.id         = p_guest_id
    AND  guest_users.is_active  = true
    AND  guest_users.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'wrong_pin'::text, NULL::uuid, NULL::text, NULL::text[], NULL::uuid;
    RETURN;
  END IF;

  -- 2. Check active lockout
  IF v_guest.locked_until IS NOT NULL AND v_guest.locked_until > NOW() THEN
    RETURN QUERY SELECT 'locked'::text, NULL::uuid, NULL::text, NULL::text[], NULL::uuid;
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

    RETURN QUERY SELECT 'wrong_pin'::text, NULL::uuid, NULL::text, NULL::text[], NULL::uuid;
    RETURN;
  END IF;

  -- 4. PIN correct — reset lockout counters and return session data
  UPDATE guest_users
  SET    attempt_count = 0,
         locked_until  = NULL
  WHERE  guest_users.id = p_guest_id;

  RETURN QUERY
  SELECT 'ok'::text,
         v_guest.id,
         v_guest.name,
         v_guest.allowed_categories,
         v_guest.budget_centre_id;

END;
$$;

-- Grant execution to the anon key (guest portal, no Supabase Auth session)
-- and to authenticated users (owner testing from the dashboard)
GRANT EXECUTE ON FUNCTION authenticate_guest(uuid, text) TO anon, authenticated;
