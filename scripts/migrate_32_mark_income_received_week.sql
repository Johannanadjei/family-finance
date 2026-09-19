-- =============================================================================
-- migrate_32_mark_income_received_week.sql
--
-- #4b FOLLOW-UP — mark_income_received's INSERT path violated a NOT NULL.
--
-- THE BUG
--   migrate_31's INSERT omitted `week`, which is `text NOT NULL` with NO default
--   (schema_base.sql:159). Every INSERT path call failed with:
--     null value in column "week" of relation "transactions" violates not-null constraint
--   The UPDATE path was unaffected — it touches an existing row — which is why the
--   idempotent branch worked and only first-time confirmations broke. The client's
--   rollback held and nothing partial was written.
--
--   Root cause of the omission: the client used to build this row and called
--   getWeekForDate() itself (lib/finance.js). Moving the INSERT server-side moved
--   that responsibility too, and it was not carried across.
--
-- THE WEEK RULE — must match lib/finance.js getWeekForDate EXACTLY
--   export const getWeekForDate = (dateStr) => {
--     const day = new Date(dateStr).getDate();
--     if (day <= 7)  return 'Week 1';
--     if (day <= 14) return 'Week 2';
--     if (day <= 21) return 'Week 3';
--     if (day <= 28) return 'Week 4';
--     return 'Week 5';
--   };
--   Day-of-month banding in 7s, with days 29-31 falling into Week 5. The SQL below
--   is the same banding on EXTRACT(DAY FROM …), which is exact (no timezone step —
--   the JS version's Date parse assumes the UTC parity lib/dates.js documents).
--   src/lib/mark-income-received-week.test.js parses the CASE out of THIS FILE and
--   asserts it against getWeekForDate for days 1-31, so the two cannot drift.
--   The transactions_week_check CHECK constrains the column to these five values.
--
-- ALSO FIXED — week on the UPDATE path
--   migrate_31's UPDATE changed `date` but left `week` alone, so correcting a
--   receipt from the 5th to the 20th left week='Week 1' beside date=20th. Latent,
--   never surfaced (nothing reads week for income), but wrong. It is set now.
--
-- NOT NULL AUDIT of public.transactions (schema_base.sql:155-181)
--   no default, MUST be set : budget_centre_id, date, week, type, category_name, amount
--   default but set anyway  : currency, description, logged_by_name, source,
--                             submitted_by_name, from_spare
--   nullable, set where known: category_id (NULL — income has no budget category),
--                             logged_by_user_id, income_source_id, cycle_id
--   nullable, left NULL     : submitted_by_guest_id, deleted_at
--   `week` was the only actual violation; the rest are set explicitly so a future
--   default change cannot silently alter what this RPC writes.
--
-- FULL BODY, not a patch: CREATE OR REPLACE with the complete function so this file
-- alone describes the installed behaviour. Everything from migrate_31 is preserved
-- (role gate, INC01/INC02, cycle resolution, date clamp, idempotency key, cache
-- column maintenance); only the INSERT/UPDATE column lists change.
--
-- SAFE TO RE-RUN. Adds no column and no constraint.
--
-- ── ROLLBACK (down-migration) ────────────────────────────────────────────────
--   Re-apply scripts/migrate_31_mark_income_received.sql in full. It is a
--   CREATE OR REPLACE of the same signature, so it restores migrate_31's body
--   exactly — including the missing `week`, i.e. it restores the bug. Roll back
--   only if this file is itself faulty.
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
  -- Display name, same source the rest of the app uses (public.users.name is
  -- backfilled full_name → email prefix by backfill_user_names.sql).
  SELECT COALESCE(NULLIF(name, ''), '') INTO v_name FROM users WHERE id = auth.uid();

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

-- Self-verification: the function exists, is callable, and its INSERT column list
-- covers every NOT NULL column on transactions that has no default.
DO $$
DECLARE v_n int; v_missing text;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'mark_income_received';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: mark_income_received not installed (got %)', v_n; END IF;

  IF NOT has_function_privilege('authenticated', 'public.mark_income_received(uuid, numeric, date)', 'EXECUTE')
    THEN RAISE EXCEPTION 'FAIL: authenticated cannot execute mark_income_received'; END IF;

  -- Any NOT NULL column with no default that this RPC does not name would be the
  -- next 'week'. Listed here so the failure is a clear message, not a runtime 23502.
  SELECT string_agg(column_name, ', ') INTO v_missing
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'transactions'
    AND is_nullable = 'NO' AND column_default IS NULL
    AND column_name NOT IN ('budget_centre_id','date','week','type','category_name','amount');
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: transactions has NOT NULL columns with no default that this RPC does not set: %', v_missing;
  END IF;

  RAISE NOTICE 'migrate_32 OK: mark_income_received sets week + every NOT NULL column on INSERT.';
END $$;

COMMIT;

-- =============================================================================
-- MANUAL VERIFICATION (run as an owner of the hub, against a real source id)
--
-- A. INSERT path — the one migrate_31 broke. Use a source with NO receipt yet:
--   SELECT mark_income_received('<source-uuid>', 27942, '2026-09-12');
--   -- expect created = true, week = 'Week 2'   (12 -> Week 2)
--
-- B. Idempotent repeat:
--   SELECT mark_income_received('<source-uuid>', 27942, '2026-09-12');
--   -- expect created = false, same transaction_id
--
-- C. Moving the date re-bands the week (the UPDATE-path fix):
--   SELECT mark_income_received('<source-uuid>', 27942, '2026-09-24');
--   -- expect created = false, week = 'Week 4'
--
-- D. Still exactly one live income transaction:
--   SELECT count(*) FROM transactions
--    WHERE income_source_id = '<source-uuid>' AND type = 'income' AND deleted_at IS NULL;
--   -- expect 1
--
-- E. Week boundaries (7/8, 14/15, 21/22, 28/29) match getWeekForDate — asserted
--    automatically by src/lib/mark-income-received-week.test.js.
-- =============================================================================
