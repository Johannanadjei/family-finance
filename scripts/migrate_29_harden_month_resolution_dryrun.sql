-- =============================================================================
-- migrate_29_harden_month_resolution_dryrun.sql
--
-- BEHAVIOURAL TEST for the hardened resolve_cycle_id(). Run in the Supabase SQL
-- editor AFTER applying migrate_29_harden_month_resolution.sql. Proves the rules
-- actually hold against the real trigger on the real schema, which the structural
-- DO block inside that file cannot do (it only asserts signature / body text /
-- trigger scope).
--
-- SAFE BY CONSTRUCTION. The whole file is one transaction ending in ROLLBACK, so
-- every row it writes is discarded. It NEVER touches an existing hub: each
-- scenario builds its OWN throwaway budget centre (named 'DRYRUN29 …') inside the
-- transaction, so no real family's periods, categories, income or transactions are
-- read, written or even transiently modified. The only pre-existing rows it reads
-- are auth.users ids (to own the throwaway hubs) — never modified. Running it twice
-- changes nothing. Same discipline as migrate_28_ensure_current_budget_period_dryrun.sql.
--
-- All fixture dates are in a FIXED far-future year (2031) so nothing here depends
-- on today's date and the file gives the same verdicts whenever it is run. The
-- year constraint (migrate_17 / CYC03) lives in create_budget_period, which this
-- file does not call — fixtures insert into budget_cycles directly, exactly as
-- migrate_28's dry run does.
--
-- WHAT IT PROVES (9 scenarios; any failure RAISES and rolls the whole thing back)
--   S1  ONE live period starting in the month → an INSERT with NO cycle_id still
--       resolves and stamps that period. The working case is UNCHANGED — this is
--       the regression guard on the ordinary path.
--   S2  TWO live periods starting in the same month → the same INSERT now RAISES
--       SQLSTATE CYC05, and NOTHING is written. This is the bug being closed:
--       before migrate_29 this silently stamped an arbitrary one of the two.
--   S3  ⭐ THE ONE THAT MATTERS FOR SHIPPING — with that ambiguous month still in
--       place, an INSERT that DOES carry cycle_id succeeds and lands in exactly the
--       period asked for. This is the path the client now always takes after the
--       cycle-key rework, so a hub with two same-month periods ("The house") keeps
--       working through the app even BEFORE its one-time repair.
--   S4  ZERO live periods for the month → still CYC02, unchanged.
--   S5  A soft-deleted period does NOT count toward ambiguity: two periods starting
--       in the month, one deleted → resolves cleanly to the live one.
--   S6  budget_categories is hardened identically (same branch, other table).
--   S7  REGRESSION (Commit 12): moving a transaction by writing cycle_id still wins
--       over date re-resolution, and the date is preserved. This is the feature a
--       full-body CREATE OR REPLACE could most easily have reverted.
--   S8  REGRESSION (Commit 10): the transactions date branch is untouched — a
--       date-only edit re-resolves cycle_id (visibly moving the row back out of the
--       period S7 moved it into), and an out-of-range date still raises CYC02.
--   S9  The CYC05 message NAMES BOTH candidate periods with their ranges, so
--       whoever hits it can see which one they meant without a query.
--
-- HOW TO READ THE OUTPUT — TWO CHANNELS, BOTH SHOWING THE SAME 9 VERDICTS.
--   1. The NOTICES / "Logs" panel. The DO block ends by echoing every dryrun_log
--      row as a NOTICE. This channel is ALWAYS rendered, so it is the one to read.
--   2. The results grid. The Supabase SQL editor returns only the LAST statement's
--      result set, and the last statement here MUST stay ROLLBACK (safety), which
--      returns no rows. So the grid may come back as "Success. No rows returned".
--      That is not a failure, and it is why channel 1 exists.
--
-- If you got as far as ANY output at all, every assertion passed — a failure aborts
-- the whole DO block, before either channel, with the scenario name in the error
-- message. Silence plus an error = fail; nine verdict lines = pass.
--
-- ALREADY EXECUTED BEFORE YOU RUN IT (2026-09-10, PostgreSQL 17 in a container,
-- carrying schema_base + migrate_cycles_schema + migrate_cycles_fk_columns +
-- cycle_majority_name + the Commit-10 and Commit-12 triggers, in that order):
--   • RED FIRST — against the UN-hardened trigger (today's production state) this
--     file fails at S2 with "ambiguous month was accepted — the arbitrary pick is
--     still live". The test genuinely detects the bug; it is not vacuous.
--   • GREEN — after applying migrate_29_harden_month_resolution.sql: 9/9 PASS.
--   • IDEMPOTENT — applying migrate_29 twice, then re-running: still 9/9.
--   • ROLLBACK PROVEN — re-running migrate_move_cycle_trigger.sql (the documented
--     rollback) puts S2 back to failing, i.e. the revert really reverts.
--   • NO LEAKAGE — 'DRYRUN29 %' hub count was 0 afterwards.
-- What that run could NOT cover, and Supabase can: RLS policies, the real
-- auth.users population, and this project's actual period data.
-- =============================================================================
BEGIN;

CREATE TEMP TABLE dryrun_log (
  seq      int,
  scenario text,
  verdict  text,
  detail   text
) ON COMMIT DROP;

-- Build a throwaway hub owned by p_owner, with p_owner as its 'owner' member.
CREATE FUNCTION pg_temp.mk_hub(p_owner uuid, p_label text) RETURNS uuid AS $fn$
DECLARE v_id uuid;
BEGIN
  INSERT INTO budget_centres (name, owner_id, currency, type)
  VALUES ('DRYRUN29 ' || p_label || ' (rolled back)', p_owner, 'GHS', 'family')
  RETURNING id INTO v_id;

  INSERT INTO budget_centre_members (budget_centre_id, user_id, role)
  VALUES (v_id, p_owner, 'owner');

  RETURN v_id;
END;
$fn$ LANGUAGE plpgsql;

-- Insert a live period directly (bypassing the RPC, so no year/role gate applies).
CREATE FUNCTION pg_temp.mk_cycle(p_hub uuid, p_start date, p_end date) RETURNS uuid AS $fn$
DECLARE v_id uuid;
BEGIN
  INSERT INTO budget_cycles (budget_centre_id, name, start_date, end_date, anchor_type)
  VALUES (p_hub, cycle_majority_name(p_start, p_end), p_start, p_end, 'custom')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$ LANGUAGE plpgsql;

-- Insert an income source. p_cycle NULL → let the trigger resolve from month.
CREATE FUNCTION pg_temp.mk_income(p_hub uuid, p_label text, p_month text, p_cycle uuid)
RETURNS uuid AS $fn$
DECLARE v_id uuid;
BEGIN
  INSERT INTO income_sources (budget_centre_id, label, expected_amount, currency, month, cycle_id)
  VALUES (p_hub, p_label, 1000, 'GHS', p_month, p_cycle)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$ LANGUAGE plpgsql;

DO $$
DECLARE
  v_owner   uuid;
  v_hub     uuid;
  v_c1      uuid;
  v_c2      uuid;
  v_id      uuid;
  v_got     uuid;
  v_date    date;
  v_n       int;
  v_msg     text;
  v_row     record;
BEGIN
  -- budget_centres.owner_id FKs to public.users, not auth.users, so pick an auth
  -- user that actually HAS a public.users row. (Selecting straight from auth.users
  -- would fail the FK for an orphaned auth row.) Nothing about this user is modified.
  SELECT u.id INTO v_owner
    FROM auth.users u
    JOIN public.users pu ON pu.id = u.id
   ORDER BY u.created_at
   LIMIT 1;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'no auth.users row with a matching public.users row to own the throwaway hubs';
  END IF;

  -- ── S1 — one live period starting in the month: unchanged, still resolves ──
  v_hub := pg_temp.mk_hub(v_owner, 'S1 single');
  v_c1  := pg_temp.mk_cycle(v_hub, DATE '2031-03-01', DATE '2031-03-31');
  v_id  := pg_temp.mk_income(v_hub, 'Salary', '2031-03', NULL);
  SELECT cycle_id INTO v_got FROM income_sources WHERE id = v_id;
  IF v_got IS DISTINCT FROM v_c1 THEN
    RAISE EXCEPTION 'S1 FAIL: expected cycle %, got % — the ordinary month path regressed', v_c1, v_got;
  END IF;
  INSERT INTO dryrun_log VALUES (1, 'S1 one period starts in month', 'PASS',
    'no cycle_id supplied → trigger resolved to the single live period');

  -- ── S2 — two live periods start in the month: RAISES CYC05, writes nothing ──
  -- Non-overlapping (the GiST constraint forbids overlap) but both start in March.
  -- This is the exact live shape on "The house": Sept 1–17 + Sept 18 – Oct 18.
  v_hub := pg_temp.mk_hub(v_owner, 'S2 ambiguous');
  v_c1  := pg_temp.mk_cycle(v_hub, DATE '2031-03-01', DATE '2031-03-17');
  v_c2  := pg_temp.mk_cycle(v_hub, DATE '2031-03-18', DATE '2031-04-18');
  BEGIN
    PERFORM pg_temp.mk_income(v_hub, 'Salary', '2031-03', NULL);
    RAISE EXCEPTION 'S2 FAIL: ambiguous month was accepted — the arbitrary pick is still live';
  EXCEPTION WHEN SQLSTATE 'CYC05' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  SELECT count(*) INTO v_n FROM income_sources WHERE budget_centre_id = v_hub;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'S2 FAIL: CYC05 raised but % row(s) were still written', v_n;
  END IF;
  INSERT INTO dryrun_log VALUES (2, 'S2 two periods start in month', 'PASS',
    'raised CYC05 and wrote 0 rows');

  -- ── S3 — ⭐ explicit cycle_id still works on that SAME ambiguous hub ────────
  -- The client path after the cycle-key rework. If this failed, the app would be
  -- broken on "The house" until the one-time repair; it does not.
  v_id := pg_temp.mk_income(v_hub, 'Salary (explicit)', '2031-03', v_c1);
  SELECT cycle_id INTO v_got FROM income_sources WHERE id = v_id;
  IF v_got IS DISTINCT FROM v_c1 THEN
    RAISE EXCEPTION 'S3 FAIL: explicit cycle_id % was overridden to %', v_c1, v_got;
  END IF;
  -- and the OTHER period is equally addressable — the caller chooses, not the trigger
  v_id := pg_temp.mk_income(v_hub, 'Side gig (explicit)', '2031-03', v_c2);
  SELECT cycle_id INTO v_got FROM income_sources WHERE id = v_id;
  IF v_got IS DISTINCT FROM v_c2 THEN
    RAISE EXCEPTION 'S3 FAIL: explicit cycle_id % was overridden to %', v_c2, v_got;
  END IF;
  INSERT INTO dryrun_log VALUES (3, 'S3 explicit cycle_id on an ambiguous hub', 'PASS',
    'both same-month periods addressable by id — the client path is unaffected');

  -- ── S4 — no live period for the month: still CYC02 ─────────────────────────
  v_hub := pg_temp.mk_hub(v_owner, 'S4 no period');
  PERFORM pg_temp.mk_cycle(v_hub, DATE '2031-03-01', DATE '2031-03-31');
  BEGIN
    PERFORM pg_temp.mk_income(v_hub, 'Salary', '2031-07', NULL);
    RAISE EXCEPTION 'S4 FAIL: a month with no period was accepted';
  EXCEPTION WHEN SQLSTATE 'CYC02' THEN
    NULL;
  END;
  INSERT INTO dryrun_log VALUES (4, 'S4 zero periods for the month', 'PASS',
    'still raises CYC02, not CYC05 — the two conditions stay distinguishable');

  -- ── S5 — a soft-deleted period does not create ambiguity ───────────────────
  v_hub := pg_temp.mk_hub(v_owner, 'S5 soft-deleted twin');
  v_c1  := pg_temp.mk_cycle(v_hub, DATE '2031-03-01', DATE '2031-03-17');
  v_c2  := pg_temp.mk_cycle(v_hub, DATE '2031-03-18', DATE '2031-04-18');
  UPDATE budget_cycles SET deleted_at = now() WHERE id = v_c2;
  v_id := pg_temp.mk_income(v_hub, 'Salary', '2031-03', NULL);
  SELECT cycle_id INTO v_got FROM income_sources WHERE id = v_id;
  IF v_got IS DISTINCT FROM v_c1 THEN
    RAISE EXCEPTION 'S5 FAIL: expected the live period %, got %', v_c1, v_got;
  END IF;
  INSERT INTO dryrun_log VALUES (5, 'S5 soft-deleted twin ignored', 'PASS',
    'deleted_at IS NULL filter still applies before the ambiguity test');

  -- ── S6 — budget_categories is hardened the same way ────────────────────────
  v_hub := pg_temp.mk_hub(v_owner, 'S6 categories');
  v_c1  := pg_temp.mk_cycle(v_hub, DATE '2031-03-01', DATE '2031-03-17');
  v_c2  := pg_temp.mk_cycle(v_hub, DATE '2031-03-18', DATE '2031-04-18');
  BEGIN
    INSERT INTO budget_categories (budget_centre_id, name, budget_amount, month)
    VALUES (v_hub, 'Food', 500, '2031-03');
    RAISE EXCEPTION 'S6 FAIL: ambiguous month accepted on budget_categories';
  EXCEPTION WHEN SQLSTATE 'CYC05' THEN
    NULL;
  END;
  -- explicit cycle_id works here too
  INSERT INTO budget_categories (budget_centre_id, name, budget_amount, month, cycle_id)
  VALUES (v_hub, 'Food', 500, '2031-03', v_c2) RETURNING id INTO v_id;
  SELECT cycle_id INTO v_got FROM budget_categories WHERE id = v_id;
  IF v_got IS DISTINCT FROM v_c2 THEN
    RAISE EXCEPTION 'S6 FAIL: explicit category cycle_id % overridden to %', v_c2, v_got;
  END IF;
  INSERT INTO dryrun_log VALUES (6, 'S6 budget_categories hardened too', 'PASS',
    'same CYC05 on ambiguity; explicit cycle_id still honoured');

  -- ── S7 — REGRESSION: Commit-12 move branch survived the full-body replace ──
  v_hub := pg_temp.mk_hub(v_owner, 'S7 move');
  v_c1  := pg_temp.mk_cycle(v_hub, DATE '2031-03-01', DATE '2031-03-31');
  v_c2  := pg_temp.mk_cycle(v_hub, DATE '2031-04-01', DATE '2031-04-30');
  INSERT INTO transactions (budget_centre_id, date, week, type, category_name, amount, currency)
  VALUES (v_hub, DATE '2031-03-10', 'Week 2', 'expense', 'Food', 50, 'GHS')
  RETURNING id INTO v_id;
  SELECT cycle_id INTO v_got FROM transactions WHERE id = v_id;
  IF v_got IS DISTINCT FROM v_c1 THEN
    RAISE EXCEPTION 'S7 FAIL: insert did not resolve to the March period (got %)', v_got;
  END IF;
  -- The move: write cycle_id, keep the date. The trigger must TRUST the caller.
  UPDATE transactions SET cycle_id = v_c2 WHERE id = v_id;
  SELECT cycle_id, date INTO v_got, v_date FROM transactions WHERE id = v_id;
  IF v_got IS DISTINCT FROM v_c2 THEN
    RAISE EXCEPTION 'S7 FAIL: move was re-resolved back to % — Commit-12 branch lost', v_got;
  END IF;
  IF v_date <> DATE '2031-03-10' THEN
    RAISE EXCEPTION 'S7 FAIL: move altered the date (now %)', v_date;
  END IF;
  INSERT INTO dryrun_log VALUES (7, 'S7 Commit-12 move still wins', 'PASS',
    'cycle_id honoured, date preserved — the move feature was not reverted');

  -- ── S8 — REGRESSION: Commit-10 transactions date branch untouched ──────────
  -- The row is currently in APRIL (moved there by S7) while its date is in MARCH.
  -- A date-only edit must re-resolve and pull it BACK to March — which only proves
  -- something because the two differ: cycle_id visibly changes v_c2 → v_c1.
  UPDATE transactions SET date = DATE '2031-03-20' WHERE id = v_id;
  SELECT cycle_id INTO v_got FROM transactions WHERE id = v_id;
  IF v_got IS DISTINCT FROM v_c1 THEN
    RAISE EXCEPTION 'S8 FAIL: a date-only edit did not re-resolve to the March period (got %, expected %)', v_got, v_c1;
  END IF;
  BEGIN
    INSERT INTO transactions (budget_centre_id, date, week, type, category_name, amount, currency)
    VALUES (v_hub, DATE '2031-12-25', 'Week 4', 'expense', 'Food', 50, 'GHS');
    RAISE EXCEPTION 'S8 FAIL: an out-of-range date was accepted';
  EXCEPTION WHEN SQLSTATE 'CYC02' THEN
    NULL;
  END;
  INSERT INTO dryrun_log VALUES (8, 'S8 date branch unchanged', 'PASS',
    'date-only edit re-resolves; out-of-range date still CYC02');

  -- ── S9 — the CYC05 message names both candidates (v_msg captured in S2) ────
  IF v_msg IS NULL THEN
    RAISE EXCEPTION 'S9 FAIL: no CYC05 message was captured in S2';
  END IF;
  IF v_msg NOT LIKE '%2031-03-01%' OR v_msg NOT LIKE '%2031-03-18%' THEN
    RAISE EXCEPTION 'S9 FAIL: message does not name both candidate ranges: %', v_msg;
  END IF;
  IF v_msg NOT LIKE '%ambiguous%' THEN
    RAISE EXCEPTION 'S9 FAIL: message is not self-explaining: %', v_msg;
  END IF;
  INSERT INTO dryrun_log VALUES (9, 'S9 error names both candidates', 'PASS', v_msg);

  -- ── Echo every verdict as a NOTICE (the channel that always renders) ───────
  RAISE NOTICE '── migrate_29 dry run — 9/9 scenarios passed ──────────────────';
  FOR v_row IN SELECT * FROM dryrun_log ORDER BY seq LOOP
    RAISE NOTICE '% — %', v_row.verdict, v_row.scenario;
    RAISE NOTICE '       %', v_row.detail;
  END LOOP;
  RAISE NOTICE '── nothing above was committed; the next statement is ROLLBACK ─';
END $$;

SELECT * FROM dryrun_log ORDER BY seq;

-- The last statement MUST stay ROLLBACK. Everything above is discarded.
ROLLBACK;

-- =============================================================================
-- AFTERWARDS — confirm nothing leaked. This must return 0. (If it ever returns
-- > 0, a DRYRUN29 hub was committed — delete those rows; no real hub is ever
-- named 'DRYRUN29 …'.)
--   SELECT count(*) FROM budget_centres WHERE name LIKE 'DRYRUN29 %';
--
-- NOT PROVEN HERE, and deliberately so:
--   • That no PRODUCTION hub currently relies on ambiguous month resolution. That
--     is a data question, not a behaviour one — run the GROUP BY … HAVING count(*)>1
--     query at the foot of migrate_29_harden_month_resolution.sql against live data.
--   • The one-time repair of "The house" (b7e336d0). That is sequence step 3 and
--     gets its own dry-run-then-apply pair.
-- =============================================================================
