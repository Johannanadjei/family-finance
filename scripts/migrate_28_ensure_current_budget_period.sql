-- =============================================================================
-- migrate_28_ensure_current_budget_period.sql
--
-- The AUTO-CONTINUE writer for the period-UX fix. One idempotent RPC that
-- guarantees "there is always a budget period covering today", and — critically —
-- that the new period is NOT EMPTY: it carries the previous period's categories
-- and income sources forward in the same transaction.
--
-- WHY CARRY-FORWARD IS NOT OPTIONAL
--   Auto-creating an EMPTY period is the dangerous half of this feature. A user
--   opening the app on the 1st would see GHS 0 budgeted, GHS 0 expected income and
--   no categories — visually identical to the cold-load data-loss failure mode in
--   CLAUDE.md §12. Carry-forward is what makes silent creation safe, so it lives
--   INSIDE this function rather than being a second client call that can fail
--   independently and leave the empty state behind.
--
-- CONTRACT
--   ensure_current_budget_period(p_centre_id uuid) RETURNS jsonb
--     {
--       cycle_id, name, start_date, end_date,   -- the period covering today
--       created            boolean,             -- false = one already existed
--       source_cycle_id    uuid|null,           -- what we copied from
--       categories_carried int, categories_skipped int,
--       income_carried     int, income_skipped     int,
--       tier               text                 -- owner tier used for the caps
--     }
--
--   • SECURITY DEFINER, search_path=public. auth.uid() is still the calling user.
--   • Auth gate: caller must be an ACTIVE member with role IN ('owner','full_access')
--     — the DB twin of can(role,'manageCycles') in lib/roles.js, identical to
--     create_budget_period (migrate_16) and reset_budget_period (migrate_18).
--     A `standard` member gets 42501. The client ALSO guards on can('manageCycles')
--     so this raise should be unreachable; it is the backstop, not the gate.
--   • IDEMPOTENT BY DESIGN. This is the property that makes it safe to fire on
--     every hub open: if a live cycle already contains today it is returned with
--     created=false and NOTHING is written — no second period, no re-copy, no
--     duplicated categories. Called 100 times in a row it writes exactly once.
--
-- THE RANGE IS CLIPPED, NOT ASSUMED (this is what removes CYC01 from the flow)
--   The target is the calendar month containing today, CLIPPED to the gap that
--   actually contains today:
--       start = greatest(month_start, latest end_date BEFORE today + 1)
--       end   = least(month_end,      earliest start_date AFTER today − 1)
--   Because no live cycle contains today and live cycles never overlap each other
--   (no_overlapping_cycles GiST), that window is exactly the free gap around today
--   and CANNOT overlap an existing period. So the ordinary path never raises CYC01,
--   even for hubs whose previous period ended mid-month (custom ranges) or that
--   already have a future period planned. Both bounds always bracket today: a
--   cycle ending before today has end_date < today, and one starting after has
--   start_date > today.
--
-- CONCURRENCY
--   A transaction-scoped advisory lock on the centre serialises concurrent callers
--   (two devices, two tabs, or the auto-fire racing the manual "Set up September"
--   tap — which calls THIS function, not create_budget_period, precisely so the
--   race resolves to created=false instead of an error). The loser blocks, then
--   its post-lock lookup sees the winner's committed row and returns it.
--   The exclusion_violation trap is DEFENCE-IN-DEPTH for a racer that does not
--   take this lock (create_budget_period from the custom-dates sheet): it re-reads
--   the covering cycle and returns created=false rather than surfacing CYC01.
--   Only if no covering cycle exists after such a violation is CYC01 re-raised.
--
-- CAPS: CARRY-FORWARD IS CLAMPED, NEVER REJECTED
--   create_categories_bulk (CAT01) rejects a WHOLE batch that would exceed the
--   owner-tier category cap — correct for a user-initiated rollforward, wrong here:
--   a downgraded hub would then fail to get a period every single month with no
--   recovery the user can see. So this function CLAMPS instead: it copies the first
--   N rows (deterministic order) where N is the owner-tier limit, and reports what
--   it skipped so the client receipt can say so. The period is always created.
--   Limits are hardcoded from src/lib/plans.js (Free 10 categories / 2 income
--   streams; Pro unlimited ↔ the 2147483647 sentinel) — the same convention, and
--   the same keep-in-sync obligation, as create_categories_bulk.sql:110.
--   Tier comes from hub_tier() — the OWNER's tier, never the caller's.
--
-- CARRY-FORWARD SEMANTICS
--   Source = the most recent live cycle STARTING BEFORE the new period's start.
--   (Strictly before, so a stray FUTURE period — the exact state the old
--   next-month quick-create used to manufacture — is never used as the source.)
--   • categories: name, icon, budget_amount, is_fixed, sort_order — the plan shape.
--   • income_sources: label, icon, expected_amount, currency, pay_day, pay_day_type,
--     notes — with received=false, received_amount=0, actual_pay_date=NULL. A new
--     period starts UNPAID; copying receipt state would fabricate income.
--   • Both are stamped with the new cycle_id explicitly and month = the new period's
--     start month, so the resolve_cycle_id() trigger short-circuits (it returns early
--     on INSERT when cycle_id is already set — migrate_cycle_id_trigger.sql:79).
--   • Nothing is copied when there is no source cycle (a hub's very first period is
--     seeded by CreateHubSheet/OnboardingFlow, so this is the legacy/empty case).
--   • Transactions are NEVER copied. Only the plan carries forward, not activity.
--
-- NOT COPIED / NOT DONE
--   • No gap backfill. A user returning in December after last opening in September
--     gets December only — fabricating Oct+Nov would invent history and burn two of
--     the free tier's three visible cycle slots on empty months.
--   • No year constraint needed: the month containing today is always inside the
--     current year, so CYC03 (migrate_17) can never fire on this path.
--
-- KNOWN, PRE-EXISTING EDGE (not introduced here)
--   The month-keyed resolution used by income_sources/budget_categories maps a
--   'YYYY-MM' to a cycle by START MONTH (resolve_cycle_id's month branch, and
--   lib/cycles.cycleForMonth). If a hub already has a live period that STARTS and
--   ENDS inside the current month before today (e.g. 1–2 Sep, today the 3rd), the
--   clipped window also starts in September and two live cycles share a start
--   month — the month→cycle map becomes ambiguous. create_budget_period allows the
--   same shape today, so this function neither introduces nor widens the hole, and
--   covering today is worth more than refusing. The date-keyed path (transactions)
--   is unaffected: it resolves by containment, which stays unique under the GiST
--   constraint.
--
-- DEPENDS ON (must already exist):
--   • budget_cycles + no_overlapping_cycles GiST   (migrate_cycles_schema)
--   • cycle_majority_name(date, date)              (migrate_14b; KEPT by migrate_15)
--   • hub_tier(uuid)                               (hub_tier.sql)
--   • budget_categories / income_sources carrying cycle_id + month + deleted_at
--
-- PURELY ADDITIVE: introduces a NEW function, drops nothing, alters no table.
-- Older main JS simply never calls it — safe in the single shared Supabase project.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️  DO NOT RUN UNTIL REVIEWED. This RPC is a WRITE that the client fires on hub
-- open, against the shared production database. Before applying:
--   1. Review this file.
--   2. Run scripts/migrate_28_ensure_current_budget_period_dryrun.sql — it builds a
--      throwaway hub, exercises every scenario and ends in ROLLBACK, so it proves
--      the behaviour without committing a single row.
--   3. Only then run THIS file, and only then ship the client wiring.
-- Applying this file alone changes nothing user-visible: without the client call
-- the function is dormant.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Idempotent (CREATE OR REPLACE + re-issued GRANT). Self-verifying: the final DO
-- block asserts signature, SECURITY DEFINER, every dependency, the presence of the
-- role gate / advisory lock / exclusion trap, and the ACL — RAISING (and rolling
-- the whole TX back) on any miss. Atomic.
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
      'tier',               hub_tier(p_centre_id)
    );
  END IF;

  -- 5. Compute the CLIPPED calendar month containing today (see file header).
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
        'tier',               hub_tier(p_centre_id)
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
    'tier',               v_tier
  );
END;
$$;

-- Any authenticated user may call it; the in-function role check is the real gate.
GRANT EXECUTE ON FUNCTION ensure_current_budget_period(uuid) TO authenticated;

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

  -- (c) The load-bearing clauses are actually in the body. These are the four
  --     properties the feature's safety rests on; a refactor that drops any of
  --     them must fail this migration rather than ship quietly.
  IF v_src NOT LIKE '%42501%'                THEN RAISE EXCEPTION 'FAIL: owner/full_access role gate (42501) missing'; END IF;
  IF v_src NOT LIKE '%pg_advisory_xact_lock%' THEN RAISE EXCEPTION 'FAIL: advisory lock (concurrency serialisation) missing'; END IF;
  IF v_src NOT LIKE '%exclusion_violation%'  THEN RAISE EXCEPTION 'FAIL: exclusion_violation trap missing'; END IF;
  IF v_src NOT LIKE '%CYC01%'                THEN RAISE EXCEPTION 'FAIL: CYC01 re-raise missing'; END IF;

  -- (d) Dependencies present.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'cycle_majority_name';
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: cycle_majority_name missing — run migrate_14b/15 first'; END IF;
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'hub_tier';
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: hub_tier(uuid) missing — run hub_tier.sql first'; END IF;
  SELECT count(*) INTO v_n FROM pg_constraint WHERE conname = 'no_overlapping_cycles';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: no_overlapping_cycles constraint missing — the clip relies on it'; END IF;

  -- (e) Target columns the carry-forward writes.
  SELECT count(*) INTO v_n FROM information_schema.columns
    WHERE table_name = 'budget_categories'
      AND column_name IN ('cycle_id','month','deleted_at','sort_order','is_fixed','budget_amount');
  IF v_n <> 6 THEN RAISE EXCEPTION 'FAIL: budget_categories missing carry-forward columns (got %)', v_n; END IF;
  SELECT count(*) INTO v_n FROM information_schema.columns
    WHERE table_name = 'income_sources'
      AND column_name IN ('cycle_id','month','deleted_at','received','received_amount','actual_pay_date','expected_amount');
  IF v_n <> 7 THEN RAISE EXCEPTION 'FAIL: income_sources missing carry-forward columns (got %)', v_n; END IF;

  -- (f) authenticated has EXECUTE (this RPC is intentionally caller-gated, not
  --     service_role-only — see CLAUDE.md §9.6's note on the gate RPCs).
  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
    WHERE routine_name = 'ensure_current_budget_period'
      AND grantee = 'authenticated' AND privilege_type = 'EXECUTE';
  IF v_n < 1 THEN RAISE EXCEPTION 'FAIL: authenticated lacks EXECUTE on ensure_current_budget_period'; END IF;

  RAISE NOTICE 'migrate_28 OK: ensure_current_budget_period(uuid) installed (SECURITY DEFINER, owner/full_access gate, advisory lock, clipped range, clamped carry-forward).';
END $$;

COMMIT;

-- =============================================================================
-- NEXT STEP — behavioural proof:
--   scripts/migrate_28_ensure_current_budget_period_dryrun.sql
-- Run it after this file. It ends in ROLLBACK and commits nothing.
-- =============================================================================
