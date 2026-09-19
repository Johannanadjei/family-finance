-- =============================================================================
-- migrate_31_mark_income_received.sql
--
-- #4b — make "mark received" IDEMPOTENT, server-side.
--
-- THE BUG THIS CLOSES
--   markReceived was a CLIENT-side two-phase write (useIncomeMutations): update
--   income_sources, then INSERT an income transaction. Nothing made the insert
--   conditional, so a second invocation created a SECOND transaction for the same
--   receipt. In production on 2026-09-19 one source produced insert → soft-delete →
--   insert inside 30 seconds, and the hub's income read double.
--
--   Two taps is not the only path in: a retry after a flaky phase-2, two devices,
--   or a client whose `txs` slice is stale all reach the same place. Idempotency
--   has to be enforced where the uniqueness actually lives — the database.
--
-- WHAT THIS FUNCTION DOES
--   Resolves the source's cycle, then UPSERTs BY MEANING rather than by key:
--     • a LIVE income transaction already carrying this income_source_id inside the
--       source's cycle  → UPDATE its amount/date (the user is correcting a figure)
--     • none            → INSERT one
--   Either way the caller ends with exactly one live income transaction per source
--   per cycle. Calling it twice with the same arguments changes nothing the second
--   time; calling it with a new amount edits in place.
--
--   The income_sources cache columns (received / received_amount / actual_pay_date)
--   are still maintained HERE so existing reads and the carry-forward RPCs keep
--   working, but they are DEPRECATED: lib/finance.js derives received from
--   transactions and no longer reads them. The client no longer writes them at all.
--   See docs/engineering-decisions.md (#4b).
--
-- WHY SECURITY DEFINER (CLAUDE.md §9.6)
--   The write spans two tables (income_sources + transactions) and must be atomic —
--   the split-brain state the client version could leave (source flagged received,
--   no transaction, or vice versa) is exactly what produced the mismatch. One
--   function, one transaction, one outcome. The in-function role check IS the gate,
--   since DEFINER bypasses RLS.
--
-- ERROR CODES (registry: CYC01-05, CAT01, GST01, HUB01, MEM01, SKN01 in use)
--   INC01  income source not found, deleted, or not in the caller's hub
--   INC02  the source has no resolvable cycle (cycle_id NULL — pre-Commit-10 row)
--
-- SAFE TO RE-RUN. CREATE OR REPLACE only; adds no column and no constraint.
--
-- BACKWARD COMPATIBLE. This only ADDS a function. The currently-deployed client
-- still performs its two-phase write and is unaffected — which matters because
-- there is ONE shared Supabase project across dev/staging/main, so this file
-- reaches production the moment it runs. SQL first, code second.
--
-- ── ROLLBACK (down-migration) ────────────────────────────────────────────────
--   DROP FUNCTION IF EXISTS public.mark_income_received(uuid, numeric, date);
--   -- The client's two-phase path is unchanged by this file, so dropping the
--   -- function restores the previous behaviour exactly. Run this BEFORE reverting
--   -- the client commit if you are rolling back both.
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

  IF v_existing IS NOT NULL THEN
    UPDATE transactions
       SET amount        = p_amount,
           date          = p_date,
           category_name = v_src.label,
           updated_at    = now()
     WHERE id = v_existing
    RETURNING * INTO v_tx;
  ELSE
    INSERT INTO transactions
      (budget_centre_id, date, type, category_name, currency, amount,
       description, source, income_source_id, cycle_id, logged_by_user_id)
    VALUES
      (v_src.budget_centre_id, p_date, 'income', v_src.label,
       (SELECT currency FROM budget_centres WHERE id = v_src.budget_centre_id),
       p_amount, v_src.label || ' received', 'main_app', p_source_id,
       v_src.cycle_id, auth.uid())
    RETURNING * INTO v_tx;
    v_created := true;
  END IF;

  -- 4. Maintain the DEPRECATED cache columns so carry-forward and any un-migrated
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
    'created',        v_created   -- false on the idempotent path
  );
END;
$$;

-- These gate RPCs are meant to be called by signed-in clients, so the Supabase
-- default `authenticated` EXECUTE grant is correct here (CLAUDE.md §9.6 note).
GRANT EXECUTE ON FUNCTION public.mark_income_received(uuid, numeric, date) TO authenticated;

-- Self-verification.
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'mark_income_received';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: mark_income_received not installed (got %)', v_n; END IF;

  IF NOT has_function_privilege('authenticated', 'public.mark_income_received(uuid, numeric, date)', 'EXECUTE')
    THEN RAISE EXCEPTION 'FAIL: authenticated cannot execute mark_income_received'; END IF;

  RAISE NOTICE 'migrate_31 OK: mark_income_received(uuid,numeric,date) installed (SECURITY DEFINER, owner/full_access gate, idempotent per source+cycle).';
END $$;

COMMIT;

-- =============================================================================
-- MANUAL VERIFICATION (run as an owner of the hub, against a real source id)
--
-- A. First call creates:
--   SELECT mark_income_received('<source-uuid>', 27942, CURRENT_DATE);
--   -- expect created = true
--
-- B. Second call with the SAME arguments is a no-op edit, NOT a second row:
--   SELECT mark_income_received('<source-uuid>', 27942, CURRENT_DATE);
--   -- expect created = false, same transaction_id as A
--
-- C. Exactly one live income transaction exists for that source in that period:
--   SELECT count(*) FROM transactions
--    WHERE income_source_id = '<source-uuid>' AND type = 'income' AND deleted_at IS NULL;
--   -- expect 1
--
-- D. A corrected amount edits in place:
--   SELECT mark_income_received('<source-uuid>', 30000, CURRENT_DATE);
--   -- expect created = false, amount = 30000, still exactly 1 row from C
-- =============================================================================
