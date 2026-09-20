-- =============================================================================
-- migrate_34_mark_income_received_name.sql
--
-- ONE FIELD. mark_income_received wrote logged_by_name from a different source
-- than the client does, so the same person appeared under two names in the same
-- activity feed depending on which door the transaction came through.
--
--   client (transactions.service.js:134)
--     logged_by_name: tx.logged_by_name || user?.user_metadata?.full_name || ''
--     -> auth.users.raw_user_meta_data ->> 'full_name'
--
--   this RPC (migrate_31, unchanged by migrate_32)
--     SELECT COALESCE(NULLIF(name, ''), '') FROM users WHERE id = auth.uid()
--     -> public.users.name
--
-- public.users.name is backfilled (full_name -> email prefix, backfill_user_names.sql),
-- so the two agree for accounts created since that backfill and disagree for any
-- account whose display name was changed afterwards, or whose backfill fell through
-- to the email prefix. The visible symptom is Recent Activity attributing one
-- person's expense and their payday receipt to two different names.
--
-- THE FIX: read auth.users.raw_user_meta_data ->> 'full_name' first, exactly as the
-- client does, and keep public.users.name only as a fallback for the case where that
-- key is missing or blank -- which is precisely the case in which the client writes
-- ''. So the RPC can never disagree with the client where the client has a name,
-- and degrades better where it does not.
--
-- Reading auth.users is safe here: the function is already SECURITY DEFINER and is
-- owned by the DB owner. The column list is schema-qualified because of
-- SET search_path = public.
--
-- NOT BACKFILLED. Rows already written keep the name they were written with. A
-- historical receipt showing the old form of a name is an accurate record of what
-- was stored; rewriting the ledger to tidy a label is not worth the migration.
--
-- FULL BODY, not a patch: CREATE OR REPLACE with the complete function, so this file
-- alone describes the installed behaviour (the migrate_32 convention). Everything
-- else is byte-identical to migrate_32 -- role gate, INC01/INC02, cycle resolution,
-- date clamp, week banding, idempotency key, cache column maintenance.
--
-- SAFE TO RE-RUN. Adds no column and no constraint.
--
-- -- ROLLBACK (down-migration) ------------------------------------------------
--   Re-apply scripts/migrate_32_mark_income_received_week.sql in full. It is a
--   CREATE OR REPLACE of the same signature, so it restores migrate_32's body
--   exactly, including the public.users.name read this file replaces.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.mark_income_received(
  p_source_id uuid,
  p_amount    numeric,
  p_date      date
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src      income_sources;
  v_cycle    budget_cycles;
  v_tx       transactions;
  v_existing uuid;
  v_created  boolean := false;
  v_week     text;
  v_currency text;
  v_name     text;
BEGIN
  -- 1. Load the source and authorize in one step: the membership check is the
  --    write gate (SECURITY DEFINER bypasses RLS).
  SELECT s.* INTO v_src
  FROM income_sources s
  WHERE s.id = p_source_id
    AND s.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM budget_centre_members m
      WHERE m.budget_centre_id = s.budget_centre_id
        AND m.user_id          = auth.uid()
        AND m.role             IN ('owner', 'full_access')
        AND m.deleted_at       IS NULL
    );

  IF v_src.id IS NULL THEN
    RAISE EXCEPTION 'Income source % not found, deleted, or not writable by this user', p_source_id
      USING ERRCODE = 'INC01';
  END IF;

  IF v_src.cycle_id IS NULL THEN
    RAISE EXCEPTION 'Income source % has no cycle_id — cannot resolve its budget period', p_source_id
      USING ERRCODE = 'INC02';
  END IF;

  SELECT * INTO v_cycle FROM budget_cycles WHERE id = v_src.cycle_id AND deleted_at IS NULL;
  IF v_cycle.id IS NULL THEN
    RAISE EXCEPTION 'Budget period % for income source % is missing or deleted', v_src.cycle_id, p_source_id
      USING ERRCODE = 'INC02';
  END IF;

  -- 2. THE IDEMPOTENCY KEY: one live income transaction per (source, cycle).
  --    Scoped by cycle_id, not by date, so correcting the date of an existing
  --    receipt updates that row instead of adding a second one.
  SELECT t.id INTO v_existing
  FROM transactions t
  WHERE t.income_source_id = p_source_id
    AND t.cycle_id         = v_src.cycle_id
    AND t.type             = 'income'
    AND t.deleted_at       IS NULL
  ORDER BY t.created_at
  LIMIT 1;

  -- 3. Clamp the date into the period. A receipt dated outside its own period
  --    would resolve to a DIFFERENT cycle via the resolve_cycle_id trigger and
  --    silently escape this idempotency check on the next call.
  p_date := LEAST(GREATEST(COALESCE(p_date, CURRENT_DATE), v_cycle.start_date), v_cycle.end_date);

  -- 4. week — mirrors lib/finance.js getWeekForDate. Parsed and asserted against it
  --    by src/lib/mark-income-received-week.test.js; keep the shape below stable.
  -- WEEK_RULE_BEGIN
  v_week := CASE
    WHEN EXTRACT(DAY FROM p_date) <= 7  THEN 'Week 1'
    WHEN EXTRACT(DAY FROM p_date) <= 14 THEN 'Week 2'
    WHEN EXTRACT(DAY FROM p_date) <= 21 THEN 'Week 3'
    WHEN EXTRACT(DAY FROM p_date) <= 28 THEN 'Week 4'
    ELSE 'Week 5'
  END;
  -- WEEK_RULE_END

  -- Hub currency is authoritative (migrate_20/21); income_sources.currency is vestigial.
  SELECT currency INTO v_currency FROM budget_centres WHERE id = v_src.budget_centre_id;
  -- migrate_34: read the SAME field the client writes.
  --
  -- transactions.service.js:134 builds logged_by_name as
  --   tx.logged_by_name || user?.user_metadata?.full_name || ''
  -- i.e. auth.users.raw_user_meta_data->>'full_name'. This RPC read public.users.name
  -- instead, so the two doors wrote different names for the same person: an expense
  -- logged in the app said "Johannan Adjei" while a payday receipt confirmed seconds
  -- later said whatever public.users.name happened to hold. Same user, same feed,
  -- two names.
  --
  -- public.users.name stays as a FALLBACK, not as the primary. It only fires where
  -- the metadata key is absent or blank -- exactly the case in which the client
  -- would have written '' -- so this can never diverge from the client where the
  -- client has a name to write, and is strictly better where it does not.
  SELECT COALESCE(
           NULLIF(au.raw_user_meta_data ->> 'full_name', ''),
           NULLIF(pu.name, ''),
           ''
         )
    INTO v_name
    FROM auth.users au
    LEFT JOIN public.users pu ON pu.id = au.id
   WHERE au.id = auth.uid();

  IF v_existing IS NOT NULL THEN
    UPDATE transactions
       SET amount        = p_amount,
           date          = p_date,
           week          = v_week,   -- migrate_32: was left stale when the date moved
           category_name = v_src.label,
           currency      = COALESCE(v_currency, currency),
           updated_at    = now()
     WHERE id = v_existing
    RETURNING * INTO v_tx;
  ELSE
    INSERT INTO transactions
      (budget_centre_id, date, week, type, category_id, category_name, amount,
       currency, description, logged_by_user_id, logged_by_name, source,
       submitted_by_name, from_spare, income_source_id, cycle_id)
    VALUES
      (v_src.budget_centre_id,
       p_date,
       v_week,                            -- migrate_32: the NOT NULL this file fixes
       'income',
       NULL,                              -- income has no budget category
       v_src.label,
       p_amount,
       COALESCE(v_currency, 'GHS'),
       v_src.label || ' received',
       auth.uid(),
       COALESCE(v_name, ''),
       'main_app',
       '',                                -- not a guest submission
       false,                             -- from_spare is an expense concept
       p_source_id,
       v_src.cycle_id)
    RETURNING * INTO v_tx;
    v_created := true;
  END IF;

  -- 5. Maintain the DEPRECATED cache columns so carry-forward and any un-migrated
  --    reader stay consistent. Nothing in the client reads these any more.
  UPDATE income_sources
     SET received        = true,
         received_amount = p_amount,
         actual_pay_date = p_date
   WHERE id = p_source_id;

  RETURN json_build_object(
    'transaction_id', v_tx.id,
    'source_id',      p_source_id,
    'cycle_id',       v_src.cycle_id,
    'amount',         v_tx.amount,
    'date',           v_tx.date,
    'week',           v_tx.week,
    'created',        v_created   -- false on the idempotent path
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_income_received(uuid, numeric, date) TO authenticated;

-- Verification: the function still exists and is callable, and its name source is
-- now the metadata key the client uses. The prosrc check is the regression guard --
-- a rebuild from migrate_31/32 would silently reinstate the divergence.
DO $$
DECLARE v_n int; v_src text; v_missing text;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'mark_income_received';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: mark_income_received not installed (got %)', v_n; END IF;

  IF NOT has_function_privilege('authenticated', 'public.mark_income_received(uuid, numeric, date)', 'EXECUTE')
    THEN RAISE EXCEPTION 'FAIL: authenticated cannot execute mark_income_received'; END IF;

  SELECT p.prosrc INTO v_src FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'mark_income_received';
  IF v_src NOT LIKE '%raw_user_meta_data%' THEN
    RAISE EXCEPTION 'FAIL: mark_income_received does not read raw_user_meta_data — logged_by_name has diverged from the client again (transactions.service.js uses user_metadata.full_name)';
  END IF;

  -- migrate_32's NOT NULL guard, kept: any NOT NULL column with no default that
  -- this RPC does not name would be the next `week`.
  SELECT string_agg(column_name, ', ') INTO v_missing
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'transactions'
    AND is_nullable = 'NO' AND column_default IS NULL
    AND column_name NOT IN ('budget_centre_id','date','week','type','category_name','amount');
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: transactions has NOT NULL columns with no default that this RPC does not set: %', v_missing;
  END IF;

  RAISE NOTICE 'migrate_34 OK: mark_income_received reads logged_by_name from the same field as the client.';
END $$;

COMMIT;

-- =============================================================================
-- MANUAL VERIFICATION
--
-- A. What the two doors now write, for the signed-in user:
--   SELECT COALESCE(NULLIF(au.raw_user_meta_data ->> 'full_name', ''), NULLIF(pu.name, ''), '') AS rpc_name,
--          au.raw_user_meta_data ->> 'full_name'                                               AS client_name
--     FROM auth.users au LEFT JOIN public.users pu ON pu.id = au.id
--    WHERE au.id = auth.uid();
--   -- expect rpc_name = client_name whenever client_name is non-empty
--
-- B. End to end: log an expense in the app, then confirm a payday receipt. Both
--    rows in Recent Activity must show the same name.
--   SELECT type, category_name, logged_by_name FROM transactions
--    WHERE logged_by_user_id = auth.uid() ORDER BY created_at DESC LIMIT 5;
--
-- C. Historical rows are untouched by design — an older receipt may still carry the
--    previous name. That is the record, not a bug.
-- =============================================================================
