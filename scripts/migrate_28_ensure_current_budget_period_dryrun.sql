-- =============================================================================
-- migrate_28_ensure_current_budget_period_dryrun.sql
--
-- BEHAVIOURAL TEST for ensure_current_budget_period — run in the Supabase SQL
-- editor AFTER applying migrate_28_ensure_current_budget_period.sql. Proves the
-- rules actually hold against the real function on the real schema, which the
-- structural DO block inside that file cannot do (it asserts signature/deps/ACL).
--
-- SAFE BY CONSTRUCTION. The whole file is one transaction ending in ROLLBACK, so
-- every row it writes is discarded. It NEVER touches an existing hub: each
-- scenario builds its OWN throwaway budget centre (named 'DRYRUN …') inside the
-- transaction, so no real family's periods, categories or income are read,
-- written or even transiently modified. The only pre-existing rows it reads are
-- auth.users ids (to own the throwaway hubs) — never modified. Running it twice
-- changes nothing. Same discipline as apply_subscription_event_dryrun.sql.
--
-- There is no Docker/pgTAP harness in this repo (npm test covers JS only), so this
-- file IS the test for the SQL half of auto-continue. Re-run it after any edit to
-- migrate_28_ensure_current_budget_period.sql.
--
-- WHAT IT PROVES (11 scenarios; any failure RAISES and rolls back)
--   S1  first call on a hub with a previous period → created=true, range = the
--       calendar month containing today, name = majority-month label
--   S2  carry-forward is CORRECT: 3 categories copied with name/icon/amount/
--       is_fixed/sort_order intact, stamped with the new cycle_id and the new
--       month; 2 income sources copied with expectations intact
--   S3  receipts DO NOT carry: every copied income row is received=false,
--       received_amount=0, actual_pay_date NULL — even though the source rows
--       were received with real amounts
--   S4  activity does NOT carry: 0 transactions in the new period (the source had 2)
--   S5  IDEMPOTENCY: 2nd and 3rd calls return the SAME cycle_id with created=false,
--       and the category/income counts are UNCHANGED — no second period, NO RE-COPY,
--       no duplicates. This is the property that makes firing on every hub open safe
--   S6  no source cycle (brand-new hub, zero periods) → created=true, source NULL,
--       carried 0/0 — and it does not error
--   S7  CLIPPED RANGE: previous period ends today−1 and a future period starts
--       today+1 → the created window is exactly [today, today]; it never overlaps
--       either neighbour, which is why CYC01 cannot fire on the ordinary path
--   S8  CAP CLAMP (free tier): a source period with 13 categories / 3 income streams
--       carries 10 + 2 and reports skipped 3 + 1 — the period is still created.
--       A downgraded hub must never be left without a period
--   S9  ROLE GATE: a non-member caller gets 42501
--   S10 ROLE GATE: a `standard` member gets 42501 (skipped with a NOTICE if the
--       project has only one auth user to build the fixture from)
--   S11 EXCLUSION TRAP: the no_overlapping_cycles constraint really does raise
--       SQLSTATE 23P01 (exclusion_violation) on this schema — the error the
--       function's trap catches
--
-- ON S11 — WHAT IS AND IS NOT PROVEN HERE. The trap's recovery branch cannot be
-- driven from a single SQL session: reaching it needs a CONCURRENT transaction to
-- commit an overlapping period between this function's clip and its INSERT. Same-
-- transaction rows are visible to the clip, so no single-session fixture can get
-- there — which is itself the point: on the ordinary path the clipped window
-- provably cannot overlap, so CYC01 is unreachable except under a genuine race.
-- So S11 proves the half that IS reachable from here: that the constraint raises
-- exclusion_violation (the exception the trap names) on this schema.
--
-- The recovery branch itself WAS proven, out of band, with two concurrent sessions
-- against a scratch Postgres 17 carrying this repo's real dependency functions. The
-- reproduction is in the appendix at the foot of this file. Result: session A hit
-- exclusion_violation, caught it, adopted the racer's period and returned
-- created=false — one live period on the hub, no duplicate, no error surfaced.
--
-- HOW TO READ THE OUTPUT — TWO CHANNELS, BOTH SHOWING THE SAME 11 VERDICTS.
--   1. The NOTICES / "Logs" panel. The DO block ends by echoing every dryrun_log
--      row as a NOTICE — same panel as the 'dry run as user …' line at the top of
--      the run. This channel is ALWAYS rendered, so it is the one to read.
--   2. The results grid. The last statement before ROLLBACK is a SELECT of the
--      whole dryrun_log. Whether it renders depends on the client: the Supabase
--      SQL editor returns only the LAST statement's result set, and the last
--      statement in this file MUST stay ROLLBACK (safety — see the banner above),
--      which returns no rows. So the grid may come back as "Success. No rows
--      returned". That is not a failure, and it is why channel 1 exists.
--
-- If you got as far as ANY output at all, every assertion passed — a failure
-- aborts the whole DO block, before either channel, with the scenario name in the
-- error message. Silence plus an error = fail; verdict lines = pass.
-- =============================================================================
BEGIN;

CREATE TEMP TABLE dryrun_log (
  seq       int,
  scenario  text,
  created   boolean,
  cycle     text,
  window_    text,
  cats      text,
  income    text,
  note      text
) ON COMMIT DROP;

-- Build a throwaway hub owned by v_owner, with v_owner as its 'owner' member.
CREATE FUNCTION pg_temp.mk_hub(p_owner uuid, p_label text) RETURNS uuid AS $fn$
DECLARE v_id uuid;
BEGIN
  INSERT INTO budget_centres (name, owner_id, currency, type)
  VALUES ('DRYRUN ' || p_label || ' (rolled back)', p_owner, 'GHS', 'family')
  RETURNING id INTO v_id;

  INSERT INTO budget_centre_members (budget_centre_id, user_id, role)
  VALUES (v_id, p_owner, 'owner');

  RETURN v_id;
END;
$fn$ LANGUAGE plpgsql;

-- Insert a live cycle directly (bypassing the RPC) to build fixtures.
CREATE FUNCTION pg_temp.mk_cycle(p_hub uuid, p_start date, p_end date) RETURNS uuid AS $fn$
DECLARE v_id uuid;
BEGIN
  INSERT INTO budget_cycles (budget_centre_id, name, start_date, end_date, anchor_type)
  VALUES (p_hub, cycle_majority_name(p_start, p_end), p_start, p_end, 'custom')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$ LANGUAGE plpgsql;

DO $$
DECLARE
  v_owner       uuid;
  v_second      uuid;
  v_hub         uuid;
  v_prev        uuid;
  v_new         uuid;
  v_res         jsonb;
  v_res2        jsonb;
  v_today       date := (now() AT TIME ZONE 'UTC')::date;
  v_m_start     date := date_trunc('month', (now() AT TIME ZONE 'UTC')::date)::date;
  v_m_end       date := (date_trunc('month', (now() AT TIME ZONE 'UTC')::date) + interval '1 month - 1 day')::date;
  v_prev_start  date;
  v_prev_end    date;
  v_n           int;
  v_row         record;
  v_sqlstate    text;
  i             int;
BEGIN
  -- ── Pick the hub owner: an auth user with NO subscriptions row, so hub_tier()
  --    resolves 'free' deterministically (S8 depends on the free caps). Nothing
  --    about this user is modified — we only own throwaway hubs with their id.
  SELECT u.id INTO v_owner
  FROM auth.users u
  WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.deleted_at IS NULL)
  ORDER BY u.created_at
  LIMIT 1;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'no test account available: every auth.users row has a subscriptions row';
  END IF;

  SELECT u.id INTO v_second FROM auth.users u WHERE u.id <> v_owner ORDER BY u.created_at LIMIT 1;

  -- auth.uid() inside the RPC reads this claim. Transaction-local (third arg true).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  RAISE NOTICE 'dry run as user %  (today = %)', v_owner, v_today;

  -- Previous period: the calendar month BEFORE this one, so nothing covers today.
  v_prev_start := (v_m_start - interval '1 month')::date;
  v_prev_end   := (v_m_start - interval '1 day')::date;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- FIXTURE A — hub with a fully-populated previous period. Used by S1–S5.
  -- ═══════════════════════════════════════════════════════════════════════════
  v_hub  := pg_temp.mk_hub(v_owner, 'A carry-forward');
  v_prev := pg_temp.mk_cycle(v_hub, v_prev_start, v_prev_end);

  INSERT INTO budget_categories (budget_centre_id, name, icon, budget_amount, month, is_fixed, sort_order, cycle_id)
  VALUES
    (v_hub, 'Rent',      '🏠', 1200.00, to_char(v_prev_start,'YYYY-MM'), true,  0, v_prev),
    (v_hub, 'Groceries', '🛒',  850.50, to_char(v_prev_start,'YYYY-MM'), false, 1, v_prev),
    (v_hub, 'Transport', '🚌',  200.00, to_char(v_prev_start,'YYYY-MM'), false, 2, v_prev);

  -- Both source rows are RECEIVED with real amounts — S3 proves that does not carry.
  INSERT INTO income_sources (budget_centre_id, label, icon, expected_amount, currency, pay_day,
                              pay_day_type, notes, received, received_amount, actual_pay_date, month, cycle_id)
  VALUES
    (v_hub, 'Salary',     '💰', 4000.00, 'GHS', 25, 'fixed_date', 'main',  true, 3980.00, v_prev_end, to_char(v_prev_start,'YYYY-MM'), v_prev),
    (v_hub, 'Side gig',   '💻',  600.00, 'GHS',  5, 'flexible',   '',      true,  600.00, v_prev_end, to_char(v_prev_start,'YYYY-MM'), v_prev);

  -- Activity in the source period — S4 proves transactions never carry.
  INSERT INTO transactions (budget_centre_id, date, week, type, category_name, amount, currency, cycle_id)
  VALUES
    (v_hub, v_prev_end, 'Week 4', 'expense', 'Groceries', 120.00, 'GHS', v_prev),
    (v_hub, v_prev_end, 'Week 4', 'expense', 'Transport',  30.00, 'GHS', v_prev);

  -- ═══ S1 — first call creates the calendar month containing today.
  v_res := ensure_current_budget_period(v_hub);
  v_new := (v_res->>'cycle_id')::uuid;

  IF (v_res->>'created')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'S1 FAIL: created is % (expected true)', v_res->>'created'; END IF;
  IF (v_res->>'start_date')::date <> v_m_start THEN RAISE EXCEPTION 'S1 FAIL: start is % (expected %)', v_res->>'start_date', v_m_start; END IF;
  IF (v_res->>'end_date')::date   <> v_m_end   THEN RAISE EXCEPTION 'S1 FAIL: end is % (expected %)',   v_res->>'end_date',   v_m_end; END IF;
  IF (v_res->>'source_cycle_id')::uuid <> v_prev THEN RAISE EXCEPTION 'S1 FAIL: source is % (expected the previous period)', v_res->>'source_cycle_id'; END IF;
  IF v_res->>'name' <> cycle_majority_name(v_m_start, v_m_end) THEN RAISE EXCEPTION 'S1 FAIL: name is % (expected %)', v_res->>'name', cycle_majority_name(v_m_start, v_m_end); END IF;

  -- The whole point: a period now covers today.
  SELECT count(*) INTO v_n FROM budget_cycles
   WHERE budget_centre_id = v_hub AND deleted_at IS NULL AND v_today BETWEEN start_date AND end_date;
  IF v_n <> 1 THEN RAISE EXCEPTION 'S1 FAIL: % live periods cover today (expected exactly 1)', v_n; END IF;

  INSERT INTO dryrun_log VALUES (1, 'first call, previous period exists', true,
    v_res->>'name', (v_res->>'start_date') || ' → ' || (v_res->>'end_date'),
    v_res->>'categories_carried', v_res->>'income_carried', 'covers today');

  -- ═══ S2 — carry-forward copied the PLAN correctly.
  IF (v_res->>'categories_carried')::int <> 3 THEN RAISE EXCEPTION 'S2 FAIL: categories_carried is % (expected 3)', v_res->>'categories_carried'; END IF;
  IF (v_res->>'income_carried')::int     <> 2 THEN RAISE EXCEPTION 'S2 FAIL: income_carried is % (expected 2)',     v_res->>'income_carried'; END IF;
  IF (v_res->>'categories_skipped')::int <> 0 THEN RAISE EXCEPTION 'S2 FAIL: categories_skipped is % (expected 0)', v_res->>'categories_skipped'; END IF;

  SELECT count(*) INTO v_n FROM budget_categories WHERE cycle_id = v_new AND deleted_at IS NULL;
  IF v_n <> 3 THEN RAISE EXCEPTION 'S2 FAIL: % categories in the new period (expected 3)', v_n; END IF;

  -- Field-for-field: every source category has exactly one twin with identical shape.
  SELECT count(*) INTO v_n
  FROM budget_categories src
  JOIN budget_categories cp
    ON cp.cycle_id = v_new AND cp.deleted_at IS NULL
   AND cp.name = src.name AND cp.icon = src.icon
   AND cp.budget_amount = src.budget_amount
   AND cp.is_fixed = src.is_fixed AND cp.sort_order = src.sort_order
  WHERE src.cycle_id = v_prev AND src.deleted_at IS NULL;
  IF v_n <> 3 THEN RAISE EXCEPTION 'S2 FAIL: % of 3 categories matched the source shape', v_n; END IF;

  -- Stamped with the NEW cycle and the NEW month (so the client slice + the
  -- month-keyed trigger both resolve them to this period).
  SELECT count(*) INTO v_n FROM budget_categories
   WHERE cycle_id = v_new AND deleted_at IS NULL AND month = to_char(v_m_start, 'YYYY-MM');
  IF v_n <> 3 THEN RAISE EXCEPTION 'S2 FAIL: % categories carry the new month stamp (expected 3)', v_n; END IF;

  SELECT count(*) INTO v_n
  FROM income_sources src
  JOIN income_sources cp
    ON cp.cycle_id = v_new AND cp.deleted_at IS NULL
   AND cp.label = src.label AND cp.expected_amount = src.expected_amount
   AND cp.currency = src.currency AND cp.pay_day IS NOT DISTINCT FROM src.pay_day
   AND cp.pay_day_type = src.pay_day_type
  WHERE src.cycle_id = v_prev AND src.deleted_at IS NULL;
  IF v_n <> 2 THEN RAISE EXCEPTION 'S2 FAIL: % of 2 income sources matched the source shape', v_n; END IF;

  INSERT INTO dryrun_log VALUES (2, 'carry-forward shape intact', true, v_res->>'name', 'n/a', '3 copied', '2 copied', 'name/icon/amount/is_fixed/sort_order + month + cycle_id');

  -- ═══ S3 — receipts do NOT carry: a new period starts unpaid.
  SELECT count(*) INTO v_n FROM income_sources
   WHERE cycle_id = v_new AND deleted_at IS NULL
     AND (received IS NOT FALSE OR received_amount <> 0 OR actual_pay_date IS NOT NULL);
  IF v_n <> 0 THEN RAISE EXCEPTION 'S3 FAIL: % copied income row(s) carried receipt state — that fabricates income', v_n; END IF;

  INSERT INTO dryrun_log VALUES (3, 'receipts do not carry', true, v_res->>'name', 'n/a', 'n/a', '2 unpaid', 'received=false, amount=0, date NULL');

  -- ═══ S4 — activity does NOT carry.
  SELECT count(*) INTO v_n FROM transactions WHERE cycle_id = v_new AND deleted_at IS NULL;
  IF v_n <> 0 THEN RAISE EXCEPTION 'S4 FAIL: % transaction(s) copied into the new period (expected 0)', v_n; END IF;
  SELECT count(*) INTO v_n FROM transactions WHERE cycle_id = v_prev AND deleted_at IS NULL;
  IF v_n <> 2 THEN RAISE EXCEPTION 'S4 FAIL: source period lost transactions (% left, expected 2)', v_n; END IF;

  INSERT INTO dryrun_log VALUES (4, 'transactions do not carry', true, v_res->>'name', 'n/a', 'n/a', 'n/a', '0 copied, source intact');

  -- ═══ S5 — IDEMPOTENCY. Call twice more; nothing may change.
  FOR i IN 1..2 LOOP
    v_res2 := ensure_current_budget_period(v_hub);

    IF (v_res2->>'created')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'S5 FAIL (call %): created is % (expected false)', i + 1, v_res2->>'created'; END IF;
    IF (v_res2->>'cycle_id')::uuid <> v_new THEN RAISE EXCEPTION 'S5 FAIL (call %): returned a DIFFERENT cycle', i + 1; END IF;
    IF (v_res2->>'categories_carried')::int <> 0 OR (v_res2->>'income_carried')::int <> 0
      THEN RAISE EXCEPTION 'S5 FAIL (call %): re-copied % categories / % income', i + 1, v_res2->>'categories_carried', v_res2->>'income_carried'; END IF;

    SELECT count(*) INTO v_n FROM budget_cycles WHERE budget_centre_id = v_hub AND deleted_at IS NULL;
    IF v_n <> 2 THEN RAISE EXCEPTION 'S5 FAIL (call %): % live periods (expected 2 — no duplicate created)', i + 1, v_n; END IF;

    SELECT count(*) INTO v_n FROM budget_categories WHERE cycle_id = v_new AND deleted_at IS NULL;
    IF v_n <> 3 THEN RAISE EXCEPTION 'S5 FAIL (call %): % categories (expected 3 — DUPLICATES)', i + 1, v_n; END IF;

    SELECT count(*) INTO v_n FROM income_sources WHERE cycle_id = v_new AND deleted_at IS NULL;
    IF v_n <> 2 THEN RAISE EXCEPTION 'S5 FAIL (call %): % income sources (expected 2 — DUPLICATES)', i + 1, v_n; END IF;
  END LOOP;

  INSERT INTO dryrun_log VALUES (5, 'idempotent: 3 calls total', false, v_res2->>'name', 'unchanged', '3 (no dupes)', '2 (no dupes)', 'created=false, nothing re-copied');

  -- ═══════════════════════════════════════════════════════════════════════════
  -- S6 — FIXTURE B: brand-new hub, zero periods. Must create, must not error.
  -- ═══════════════════════════════════════════════════════════════════════════
  v_hub := pg_temp.mk_hub(v_owner, 'B no source');
  v_res := ensure_current_budget_period(v_hub);

  IF (v_res->>'created')::boolean IS NOT TRUE   THEN RAISE EXCEPTION 'S6 FAIL: created is %', v_res->>'created'; END IF;
  IF  v_res->>'source_cycle_id' IS NOT NULL     THEN RAISE EXCEPTION 'S6 FAIL: source is % (expected null)', v_res->>'source_cycle_id'; END IF;
  IF (v_res->>'categories_carried')::int <> 0   THEN RAISE EXCEPTION 'S6 FAIL: carried % categories from nowhere', v_res->>'categories_carried'; END IF;
  IF (v_res->>'start_date')::date <> v_m_start OR (v_res->>'end_date')::date <> v_m_end
    THEN RAISE EXCEPTION 'S6 FAIL: window % – % (expected the full calendar month)', v_res->>'start_date', v_res->>'end_date'; END IF;

  INSERT INTO dryrun_log VALUES (6, 'no source cycle', true, v_res->>'name',
    (v_res->>'start_date') || ' → ' || (v_res->>'end_date'), '0', '0', 'full month, source null');

  -- ═══════════════════════════════════════════════════════════════════════════
  -- S7 — FIXTURE C: the CLIP. Previous ends today−1, next starts today+1, so the
  --      only free window is exactly [today, today]. Proves the created range is
  --      clipped to the real gap and can never overlap a neighbour.
  -- ═══════════════════════════════════════════════════════════════════════════
  v_hub := pg_temp.mk_hub(v_owner, 'C clipped window');
  PERFORM pg_temp.mk_cycle(v_hub, (v_today - 20), (v_today - 1));   -- ends yesterday
  PERFORM pg_temp.mk_cycle(v_hub, (v_today + 1),  (v_today + 20));  -- starts tomorrow

  v_res := ensure_current_budget_period(v_hub);

  IF (v_res->>'created')::boolean IS NOT TRUE  THEN RAISE EXCEPTION 'S7 FAIL: created is %', v_res->>'created'; END IF;
  IF (v_res->>'start_date')::date <> v_today   THEN RAISE EXCEPTION 'S7 FAIL: start is % (expected today %)', v_res->>'start_date', v_today; END IF;
  IF (v_res->>'end_date')::date   <> v_today   THEN RAISE EXCEPTION 'S7 FAIL: end is % (expected today %)',   v_res->>'end_date',   v_today; END IF;

  SELECT count(*) INTO v_n FROM budget_cycles WHERE budget_centre_id = v_hub AND deleted_at IS NULL;
  IF v_n <> 3 THEN RAISE EXCEPTION 'S7 FAIL: % live periods (expected 3)', v_n; END IF;

  INSERT INTO dryrun_log VALUES (7, 'clipped to the real gap', true, v_res->>'name',
    (v_res->>'start_date') || ' → ' || (v_res->>'end_date'), 'n/a', 'n/a', 'no overlap with either neighbour');

  -- ═══════════════════════════════════════════════════════════════════════════
  -- S8 — FIXTURE D: free-tier CAP CLAMP. 13 categories + 3 income in the source.
  --      Must carry 10 + 2, report the rest skipped, and STILL create the period.
  -- ═══════════════════════════════════════════════════════════════════════════
  v_hub  := pg_temp.mk_hub(v_owner, 'D cap clamp');
  v_prev := pg_temp.mk_cycle(v_hub, v_prev_start, v_prev_end);

  INSERT INTO budget_categories (budget_centre_id, name, icon, budget_amount, month, is_fixed, sort_order, cycle_id)
  SELECT v_hub, 'Cat ' || g, '💸', 100 * g, to_char(v_prev_start,'YYYY-MM'), false, g, v_prev
  FROM generate_series(1, 13) g;

  INSERT INTO income_sources (budget_centre_id, label, icon, expected_amount, currency, pay_day,
                              pay_day_type, notes, month, cycle_id)
  SELECT v_hub, 'Inc ' || g, '💰', 1000 * g, 'GHS', g, 'fixed_date', '', to_char(v_prev_start,'YYYY-MM'), v_prev
  FROM generate_series(1, 3) g;

  v_res := ensure_current_budget_period(v_hub);

  IF v_res->>'tier' <> 'free' THEN RAISE EXCEPTION 'S8 FAIL: tier is % — pick a subscription-free owner or the caps differ', v_res->>'tier'; END IF;
  IF (v_res->>'created')::boolean IS NOT TRUE     THEN RAISE EXCEPTION 'S8 FAIL: the period was NOT created — a capped hub must still get a period'; END IF;
  IF (v_res->>'categories_carried')::int <> 10    THEN RAISE EXCEPTION 'S8 FAIL: categories_carried is % (expected 10)', v_res->>'categories_carried'; END IF;
  IF (v_res->>'categories_skipped')::int <> 3     THEN RAISE EXCEPTION 'S8 FAIL: categories_skipped is % (expected 3)',  v_res->>'categories_skipped'; END IF;
  IF (v_res->>'income_carried')::int     <> 2     THEN RAISE EXCEPTION 'S8 FAIL: income_carried is % (expected 2)',      v_res->>'income_carried'; END IF;
  IF (v_res->>'income_skipped')::int     <> 1     THEN RAISE EXCEPTION 'S8 FAIL: income_skipped is % (expected 1)',      v_res->>'income_skipped'; END IF;

  -- The clamp is by sort_order, so the user keeps their FIRST ten, not a random ten.
  SELECT count(*) INTO v_n FROM budget_categories
   WHERE cycle_id = (v_res->>'cycle_id')::uuid AND deleted_at IS NULL AND sort_order <= 10;
  IF v_n <> 10 THEN RAISE EXCEPTION 'S8 FAIL: clamp did not keep the first 10 by sort_order (got %)', v_n; END IF;

  INSERT INTO dryrun_log VALUES (8, 'free-tier cap clamp', true, v_res->>'name', 'n/a',
    '10 of 13 (3 skipped)', '2 of 3 (1 skipped)', 'period still created');

  -- ═══════════════════════════════════════════════════════════════════════════
  -- S9 — ROLE GATE: a non-member caller is refused with 42501.
  -- ═══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true);
  BEGIN
    v_res := ensure_current_budget_period(v_hub);
    RAISE EXCEPTION 'S9 FAIL: a non-member was allowed to create a period';
  EXCEPTION
    WHEN insufficient_privilege THEN
      INSERT INTO dryrun_log VALUES (9, 'non-member caller', NULL, NULL, NULL, NULL, NULL, 'refused with 42501');
  END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- S10 — ROLE GATE: a `standard` member is refused with 42501. This is the DB
  --       twin of the client's can('manageCycles') auto-fire guard.
  -- ═══════════════════════════════════════════════════════════════════════════
  IF v_second IS NULL THEN
    RAISE NOTICE 'S10 SKIPPED: only one auth user in this project, cannot build a standard-member fixture';
    INSERT INTO dryrun_log VALUES (10, 'standard member', NULL, NULL, NULL, NULL, NULL, 'SKIPPED — needs a 2nd auth user');
  ELSE
    v_hub := pg_temp.mk_hub(v_owner, 'E standard member');
    INSERT INTO budget_centre_members (budget_centre_id, user_id, role)
    VALUES (v_hub, v_second, 'standard');

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_second)::text, true);
    BEGIN
      v_res := ensure_current_budget_period(v_hub);
      RAISE EXCEPTION 'S10 FAIL: a standard member was allowed to create a period';
    EXCEPTION
      WHEN insufficient_privilege THEN
        INSERT INTO dryrun_log VALUES (10, 'standard member', NULL, NULL, NULL, NULL, NULL, 'refused with 42501');
    END;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);

    SELECT count(*) INTO v_n FROM budget_cycles WHERE budget_centre_id = v_hub AND deleted_at IS NULL;
    IF v_n <> 0 THEN RAISE EXCEPTION 'S10 FAIL: the refused call still wrote % period(s)', v_n; END IF;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- S11 — the constraint the trap catches really does raise exclusion_violation.
  --       (See the header for what this does and does not prove.)
  -- ═══════════════════════════════════════════════════════════════════════════
  v_hub := pg_temp.mk_hub(v_owner, 'F overlap');
  PERFORM pg_temp.mk_cycle(v_hub, v_m_start, v_m_end);

  BEGIN
    PERFORM pg_temp.mk_cycle(v_hub, v_today, v_today);   -- squarely inside the above
    RAISE EXCEPTION 'S11 FAIL: an overlapping period was accepted — no_overlapping_cycles is not enforcing';
  EXCEPTION
    WHEN exclusion_violation THEN
      GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
      IF v_sqlstate <> '23P01' THEN RAISE EXCEPTION 'S11 FAIL: sqlstate % (expected 23P01)', v_sqlstate; END IF;
      INSERT INTO dryrun_log VALUES (11, 'overlap raises exclusion_violation', NULL, NULL, NULL, NULL, NULL, 'SQLSTATE 23P01 — the error the trap catches');
  END;

  -- And on that same hub the function is a no-op: a period already covers today.
  v_res := ensure_current_budget_period(v_hub);
  IF (v_res->>'created')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'S11 FAIL: created a second period over an existing one'; END IF;

  -- ── Footer row: every throwaway hub this file built. All of them are inside the
  --    transaction about to be discarded; this is what the ROLLBACK erases. It was
  --    a separate trailing SELECT, folded in here so that the dryrun_log SELECT can
  --    be the LAST statement before ROLLBACK rather than being overwritten by it.
  SELECT count(*) INTO v_n FROM budget_centres WHERE name LIKE 'DRYRUN %';
  INSERT INTO dryrun_log VALUES (12, 'throwaway hubs built by this run', NULL, NULL, NULL, NULL, NULL,
    v_n || ' DRYRUN hubs exist inside this transaction — the ROLLBACK below erases every one');

  -- ── Echo the whole log to the NOTICES panel. The grid below can be swallowed by
  --    the client (see HOW TO READ THE OUTPUT in the header): the last statement
  --    must stay ROLLBACK, and the Supabase SQL editor returns only the last
  --    statement's rows. NOTICES always render, so these lines are the
  --    guaranteed-visible copy of the verdicts.
  RAISE NOTICE '════════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '  ensure_current_budget_period — DRY RUN VERDICTS  (today = %)', v_today;
  RAISE NOTICE '════════════════════════════════════════════════════════════════════════';
  FOR v_row IN SELECT * FROM dryrun_log ORDER BY seq LOOP
    RAISE NOTICE '%  %  %  %',
      rpad('S' || v_row.seq::text, 4),
      rpad(CASE WHEN v_row.seq >= 12                 THEN 'INFO'
                WHEN v_row.note LIKE 'SKIPPED%'      THEN 'SKIP'
                ELSE 'PASS' END, 4),
      rpad(v_row.scenario, 38),
      COALESCE(v_row.note, '');
    IF v_row.cycle IS NOT NULL THEN
      RAISE NOTICE '            created=%  cycle=%  window=%  categories=%  income=%',
        COALESCE(v_row.created::text, 'n/a'), v_row.cycle, COALESCE(v_row.window_, 'n/a'),
        COALESCE(v_row.cats, 'n/a'), COALESCE(v_row.income, 'n/a');
    END IF;
  END LOOP;
  RAISE NOTICE '════════════════════════════════════════════════════════════════════════';

  RAISE NOTICE 'ALL SCENARIOS PASSED — nothing committed.';
END $$;

-- THE LAST STATEMENT BEFORE ROLLBACK, deliberately: the full dryrun_log, one row
-- per scenario plus the throwaway-hub footer. Nothing may be added between this
-- SELECT and the ROLLBACK — anything that does would overwrite the result grid,
-- which is exactly the bug this ordering fixes.
SELECT seq,
       CASE WHEN seq >= 12            THEN 'INFO'
            WHEN note LIKE 'SKIPPED%' THEN 'SKIP'
            ELSE 'PASS' END           AS verdict,
       scenario, created, cycle, window_ AS period_window, cats AS categories, income, note
FROM dryrun_log ORDER BY seq;

-- ═════════════════════════════════════════════════════════════════════════════
-- This is a TEST. Leave the next line as ROLLBACK — everything above ran and is
-- now discarded. There is no "real run" variant of this file.
-- ═════════════════════════════════════════════════════════════════════════════
ROLLBACK;

-- Optional post-run proof that nothing leaked. Run this AFTER the file above;
-- it must return 0. (If it ever returns > 0, a DRYRUN hub was committed — delete
-- those rows; no real hub is ever named 'DRYRUN …'.)
--   SELECT count(*) FROM budget_centres WHERE name LIKE 'DRYRUN %';

-- =============================================================================
-- APPENDIX — reproducing the concurrency proof (optional; needs Docker, not
-- Supabase). The SQL editor is single-session, so the trap's RECOVERY branch is
-- proven here instead. Run against a scratch Postgres carrying this repo's
-- schema + cycle_majority_name, is_budget_centre_member, hub_tier, resolve_cycle_id:
--
--   1. Install a twin of the function named ensure_test, identical except for a
--      `PERFORM pg_sleep(4);` inserted immediately BEFORE the `INSERT INTO
--      budget_cycles` — that widens the window between the "already covered?"
--      lookup and the insert.
--   2. Commit a hub with an owner member and NO cycles.
--   3. Session A:  BEGIN; set request.jwt.claims to the owner; SELECT ensure_test(hub); COMMIT;
--   4. Session B, ~2s later: INSERT a period covering today directly into
--      budget_cycles (this is what create_budget_period from the custom-dates
--      sheet does) and COMMIT.
--
--   EXPECTED, AND OBSERVED: session A's insert raises exclusion_violation, the trap
--   catches it, re-reads the covering period and returns session B's period with
--   created=false and zero carried rows. The hub ends with exactly ONE live period.
--   No CYC01 reaches the client.
-- =============================================================================
