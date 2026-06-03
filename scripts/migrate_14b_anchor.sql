-- =============================================================================
-- migrate_14b_anchor.sql
--
-- Commit 14b of the Budget Cycles project — anchor types (custom / payday-anchored
-- cycles). ZERO behaviour change for existing hubs: cycle_anchor_type defaults to
-- 'calendar', which reproduces the calendar-month cycles every hub already has.
--
-- WHAT THIS ADDS
--   1. budget_centres.cycle_anchor_type   — 'calendar' | 'fixed_day' |
--                                            'last_working_day' | 'last_day_of_month'
--      budget_centres.cycle_anchor_day    — 1..31, present IFF cycle_anchor_type='fixed_day'
--   2. cycle_anchored_day()  — pure helper: the anchored boundary date for a month
--   3. cycle_majority_name() — pure helper: majority-month display name (server twin
--                              of lib/cycles.js cycleDefaultName; tie → later month)
--   4. create_cycle_by_anchor() — SECURITY DEFINER replacement for
--                              create_calendar_cycle. Computes the cycle range
--                              CONTAINING a reference date from the hub anchor,
--                              forward-only clamps to the latest cycle's end+1 (M1),
--                              maps the hub anchor vocabulary to the cycle row's
--                              3-value anchor_type CHECK, and traps overlap → CYC01.
--   5. DROP create_calendar_cycle() — its single caller (useFinance auto-create) is
--                              migrated to create_cycle_by_anchor in this commit.
--
-- ANCHOR VOCABULARY MAPPING (CLAUDE.md decision 9/16; see 14b engineering entry)
--   The hub stores the user-facing anchor (4 values). The budget_cycles row keeps
--   its existing CHECK (anchor_type IN ('calendar','payday','custom')) UNCHANGED:
--     calendar           → cycle anchor_type 'calendar'
--     fixed_day          → cycle anchor_type 'custom'
--     last_working_day   → cycle anchor_type 'custom'
--     last_day_of_month  → cycle anchor_type 'custom'
--   The cycle row's anchor_day stays NULL for every 14b cycle (the existing
--   "(anchor_type='payday') = (anchor_day IS NOT NULL)" CHECK then holds trivially).
--   The 'payday' cycle value is reserved/unused — the real anchor day lives on
--   budget_centres.cycle_anchor_day. We map at the boundary rather than widen the
--   cycle CHECK; widen later only if per-cycle granularity becomes load-bearing.
--
-- REFERENCE DATE (CLAUDE.md decision 11)
--   create_cycle_by_anchor builds the cycle that CONTAINS p_reference_date. Callers
--   pass prev_cycle.end_date + 1 (auto-create / anchor change), or today for the
--   very first cycle of a hub. The forward-only clamp guarantees the new cycle never
--   reaches back over an existing one (GiST no-overlap constraint preserved).
--
-- Run this entire file in the Supabase SQL editor in one go. Safe to re-run.
-- Validate manually after running (substitute a centre you belong to):
--   SELECT * FROM create_cycle_by_anchor('<centre>'::uuid, 'fixed_day', 25::smallint, '2026-07-10', NULL);
--   SELECT cycle_anchored_day('last_working_day', NULL, '2026-02-15');   -- expect 2026-02-27 (Fri)
--   SELECT cycle_majority_name('2026-05-29', '2026-06-28');               -- expect 'June 2026'
-- =============================================================================

BEGIN;

-- 1. Hub anchor columns. Default 'calendar' = today's behaviour, so existing hubs
--    are untouched and the no-overlap invariant continues to hold.
ALTER TABLE budget_centres
  ADD COLUMN IF NOT EXISTS cycle_anchor_type text NOT NULL DEFAULT 'calendar';
ALTER TABLE budget_centres
  ADD COLUMN IF NOT EXISTS cycle_anchor_day smallint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_centres_cycle_anchor_type_chk') THEN
    ALTER TABLE budget_centres ADD CONSTRAINT budget_centres_cycle_anchor_type_chk
      CHECK (cycle_anchor_type IN ('calendar', 'fixed_day', 'last_working_day', 'last_day_of_month'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_centres_cycle_anchor_day_chk') THEN
    -- anchor_day is present IFF the hub is fixed_day, and within 1..31 when present.
    ALTER TABLE budget_centres ADD CONSTRAINT budget_centres_cycle_anchor_day_chk
      CHECK (
        ((cycle_anchor_type = 'fixed_day') = (cycle_anchor_day IS NOT NULL))
        AND (cycle_anchor_day IS NULL OR (cycle_anchor_day BETWEEN 1 AND 31))
      );
  END IF;
END $$;

-- 2. Pure helper — the anchored boundary date for the month containing p_in_month.
--    'calendar' anchors to the 1st; the other three anchor to a month-end-ish day.
--    fixed_day clamps to the month length (day 31 → Feb 28/29). last_working_day
--    walks back off Sat/Sun (isodow 6/7). No holiday calendar in v1 (decision 12).
CREATE OR REPLACE FUNCTION cycle_anchored_day(
  p_anchor_type text,
  p_anchor_day  smallint,
  p_in_month    date
) RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_first date := date_trunc('month', p_in_month)::date;
  v_last  date := (date_trunc('month', p_in_month) + interval '1 month' - interval '1 day')::date;
  v_dim   int  := extract(day from v_last)::int;
  v_d     date;
BEGIN
  IF p_anchor_type = 'calendar' THEN
    RETURN v_first;
  ELSIF p_anchor_type = 'fixed_day' THEN
    RETURN make_date(extract(year from v_first)::int, extract(month from v_first)::int, LEAST(p_anchor_day::int, v_dim));
  ELSIF p_anchor_type = 'last_day_of_month' THEN
    RETURN v_last;
  ELSIF p_anchor_type = 'last_working_day' THEN
    v_d := v_last;
    WHILE extract(isodow from v_d) > 5 LOOP   -- 6 = Sat, 7 = Sun
      v_d := v_d - 1;
    END LOOP;
    RETURN v_d;
  ELSE
    RAISE EXCEPTION 'Unknown anchor type: %', p_anchor_type;
  END IF;
END;
$$;

-- 3. Pure helper — majority-month display name. Counts days per calendar month in
--    [p_start, p_end]; the month with the most days wins, ties broken toward the
--    LATER month (>= in the comparison). Server twin of lib/cycles.js cycleDefaultName.
CREATE OR REPLACE FUNCTION cycle_majority_name(p_start date, p_end date)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_month      date := date_trunc('month', p_start)::date;
  v_best_month date;
  v_best_count int  := -1;
  v_seg_start  date;
  v_seg_end    date;
  v_count      int;
BEGIN
  WHILE v_month <= p_end LOOP
    v_seg_start := GREATEST(p_start, v_month);
    v_seg_end   := LEAST(p_end, (v_month + interval '1 month' - interval '1 day')::date);
    v_count     := (v_seg_end - v_seg_start) + 1;
    IF v_count >= v_best_count THEN   -- >= → later month wins on a tie
      v_best_count := v_count;
      v_best_month := v_month;
    END IF;
    v_month := (v_month + interval '1 month')::date;
  END LOOP;
  RETURN to_char(v_best_month, 'FMMonth YYYY');   -- matches lib/dates.formatMonth ('June 2026')
END;
$$;

-- 4. The anchor-aware cycle creator. Replaces create_calendar_cycle.
--    Authorizes the caller as an active member (same gate as create_calendar_cycle),
--    computes the range CONTAINING p_reference_date, forward-only clamps, maps the
--    anchor vocabulary, and inserts. p_name is the client-computed cycleDefaultName;
--    NULL falls back to the server twin.
CREATE OR REPLACE FUNCTION create_cycle_by_anchor(
  p_centre_id      uuid,
  p_anchor_type    text,
  p_anchor_day     smallint,
  p_reference_date date,
  p_name           text DEFAULT NULL
) RETURNS budget_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start      date;
  v_end        date;
  v_cand       date;
  v_prev_end   date;
  v_cyc_anchor text;
  v_name       text;
  v_cycle      budget_cycles;
BEGIN
  -- 4a. Authorize: caller must be an active member of the centre.
  IF NOT EXISTS (
    SELECT 1 FROM budget_centre_members
    WHERE budget_centre_id = p_centre_id
      AND user_id          = auth.uid()
      AND deleted_at       IS NULL
  ) THEN
    RAISE EXCEPTION 'User is not a member of this centre' USING ERRCODE = '42501';
  END IF;

  -- 4b. Validate the anchor (defence-in-depth; the service + DB CHECK also guard).
  IF p_anchor_type NOT IN ('calendar', 'fixed_day', 'last_working_day', 'last_day_of_month') THEN
    RAISE EXCEPTION 'Invalid anchor type: %', p_anchor_type;
  END IF;
  IF p_anchor_type = 'fixed_day' AND (p_anchor_day IS NULL OR p_anchor_day < 1 OR p_anchor_day > 31) THEN
    RAISE EXCEPTION 'fixed_day anchor requires anchor_day between 1 and 31';
  END IF;
  IF p_reference_date IS NULL THEN
    RAISE EXCEPTION 'reference_date is required';
  END IF;

  -- 4c. Compute the cycle range that CONTAINS the reference date.
  IF p_anchor_type = 'calendar' THEN
    v_start := date_trunc('month', p_reference_date)::date;
    v_end   := (v_start + interval '1 month' - interval '1 day')::date;
  ELSE
    -- Start-anchored: the cycle runs from one month's anchor to the day before the
    -- next month's anchor. Pick the window the reference date falls in.
    v_cand := cycle_anchored_day(p_anchor_type, p_anchor_day, p_reference_date);
    IF p_reference_date >= v_cand THEN
      v_start := v_cand;
      v_end   := cycle_anchored_day(p_anchor_type, p_anchor_day, (p_reference_date + interval '1 month')::date) - 1;
    ELSE
      v_start := cycle_anchored_day(p_anchor_type, p_anchor_day, (p_reference_date - interval '1 month')::date);
      v_end   := v_cand - 1;
    END IF;
  END IF;

  -- 4d. Forward-only clamp (M1): never reach back over an existing cycle.
  SELECT max(end_date) INTO v_prev_end
  FROM budget_cycles
  WHERE budget_centre_id = p_centre_id AND deleted_at IS NULL;

  IF v_prev_end IS NOT NULL AND v_start <= v_prev_end THEN
    v_start := v_prev_end + 1;
  END IF;

  IF v_start > v_end THEN
    RAISE EXCEPTION 'Computed cycle range is empty after clamp (start % > end %)', v_start, v_end
      USING ERRCODE = 'CYC03';
  END IF;

  -- 4e. Map hub anchor → cycle-row anchor vocabulary; cycle anchor_day stays NULL.
  v_cyc_anchor := CASE WHEN p_anchor_type = 'calendar' THEN 'calendar' ELSE 'custom' END;

  -- 4f. Name: prefer the client-computed cycleDefaultName, else the server twin.
  v_name := COALESCE(NULLIF(btrim(p_name), ''), cycle_majority_name(v_start, v_end));

  -- 4g. Insert. The GiST exclusion constraint enforces no-overlap; trap it and
  --     re-raise a friendly, machine-detectable error (custom SQLSTATE CYC01).
  BEGIN
    INSERT INTO budget_cycles (budget_centre_id, name, start_date, end_date, anchor_type)
    VALUES (p_centre_id, v_name, v_start, v_end, v_cyc_anchor)
    RETURNING * INTO v_cycle;
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'A cycle overlapping % already exists in this hub', v_start
        USING ERRCODE = 'CYC01';
  END;

  RETURN v_cycle;
END;
$$;

-- Any authenticated user may call it; the in-function auth.uid() check is the gate.
GRANT EXECUTE ON FUNCTION create_cycle_by_anchor(uuid, text, smallint, date, text) TO authenticated;

-- 5. Remove the superseded calendar-only creator (single caller migrated this commit).
DROP FUNCTION IF EXISTS create_calendar_cycle(uuid, text);

COMMIT;

-- =============================================================================
-- 6. Verification queries — run after COMMIT to confirm the migration landed.
-- =============================================================================
-- Expect: cycle_anchor_type (NOT NULL, default 'calendar') + cycle_anchor_day on budget_centres.
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'budget_centres' AND column_name LIKE 'cycle_anchor%';
--
-- Expect: the two new CHECK constraints present.
--   SELECT conname FROM pg_constraint
--   WHERE conname IN ('budget_centres_cycle_anchor_type_chk', 'budget_centres_cycle_anchor_day_chk');
--
-- Expect: create_cycle_by_anchor present, create_calendar_cycle gone.
--   SELECT proname FROM pg_proc WHERE proname IN ('create_cycle_by_anchor', 'create_calendar_cycle');
--
-- Expect: helper parity with the JS twins.
--   SELECT cycle_anchored_day('fixed_day', 31::smallint, '2026-02-10');   -- 2026-02-28
--   SELECT cycle_anchored_day('last_working_day', NULL, '2026-05-15');    -- 2026-05-29 (Fri)
--   SELECT cycle_majority_name('2026-05-29', '2026-06-28');                -- 'June 2026'
-- =============================================================================
