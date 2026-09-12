-- =============================================================================
-- migrate_30_clipped_period_receipt.sql
--
-- THE CLIPPED-PERIOD RECEIPT. ensure_current_budget_period (migrate_28) already
-- clips the auto-continued period to the free gap around today. It has never said
-- SO. A user whose hub carries a future period opens the app on 12 September, gets
-- "September 1–17", and has no way to learn why it stopped on the 17th. The period
-- is correct; the silence is the bug.
--
-- This migration adds the facts the client needs to explain it:
--
--     "September 1–17 created — you already have a later period (18 Sep – 18 Oct)"
--
-- ── NO LOGIC CHANGE. THIS IS THE WHOLE POINT OF THE FILE ─────────────────────
--   The period this function creates is BYTE-FOR-BYTE what migrate_28 created:
--   same start_date, same end_date, same name, same carry-forward, same clamp,
--   same counts, same role gate, same advisory lock, same exclusion trap.
--   Six keys are ADDED to the returned jsonb. Nothing is removed, renamed or
--   recomputed.
--
--   Concretely, the clip arithmetic block is copied across UNTOUCHED:
--       v_start := greatest(v_month_start, COALESCE(v_prev_end   + 1, v_month_start));
--       v_end   := least   (v_month_end,   COALESCE(v_next_start - 1, v_month_end));
--   including the two aggregate SELECTs that feed it. The neighbour-row lookups
--   this migration needs are a SEPARATE, additive block placed after it (step 5a)
--   rather than a rewrite of those aggregates into row lookups. That duplication
--   is deliberate: it makes "the clip did not change" checkable by eye, which a
--   rewrite — however equivalent — would not. Two extra index lookups, once per
--   period created (i.e. about once per hub per month), is not a cost worth
--   trading correctness-by-inspection for.
--
-- ── THE SIX NEW KEYS ─────────────────────────────────────────────────────────
--   clipped_start  boolean   the period starts LATER than the 1st because an
--                            earlier period ends inside this month
--   clipped_end    boolean   the period ends EARLIER than the month end because a
--                            later period starts inside this month
--   prev_start     date|null \ the period immediately BEFORE today, whole range, so
--   prev_end       date|null / the message can name it
--   next_start     date|null \ the period immediately AFTER today, whole range —
--   next_end       date|null / this is the one the "you already have a later
--                              period (18 Sep – 18 Oct)" message reads
--
--   WHY WHOLE RANGES, NOT JUST THE BOUNDARY. migrate_28 only ever needed
--   max(end_date) and min(start_date) — one date each, enough to clip. A message
--   that names the neighbour needs BOTH of its dates ("18 Sep – 18 Oct"), so the
--   neighbour is fetched as a row. Naming it by id instead would push a second
--   round trip onto the client at exactly the moment it is trying to render one
--   sentence.
--
--   THE FLAGS ARE DERIVED FROM THE RESULT, NOT RE-DERIVED FROM THE INPUTS:
--       v_clip_start := v_start > v_month_start;
--       v_clip_end   := v_end   < v_month_end;
--   "the window came out shorter than the calendar month" is the exact thing the
--   user is being told, and reading it off the final bounds cannot drift from the
--   clip. Re-deriving it from v_prev_end / v_next_start would be a second
--   implementation of the same rule, free to disagree with the first.
--
--   A NEIGHBOUR CAN EXIST WITHOUT CLIPPING — a previous period that ended last
--   month sets prev_start/prev_end but leaves clipped_start false. The dates are
--   reported whenever the neighbour exists; the FLAGS say whether the neighbour
--   actually shortened anything. The client must read the flag, never the mere
--   presence of the dates. (PeriodSetupPrompt does exactly that.)
--
-- ── THE NOT-CREATED BRANCHES ─────────────────────────────────────────────────
--   Both created=false returns — "a period already covers today" (step 4) and the
--   exclusion_violation adoption (step 6) — report clipped_start=false,
--   clipped_end=false and all four dates NULL. Neither branch computed a window,
--   so it has no clipping to describe, and the period it returns was not made by
--   this call. The client already gates its receipt on created===true, so these
--   values are belt-and-braces: the payload cannot be misread even if it is.
--
-- ── WHAT THIS DOES NOT TOUCH ─────────────────────────────────────────────────
--   No table, no column, no index, no constraint, no trigger, no RLS policy.
--   No ACL: CREATE OR REPLACE preserves the existing grants, so migrate_28's
--   `GRANT EXECUTE … TO authenticated` carries over untouched and is NOT re-issued
--   here — the verify block ASSERTS it instead. (Per CLAUDE.md §9.6, this is one of
--   the caller-gated RPCs where an `authenticated` grant is correct and intended:
--   the in-function owner/full_access check is the real gate, not the ACL.)
--
-- ── COMPATIBILITY — SAFE TO APPLY BEFORE THE CLIENT SHIPS ────────────────────
--   Purely additive to a jsonb payload. The live client reads keys by name and
--   ignores unknown ones, so applying this file alone changes nothing a user can
--   see; the new keys simply sit unread until the client wiring deploys. That
--   matters here: this repo runs ONE shared Supabase project across dev, staging
--   and main, so this function goes live for every environment the moment it is
--   applied. Additive-only is what makes that safe.
--
-- DEPENDS ON: migrate_28 applied (this REPLACES the function it installed), plus
--   everything migrate_28 depends on — budget_cycles + no_overlapping_cycles GiST,
--   cycle_majority_name(date,date), hub_tier(uuid).
--
-- ⚠ THIS FILE REBUILDS ensure_current_budget_period() IN FULL, from migrate_28's
--   body. Only one file in this repo defines it, so there is no Commit-12-style
--   "rebuilt from the wrong body" hazard here (cf. migrate_29's warning) — but the
--   verify block still regression-asserts every load-bearing clause migrate_28 put
--   in (role gate, advisory lock, exclusion trap, CYC01, clip arithmetic, tier
--   clamp, receipt-free carry-forward), because a full-body rewrite is exactly the
--   change that can drop one silently.
--
-- IDEMPOTENT. CREATE OR REPLACE only; safe to re-run. Atomic — the verify block
--   RAISEs and rolls the whole transaction back on any miss.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   Re-run scripts/migrate_28_ensure_current_budget_period.sql. It restores the
--   11-key payload. Nothing written by this version needs undoing: the six new
--   keys are read-only facts about a period, never stored anywhere.
--
-- NEXT STEP after applying: scripts/migrate_30_clipped_period_receipt_dryrun.sql
--   (behavioural proof; ends in ROLLBACK and commits nothing).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION ensure_current_budget_period(
  p_centre_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today       date := (now() AT TIME ZONE 'UTC')::date;   -- matches client getToday()
  v_cycle       budget_cycles%ROWTYPE;
  v_month_start date;
  v_month_end   date;
  v_start       date;
  v_end         date;
  v_prev_end    date;
  v_next_start  date;
  -- migrate_30 — receipt facts only. Never read by the clip arithmetic below.
  v_prev        budget_cycles%ROWTYPE;
  v_next        budget_cycles%ROWTYPE;
  v_clip_start  boolean := false;
  v_clip_end    boolean := false;
  v_source      uuid;
  v_tier        text;
  v_cat_limit   int;
  v_inc_limit   int;
  v_cat_avail   int := 0;
  v_inc_avail   int := 0;
  v_cat_n       int := 0;
  v_inc_n       int := 0;
  v_new_month   text;
BEGIN
  -- 1. Resolve the hub. Must exist, be live and not archived — auto-creating
  --    periods inside an archived hub would resurrect it in every period list.
  IF NOT EXISTS (
    SELECT 1 FROM budget_centres
    WHERE id = p_centre_id AND deleted_at IS NULL AND is_archived IS FALSE
  ) THEN
    RAISE EXCEPTION 'Budget centre % not found, deleted or archived', p_centre_id;
  END IF;

  -- 2. Authorize: caller must be an active owner / full_access member of the centre.
  --    SECURITY DEFINER bypasses RLS, so this in-function check IS the write gate.
  IF NOT EXISTS (
    SELECT 1 FROM budget_centre_members
    WHERE budget_centre_id = p_centre_id
      AND user_id          = auth.uid()
      AND role             IN ('owner', 'full_access')
      AND deleted_at       IS NULL
  ) THEN
    RAISE EXCEPTION 'User is not an owner or full-access member of this centre'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Serialise concurrent ensure calls for this hub (two tabs, two devices, or
  --    the auto-fire racing the one-tap CTA). Transaction-scoped: auto-released at
  --    COMMIT/ROLLBACK. The loser blocks here, then finds the winner's row at 4.
  PERFORM pg_advisory_xact_lock(hashtext('ensure_current_budget_period:' || p_centre_id::text));

  -- 4. ALREADY COVERED → return it untouched. This is THE idempotency guarantee:
  --    no insert, no copy, created=false. Also the landing point for the racer at 6.
  SELECT * INTO v_cycle
    FROM budget_cycles
   WHERE budget_centre_id = p_centre_id
     AND deleted_at IS NULL
     AND v_today BETWEEN start_date AND end_date
   LIMIT 1;   -- the GiST constraint guarantees at most one live match

  IF FOUND THEN
    -- migrate_30: nothing was computed and nothing was created, so there is no
    -- clipping to describe. Flags false, neighbour dates NULL.
    RETURN jsonb_build_object(
      'cycle_id',           v_cycle.id,
      'name',               v_cycle.name,
      'start_date',         v_cycle.start_date,
      'end_date',           v_cycle.end_date,
      'created',            false,
      'source_cycle_id',    NULL,
      'categories_carried', 0,
      'categories_skipped', 0,
      'income_carried',     0,
      'income_skipped',     0,
      'tier',               hub_tier(p_centre_id),
      'clipped_start',      false,
      'clipped_end',        false,
      'prev_start',         NULL::date,
      'prev_end',           NULL::date,
      'next_start',         NULL::date,
      'next_end',           NULL::date
    );
  END IF;

  -- 5. Compute the CLIPPED calendar month containing today (see file header).
  --    ── UNCHANGED FROM migrate_28. Do not fold the neighbour-row lookups in 5a
  --       into these aggregates: keeping this block verbatim is what makes "the
  --       created period did not change" checkable by inspection.
  v_month_start := date_trunc('month', v_today)::date;
  v_month_end   := (date_trunc('month', v_today) + interval '1 month - 1 day')::date;

  SELECT max(end_date)   INTO v_prev_end
    FROM budget_cycles
   WHERE budget_centre_id = p_centre_id AND deleted_at IS NULL AND end_date   < v_today;

  SELECT min(start_date) INTO v_next_start
    FROM budget_cycles
   WHERE budget_centre_id = p_centre_id AND deleted_at IS NULL AND start_date > v_today;

  v_start := greatest(v_month_start, COALESCE(v_prev_end   + 1, v_month_start));
  v_end   := least   (v_month_end,   COALESCE(v_next_start - 1, v_month_end));

  -- 5a. migrate_30 — RECEIPT FACTS. Pure reads. Nothing here feeds v_start/v_end;
  --     the window is already final above and is not touched again.
  --
  --     Read off the RESULT, not the inputs: "the window came out shorter than the
  --     calendar month" is exactly what the user is being told, and deriving it
  --     from the final bounds cannot drift from the clip that produced them.
  v_clip_start := v_start > v_month_start;
  v_clip_end   := v_end   < v_month_end;

  --     The neighbours as WHOLE ROWS, so the client can name a period by its range
  --     ("18 Sep – 18 Oct") instead of round-tripping for the other half of it.
  --     Each matches the aggregate above by construction: live periods cannot
  --     overlap (no_overlapping_cycles GiST), so end_date is unique among periods
  --     ending before today and start_date unique among those starting after —
  --     ORDER BY … LIMIT 1 therefore lands on exactly the row whose boundary the
  --     max()/min() returned. On no match the record stays all-NULL, which is the
  --     same nothing the aggregate's NULL means.
  SELECT * INTO v_prev
    FROM budget_cycles
   WHERE budget_centre_id = p_centre_id AND deleted_at IS NULL AND end_date   < v_today
   ORDER BY end_date DESC
   LIMIT 1;

  SELECT * INTO v_next
    FROM budget_cycles
   WHERE budget_centre_id = p_centre_id AND deleted_at IS NULL AND start_date > v_today
   ORDER BY start_date ASC
   LIMIT 1;

  -- Both bounds bracket today by construction; assert it rather than trust it.
  IF v_today < v_start OR v_today > v_end THEN
    RAISE EXCEPTION 'internal: computed window % – % does not contain today %', v_start, v_end, v_today;
  END IF;

  -- 6. Create it. Name is the server-authoritative majority-month label, matching
  --    create_budget_period's NULL-name fallback. anchor_type='custom' satisfies the
  --    "(anchor_type='payday') = (anchor_day IS NOT NULL)" CHECK trivially.
  BEGIN
    INSERT INTO budget_cycles (budget_centre_id, name, start_date, end_date, anchor_type)
    VALUES (p_centre_id, cycle_majority_name(v_start, v_end), v_start, v_end, 'custom')
    RETURNING * INTO v_cycle;
  EXCEPTION
    WHEN exclusion_violation THEN
      -- A racer that did not take our advisory lock (create_budget_period from the
      -- custom-dates sheet) committed an overlapping period first. Adopt it.
      SELECT * INTO v_cycle
        FROM budget_cycles
       WHERE budget_centre_id = p_centre_id
         AND deleted_at IS NULL
         AND v_today BETWEEN start_date AND end_date
       LIMIT 1;

      IF NOT FOUND THEN
        -- Overlapped something that does NOT cover today: genuinely unresolvable here.
        RAISE EXCEPTION 'A budget period overlapping % – % already exists in this hub', v_start, v_end
          USING ERRCODE = 'CYC01';
      END IF;

      -- migrate_30: we adopted somebody else's period. Our computed window was
      -- discarded, so its clipping describes nothing that exists. Flags false,
      -- neighbour dates NULL — same contract as the step-4 already-covered return.
      RETURN jsonb_build_object(
        'cycle_id',           v_cycle.id,
        'name',               v_cycle.name,
        'start_date',         v_cycle.start_date,
        'end_date',           v_cycle.end_date,
        'created',            false,
        'source_cycle_id',    NULL,
        'categories_carried', 0,
        'categories_skipped', 0,
        'income_carried',     0,
        'income_skipped',     0,
        'tier',               hub_tier(p_centre_id),
        'clipped_start',      false,
        'clipped_end',        false,
        'prev_start',         NULL::date,
        'prev_end',           NULL::date,
        'next_start',         NULL::date,
        'next_end',           NULL::date
      );
  END;

  v_new_month := to_char(v_cycle.start_date, 'YYYY-MM');

  -- 7. Source for the carry-forward: the most recent live cycle STARTING BEFORE the
  --    new one. Strictly before, so a stray FUTURE period is never the source.
  SELECT id INTO v_source
    FROM budget_cycles
   WHERE budget_centre_id = p_centre_id
     AND deleted_at IS NULL
     AND id         <> v_cycle.id
     AND start_date  < v_cycle.start_date
   ORDER BY start_date DESC
   LIMIT 1;

  -- 8. Owner-tier caps. Hardcoded from src/lib/plans.js — keep in sync.
  v_tier      := hub_tier(p_centre_id);
  v_cat_limit := CASE WHEN v_tier = 'pro' THEN 2147483647 ELSE 10 END;
  v_inc_limit := CASE WHEN v_tier = 'pro' THEN 2147483647 ELSE 2  END;

  IF v_source IS NOT NULL THEN
    SELECT count(*) INTO v_cat_avail
      FROM budget_categories WHERE cycle_id = v_source AND deleted_at IS NULL;
    SELECT count(*) INTO v_inc_avail
      FROM income_sources   WHERE cycle_id = v_source AND deleted_at IS NULL;

    -- 8a. Categories — the plan shape only. Deterministic order so the clamp is
    --     stable: the user keeps their first N by sort_order, not an arbitrary N.
    INSERT INTO budget_categories
      (budget_centre_id, name, icon, budget_amount, month, is_fixed, sort_order, cycle_id)
    SELECT p_centre_id, c.name, c.icon, c.budget_amount, v_new_month, c.is_fixed, c.sort_order, v_cycle.id
      FROM budget_categories c
     WHERE c.cycle_id = v_source AND c.deleted_at IS NULL
     ORDER BY c.sort_order, c.created_at, c.id
     LIMIT v_cat_limit;
    GET DIAGNOSTICS v_cat_n = ROW_COUNT;

    -- 8b. Income sources — expectations carry, RECEIPTS DO NOT. A new period starts
    --     unpaid: received=false, received_amount=0, actual_pay_date=NULL.
    INSERT INTO income_sources
      (budget_centre_id, label, icon, expected_amount, currency, pay_day, pay_day_type,
       notes, received, received_amount, actual_pay_date, month, cycle_id)
    SELECT p_centre_id, s.label, s.icon, s.expected_amount, s.currency, s.pay_day, s.pay_day_type,
           s.notes, false, 0, NULL, v_new_month, v_cycle.id
      FROM income_sources s
     WHERE s.cycle_id = v_source AND s.deleted_at IS NULL
     ORDER BY s.pay_day NULLS LAST, s.created_at, s.id
     LIMIT v_inc_limit;
    GET DIAGNOSTICS v_inc_n = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'cycle_id',           v_cycle.id,
    'name',               v_cycle.name,
    'start_date',         v_cycle.start_date,
    'end_date',           v_cycle.end_date,
    'created',            true,
    'source_cycle_id',    v_source,
    'categories_carried', v_cat_n,
    'categories_skipped', greatest(v_cat_avail - v_cat_n, 0),
    'income_carried',     v_inc_n,
    'income_skipped',     greatest(v_inc_avail - v_inc_n, 0),
    'tier',               v_tier,
    -- migrate_30 — why this period is the shape it is. The flags say whether the
    -- window was shortened; the dates name the neighbour that shortened it. A
    -- neighbour can be reported with its flag false (it exists but did not clip) —
    -- read the FLAG, never the presence of the dates.
    'clipped_start',      v_clip_start,
    'clipped_end',        v_clip_end,
    'prev_start',         v_prev.start_date,
    'prev_end',           v_prev.end_date,
    'next_start',         v_next.start_date,
    'next_end',           v_next.end_date
  );
END;
$$;

-- NO GRANT re-issued. CREATE OR REPLACE preserves the existing ACL, so migrate_28's
-- `GRANT EXECUTE … TO authenticated` survives this replace untouched. The verify
-- block asserts that rather than re-granting, so that a lost grant FAILS this
-- migration instead of being silently papered over by it.

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n   int;
  v_src text;
BEGIN
  -- (a) Exists with the expected 1-arg signature.
  SELECT count(*) INTO v_n FROM pg_proc
    WHERE proname = 'ensure_current_budget_period'
      AND pg_get_function_identity_arguments(oid) = 'p_centre_id uuid';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: ensure_current_budget_period(uuid) not found (got %)', v_n; END IF;

  -- (b) SECURITY DEFINER with a pinned search_path.
  SELECT count(*) INTO v_n FROM pg_proc
    WHERE proname = 'ensure_current_budget_period' AND prosecdef IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: ensure_current_budget_period is not SECURITY DEFINER'; END IF;
  SELECT count(*) INTO v_n FROM pg_proc
    WHERE proname = 'ensure_current_budget_period' AND 'search_path=public' = ANY(proconfig);
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: ensure_current_budget_period does not pin search_path=public'; END IF;

  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'ensure_current_budget_period';

  -- (c) THIS migration's contribution: all six receipt keys are in the payload.
  IF v_src NOT LIKE '%clipped_start%' THEN RAISE EXCEPTION 'FAIL: clipped_start missing from payload'; END IF;
  IF v_src NOT LIKE '%clipped_end%'   THEN RAISE EXCEPTION 'FAIL: clipped_end missing from payload';   END IF;
  IF v_src NOT LIKE '%prev_start%'    THEN RAISE EXCEPTION 'FAIL: prev_start missing from payload';    END IF;
  IF v_src NOT LIKE '%prev_end%'      THEN RAISE EXCEPTION 'FAIL: prev_end missing from payload';      END IF;
  IF v_src NOT LIKE '%next_start%'    THEN RAISE EXCEPTION 'FAIL: next_start missing from payload';    END IF;
  IF v_src NOT LIKE '%next_end%'      THEN RAISE EXCEPTION 'FAIL: next_end missing from payload';      END IF;

  --     The flags are derived from the FINAL bounds, not re-derived from the
  --     neighbour dates. A refactor to the latter is the drift this guards against.
  IF v_src NOT LIKE '%v_clip_start := v_start > v_month_start%'
    THEN RAISE EXCEPTION 'FAIL: clipped_start is not derived from the final window bounds'; END IF;
  IF v_src NOT LIKE '%v_clip_end   := v_end   < v_month_end%'
    THEN RAISE EXCEPTION 'FAIL: clipped_end is not derived from the final window bounds'; END IF;

  --     Both neighbours are fetched as ROWS — a range needs both of its dates.
  IF v_src NOT LIKE '%SELECT * INTO v_prev%' THEN RAISE EXCEPTION 'FAIL: prev neighbour row lookup missing'; END IF;
  IF v_src NOT LIKE '%SELECT * INTO v_next%' THEN RAISE EXCEPTION 'FAIL: next neighbour row lookup missing'; END IF;

  -- (d) REGRESSION GUARD — this file rebuilds the whole function from migrate_28's
  --     body, so it must still carry everything migrate_28 put there. A full-body
  --     rewrite is exactly the change that drops one of these silently.
  IF v_src NOT LIKE '%42501%'                 THEN RAISE EXCEPTION 'FAIL: owner/full_access role gate (42501) missing'; END IF;
  IF v_src NOT LIKE '%pg_advisory_xact_lock%' THEN RAISE EXCEPTION 'FAIL: advisory lock (concurrency serialisation) missing'; END IF;
  IF v_src NOT LIKE '%exclusion_violation%'   THEN RAISE EXCEPTION 'FAIL: exclusion_violation trap missing'; END IF;
  IF v_src NOT LIKE '%CYC01%'                 THEN RAISE EXCEPTION 'FAIL: CYC01 re-raise missing'; END IF;
  IF v_src NOT LIKE '%is_archived IS FALSE%'  THEN RAISE EXCEPTION 'FAIL: archived-hub guard missing'; END IF;

  --     THE CLIP ITSELF — the created period must still be computed the old way.
  --     These two lines are the contract "no logic change" rests on.
  IF v_src NOT LIKE '%greatest(v_month_start, COALESCE(v_prev_end   + 1, v_month_start))%'
    THEN RAISE EXCEPTION 'FAIL: clip start arithmetic changed — the created period is no longer migrate_28-identical'; END IF;
  IF v_src NOT LIKE '%least   (v_month_end,   COALESCE(v_next_start - 1, v_month_end))%'
    THEN RAISE EXCEPTION 'FAIL: clip end arithmetic changed — the created period is no longer migrate_28-identical'; END IF;
  IF v_src NOT LIKE '%does not contain today%'
    THEN RAISE EXCEPTION 'FAIL: the window-brackets-today assertion is missing'; END IF;

  --     Carry-forward: the tier clamp, and receipts NOT carrying.
  IF v_src NOT LIKE '%2147483647%'          THEN RAISE EXCEPTION 'FAIL: pro-tier unlimited sentinel missing — caps clamp broken'; END IF;
  IF v_src NOT LIKE '%cycle_majority_name%' THEN RAISE EXCEPTION 'FAIL: server-authoritative period name missing'; END IF;
  IF v_src NOT LIKE '%GET DIAGNOSTICS%'     THEN RAISE EXCEPTION 'FAIL: carry-forward row counts missing'; END IF;

  -- (e) Dependencies present (unchanged from migrate_28).
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'cycle_majority_name';
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: cycle_majority_name missing — run migrate_14b/15 first'; END IF;
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'hub_tier';
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: hub_tier(uuid) missing — run hub_tier.sql first'; END IF;
  SELECT count(*) INTO v_n FROM pg_constraint WHERE conname = 'no_overlapping_cycles';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: no_overlapping_cycles constraint missing — the clip AND the neighbour uniqueness rely on it'; END IF;

  -- (f) ACL SURVIVED THE REPLACE. Not re-granted above deliberately: if the grant
  --     were lost, this must fail loudly rather than be quietly restored.
  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
    WHERE routine_name = 'ensure_current_budget_period'
      AND grantee = 'authenticated' AND privilege_type = 'EXECUTE';
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: authenticated lost EXECUTE on ensure_current_budget_period — CREATE OR REPLACE should have preserved it; re-run migrate_28 grant'; END IF;

  RAISE NOTICE 'migrate_30 OK: ensure_current_budget_period(uuid) now returns clipped_start/clipped_end + prev/next ranges (period creation unchanged, migrate_28 behaviour preserved).';
END $$;

COMMIT;

-- =============================================================================
-- NEXT STEP — behavioural proof:
--   scripts/migrate_30_clipped_period_receipt_dryrun.sql
-- Run it after this file. It ends in ROLLBACK and commits nothing. It asserts the
-- clipped/unclipped/not-created shapes AND that the created window is still the
-- calendar month clipped to the gap — i.e. that this file added facts and changed
-- nothing.
--
-- THEN — find the hubs that will actually show the new message (read-only):
--   SELECT c.budget_centre_id,
--          c.start_date, c.end_date
--     FROM budget_cycles c
--    WHERE c.deleted_at IS NULL
--      AND c.start_date > (now() AT TIME ZONE 'UTC')::date
--      AND c.start_date <= (date_trunc('month', (now() AT TIME ZONE 'UTC')::date)
--                            + interval '1 month - 1 day')::date
--    ORDER BY 1, 2;
--
--   Any hub listed here has a future period starting inside the current month, so
--   its next auto-continue clips the end and the receipt explains why.
-- =============================================================================
