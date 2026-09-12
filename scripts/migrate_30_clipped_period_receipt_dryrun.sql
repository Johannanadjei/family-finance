-- =============================================================================
-- migrate_30_clipped_period_receipt_dryrun.sql
--
-- BEHAVIOURAL PROOF for scripts/migrate_30_clipped_period_receipt.sql.
-- Builds throwaway hubs, exercises every clipping shape, asserts the six new keys
-- AND that the created period is still migrate_28-identical, then ROLLS BACK.
--
-- ⚠️  SAFE BY CONSTRUCTION — THE LAST STATEMENT IS `ROLLBACK`.
--   Everything below runs inside ONE transaction that is discarded. The hubs,
--   periods, categories and income sources it creates never reach committed state.
--   DO NOT edit the final ROLLBACK into a COMMIT: this file writes to the shared
--   production database, and the ROLLBACK is the only thing making that acceptable.
--
-- RUN THIS AFTER migrate_30_clipped_period_receipt.sql. Against the migrate_28
--   function it fails at S1 (no clipped_end key in the payload) — which is the
--   point: it can tell the two versions apart.
--
-- ── WHAT IT PROVES ───────────────────────────────────────────────────────────
--   S1  clipped END — the headline case. A future period starting inside this
--       month shortens the new one; clipped_end=true and next_start/next_end name
--       the period the message has to mention. This is literally
--       "September 1–17 created — you already have a later period (18 Sep–18 Oct)".
--   S2  clipped START — an earlier period ending inside this month pushes the
--       start off the 1st; clipped_start=true and prev_start/prev_end name it.
--   S3  clipped BOTH ends at once — both flags true, all four dates present.
--   S4  NOT clipped, neighbour present — the trap. A previous period that ended
--       LAST month sets prev_start/prev_end but must leave clipped_start FALSE.
--       A client reading the dates instead of the flag would wrongly claim the
--       month was shortened. This is the scenario that catches that.
--   S5  already covered (created=false) — flags false, all four dates NULL.
--   S6  virgin hub, no periods at all — full calendar month, flags false, all
--       four dates NULL, no source to carry from.
--   S7  NO LOGIC CHANGE — on the S1 hub, the carry-forward still copied the plan
--       and still did NOT copy receipts, and the window matches greatest/least
--       computed independently here. migrate_30 added facts and changed nothing.
--
-- ── HOW TO READ THE OUTPUT — TWO CHANNELS, SAME VERDICTS ─────────────────────
--   1. The NOTICES / "Logs" panel — ALWAYS rendered. The DO block ends by echoing
--      every dryrun_log row as a NOTICE. This is the channel to read.
--   2. The results grid — may come back "Success. No rows returned", because the
--      Supabase SQL editor returns only the LAST statement's rows and the last
--      statement here must stay ROLLBACK. That is not a failure; it is why
--      channel 1 exists.
--
--   If you got ANY output at all, every assertion passed — a failure aborts the
--   whole DO block, before either channel, naming the scenario. Silence plus an
--   error = fail; verdict lines = pass.
--
-- ── DATE-SENSITIVE SCENARIOS ─────────────────────────────────────────────────
--   S2/S3 need room before today for a period to END inside this month (today on
--   or after the 3rd); S1/S3 need room after today for one to START inside it
--   (today at most month-end minus 2). When there is no room the scenario logs
--   SKIPPED rather than failing — the same convention as migrate_28's dry run.
--   Nothing is skipped in the middle of a month.
-- =============================================================================
BEGIN;

CREATE TEMP TABLE dryrun_log (
  seq       int,
  scenario  text,
  created   boolean,
  window_   text,
  clipped   text,
  neighbour text,
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
  v_hub         uuid;
  v_prev        uuid;
  v_future      uuid;
  v_res         jsonb;
  v_today       date := (now() AT TIME ZONE 'UTC')::date;
  v_m_start     date := date_trunc('month', (now() AT TIME ZONE 'UTC')::date)::date;
  v_m_end       date := (date_trunc('month', (now() AT TIME ZONE 'UTC')::date) + interval '1 month - 1 day')::date;
  v_prev_start  date;
  v_prev_end    date;
  v_fut_start   date;
  v_fut_end     date;
  v_cut         date;
  v_room_before boolean;
  v_room_after  boolean;
  v_n           int;
  v_row         record;
BEGIN
  -- ── Owner: an auth user with NO subscriptions row, so hub_tier() resolves
  --    'free' deterministically. Nothing about this user is modified — we only own
  --    throwaway hubs with their id, and those are rolled back.
  SELECT u.id INTO v_owner
  FROM auth.users u
  WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.deleted_at IS NULL)
  ORDER BY u.created_at
  LIMIT 1;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'no test account available: every auth.users row has a subscriptions row';
  END IF;

  -- auth.uid() inside the RPC reads this claim. Transaction-local (third arg true).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);

  v_prev_start  := (v_m_start - interval '1 month')::date;
  v_prev_end    := (v_m_start - interval '1 day')::date;
  v_fut_start   := v_today + 2;                 -- starts inside this month, after today
  v_fut_end     := v_today + 32;                -- …and runs into next month ("18 Sep – 18 Oct")
  v_cut         := v_today - 2;                 -- an earlier period ends here, inside this month
  v_room_before := v_cut >= v_m_start;          -- S2/S3 need a day before today, inside the month
  v_room_after  := v_fut_start <= v_m_end;      -- S1/S3 need a day after today, inside the month

  RAISE NOTICE 'dry run as user %  (today = %, month = % → %)', v_owner, v_today, v_m_start, v_m_end;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- S1 — CLIPPED END. The headline case: a later period already exists.
  --      prev = all of last month; future = today+2 → today+32.
  --      Expected window: month start → the day before the future period.
  -- ═══════════════════════════════════════════════════════════════════════════
  IF NOT v_room_after THEN
    INSERT INTO dryrun_log VALUES (1, 'clipped end (later period exists)', NULL, NULL, NULL, NULL,
      'SKIPPED: today is too close to month end to place a future period inside this month');
  ELSE
    v_hub    := pg_temp.mk_hub(v_owner, 'S1 clipped end');
    v_prev   := pg_temp.mk_cycle(v_hub, v_prev_start, v_prev_end);
    v_future := pg_temp.mk_cycle(v_hub, v_fut_start,  v_fut_end);

    -- A populated source period, so S7 can prove carry-forward still works.
    INSERT INTO budget_categories (budget_centre_id, name, icon, budget_amount, month, is_fixed, sort_order, cycle_id)
    VALUES (v_hub, 'Rent',      '🏠', 1200.00, to_char(v_prev_start,'YYYY-MM'), true,  0, v_prev),
           (v_hub, 'Groceries', '🛒',  850.50, to_char(v_prev_start,'YYYY-MM'), false, 1, v_prev);

    INSERT INTO income_sources (budget_centre_id, label, icon, expected_amount, currency, pay_day,
                                pay_day_type, notes, received, received_amount, actual_pay_date, month, cycle_id)
    VALUES (v_hub, 'Salary', '💰', 4000.00, 'GHS', 25, 'fixed_date', 'main', true, 3980.00, v_prev_end,
            to_char(v_prev_start,'YYYY-MM'), v_prev);

    v_res := ensure_current_budget_period(v_hub);

    IF (v_res->>'created')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'S1 FAIL: created is % (expected true)', v_res->>'created'; END IF;

    -- The window itself — unchanged from migrate_28: clipped to the day before the
    -- next period, and NOT clipped at the start (last month's period ended on the 31st).
    IF (v_res->>'start_date')::date <> v_m_start        THEN RAISE EXCEPTION 'S1 FAIL: start is % (expected %)', v_res->>'start_date', v_m_start; END IF;
    IF (v_res->>'end_date')::date   <> v_fut_start - 1  THEN RAISE EXCEPTION 'S1 FAIL: end is % (expected %)',   v_res->>'end_date',   v_fut_start - 1; END IF;

    -- THE NEW FACTS.
    IF (v_res->>'clipped_end')::boolean   IS NOT TRUE  THEN RAISE EXCEPTION 'S1 FAIL: clipped_end is % (expected true)',   v_res->>'clipped_end'; END IF;
    IF (v_res->>'clipped_start')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'S1 FAIL: clipped_start is % (expected false)', v_res->>'clipped_start'; END IF;

    -- The later period, named in full — this is what the message renders.
    IF (v_res->>'next_start')::date <> v_fut_start THEN RAISE EXCEPTION 'S1 FAIL: next_start is % (expected %)', v_res->>'next_start', v_fut_start; END IF;
    IF (v_res->>'next_end')::date   <> v_fut_end   THEN RAISE EXCEPTION 'S1 FAIL: next_end is % (expected %)',   v_res->>'next_end',   v_fut_end;   END IF;

    -- The previous period is reported too, even though it clipped nothing.
    IF (v_res->>'prev_start')::date <> v_prev_start THEN RAISE EXCEPTION 'S1 FAIL: prev_start is % (expected %)', v_res->>'prev_start', v_prev_start; END IF;
    IF (v_res->>'prev_end')::date   <> v_prev_end   THEN RAISE EXCEPTION 'S1 FAIL: prev_end is % (expected %)',   v_res->>'prev_end',   v_prev_end;   END IF;

    INSERT INTO dryrun_log VALUES (1, 'clipped end (later period exists)', true,
      (v_res->>'start_date') || ' → ' || (v_res->>'end_date'), 'end',
      (v_res->>'next_start') || ' → ' || (v_res->>'next_end'),
      'the receipt can say: you already have a later period');

    -- ═══ S7 — NO LOGIC CHANGE, on this same hub. Carry-forward still ran, and
    --     receipts still did NOT carry. (Asserted here because S1 is the only
    --     fixture with a populated source period.)
    IF (v_res->>'categories_carried')::int <> 2 THEN RAISE EXCEPTION 'S7 FAIL: categories_carried is % (expected 2)', v_res->>'categories_carried'; END IF;
    IF (v_res->>'income_carried')::int     <> 1 THEN RAISE EXCEPTION 'S7 FAIL: income_carried is % (expected 1)',     v_res->>'income_carried'; END IF;
    IF (v_res->>'source_cycle_id')::uuid   <> v_prev THEN RAISE EXCEPTION 'S7 FAIL: source is % (expected the previous period)', v_res->>'source_cycle_id'; END IF;
    IF  v_res->>'name' <> cycle_majority_name(v_m_start, v_fut_start - 1)
      THEN RAISE EXCEPTION 'S7 FAIL: name is % (expected %)', v_res->>'name', cycle_majority_name(v_m_start, v_fut_start - 1); END IF;

    SELECT count(*) INTO v_n FROM income_sources
     WHERE cycle_id = (v_res->>'cycle_id')::uuid AND deleted_at IS NULL
       AND (received IS TRUE OR received_amount <> 0 OR actual_pay_date IS NOT NULL);
    IF v_n <> 0 THEN RAISE EXCEPTION 'S7 FAIL: % carried income rows arrived already received — a new period must start unpaid', v_n; END IF;

    SELECT count(*) INTO v_n FROM budget_cycles
     WHERE budget_centre_id = v_hub AND deleted_at IS NULL AND v_today BETWEEN start_date AND end_date;
    IF v_n <> 1 THEN RAISE EXCEPTION 'S7 FAIL: % live periods cover today (expected exactly 1)', v_n; END IF;

    INSERT INTO dryrun_log VALUES (7, 'no logic change: plan carried, receipts not', true,
      (v_res->>'start_date') || ' → ' || (v_res->>'end_date'), 'end',
      (v_res->>'categories_carried') || ' cats, ' || (v_res->>'income_carried') || ' income',
      'carry-forward + unpaid-start + one period covers today, exactly as migrate_28');
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- S2 — CLIPPED START. An earlier period ends INSIDE this month, before today.
  --      Expected window: the day after it → month end.
  -- ═══════════════════════════════════════════════════════════════════════════
  IF NOT v_room_before THEN
    INSERT INTO dryrun_log VALUES (2, 'clipped start (earlier period in month)', NULL, NULL, NULL, NULL,
      'SKIPPED: today is too early in the month for a period to end before it');
  ELSE
    v_hub  := pg_temp.mk_hub(v_owner, 'S2 clipped start');
    v_prev := pg_temp.mk_cycle(v_hub, v_m_start, v_cut);

    -- One category, to prove carry-forward still resolves on a hub that now has TWO
    -- live periods starting in the same month — the shape migrate_29 made ambiguous
    -- for month-keyed writes. It works because the carry-forward stamps cycle_id
    -- explicitly, so resolve_cycle_id() short-circuits and never sees the month.
    INSERT INTO budget_categories (budget_centre_id, name, icon, budget_amount, month, is_fixed, sort_order, cycle_id)
    VALUES (v_hub, 'Transport', '🚌', 200.00, to_char(v_m_start,'YYYY-MM'), false, 0, v_prev);

    v_res := ensure_current_budget_period(v_hub);

    IF (v_res->>'created')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'S2 FAIL: created is % (expected true)', v_res->>'created'; END IF;
    IF (v_res->>'start_date')::date <> v_cut + 1 THEN RAISE EXCEPTION 'S2 FAIL: start is % (expected %)', v_res->>'start_date', v_cut + 1; END IF;
    IF (v_res->>'end_date')::date   <> v_m_end   THEN RAISE EXCEPTION 'S2 FAIL: end is % (expected %)',   v_res->>'end_date',   v_m_end; END IF;

    IF (v_res->>'clipped_start')::boolean IS NOT TRUE  THEN RAISE EXCEPTION 'S2 FAIL: clipped_start is % (expected true)',  v_res->>'clipped_start'; END IF;
    IF (v_res->>'clipped_end')::boolean   IS NOT FALSE THEN RAISE EXCEPTION 'S2 FAIL: clipped_end is % (expected false)',   v_res->>'clipped_end'; END IF;

    IF (v_res->>'prev_start')::date <> v_m_start THEN RAISE EXCEPTION 'S2 FAIL: prev_start is % (expected %)', v_res->>'prev_start', v_m_start; END IF;
    IF (v_res->>'prev_end')::date   <> v_cut     THEN RAISE EXCEPTION 'S2 FAIL: prev_end is % (expected %)',   v_res->>'prev_end',   v_cut; END IF;
    IF  v_res->>'next_start' IS NOT NULL THEN RAISE EXCEPTION 'S2 FAIL: next_start is % (expected null — no later period)', v_res->>'next_start'; END IF;
    IF  v_res->>'next_end'   IS NOT NULL THEN RAISE EXCEPTION 'S2 FAIL: next_end is % (expected null — no later period)',   v_res->>'next_end'; END IF;

    IF (v_res->>'categories_carried')::int <> 1
      THEN RAISE EXCEPTION 'S2 FAIL: categories_carried is % (expected 1) — carry-forward broke on a two-same-month hub', v_res->>'categories_carried'; END IF;

    INSERT INTO dryrun_log VALUES (2, 'clipped start (earlier period in month)', true,
      (v_res->>'start_date') || ' → ' || (v_res->>'end_date'), 'start',
      (v_res->>'prev_start') || ' → ' || (v_res->>'prev_end'),
      'carry-forward still fine with two live periods starting in the same month');
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- S3 — CLIPPED AT BOTH ENDS. Squeezed between two periods inside one month.
  -- ═══════════════════════════════════════════════════════════════════════════
  IF NOT (v_room_before AND v_room_after) THEN
    INSERT INTO dryrun_log VALUES (3, 'clipped both ends', NULL, NULL, NULL, NULL,
      'SKIPPED: today lacks room on one side to place a neighbouring period in this month');
  ELSE
    v_hub    := pg_temp.mk_hub(v_owner, 'S3 clipped both');
    v_prev   := pg_temp.mk_cycle(v_hub, v_m_start,  v_cut);
    v_future := pg_temp.mk_cycle(v_hub, v_fut_start, v_fut_end);

    v_res := ensure_current_budget_period(v_hub);

    IF (v_res->>'created')::boolean IS NOT TRUE       THEN RAISE EXCEPTION 'S3 FAIL: created is % (expected true)', v_res->>'created'; END IF;
    IF (v_res->>'start_date')::date <> v_cut + 1      THEN RAISE EXCEPTION 'S3 FAIL: start is % (expected %)', v_res->>'start_date', v_cut + 1; END IF;
    IF (v_res->>'end_date')::date   <> v_fut_start - 1 THEN RAISE EXCEPTION 'S3 FAIL: end is % (expected %)',  v_res->>'end_date',   v_fut_start - 1; END IF;

    IF (v_res->>'clipped_start')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'S3 FAIL: clipped_start is % (expected true)', v_res->>'clipped_start'; END IF;
    IF (v_res->>'clipped_end')::boolean   IS NOT TRUE THEN RAISE EXCEPTION 'S3 FAIL: clipped_end is % (expected true)',   v_res->>'clipped_end'; END IF;

    IF (v_res->>'prev_end')::date   <> v_cut       THEN RAISE EXCEPTION 'S3 FAIL: prev_end is % (expected %)',   v_res->>'prev_end',   v_cut; END IF;
    IF (v_res->>'next_start')::date <> v_fut_start THEN RAISE EXCEPTION 'S3 FAIL: next_start is % (expected %)', v_res->>'next_start', v_fut_start; END IF;
    IF (v_res->>'next_end')::date   <> v_fut_end   THEN RAISE EXCEPTION 'S3 FAIL: next_end is % (expected %)',   v_res->>'next_end',   v_fut_end; END IF;

    INSERT INTO dryrun_log VALUES (3, 'clipped both ends', true,
      (v_res->>'start_date') || ' → ' || (v_res->>'end_date'), 'start + end',
      'prev ends ' || (v_res->>'prev_end') || ', next starts ' || (v_res->>'next_start'),
      'both neighbours reported, both flags true');
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- S4 — NOT CLIPPED, BUT A NEIGHBOUR EXISTS. The trap this migration can fall
  --      into: prev_start/prev_end are populated (last month's period) while
  --      clipped_start MUST stay false. A client that renders on the presence of
  --      the dates rather than the flag claims a full month was shortened.
  -- ═══════════════════════════════════════════════════════════════════════════
  v_hub  := pg_temp.mk_hub(v_owner, 'S4 unclipped');
  v_prev := pg_temp.mk_cycle(v_hub, v_prev_start, v_prev_end);

  v_res := ensure_current_budget_period(v_hub);

  IF (v_res->>'created')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'S4 FAIL: created is % (expected true)', v_res->>'created'; END IF;
  IF (v_res->>'start_date')::date <> v_m_start THEN RAISE EXCEPTION 'S4 FAIL: start is % (expected the 1st, %)', v_res->>'start_date', v_m_start; END IF;
  IF (v_res->>'end_date')::date   <> v_m_end   THEN RAISE EXCEPTION 'S4 FAIL: end is % (expected month end, %)', v_res->>'end_date',   v_m_end; END IF;

  IF (v_res->>'clipped_start')::boolean IS NOT FALSE
    THEN RAISE EXCEPTION 'S4 FAIL: clipped_start is % — a neighbour that ended LAST month clips nothing', v_res->>'clipped_start'; END IF;
  IF (v_res->>'clipped_end')::boolean IS NOT FALSE
    THEN RAISE EXCEPTION 'S4 FAIL: clipped_end is % (expected false)', v_res->>'clipped_end'; END IF;

  -- …and yet the neighbour IS reported. Dates present, flag false: read the flag.
  IF (v_res->>'prev_start')::date <> v_prev_start THEN RAISE EXCEPTION 'S4 FAIL: prev_start is % (expected %)', v_res->>'prev_start', v_prev_start; END IF;
  IF (v_res->>'prev_end')::date   <> v_prev_end   THEN RAISE EXCEPTION 'S4 FAIL: prev_end is % (expected %)',   v_res->>'prev_end',   v_prev_end; END IF;
  IF  v_res->>'next_start' IS NOT NULL THEN RAISE EXCEPTION 'S4 FAIL: next_start is % (expected null)', v_res->>'next_start'; END IF;

  INSERT INTO dryrun_log VALUES (4, 'neighbour exists but does NOT clip', true,
    (v_res->>'start_date') || ' → ' || (v_res->>'end_date'), 'neither',
    (v_res->>'prev_start') || ' → ' || (v_res->>'prev_end'),
    'dates reported, both flags false — the client must read the FLAG');

  -- ═══════════════════════════════════════════════════════════════════════════
  -- S5 — ALREADY COVERED. Second call on the S4 hub: created=false, and the
  --      receipt fields are inert because this call computed no window.
  -- ═══════════════════════════════════════════════════════════════════════════
  v_res := ensure_current_budget_period(v_hub);

  IF (v_res->>'created')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'S5 FAIL: created is % (expected false — idempotency)', v_res->>'created'; END IF;
  IF (v_res->>'clipped_start')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'S5 FAIL: clipped_start is % (expected false)', v_res->>'clipped_start'; END IF;
  IF (v_res->>'clipped_end')::boolean   IS NOT FALSE THEN RAISE EXCEPTION 'S5 FAIL: clipped_end is % (expected false)',   v_res->>'clipped_end'; END IF;
  IF  v_res->>'prev_start' IS NOT NULL THEN RAISE EXCEPTION 'S5 FAIL: prev_start is % (expected null on a not-created return)', v_res->>'prev_start'; END IF;
  IF  v_res->>'prev_end'   IS NOT NULL THEN RAISE EXCEPTION 'S5 FAIL: prev_end is % (expected null on a not-created return)',   v_res->>'prev_end'; END IF;
  IF  v_res->>'next_start' IS NOT NULL THEN RAISE EXCEPTION 'S5 FAIL: next_start is % (expected null on a not-created return)', v_res->>'next_start'; END IF;
  IF  v_res->>'next_end'   IS NOT NULL THEN RAISE EXCEPTION 'S5 FAIL: next_end is % (expected null on a not-created return)',   v_res->>'next_end'; END IF;

  -- Still idempotent: the second call wrote nothing.
  SELECT count(*) INTO v_n FROM budget_cycles WHERE budget_centre_id = v_hub AND deleted_at IS NULL;
  IF v_n <> 2 THEN RAISE EXCEPTION 'S5 FAIL: hub has % live periods (expected 2 — the second call must write nothing)', v_n; END IF;

  INSERT INTO dryrun_log VALUES (5, 'already covered (created=false)', false,
    (v_res->>'start_date') || ' → ' || (v_res->>'end_date'), 'neither',
    'all four dates null',
    'no window computed, so nothing to describe — and nothing written');

  -- ═══════════════════════════════════════════════════════════════════════════
  -- S6 — VIRGIN HUB. No periods at all: full calendar month, no neighbours.
  -- ═══════════════════════════════════════════════════════════════════════════
  v_hub := pg_temp.mk_hub(v_owner, 'S6 virgin');

  v_res := ensure_current_budget_period(v_hub);

  IF (v_res->>'created')::boolean IS NOT TRUE  THEN RAISE EXCEPTION 'S6 FAIL: created is % (expected true)', v_res->>'created'; END IF;
  IF (v_res->>'start_date')::date <> v_m_start THEN RAISE EXCEPTION 'S6 FAIL: start is % (expected %)', v_res->>'start_date', v_m_start; END IF;
  IF (v_res->>'end_date')::date   <> v_m_end   THEN RAISE EXCEPTION 'S6 FAIL: end is % (expected %)',   v_res->>'end_date',   v_m_end; END IF;
  IF (v_res->>'clipped_start')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'S6 FAIL: clipped_start is % (expected false)', v_res->>'clipped_start'; END IF;
  IF (v_res->>'clipped_end')::boolean   IS NOT FALSE THEN RAISE EXCEPTION 'S6 FAIL: clipped_end is % (expected false)',   v_res->>'clipped_end'; END IF;
  IF  v_res->>'prev_start'      IS NOT NULL THEN RAISE EXCEPTION 'S6 FAIL: prev_start is % (expected null)', v_res->>'prev_start'; END IF;
  IF  v_res->>'next_start'      IS NOT NULL THEN RAISE EXCEPTION 'S6 FAIL: next_start is % (expected null)', v_res->>'next_start'; END IF;
  IF  v_res->>'source_cycle_id' IS NOT NULL THEN RAISE EXCEPTION 'S6 FAIL: source_cycle_id is % (expected null — nothing to carry)', v_res->>'source_cycle_id'; END IF;
  IF (v_res->>'categories_carried')::int <> 0 THEN RAISE EXCEPTION 'S6 FAIL: categories_carried is % (expected 0)', v_res->>'categories_carried'; END IF;

  INSERT INTO dryrun_log VALUES (6, 'virgin hub, no periods at all', true,
    (v_res->>'start_date') || ' → ' || (v_res->>'end_date'), 'neither',
    'no neighbours', 'full calendar month, nothing to carry, nothing to explain');

  -- ── Footer row: every throwaway hub this file built, all inside the transaction
  --    about to be discarded. Folded in here so the dryrun_log SELECT can be the
  --    LAST statement before ROLLBACK rather than being overwritten by it.
  SELECT count(*) INTO v_n FROM budget_centres WHERE name LIKE 'DRYRUN %';
  INSERT INTO dryrun_log VALUES (8, 'throwaway hubs built by this run', NULL, NULL, NULL, NULL,
    v_n || ' DRYRUN hubs exist inside this transaction — the ROLLBACK below erases every one');

  -- ── Echo the whole log to the NOTICES panel (the guaranteed-visible channel).
  RAISE NOTICE '════════════════════════════════════════════════════════════════════════';
  RAISE NOTICE '  clipped-period receipt — DRY RUN VERDICTS  (today = %)', v_today;
  RAISE NOTICE '════════════════════════════════════════════════════════════════════════';
  FOR v_row IN SELECT * FROM dryrun_log ORDER BY seq LOOP
    RAISE NOTICE '%  %  %  %',
      rpad('S' || v_row.seq::text, 4),
      rpad(CASE WHEN v_row.seq >= 8                THEN 'INFO'
                WHEN v_row.note LIKE 'SKIPPED%'    THEN 'SKIP'
                ELSE 'PASS' END, 4),
      rpad(v_row.scenario, 42),
      COALESCE(v_row.note, '');
    IF v_row.window_ IS NOT NULL THEN
      RAISE NOTICE '            created=%  window=%  clipped=%  neighbour=%',
        COALESCE(v_row.created::text, '—'), v_row.window_, v_row.clipped, COALESCE(v_row.neighbour, '—');
    END IF;
  END LOOP;
  RAISE NOTICE '════════════════════════════════════════════════════════════════════════';
  RAISE NOTICE 'ALL SCENARIOS PASSED — nothing committed.';
END $$;

SELECT * FROM dryrun_log ORDER BY seq;

-- ⚠️  MUST STAY THE LAST STATEMENT. Everything above is discarded here.
ROLLBACK;
