-- =============================================================================
-- f1_t4_diag.sql   (F1 RLS audit — T4 rejection diagnostic, evidence only)
--
-- WHY THIS EXISTS
-- The BEFORE probe reported T4 (standard member transmutes its own expense into
-- income) as REJECTED [42501] "row-level security". The live policy grid says that
-- should be IMPOSSIBLE:
--   transactions_update -> check_type INHERITED, effective check = bare
--                          is_budget_centre_member(budget_centre_id)
-- The standard member IS a member, and budget_centre_id does not change, so the
-- post-image satisfies that check. Nothing in transactions' own policies mentions
-- `type`.
--
-- THE NARROWING DEDUCTION
-- T6 updated the SAME row, in the SAME session, as the SAME user, and succeeded.
--   T6: SET amount = amount + 1, description = ...   -> 1 row
--   T4: SET type = 'income',     description = ...   -> 42501
-- The only difference is the `type` column. Whatever rejected T4 is TYPE-SENSITIVE,
-- and transactions_update is not. So the rejection is probably not coming from
-- transactions_update at all.
--
-- WHY THE FIRST PROBE COULD NOT ANSWER THIS
-- f1_write_probe.sql line 285 classifies instead of reporting:
--     WHEN v_state = '42501' AND v_msg LIKE '%row-level security%'
--       THEN 'REJECTED BY RLS [42501]  <-- WITH CHECK working'
-- It asserts a conclusion and DISCARDS v_msg. But "new row violates row-level
-- security policy for table X" names X — and X may not be `transactions`. If a
-- trigger on transactions writes to another RLS-protected table when type='income',
-- that error is still 42501 and still matches '%row-level security%' while being
-- about a completely different table. The classifier hid exactly the word that
-- matters.
--
-- SO THIS FILE DOES NOT CLASSIFY. It captures every diagnostic Postgres exposes and
-- prints them verbatim. No CASE, no interpretation, no verdict. Read the raw text.
--
-- WHAT TO LOOK FOR IN THE OUTPUT
--   MESSAGE_TEXT / TABLE_NAME -> which table's policy actually rejected the row.
--   PG_EXCEPTION_CONTEXT      -> if a trigger raised it, the trigger function and
--                                its SQL statement appear in this stack. An empty
--                                context means the error came from the UPDATE itself.
--   TRIGGERS ON transactions  -> cross-reference any function named in the context.
--
-- ── WHAT THIS FILE FOUND (2026-07-16) ────────────────────────────────────────
--   SQLSTATE 42501, MESSAGE_TEXT "new row violates row-level security policy for
--   table transactions". CONSTRAINT_NAME empty (not a CHECK/FK). PG_EXCEPTION_CONTEXT
--   showed ONLY the bare UPDATE — no resolve_cycle_id(), no handle_updated_at() — so
--   no trigger raised it. A genuine RLS WITH CHECK rejection on the post-image.
--
--   That contradicted the policy grid, which showed transactions_update's effective
--   check as bare is_budget_centre_member (INHERITED from USING) — which a standard
--   member satisfies. Resolution: the WHERE clause made the statement require
--   ACL_SELECT, which pulls migrate_23's type-aware SELECT policy in as a post-image
--   WITH CHECK. It was the READ policy rejecting a WRITE test. See f1_t4b_diag.sql:
--   the unqualified form has no such protection and was ACCEPTED.
--
-- SAFETY — identical guarantees to f1_write_probe.sql:
--   * ONE DO block = ONE statement. Cannot be half-run by a truncated paste.
--   * EVERY path out ends in RAISE EXCEPTION (setup guards raise; the report itself
--     is raised). The transaction CANNOT commit. If the UPDATE unexpectedly
--     SUCCEEDS, it still rolls back — nothing persists either way.
--   * Only T4 runs. No INSERTs, no cross-hub test, no owner tests.
--   * The only row touched is the fixture hub's own expense_tx (brief row lock,
--     released by the rollback).
--   * Impersonation is SET LOCAL, so it reverts with the rollback.
-- =============================================================================
DO $$
DECLARE
  -- ── PARAMS — identical to f1_write_probe.sql ───────────────────────────────
  p_hub_pfx        text := '0d3ccc2e';   -- fixture hub "sal income", GHS
  p_standard_pfx   text := '3a36d46c';   -- standard member — impersonation target
  p_expense_tx_pfx text := 'd6b3b86c';   -- expense tx "Groceries" / 250

  v_hub        uuid;
  v_standard   uuid;
  v_expense_tx uuid;
  v_n          int;

  c_mark constant text := 'F1-T4DIAG-ROLLBACK-ME';

  -- Captured diagnostics — every one Postgres exposes for this error class.
  d_sqlstate   text := '(no exception raised)';
  d_message    text := '';
  d_detail     text := '';
  d_hint       text := '';
  d_context    text := '';
  d_schema     text := '';
  d_table      text := '';
  d_column     text := '';
  d_constraint text := '';

  v_outcome text;
  v_trigs   text := '';
  v_rep     text := '';
BEGIN
  -- ═══ Pre-flight, as postgres, before impersonating ═════════════════════════
  -- min() has no uuid overload -> min(id::text)::uuid. count(*) drives the
  -- exactly-one assertion, so the cast cannot widen what is accepted.
  SELECT count(*), min(id::text)::uuid INTO v_n, v_hub FROM public.budget_centres
    WHERE id::text LIKE p_hub_pfx || '%' AND deleted_at IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'SETUP FAIL: hub prefix % matched % live hubs, need exactly 1', p_hub_pfx, v_n; END IF;

  SELECT count(*), min(m.user_id::text)::uuid INTO v_n, v_standard FROM public.budget_centre_members m
    WHERE m.user_id::text LIKE p_standard_pfx || '%' AND m.budget_centre_id = v_hub
      AND m.role = 'standard' AND m.deleted_at IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'SETUP FAIL: standard prefix % matched % active standard members, need exactly 1', p_standard_pfx, v_n; END IF;

  SELECT count(*), min(t.id::text)::uuid INTO v_n, v_expense_tx FROM public.transactions t
    WHERE t.id::text LIKE p_expense_tx_pfx || '%' AND t.budget_centre_id = v_hub
      AND t.type = 'expense' AND t.deleted_at IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'SETUP FAIL: expense_tx prefix % matched % live expense transactions, need exactly 1', p_expense_tx_pfx, v_n; END IF;

  -- ── Trigger inventory, read while we still have owner visibility ───────────
  -- tgenabled: O = enabled (origin), D = disabled, A = always, R = replica.
  -- A disabled trigger cannot be the cause; it is listed so that is verifiable.
  --
  -- ⚠ KNOWN FLAW — THIS INVENTORY OVER-REPORTS TRIGGER SCOPE. It decodes tgtype's
  -- event bits but never reads tgattr, which holds the COLUMN LIST of an
  -- `UPDATE OF <cols>` trigger. So it prints
  --     auto_resolve_cycle_id_transactions  BEFORE  INSERT/UPDATE  resolve_cycle_id()
  -- for a trigger that is actually
  --     BEFORE INSERT OR UPDATE OF date, cycle_id
  -- and fires on UPDATE only when `date` or `cycle_id` is in the SET list. On
  -- 2026-07-16 this cost a full round trip: it manufactured a CYC02 confound for
  -- f1_t4b_diag.sql that could not actually occur, because that test sets only
  -- `type` and `description`.
  --
  -- DO NOT trust this block for scope questions. Use the raw definition instead:
  --   SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
  --   WHERE tgrelid = 'public.transactions'::regclass AND NOT tgisinternal;
  -- It is left as-is rather than fixed because this file is an artifact of a
  -- completed investigation; the note is the fix.
  SELECT string_agg(
           format('  %-34s %-7s %-26s %s   [tgenabled=%s]',
                  tg.tgname,
                  CASE WHEN (tg.tgtype::int & 2) <> 0 THEN 'BEFORE' ELSE 'AFTER' END,
                  concat_ws('/',
                    CASE WHEN (tg.tgtype::int &  4) <> 0 THEN 'INSERT' END,
                    CASE WHEN (tg.tgtype::int &  8) <> 0 THEN 'DELETE' END,
                    CASE WHEN (tg.tgtype::int & 16) <> 0 THEN 'UPDATE' END,
                    CASE WHEN (tg.tgtype::int & 32) <> 0 THEN 'TRUNCATE' END),
                  p.proname || '()',
                  tg.tgenabled),
           E'\n' ORDER BY tg.tgname)
    INTO v_trigs
  FROM pg_trigger tg
  JOIN pg_proc p ON p.oid = tg.tgfoid
  WHERE tg.tgrelid = 'public.transactions'::regclass
    AND NOT tg.tgisinternal;   -- exclude FK enforcement triggers

  IF v_trigs IS NULL THEN v_trigs := '  (none)'; END IF;

  -- ═══ Impersonate the standard member ═══════════════════════════════════════
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_standard::text, 'role', 'authenticated')::text,
                     true);   -- true = SET LOCAL, reverts on rollback
  PERFORM set_config('role', 'authenticated', true);

  IF auth.uid() IS DISTINCT FROM v_standard THEN
    RAISE EXCEPTION 'SETUP FAIL: impersonation did not take — auth.uid() is %, expected %', auth.uid(), v_standard;
  END IF;
  IF current_user = 'postgres' THEN
    RAISE EXCEPTION 'SETUP FAIL: still running as postgres — RLS is bypassed for the table owner and T4 would pass vacuously';
  END IF;

  -- ═══ T4 — byte-identical to f1_write_probe.sql lines 277-279 ═══════════════
  -- No RETURNING: confirmed against the probe. The post-image is never read back,
  -- so SELECT policies cannot apply to it.
  BEGIN
    UPDATE public.transactions
      SET type = 'income', description = c_mark
      WHERE id = v_expense_tx;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_outcome := format('NO EXCEPTION — %s row(s) affected (rolled back regardless)', v_n);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      d_sqlstate   = RETURNED_SQLSTATE,
      d_message    = MESSAGE_TEXT,
      d_detail     = PG_EXCEPTION_DETAIL,
      d_hint       = PG_EXCEPTION_HINT,
      d_context    = PG_EXCEPTION_CONTEXT,
      d_schema     = SCHEMA_NAME,
      d_table      = TABLE_NAME,
      d_column     = COLUMN_NAME,
      d_constraint = CONSTRAINT_NAME;
    v_outcome := 'EXCEPTION RAISED — raw diagnostics below, verbatim, unclassified';
  END;

  -- ═══ Report — raised, which forces the rollback ════════════════════════════
  v_rep := E'\n\n════════ F1 T4 DIAGNOSTIC — evidence only, no verdict ════════\n'
        || format(E'standard    = %s\nfixture hub = %s\nexpense_tx  = %s\n\n',
                  v_standard, v_hub, v_expense_tx)
        || E'statement executed (identical to probe T4, no RETURNING):\n'
        || format(E'  UPDATE public.transactions SET type = ''income'', description = ''%s'' WHERE id = %s;\n\n',
                  c_mark, v_expense_tx)
        || format(E'outcome: %s\n', v_outcome)
        || E'\n──────── RAW CAPTURED DIAGNOSTICS ────────\n'
        || format(E'SQLSTATE            : %s\n',   coalesce(nullif(d_sqlstate,   ''), '(empty)'))
        || format(E'MESSAGE_TEXT        : %s\n',   coalesce(nullif(d_message,    ''), '(empty)'))
        || format(E'PG_EXCEPTION_DETAIL : %s\n',   coalesce(nullif(d_detail,     ''), '(empty)'))
        || format(E'PG_EXCEPTION_HINT   : %s\n',   coalesce(nullif(d_hint,       ''), '(empty)'))
        || format(E'SCHEMA_NAME         : %s\n',   coalesce(nullif(d_schema,     ''), '(empty)'))
        || format(E'TABLE_NAME          : %s\n',   coalesce(nullif(d_table,      ''), '(empty)'))
        || format(E'COLUMN_NAME         : %s\n',   coalesce(nullif(d_column,     ''), '(empty)'))
        || format(E'CONSTRAINT_NAME     : %s\n',   coalesce(nullif(d_constraint, ''), '(empty)'))
        || E'\nPG_EXCEPTION_CONTEXT:\n'
        || coalesce(nullif(d_context, ''), '  (empty — the error came from the UPDATE itself, not from inside a trigger function)')
        || E'\n\n──────── TRIGGERS ON public.transactions ────────\n'
        || v_trigs
        || E'\n\n════════ ROLLED BACK — nothing was written ════════\n'
        || E'This error IS the successful outcome. It is raised deliberately so the\n'
        || E'transaction cannot commit. No cleanup is required.\n';

  RAISE EXCEPTION '%', v_rep;
END $$;
