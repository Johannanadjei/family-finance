-- =============================================================================
-- f1_t4b_diag.sql   (F1 RLS audit — the unqualified-UPDATE test, evidence only)
--
-- WHAT THIS DECIDES
-- Whether paths (c)/(d) are genuinely open, or were closed all along by an
-- accidental protection.
--
-- THE MODEL UNDER TEST
-- Postgres applies SELECT policies as a WITH CHECK on an UPDATE's POST-IMAGE, but
-- ONLY when the statement requires SELECT permission on the relation. Docs, "Policies
-- Applied by Command Type": the UPDATE row under "SELECT/ALL policy USING" reads
-- "Existing & new rows", footnoted "If read access is required to the existing or new
-- row (for example, a WHERE or RETURNING clause that refers to columns from the
-- relation)". Source: rowsecurity.c get_row_security_policies() adds the CMD_SELECT
-- policies as WCO_RLS_UPDATE_CHECK with force_using=true when the RTE's requiredPerms
-- include ACL_SELECT.
--
-- If that model is right, the protection is CONDITIONAL and trivially avoided:
--   T4  (probe)  UPDATE ... SET type='income' WHERE id = X   -> WHERE reads a column
--                -> ACL_SELECT required -> type-aware transactions_select_member
--                   applied to the post-image -> 42501.            [OBSERVED]
--   T4b (here)   UPDATE ... SET type='income'                 -> no WHERE, constant SET
--                -> reads NO column -> ACL_SELECT NOT required -> SELECT policies
--                   NEVER added -> only transactions_update's bare-membership
--                   securityQual + inherited WITH CHECK remain -> SHOULD SUCCEED.
--
-- READING THE RESULT
--   SUCCEEDS, N rows  -> model confirmed. Paths (c)/(d) are OPEN: any member can
--                        transmute every transaction in their hub to income with one
--                        column-free statement. migrate_24/25's UPDATE halves are
--                        real fixes, because an explicit WITH CHECK is unconditional
--                        and does not care about requiredPerms.
--   REJECTED 42501    -> model is WRONG (second time in this area). Do not proceed;
--                        the mechanism is still unidentified.
--   REJECTED CYC02    -> should be IMPOSSIBLE; see below. If it appears anyway, the
--                        trigger is not what we verified — stop, do not read it as
--                        a pass.
--
-- CYC02 CANNOT OCCUR HERE — the trigger is COLUMN-SCOPED
-- The trigger is BEFORE INSERT OR UPDATE **OF date, cycle_id** on transactions, so
-- on UPDATE it fires only when `date` or `cycle_id` is in the SET list. T4b sets
-- `type` and `description` — neither. resolve_cycle_id() is therefore never entered
-- and CYC02 cannot be raised, no matter how many rows the unqualified UPDATE spans
-- or whether a live cycle covers their dates.
--
-- Confirmed against the LIVE database via pg_get_triggerdef(), not merely against
-- scripts/migrate_move_cycle_trigger.sql — the file matching live was checked, not
-- assumed. Re-verify with:
--   SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
--   WHERE tgrelid = 'public.transactions'::regclass AND NOT tgisinternal;
--
-- Note WHY this is the only thing saving the test: the function body has NO
-- "date unchanged -> early return" guard. On any UPDATE that DOES touch date, it
-- re-resolves per row and would raise CYC02 for the first row no live cycle covers.
-- The column scope on the trigger is the protection; the function's logic is not.
-- An earlier draft of this header claimed CYC02 was a live risk for T4b. That was
-- wrong: it came from a trigger inventory that decoded tgtype's event bits but
-- never read tgattr, so it printed "BEFORE INSERT/UPDATE" and silently dropped the
-- "OF date, cycle_id" column list.
--
-- ── RESULT LOG ───────────────────────────────────────────────────────────────
-- BEFORE (pre-migrate_24/25), run 2026-07-16 against live:
--   ACCEPTED. ROW_COUNT 2 = the full lock scope from safeguard 2. Every transaction
--   in the fixture hub was transmuted to type='income' with no RLS rejection, then
--   rolled back. Model CONFIRMED; paths (c)/(d) proven OPEN.
--
-- AFTER (post-migrate_24/25) — re-run this file UNCHANGED. Expected:
--   REJECTED 42501 "new row violates row-level security policy for table transactions".
--   The new USING admits only the standard member's expense rows, and the EXPLICIT
--   WITH CHECK then rejects the income post-image — unconditionally, regardless of
--   requiredPerms. An ACCEPTED->REJECTED flip on this identical statement is the ONLY
--   direct evidence that migrate_24's UPDATE half works; f1_write_probe.sql's T4
--   cannot show it (it is masked by the read policy in both phases).
--   If it returns 0 rows instead of an error, USING filtered everything and the
--   WITH CHECK was never exercised — that is NOT the expected proof; report it.
--
-- NO CLASSIFICATION. Raw ROW_COUNT and raw diagnostics only. No CASE, no verdict.
--
-- ── SAFEGUARD 1: SINGLE-MEMBERSHIP ASSERTION (blast-radius containment) ──────
-- An unqualified UPDATE is filtered ONLY by transactions_update's USING — bare
-- is_budget_centre_member(budget_centre_id) — so it reaches EVERY hub this member
-- belongs to, not just the fixture hub. Before any write, this aborts unless the
-- fixture member has EXACTLY ONE non-deleted membership across ALL hubs, and that
-- membership is the fixture hub. If they turn out to be in a real family hub too,
-- nothing is attempted.
--
-- ── SAFEGUARD 2: LOCK SCOPE IS COUNTED AND REPORTED ─────────────────────────
-- The pre-flight counts exactly what the USING clause admits and prints it in the
-- report, so the blast radius is a number that was seen, not assumed. Note the count
-- includes SOFT-DELETED rows: the policy is bare membership and does not filter
-- deleted_at, so those rows are lockable and writable too.
--
-- ── SAFEGUARD 3: UNCONDITIONAL ROLLBACK ─────────────────────────────────────
-- ONE DO block = ONE statement. EVERY path out ends in RAISE EXCEPTION (the setup
-- guards raise; the report itself is raised). The transaction CANNOT commit. If the
-- unqualified UPDATE SUCCEEDS — the expected outcome — it still rolls back and NO
-- row retains type='income'. Locks are held only for the length of the transaction
-- and released by the rollback. Impersonation is SET LOCAL and reverts with it.
--
-- This is the widest-locking probe in this audit. It is confined to the fixture hub
-- by safeguard 1 and persists nothing by safeguard 3, but it is not free — expect a
-- brief write lock on every transaction row in hub 0d3ccc2e.
-- =============================================================================
DO $$
DECLARE
  -- ── PARAMS ─────────────────────────────────────────────────────────────────
  p_hub_pfx      text := '0d3ccc2e';   -- fixture hub "sal income", GHS
  p_standard_pfx text := '3a36d46c';   -- standard member — impersonation target

  v_hub      uuid;
  v_standard uuid;
  v_n        int;

  -- Lock scope
  v_scope_total   int;
  v_scope_deleted int;
  v_scope_income  int;
  v_scope_expense int;
  v_memberships   text := '';

  c_mark constant text := 'F1-T4BDIAG-ROLLBACK-ME';

  -- Captured diagnostics
  d_sqlstate text := '(no exception raised)';
  d_message  text := '';
  d_detail   text := '';
  d_context  text := '';
  d_table    text := '';

  v_rowcount int := -1;
  v_outcome  text;
  v_rep      text := '';
BEGIN
  -- ═══ Pre-flight, as postgres, before impersonating ═════════════════════════
  SELECT count(*), min(id::text)::uuid INTO v_n, v_hub FROM public.budget_centres
    WHERE id::text LIKE p_hub_pfx || '%' AND deleted_at IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'SETUP FAIL: hub prefix % matched % live hubs, need exactly 1', p_hub_pfx, v_n; END IF;

  SELECT count(*), min(m.user_id::text)::uuid INTO v_n, v_standard FROM public.budget_centre_members m
    WHERE m.user_id::text LIKE p_standard_pfx || '%' AND m.budget_centre_id = v_hub
      AND m.role = 'standard' AND m.deleted_at IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'SETUP FAIL: standard prefix % matched % active standard members of the fixture hub, need exactly 1', p_standard_pfx, v_n; END IF;

  -- ── SAFEGUARD 1 — exactly one membership, and it is the fixture hub ────────
  -- Scoped to the whole table, NOT to the fixture hub: the point is to discover a
  -- membership we do not know about.
  SELECT count(*) INTO v_n FROM public.budget_centre_members m
    WHERE m.user_id = v_standard AND m.deleted_at IS NULL;

  IF v_n <> 1 THEN
    SELECT string_agg(format('%s (%s, role=%s)', c.name, m.budget_centre_id, m.role), '; ' ORDER BY c.name)
      INTO v_memberships
    FROM public.budget_centre_members m
    JOIN public.budget_centres c ON c.id = m.budget_centre_id
    WHERE m.user_id = v_standard AND m.deleted_at IS NULL;
    RAISE EXCEPTION 'ABORTED BY SAFEGUARD 1: fixture member % has % live memberships, need exactly 1. An unqualified UPDATE would reach EVERY one of them. Memberships: %',
      v_standard, v_n, coalesce(v_memberships, '(none)');
  END IF;

  SELECT count(*) INTO v_n FROM public.budget_centre_members m
    WHERE m.user_id = v_standard AND m.deleted_at IS NULL AND m.budget_centre_id = v_hub;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ABORTED BY SAFEGUARD 1: the fixture member''s single membership is NOT the fixture hub %', v_hub;
  END IF;

  -- ── SAFEGUARD 2 — count the blast radius ──────────────────────────────────
  -- This is what bare is_budget_centre_member(budget_centre_id) admits: every row in
  -- the hub. deleted_at is NOT filtered, because the policy does not filter it either.
  SELECT count(*),
         count(*) FILTER (WHERE deleted_at IS NOT NULL),
         count(*) FILTER (WHERE type = 'income'),
         count(*) FILTER (WHERE type = 'expense')
    INTO v_scope_total, v_scope_deleted, v_scope_income, v_scope_expense
  FROM public.transactions
  WHERE budget_centre_id = v_hub;

  -- ═══ Impersonate the standard member ═══════════════════════════════════════
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_standard::text, 'role', 'authenticated')::text,
                     true);   -- true = SET LOCAL, reverts on rollback
  PERFORM set_config('role', 'authenticated', true);

  IF auth.uid() IS DISTINCT FROM v_standard THEN
    RAISE EXCEPTION 'SETUP FAIL: impersonation did not take — auth.uid() is %, expected %', auth.uid(), v_standard;
  END IF;
  IF current_user = 'postgres' THEN
    RAISE EXCEPTION 'SETUP FAIL: still running as postgres — RLS is bypassed for the table owner and T4b would pass vacuously';
  END IF;

  -- ═══ T4b — unqualified UPDATE, constants only, no WHERE, no RETURNING ══════
  -- No column is read anywhere in the statement (c_mark is a PL/pgSQL constant, bound
  -- as a parameter, not a column reference), so the RTE should not require ACL_SELECT.
  -- That is the entire experiment.
  BEGIN
    UPDATE public.transactions SET type = 'income', description = c_mark;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    v_outcome := 'NO EXCEPTION — the unqualified UPDATE was ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      d_sqlstate = RETURNED_SQLSTATE,
      d_message  = MESSAGE_TEXT,
      d_detail   = PG_EXCEPTION_DETAIL,
      d_context  = PG_EXCEPTION_CONTEXT,
      d_table    = TABLE_NAME;
    v_outcome := 'EXCEPTION RAISED — raw diagnostics below, verbatim, unclassified';
  END;

  -- ═══ Report — raised, which forces the rollback ════════════════════════════
  v_rep := E'\n\n════════ F1 T4b — UNQUALIFIED UPDATE — evidence only, no verdict ════════\n'
        || format(E'standard    = %s\nfixture hub = %s\n\n', v_standard, v_hub)
        || E'──────── SAFEGUARD 1: membership ────────\n'
        || E'  exactly 1 live membership, and it is the fixture hub (asserted, or this would have aborted)\n'
        || E'\n──────── SAFEGUARD 2: lock scope admitted by transactions_update USING ────────\n'
        || format(E'  rows in fixture hub (total)   : %s   <-- the blast radius\n', v_scope_total)
        || format(E'    of which soft-deleted       : %s   (bare membership does not filter deleted_at)\n', v_scope_deleted)
        || format(E'    of which type=income        : %s\n', v_scope_income)
        || format(E'    of which type=expense       : %s\n', v_scope_expense)
        || E'\n──────── T4b: statement executed ────────\n'
        || format(E'  UPDATE public.transactions SET type = ''income'', description = ''%s'';\n', c_mark)
        || E'  (no WHERE, no RETURNING, no column read anywhere in the statement)\n'
        || E'\n──────── T4b: outcome ────────\n'
        || format(E'  %s\n', v_outcome)
        || format(E'  ROW_COUNT           : %s   (-1 = never reached; the statement raised)\n', v_rowcount)
        || format(E'  SQLSTATE            : %s\n', coalesce(nullif(d_sqlstate, ''), '(empty)'))
        || format(E'  MESSAGE_TEXT        : %s\n', coalesce(nullif(d_message,  ''), '(empty)'))
        || format(E'  PG_EXCEPTION_DETAIL : %s\n', coalesce(nullif(d_detail,   ''), '(empty)'))
        || format(E'  TABLE_NAME          : %s\n', coalesce(nullif(d_table,    ''), '(empty)'))
        || E'\n  PG_EXCEPTION_CONTEXT:\n'
        || coalesce(nullif(d_context, ''), '  (empty — the error came from the UPDATE itself, not from inside a trigger function)')
        || E'\n\n════════ ROLLED BACK — nothing was written ════════\n'
        || E'This error IS the successful outcome. It is raised deliberately so the\n'
        || E'transaction cannot commit. If the UPDATE was ACCEPTED above, NO row\n'
        || E'retains type=''income'' — the rollback undid all of it. No cleanup required.\n';

  RAISE EXCEPTION '%', v_rep;
END $$;
