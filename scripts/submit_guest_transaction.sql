-- submit_guest_transaction.sql
--
-- Paste this entire file into the Supabase SQL Editor and click Run.
--
-- What this function does:
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

CREATE OR REPLACE FUNCTION submit_guest_transaction(
  p_guest_id       uuid,
  p_centre_id      uuid,
  p_amount         numeric,
  p_category_name  text,
  p_description    text,
  p_date           text,
  p_week           text,
  p_currency       text
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
BEGIN

  -- 1. Validate guest: must be active, not deleted, and belong to this centre
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
-- and to authenticated users (owner testing from the dashboard)
GRANT EXECUTE ON FUNCTION submit_guest_transaction(uuid, uuid, numeric, text, text, text, text, text)
  TO anon, authenticated;
