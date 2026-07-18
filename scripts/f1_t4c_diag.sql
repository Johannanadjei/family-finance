-- =============================================================================
-- f1_t4c_diag.sql   (F1 RLS audit — income_sources unqualified-UPDATE, AFTER proof)
--
-- The income_sources twin of f1_t4b_diag.sql. Same vector (path c), same safeguards,
-- same unconditional rollback — but the PASS LOOKS DIFFERENT, and that difference is
-- the whole reason this file needs its own header.
--
-- ── THE PASS HERE IS SILENCE, NOT AN ERROR ───────────────────────────────────
-- f1_t4b_diag (transactions) expects REJECTED 42501, because transactions_update's
-- USING still admits a standard member's own EXPENSE rows — so the statement reaches
-- the WITH CHECK, which rejects the income post-image. An error is the proof.
--
-- income_sources is different. migrate_25 set its USING to can_view_income(), which
-- is FALSE for a standard member on every row. USING admits NOTHING, so the UPDATE
-- matches no rows and the WITH CHECK is never reached. Expected:
--
--     0 ROWS, NO ERROR.
--
-- DO NOT read the absence of a 42501 as the fix having failed. That inversion is the
-- exact mistake already made once this session, when T2's 0-rows was misread. A
-- blocked-by-USING write is not an error — the rows are simply invisible to the
-- UPDATE. Silence IS the pass.
--
-- ── WHY 0 ROWS IS MEANINGFUL HERE AND NOT VACUOUS ────────────────────────────
-- "0 rows" would also be the result if the table were empty, or if the statement were
-- broken. Two things in the report rule that out:
--
--   1. SAFEGUARD 2 prints the row count in the hub. If scope > 0 and ROW_COUNT = 0,
--      rows existed and USING filtered every one of them.
--   2. The OWNER CONTROL updates a known row (WHERE-qualified, single row) as the
--      owner and must report 1 row. That proves the rows are present and writable,
--      and that a role WITH can_view_income can still write them. Standard 0 + owner
--      1 isolates the role gate as the cause.
--
-- ── HONEST LIMIT — THIS IS AN ENDPOINT, NOT A FLIP ───────────────────────────
-- f1_t4b_diag has a true BEFORE/AFTER flip: the identical statement was ACCEPTED
-- (ROW_COUNT 2) pre-migration and is REJECTED now. This file has NO recorded BEFORE
-- run — the unqualified income_sources UPDATE was never executed pre-migrate_25. So
-- it proves the current state, not a transition.
--
-- The inference that path (c) WAS open rests on: the pre-migration grid showing
-- income_sources_update's USING as bare is_budget_centre_member (which a standard
-- member satisfies), plus the confirmed requiredPerms mechanism, plus the transactions
-- twin behaving exactly as that model predicted on the same database. That is strong,
-- but it is inference. Do not describe path (c) as "reproduced" — it was reasoned,
-- and its fix was verified. Path (d) was reproduced.
--
-- ── SAFEGUARDS — identical to f1_t4b_diag.sql ────────────────────────────────
--   1. SINGLE-MEMBERSHIP ASSERTION. An unqualified UPDATE is filtered only by the
--      policy's USING, so pre-migration it would reach EVERY hub the member belongs
--      to. Aborts unless the fixture member has exactly ONE live membership and it is
--      the fixture hub. (Still asserted post-migration: the safeguard must not depend
--      on the fix it is testing.)
--   2. LOCK SCOPE COUNTED AND REPORTED before any write is attempted.
--   3. UNCONDITIONAL ROLLBACK. One DO block; every path out ends in RAISE EXCEPTION.
--      The transaction CANNOT commit. Even if the UPDATE unexpectedly succeeds and
--      zeroes every source in the hub, it rolls back. Impersonation is SET LOCAL.
--
-- CYC02 cannot occur: the income_sources trigger is BEFORE INSERT OR UPDATE **OF
-- month**, and this statement sets expected_amount only. resolve_cycle_id() is never
-- entered. (Same column-scoping argument as f1_t4b_diag; verify with
-- pg_get_triggerdef on public.income_sources if in doubt.)
--
-- NO CLASSIFICATION. Raw ROW_COUNT and raw diagnostics only. No CASE, no verdict.
--
-- ── RESULT LOG ───────────────────────────────────────────────────────────────
-- AFTER (post-migrate_24/25), run 2026-07-16 against live:
--   standard: 0 rows, NO error. Safeguard 2 reported 1 live source in the hub, so the
--             0 is not vacuous — a real row existed and USING filtered it out.
--   owner control: 1 row. The row is present and writable by a role with
--             can_view_income; the legitimate write path is intact.
--   VERDICT: PASS. Path (c) closed, standard denied, owner unaffected.
-- =============================================================================
DO $$
DECLARE
  -- ── PARAMS ─────────────────────────────────────────────────────────────────
  p_hub_pfx        text := '0d3ccc2e';   -- fixture hub "sal income", GHS
  p_standard_pfx   text := '3a36d46c';   -- standard member — impersonation target
  p_owner_pfx      text := '8b453c16';   -- owner — control identity
  p_income_src_pfx text := '2cd9a273';   -- income source "salary" / 5000

  v_hub        uuid;
  v_standard   uuid;
  v_owner      uuid;
  v_income_src uuid;
  v_n          int;

  v_scope_total   int;
  v_scope_deleted int;
  v_memberships   text := '';

  c_mark constant text := 'F1-T4CDIAG-ROLLBACK-ME';

  -- Captured diagnostics — standard's unqualified UPDATE
  d_sqlstate text := '(no exception raised)';
  d_message  text := '';
  d_detail   text := '';
  d_context  text := '';
  d_table    text := '';

  v_rowcount   int := -1;
  v_outcome    text;

  -- Owner control
  o_rowcount int := -1;
  o_outcome  text;
  o_sqlstate text := '(no exception raised)';
  o_message  text := '';

  v_rep text := '';
BEGIN
  -- ═══ Pre-flight, as postgres, before impersonating ═════════════════════════
  SELECT count(*), min(id::text)::uuid INTO v_n, v_hub FROM public.budget_centres
    WHERE id::text LIKE p_hub_pfx || '%' AND deleted_at IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'SETUP FAIL: hub prefix % matched % live hubs, need exactly 1', p_hub_pfx, v_n; END IF;

  SELECT count(*), min(m.user_id::text)::uuid INTO v_n, v_standard FROM public.budget_centre_members m
    WHERE m.user_id::text LIKE p_standard_pfx || '%' AND m.budget_centre_id = v_hub
      AND m.role = 'standard' AND m.deleted_at IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'SETUP FAIL: standard prefix % matched % active standard members of the fixture hub, need exactly 1', p_standard_pfx, v_n; END IF;

  SELECT count(*), min(m.user_id::text)::uuid INTO v_n, v_owner FROM public.budget_centre_members m
    WHERE m.user_id::text LIKE p_owner_pfx || '%' AND m.budget_centre_id = v_hub
      AND m.role IN ('owner', 'full_access') AND m.deleted_at IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'SETUP FAIL: owner prefix % matched % active owner/full_access members of the fixture hub, need exactly 1', p_owner_pfx, v_n; END IF;

  SELECT count(*), min(s.id::text)::uuid INTO v_n, v_income_src FROM public.income_sources s
    WHERE s.id::text LIKE p_income_src_pfx || '%' AND s.budget_centre_id = v_hub AND s.deleted_at IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'SETUP FAIL: income_src prefix % matched % live sources in the fixture hub, need exactly 1', p_income_src_pfx, v_n; END IF;

  -- ── SAFEGUARD 1 — exactly one membership, and it is the fixture hub ────────
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

  -- ── SAFEGUARD 2 — count the blast radius / prove 0-rows is not vacuous ─────
  -- deleted_at is NOT filtered: the pre-migration policy did not filter it either,
  -- so soft-deleted sources were writable too.
  SELECT count(*), count(*) FILTER (WHERE deleted_at IS NOT NULL)
    INTO v_scope_total, v_scope_deleted
  FROM public.income_sources
  WHERE budget_centre_id = v_hub;

  IF v_scope_total = 0 THEN
    RAISE EXCEPTION 'SETUP FAIL: the fixture hub has NO income_sources rows — a 0-row result would be vacuous and prove nothing about the policy';
  END IF;

  -- ═══ Impersonate the standard member ═══════════════════════════════════════
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_standard::text, 'role', 'authenticated')::text,
                     true);   -- true = SET LOCAL, reverts on rollback
  PERFORM set_config('role', 'authenticated', true);

  IF auth.uid() IS DISTINCT FROM v_standard THEN
    RAISE EXCEPTION 'SETUP FAIL: impersonation did not take — auth.uid() is %, expected %', auth.uid(), v_standard;
  END IF;
  IF current_user = 'postgres' THEN
    RAISE EXCEPTION 'SETUP FAIL: still running as postgres — RLS is bypassed for the table owner and this would pass vacuously';
  END IF;

  -- ═══ THE TEST — unqualified UPDATE, constants only, no WHERE, no RETURNING ══
  -- No column is read anywhere in the statement, so the RTE should not require
  -- ACL_SELECT and the SELECT policies are never applied to either image. What
  -- remains is income_sources_update alone. Expected: 0 rows, no error.
  BEGIN
    UPDATE public.income_sources SET expected_amount = 1;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    v_outcome := 'NO EXCEPTION';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      d_sqlstate = RETURNED_SQLSTATE,
      d_message  = MESSAGE_TEXT,
      d_detail   = PG_EXCEPTION_DETAIL,
      d_context  = PG_EXCEPTION_CONTEXT,
      d_table    = TABLE_NAME;
    v_outcome := 'EXCEPTION RAISED — raw diagnostics below, verbatim, unclassified';
  END;

  -- ═══ OWNER CONTROL — proves the rows exist and are writable ════════════════
  -- WHERE-qualified and single-row on purpose: an unqualified UPDATE as the owner
  -- would reach every hub the OWNER belongs to, which includes real family hubs.
  -- Identity switch only; role stays `authenticated`, so RLS still applies.
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_owner::text, 'role', 'authenticated')::text,
                     true);
  BEGIN
    UPDATE public.income_sources SET notes = c_mark WHERE id = v_income_src;
    GET DIAGNOSTICS o_rowcount = ROW_COUNT;
    o_outcome := 'NO EXCEPTION';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS o_sqlstate = RETURNED_SQLSTATE, o_message = MESSAGE_TEXT;
    o_outcome := 'EXCEPTION RAISED';
  END;

  -- ═══ Report — raised, which forces the rollback ════════════════════════════
  v_rep := E'\n\n════════ F1 T4c — income_sources UNQUALIFIED UPDATE — evidence only ════════\n'
        || format(E'standard    = %s\nowner       = %s\nfixture hub = %s\nincome_src  = %s\n\n',
                  v_standard, v_owner, v_hub, v_income_src)
        || E'──────── SAFEGUARD 1: membership ────────\n'
        || E'  exactly 1 live membership, and it is the fixture hub (asserted, or this would have aborted)\n'
        || E'\n──────── SAFEGUARD 2: rows present in the fixture hub ────────\n'
        || format(E'  income_sources rows (total)   : %s   <-- if this is > 0 and ROW_COUNT is 0 below,\n', v_scope_total)
        || format(E'    of which soft-deleted       : %s       then USING filtered rows that DO exist\n', v_scope_deleted)
        || E'\n──────── THE TEST: as standard, unqualified ────────\n'
        || E'  UPDATE public.income_sources SET expected_amount = 1;\n'
        || E'  (no WHERE, no RETURNING, no column read anywhere in the statement)\n'
        || format(E'  outcome             : %s\n', v_outcome)
        || format(E'  ROW_COUNT           : %s   (-1 = never reached; the statement raised)\n', v_rowcount)
        || format(E'  SQLSTATE            : %s\n', coalesce(nullif(d_sqlstate, ''), '(empty)'))
        || format(E'  MESSAGE_TEXT        : %s\n', coalesce(nullif(d_message,  ''), '(empty)'))
        || format(E'  PG_EXCEPTION_DETAIL : %s\n', coalesce(nullif(d_detail,   ''), '(empty)'))
        || format(E'  TABLE_NAME          : %s\n', coalesce(nullif(d_table,    ''), '(empty)'))
        || E'  PG_EXCEPTION_CONTEXT:\n  '
        || coalesce(nullif(d_context, ''), '(empty)')
        || E'\n\n──────── OWNER CONTROL: as owner, WHERE-qualified, single row ────────\n'
        || E'  UPDATE public.income_sources SET notes = ... WHERE id = <income_src>;\n'
        || format(E'  outcome             : %s\n', o_outcome)
        || format(E'  ROW_COUNT           : %s\n', o_rowcount)
        || format(E'  SQLSTATE            : %s\n', coalesce(nullif(o_sqlstate, ''), '(empty)'))
        || format(E'  MESSAGE_TEXT        : %s\n', coalesce(nullif(o_message,  ''), '(empty)'))
        || E'\n──────── HOW TO READ THIS ────────\n'
        || E'  standard 0 rows + NO error, AND owner 1 row  -> PASS. The rows exist and are\n'
        || E'    writable by a role with can_view_income; USING admitted none of them to the\n'
        || E'    standard member. Silence is the pass — see the header.\n'
        || E'  standard N>0 rows                            -> FAIL. migrate_25 did not close\n'
        || E'    path (c); the sources were rewritten (and rolled back).\n'
        || E'  standard error 42501                         -> UNEXPECTED. USING should admit\n'
        || E'    nothing, so the WITH CHECK should be unreachable. Report it.\n'
        || E'  owner 0 rows or an error                     -> REGRESSION. migrate_25 locked out\n'
        || E'    a role that legitimately manages income. This is the control failing, and it\n'
        || E'    also makes the standard 0-row result unreadable.\n'
        || E'\n════════ ROLLED BACK — nothing was written ════════\n'
        || E'This error IS the successful outcome. It is raised deliberately so the\n'
        || E'transaction cannot commit. No cleanup is required.\n';

  RAISE EXCEPTION '%', v_rep;
END $$;
