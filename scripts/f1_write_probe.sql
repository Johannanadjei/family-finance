  -- =============================================================================
  -- f1_write_probe.sql   (F1 RLS audit — write-side probe, STEP 2 of 2)
  --
  -- Proves the four write paths empirically, as a real `standard` member, against the
  -- live database — WITHOUT persisting anything.
  --
  -- ── WHY NOTHING NEEDS CLEANING UP ────────────────────────────────────────────
  -- The whole probe is ONE `DO` block, and EVERY path out of it ends in
  -- `RAISE EXCEPTION`: the setup guards raise on a bad param, and the success path
  -- raises the report itself. Postgres therefore rolls the transaction back
  -- unconditionally — a successful forbidden write (exactly what the BEFORE phase
  -- expects) leaves NO row behind. There is no DELETE step because there is nothing
  -- to delete.
  --
  -- This is deliberate. The alternative — let the BEFORE writes land, then clean up —
  -- puts forged income rows in a live hub for the length of the window, corrupting the
  -- owner's spare-money and budget figures until the DELETE runs, and depends on the
  -- DELETE actually running. A transaction that cannot commit removes that whole class
  -- of risk.
  --
  -- One DO block is also ONE statement: it cannot be half-run by a truncated paste or
  -- a partially-executed script. Either the whole probe runs and rolls back, or none
  -- of it does.
  --
  -- ── HOW IT IMPERSONATES ──────────────────────────────────────────────────────
  -- RLS does not apply to the table owner, and the SQL editor runs as `postgres` —
  -- which owns these tables. So a probe that just ran INSERTs in the editor would
  -- prove NOTHING: every write would succeed regardless of policy. The probe therefore
  --   1. sets `request.jwt.claims` to the standard member's `sub` (what auth.uid() reads)
  --   2. `SET LOCAL ROLE authenticated` (a non-owner role, so RLS is enforced)
  -- This is exactly what PostgREST does per request, so RLS evaluates identically.
  -- Both are SET LOCAL, so they revert with the rollback.
  --
  -- LIMIT OF THIS METHOD — it proves the POLICIES, not the whole PostgREST stack.
  -- The read-side fix was proven over real REST with a live standard session. See the
  -- LAYERED VERIFICATION note at the bottom: layers 2 and 3 close that gap.
  --
  -- ── T7 AND THE REAL FAMILY HUBS (lock analysis — read before running) ────────
  -- The fixture hub has no fixture sibling, so the cross-hub test necessarily targets
  -- a REAL family hub. It is safe, and here is exactly why:
  --   • T7 is INSERT-only. No UPDATE, no SELECT ... FOR UPDATE. It never touches an
  --     existing row in that hub.
  --   • Postgres evaluates RLS WITH CHECK in ExecInsert BEFORE the heap insert and
  --     BEFORE the FK constraint triggers (FK checks are AFTER-row triggers). The FK
  --     on transactions.budget_centre_id -> budget_centres.id is the only thing that
  --     would take a row lock (KEY SHARE on the referenced budget_centres row), and
  --     the RLS rejection happens first — so that lock is never acquired.
  --   • T7 passes NO category_id, so there is no FK to budget_categories either.
  --   • The only real-hub touch is a READ: the resolve_cycle_id() BEFORE trigger
  --     SELECTs that hub's budget_cycles to find a covering cycle. ACCESS SHARE on the
  --     table, no row locks, no writes.
  --   • Even in the CRITICAL case where RLS fails to reject and the row inserts, the
  --     always-rollback guarantee still applies. The foreign hub cannot retain a row.
  -- By contrast T2/T6 DO take brief row locks — which is why they are confined to the
  -- fixture hub's own income_src / expense_tx.
  --
  -- ── THE TWO CONFOUNDS THIS PROBE GUARDS AGAINST ──────────────────────────────
  -- (1) resolve_cycle_id() is a BEFORE INSERT trigger on BOTH tables and RAISEs
  --     ERRCODE 'CYC02' when no live cycle covers the row's date/month in the target
  --     hub. BEFORE triggers run BEFORE the RLS WITH CHECK. So an INSERT into a hub
  --     with no matching cycle dies on CYC02 and never reaches RLS — recording a
  --     "rejected" that proves nothing. This matters most for the cross-hub test,
  --     where the foreign hub is the one likely to lack a cycle. The probe RESOLVES
  --     the foreign date from that hub's own latest live cycle (rather than trusting a
  --     hand-typed date), asserts coverage in both hubs before starting, and classifies
  --     CYC02 as INCONCLUSIVE — never as a pass.
  -- (2) SQLSTATE 42501 covers BOTH "new row violates row-level security policy" AND
  --     "permission denied for table" (a missing GRANT). Only the first is the result
  --     we want. The probe matches message text, not just the code, and reports a
  --     grant failure as INCONCLUSIVE.
  --
  -- ╔═════════════════════════════════════════════════════════════════════════╗
  -- ║ CORRECTION 2026-07-16 — T2 AND T4 TEST THE WRONG VECTOR. READ THIS FIRST.║
  -- ╚═════════════════════════════════════════════════════════════════════════╝
  -- T2 and T4 are WHERE-qualified, and a WHERE clause engages a protection that has
  -- nothing to do with the write policies. Their results are REAL but they do NOT
  -- measure what this probe was built to measure, and pre-migration they read as a
  -- FALSE "already safe":
  --
  --   T2 -> 0 rows, no error   (NOT the write policy: migrate_22's READ policy filtered
  --                             the row out of the UPDATE's view before USING mattered)
  --   T4 -> ERROR 42501        (NOT migrate_24: migrate_23's TYPE-AWARE READ policy was
  --                             applied to the post-image)
  --
  -- WHY: the UPDATE reference page requires SELECT privilege on any column read in an
  -- expression or condition — `WHERE id = ...` reads one. "Policies Applied by Command
  -- Type" then applies the SELECT/ALL policy USING to an UPDATE's "Existing & new rows"
  -- whenever read access is required. So a WHERE clause silently drags the READ
  -- policies into a WRITE test. (rowsecurity.c adds the CMD_SELECT policies as
  -- WCO_RLS_UPDATE_CHECK with force_using=true when requiredPerms includes ACL_SELECT.)
  --
  -- THE REAL ATTACK OMITS THE WHERE:
  --   UPDATE transactions SET type='income';       -- constant SET, reads no column
  --     -> no ACL_SELECT -> read policies never applied -> only the bare-membership
  --        USING and its inherited membership-only post-image check -> ACCEPTED.
  -- PROVEN: scripts/f1_t4b_diag.sql, 2026-07-16 — ACCEPTED, ROW_COUNT 2 = every row in
  -- the hub. Rolled back, nothing persisted. Paths (c) and (d) are open by this route.
  --
  -- THE UNQUALIFIED FORM IS DELIBERATELY NOT RUN HERE. It would rewrite every row in
  -- the fixture hub, so T5/T6/T7/T8 would then be running against transmuted rows and
  -- their results would be meaningless. It lives in f1_t4b_diag.sql as an isolated,
  -- single-purpose, rollback-guaranteed test with a single-membership safeguard.
  -- RUN THAT FILE TOO — this probe ALONE CANNOT prove or disprove paths (c)/(d).
  --
  -- WHAT T2/T4 ARE STILL GOOD FOR: they are regression tests for the READ side, and
  -- they confirm the WHERE-qualified path stays shut. Read them that way, not as
  -- evidence about the write policies.
  --
  -- ── THE 0-ROWS vs ERROR DISTINCTION (read this before judging the output) ────
  -- A write blocked by a USING clause is NOT an error — the row is simply invisible to
  -- the UPDATE, which reports 0 rows affected, silently. Only a WITH CHECK violation
  -- RAISEs. So results differ by path, and a probe that expected "error" everywhere
  -- would misreport a correct fix as a failure:
  --   T2 income_sources UPDATE   → 0 rows, NO error   (a read/USING filter, not an error)
  --   T4 transactions transmute  → ERROR 42501        (a post-image check rejected it)
  -- Both hold BEFORE and AFTER. That invariance is exactly why they are not the proof
  -- of migrate_24 they were originally written to be — see the correction above.
  --
  -- ── PARAMS ARE PREFIXES, RESOLVED AT RUNTIME ─────────────────────────────────
  -- The discovery grid was reported as 8-char prefixes. Rather than invent the
  -- remaining hex digits, the probe resolves each prefix to a full UUID in pre-flight
  -- and ABORTS unless it matches exactly one row, scoped to the fixture hub. A prefix
  -- that matches 0 or 2+ rows is a setup failure, not a silent wrong-target.
  --
  -- ── USAGE ────────────────────────────────────────────────────────────────────
  --   1. Set p_phase := 'BEFORE'. Run. Expect the INSERT leaks: T1/T3 SUCCEED.
  --      T2 is 0 rows and T4 errors ALREADY — that is the read-side protection, not
  --      safety. Run f1_t4b_diag.sql for the UPDATE paths; this file cannot see them.
  --   2. Apply migrate_24, then migrate_25.
  --   3. Set p_phase := 'AFTER'. Run again, UNCHANGED otherwise. Expect T1/T3 to flip
  --      to rejected, T2/T4 UNCHANGED from BEFORE, and every control still green.
  --   The report arrives as an error message titled "F1 WRITE PROBE". That error is
  --   the successful outcome, not a failure — it is what forces the rollback.
  --
  --   T1 and T3 are what this file actually proves: they flip BEFORE->AFTER. T2 and T4
  --   are invariant across both phases and prove nothing about migrate_24/25.
  -- =============================================================================
  DO $$
  DECLARE
    -- ── PARAMS ─────────────────────────────────────────────────────────────────
    p_phase            text := 'AFTER';    -- 'BEFORE' (pre-migration) | 'AFTER' (post)

    -- Prefixes from the discovery grid (2026-07-16). Resolved to full UUIDs below.
    p_hub_pfx          text := '0d3ccc2e';   -- (0) fixture hub "sal income", GHS
    p_standard_pfx     text := '3a36d46c';   -- (1) standard member — impersonation target
    p_owner_pfx        text := '8b453c16';   -- (2) owner — control identity
    p_category_pfx     text := 'a5ce688d';   -- (4) category "Groceries"
    p_income_src_pfx   text := '2cd9a273';   -- (5) income source "salary" / 5000
    p_expense_tx_pfx   text := 'd6b3b86c';   -- (6) expense tx "Groceries" / 250
    p_foreign_hub_pfx  text := 'b9aae0dc';   -- (7) REAL hub "The Adjei household" — see lock analysis

    p_hub_date         date := '2026-06-01'; -- (3) inside the June 2026 cycle
    p_hub_month        text := '2026-06';    -- (3) to_char(start_date,'YYYY-MM'), verbatim
    -- p_foreign_date is NOT a param — it is resolved from the foreign hub's own latest
    -- live cycle, because a hand-typed date there is the CYC02 trap in confound (1).
    -- ───────────────────────────────────────────────────────────────────────────

    -- Resolved UUIDs
    v_hub           uuid;
    v_standard      uuid;
    v_owner         uuid;
    v_category      uuid;
    v_category_name text;
    v_income_src    uuid;
    v_expense_tx    uuid;
    v_foreign_hub   uuid;
    v_foreign_date  date;

    -- Every row this probe writes carries this marker. Nothing should ever persist —
    -- but if a future edit breaks the rollback guarantee, this makes debris findable
    -- with a single grep against label / description.
    c_mark  constant text := 'F1-PROBE-ROLLBACK-ME';

    r        text[] := ARRAY[]::text[];
    v_res    text;
    v_n      int;
    v_state  text;
    v_msg    text;
    v_rep    text := '';
  BEGIN
    -- ═══ Pre-flight, run as postgres BEFORE impersonating ══════════════════════
    -- These read budget_centre_members / budget_cycles, which are themselves RLS-gated;
    -- they must happen while we still have owner visibility.

    IF p_phase NOT IN ('BEFORE', 'AFTER') THEN
      RAISE EXCEPTION 'SETUP FAIL: p_phase must be BEFORE or AFTER, got %', p_phase;
    END IF;

    -- ── Resolve every prefix to exactly one live row ───────────────────────────
    -- NOTE: min() has no uuid overload, hence min(id::text)::uuid throughout this
    -- block. count(*) is what drives the exactly-one assertion, so the cast cannot
    -- affect which prefixes are accepted — with v_n = 1 there is only one id to pick.
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

    -- b.name needs no cast (min(text) exists); with v_n = 1 both aggregates read the same row.
    SELECT count(*), min(b.id::text)::uuid, min(b.name) INTO v_n, v_category, v_category_name FROM public.budget_categories b
      WHERE b.id::text LIKE p_category_pfx || '%' AND b.budget_centre_id = v_hub AND b.deleted_at IS NULL;
    IF v_n <> 1 THEN RAISE EXCEPTION 'SETUP FAIL: category prefix % matched % live categories in the fixture hub, need exactly 1', p_category_pfx, v_n; END IF;

    SELECT count(*), min(s.id::text)::uuid INTO v_n, v_income_src FROM public.income_sources s
      WHERE s.id::text LIKE p_income_src_pfx || '%' AND s.budget_centre_id = v_hub AND s.deleted_at IS NULL;
    IF v_n <> 1 THEN RAISE EXCEPTION 'SETUP FAIL: income_src prefix % matched % live sources in the fixture hub, need exactly 1', p_income_src_pfx, v_n; END IF;

    SELECT count(*), min(t.id::text)::uuid INTO v_n, v_expense_tx FROM public.transactions t
      WHERE t.id::text LIKE p_expense_tx_pfx || '%' AND t.budget_centre_id = v_hub
        AND t.type = 'expense' AND t.deleted_at IS NULL;
    IF v_n <> 1 THEN RAISE EXCEPTION 'SETUP FAIL: expense_tx prefix % matched % live expense transactions in the fixture hub, need exactly 1', p_expense_tx_pfx, v_n; END IF;

    SELECT count(*), min(id::text)::uuid INTO v_n, v_foreign_hub FROM public.budget_centres
      WHERE id::text LIKE p_foreign_hub_pfx || '%' AND deleted_at IS NULL;
    IF v_n <> 1 THEN RAISE EXCEPTION 'SETUP FAIL: foreign hub prefix % matched % live hubs, need exactly 1', p_foreign_hub_pfx, v_n; END IF;
    IF v_foreign_hub = v_hub THEN RAISE EXCEPTION 'SETUP FAIL: foreign hub resolved to the fixture hub — the cross-hub test would be testing nothing'; END IF;

    -- ── Identity assertions ────────────────────────────────────────────────────
    -- The impersonated user really is NOT a member of the foreign hub. Without this
    -- the cross-hub test proves nothing.
    SELECT count(*) INTO v_n FROM public.budget_centre_members
      WHERE user_id = v_standard AND budget_centre_id = v_foreign_hub AND deleted_at IS NULL;
    IF v_n <> 0 THEN RAISE EXCEPTION 'SETUP FAIL: the standard member IS a member of the foreign hub — pick a hub they do not belong to'; END IF;

    -- ── CONFOUND (1) GUARD — cycles must cover every date/month we insert with ──
    SELECT count(*) INTO v_n FROM public.budget_cycles
      WHERE budget_centre_id = v_hub AND deleted_at IS NULL
        AND p_hub_date BETWEEN start_date AND end_date;
    IF v_n < 1 THEN RAISE EXCEPTION 'SETUP FAIL: no live cycle in the fixture hub covers p_hub_date % — the trigger would raise CYC02 and mask the RLS result', p_hub_date; END IF;

    SELECT count(*) INTO v_n FROM public.budget_cycles
      WHERE budget_centre_id = v_hub AND deleted_at IS NULL
        AND to_char(start_date, 'YYYY-MM') = p_hub_month;
    IF v_n < 1 THEN RAISE EXCEPTION 'SETUP FAIL: no live cycle in the fixture hub for p_hub_month % — the trigger would raise CYC02 on the income_sources INSERT', p_hub_month; END IF;

    -- Resolve the foreign date from the foreign hub's own cycle — never hand-typed.
    SELECT start_date INTO v_foreign_date FROM public.budget_cycles
      WHERE budget_centre_id = v_foreign_hub AND deleted_at IS NULL
      ORDER BY start_date DESC LIMIT 1;
    IF v_foreign_date IS NULL THEN RAISE EXCEPTION 'SETUP FAIL: foreign hub has no live cycle — the cross-hub INSERT would die on CYC02 and prove nothing about RLS'; END IF;

    -- ═══ Impersonate the standard member ═══════════════════════════════════════
    PERFORM set_config('request.jwt.claims',
                      json_build_object('sub', v_standard::text, 'role', 'authenticated')::text,
                      true);   -- true = SET LOCAL, reverts on rollback
    PERFORM set_config('role', 'authenticated', true);

    IF auth.uid() IS DISTINCT FROM v_standard THEN
      RAISE EXCEPTION 'SETUP FAIL: impersonation did not take — auth.uid() is %, expected %', auth.uid(), v_standard;
    END IF;
    IF current_user = 'postgres' THEN
      RAISE EXCEPTION 'SETUP FAIL: still running as postgres — RLS is bypassed for the table owner and every test below would pass vacuously';
    END IF;

    -- ═══ T1 — path (b): standard INSERTs an income_source in its own hub ═══════
    BEGIN
      INSERT INTO public.income_sources (budget_centre_id, label, month, expected_amount, notes)
      VALUES (v_hub, c_mark, p_hub_month, 99999, c_mark);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_res := format('SUCCEEDED (%s row)', v_n);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      v_res := CASE
        WHEN v_state = '42501' AND v_msg LIKE '%row-level security%' THEN 'REJECTED BY RLS [42501]'
        WHEN v_state = '42501' AND v_msg LIKE '%permission denied%'  THEN format('INCONCLUSIVE [%s] table GRANT missing, not RLS', v_state)
        WHEN v_state = 'CYC02'                                       THEN format('INCONCLUSIVE [%s] trigger fired before RLS: %s', v_state, left(v_msg, 60))
        ELSE format('REJECTED [%s] %s', v_state, left(v_msg, 80))
      END;
    END;
    r := r || format('T1  income_sources INSERT (own hub)      -> %s', v_res);

    -- ═══ T2 — path (c): standard blind-UPDATEs an income_source it cannot read ══
    -- AFTER the fix this is 0 rows and NO error: the USING clause filters the row out
    -- of the UPDATE's view. Silence is the pass here, not an exception.
    BEGIN
      UPDATE public.income_sources
        SET expected_amount = 1, notes = c_mark
        WHERE id = v_income_src;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_res := format('%s row(s) affected, no error', v_n);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      v_res := format('REJECTED [%s] %s', v_state, left(v_msg, 80));
    END;
    r := r || format('T2  income_sources UPDATE (blind PATCH)  -> %s', v_res);

    -- ═══ T3 — path (a): standard INSERTs an income transaction ═════════════════
    BEGIN
      INSERT INTO public.transactions (budget_centre_id, date, week, type, category_id, category_name, amount, description)
      VALUES (v_hub, p_hub_date, 'Week 1', 'income', v_category, v_category_name, 99999, c_mark);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_res := format('SUCCEEDED (%s row)', v_n);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      v_res := CASE
        WHEN v_state = '42501' AND v_msg LIKE '%row-level security%' THEN 'REJECTED BY RLS [42501]'
        WHEN v_state = '42501' AND v_msg LIKE '%permission denied%'  THEN format('INCONCLUSIVE [%s] table GRANT missing, not RLS', v_state)
        WHEN v_state = 'CYC02'                                       THEN format('INCONCLUSIVE [%s] trigger fired before RLS: %s', v_state, left(v_msg, 60))
        ELSE format('REJECTED [%s] %s', v_state, left(v_msg, 80))
      END;
    END;
    r := r || format('T3  transactions INSERT type=income      -> %s', v_res);

    -- ═══ T4 — path (d): standard transmutes its own expense INTO income ════════
    -- THE WITH CHECK TEST. USING passes (the row IS an expense), so only an explicit
    -- WITH CHECK can stop the income post-image. An error here AFTER = migrate_24's
    -- WITH CHECK is doing work USING cannot do. 1 row affected = the hole is open.
    BEGIN
      UPDATE public.transactions
        SET type = 'income', description = c_mark
        WHERE id = v_expense_tx;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_res := format('%s row(s) affected, no error', v_n);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      v_res := CASE
        WHEN v_state = '42501' AND v_msg LIKE '%row-level security%' THEN 'REJECTED BY RLS [42501]  <-- WITH CHECK working'
        ELSE format('REJECTED [%s] %s', v_state, left(v_msg, 80))
      END;
    END;
    r := r || format('T4  transactions UPDATE expense->income  -> %s', v_res);

    -- ═══ T5 — CONTROL: standard INSERTs an expense in its own hub ══════════════
    -- Must SUCCEED in both phases. If this breaks, the fix has cost standard members
    -- the core thing their role exists to do.
    BEGIN
      INSERT INTO public.transactions (budget_centre_id, date, week, type, category_id, category_name, amount, description)
      VALUES (v_hub, p_hub_date, 'Week 1', 'expense', v_category, v_category_name, 1, c_mark);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_res := format('SUCCEEDED (%s row)', v_n);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      v_res := format('REJECTED [%s] %s  <-- REGRESSION', v_state, left(v_msg, 80));
    END;
    r := r || format('T5  CONTROL expense INSERT (own hub)     -> %s', v_res);

    -- ═══ T6 — CONTROL: standard edits its own expense ══════════════════════════
    BEGIN
      UPDATE public.transactions
        SET amount = amount + 1, description = c_mark
        WHERE id = v_expense_tx;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_res := format('%s row(s) affected, no error', v_n);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      v_res := format('REJECTED [%s] %s  <-- REGRESSION', v_state, left(v_msg, 80));
    END;
    r := r || format('T6  CONTROL expense UPDATE (own hub)     -> %s', v_res);

    -- ═══ T7 — CROSS-HUB: standard writes an expense into a REAL hub it is not in ══
    -- Must be REJECTED in BOTH phases, by RLS specifically. This is the test that
    -- proves migrate_24's membership gate is load-bearing: without it, the
    -- `type='expense'` branch alone would make every hub's ledger writable by anyone.
    -- INSERT-only by design — see the lock analysis in the header. A CYC02 here means
    -- the setup guard failed and the result is INCONCLUSIVE, not a pass.
    BEGIN
      INSERT INTO public.transactions (budget_centre_id, date, week, type, category_name, amount, description)
      VALUES (v_foreign_hub, v_foreign_date, 'Week 1', 'expense', 'CrossHubProbe', 1, c_mark);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_res := format('SUCCEEDED (%s row)  <-- CROSS-HUB WRITE, CRITICAL', v_n);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      v_res := CASE
        WHEN v_state = '42501' AND v_msg LIKE '%row-level security%' THEN 'REJECTED BY RLS [42501]  <-- correct'
        WHEN v_state = '42501' AND v_msg LIKE '%permission denied%'  THEN format('INCONCLUSIVE [%s] table GRANT missing, not RLS', v_state)
        WHEN v_state = 'CYC02'                                       THEN format('INCONCLUSIVE [%s] trigger fired before RLS: %s', v_state, left(v_msg, 60))
        ELSE format('REJECTED [%s] %s', v_state, left(v_msg, 80))
      END;
    END;
    r := r || format('T7  CROSS-HUB expense INSERT             -> %s', v_res);

    -- ═══ T8 — CONTROL: the owner can still write income ════════════════════════
    -- Switch identity only; role stays `authenticated`, so RLS still applies.
    PERFORM set_config('request.jwt.claims',
                      json_build_object('sub', v_owner::text, 'role', 'authenticated')::text,
                      true);
    BEGIN
      INSERT INTO public.income_sources (budget_centre_id, label, month, expected_amount, notes)
      VALUES (v_hub, c_mark, p_hub_month, 12345, c_mark);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_res := format('SUCCEEDED (%s row)', v_n);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      v_res := format('REJECTED [%s] %s  <-- REGRESSION, owner locked out', v_state, left(v_msg, 80));
    END;
    r := r || format('T8a CONTROL owner income_source INSERT   -> %s', v_res);

    BEGIN
      INSERT INTO public.transactions (budget_centre_id, date, week, type, category_id, category_name, amount, description)
      VALUES (v_hub, p_hub_date, 'Week 1', 'income', v_category, v_category_name, 12345, c_mark);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_res := format('SUCCEEDED (%s row)', v_n);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      v_res := format('REJECTED [%s] %s  <-- REGRESSION, owner locked out', v_state, left(v_msg, 80));
    END;
    r := r || format('T8b CONTROL owner income tx INSERT       -> %s', v_res);

    -- ═══ Report — delivered as an exception, which forces the rollback ═════════
    v_rep := format(E'\n\n════════ F1 WRITE PROBE — phase %s ════════\n', p_phase)
          || format(E'standard    = %s\nowner       = %s\nfixture hub = %s\nforeign hub = %s  (date %s)\n\n',
                    v_standard, v_owner, v_hub, v_foreign_hub, v_foreign_date)
          || array_to_string(r, E'\n')
          || E'\n\n──────── EXPECTED ────────\n'
          || CASE p_phase WHEN 'BEFORE' THEN
              E'T1 SUCCEEDED        (path b — standard forges an income source)   <-- THE LEAK\n'
            || E'T2 0 rows, no error (NOT path c, and NOT safety. migrate_22''s READ policy\n'
            || E'                     filtered the row out of the UPDATE''s view. Under the\n'
            || E'                     bare-membership USING alone this would be 1 row.)\n'
            || E'T3 SUCCEEDED        (path a — standard forges an income transaction)   <-- THE LEAK\n'
            || E'T4 REJECTED [42501] (NOT path d, and NOT safety. The WHERE clause pulled\n'
            || E'                     migrate_23''s type-aware READ policy onto the post-image.\n'
            || E'                     Drop the WHERE and it succeeds.)\n'
            || E'T5 SUCCEEDED        T6 1 row        (controls — legitimate expense work)\n'
            || E'T7 REJECTED BY RLS  (membership gate already holds pre-migration)\n'
            || E'T8a/T8b SUCCEEDED   (owner unaffected)\n'
            || E'\nT1 + T3 reproduced = the INSERT leaks are real; migrate_24/25 are justified.'
            || E'\nPaths (c)/(d) are NOT visible from this file — T2/T4 are masked by the read'
            || E'\npolicies. They were proven by scripts/f1_t4b_diag.sql on 2026-07-16: the'
            || E'\nUNQUALIFIED UPDATE was ACCEPTED, ROW_COUNT = every row in the hub.'
            || E'\nDo NOT conclude "the UPDATE paths are safe" from T2/T4 above.'
            ELSE
              E'T1 REJECTED BY RLS [42501]   (migrate_25 WITH CHECK)   <-- FLIPPED from BEFORE\n'
            || E'T2 0 rows, NO error          (UNCHANGED from BEFORE — still the read policy)\n'
            || E'T3 REJECTED BY RLS [42501]   (migrate_24 WITH CHECK)   <-- FLIPPED from BEFORE\n'
            || E'T4 REJECTED [42501]          (UNCHANGED from BEFORE. Now BOTH the read policy\n'
            || E'                              and migrate_24''s explicit WITH CHECK reject it;\n'
            || E'                              which one fired is indistinguishable from here.)\n'
            || E'T5 SUCCEEDED        T6 1 row (controls — standard keeps its expense work)\n'
            || E'T7 REJECTED BY RLS  (membership gate still scopes the expense branch to the caller''s hub)\n'
            || E'T8a/T8b SUCCEEDED   (owner still writes income)\n'
            || E'\nONLY T1 and T3 flipping is evidence that migrate_24/25 changed anything.'
            || E'\nTo confirm the UPDATE halves, re-run scripts/f1_t4b_diag.sql: post-migration'
            || E'\nthe unqualified UPDATE must be REJECTED where it was ACCEPTED before.'
            || E'\n\nAnything INCONCLUSIVE = the test was masked by a trigger or a GRANT; fix the params and re-run.'
            END
          || E'\n\n════════ ROLLED BACK — nothing was written ════════\n'
          || E'This error IS the successful outcome. It is raised deliberately so the\n'
          || E'transaction cannot commit. No cleanup is required.\n';

    RAISE EXCEPTION '%', v_rep;
  END $$;

  -- ── LAYERED VERIFICATION (this probe is layer 1 of 3) ────────────────────────
  -- Layer 1 — THIS FILE. Proves the policies, zero persistence. Rollback-guaranteed.
  --
  -- Layer 2 — REST re-attempt, AFTER the migrations, with a real standard-member
  --   session (the same method that proved the read-side fix on 2026-07-13). Safe to
  --   run against production for the FORBIDDEN writes only: post-migration they are
  --   rejected, so nothing lands. Do NOT run the legitimate-write controls (T5/T6/T8)
  --   over REST — those succeed by design and would leave real rows. This layer is
  --   what confirms PostgREST sets the claims the way this probe assumes.
  --
  -- Layer 3 — LIVED USE. Green SQL is not "production stable". Confirm in the app:
  --   owner completes a payday confirm (markReceived writes income_sources + an income
  --   transaction — the exact path migrate_24/25 gate), and a standard member adds and
  --   edits an expense. If both feel normal, the fix is done.
