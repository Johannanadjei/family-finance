-- =============================================================================
-- migrate_29_harden_month_resolution.sql
--
-- Close the server half of "income carries TWO period keys" (docs/backlog.md).
-- The client half deletes cycleForMonth/cycleIdForMonth and makes cycle_id
-- income's only period key. This file removes the same hole from the DATABASE:
-- resolve_cycle_id()'s month branch picked an ARBITRARY period when a month
-- matched more than one, and now RAISES instead.
--
-- THE HOLE
--   resolve_cycle_id() resolves budget_categories / income_sources by START MONTH:
--       WHERE to_char(start_date,'YYYY-MM') = NEW.month AND deleted_at IS NULL
--       LIMIT 1
--   That is correct only while at most ONE live period starts in a given month.
--   The moment two do — "Sept 1–17" plus "Sept 18 – Oct 18", the exact shape live
--   on the hub "The house" — the bare LIMIT 1 has NO ORDER BY, so the period is
--   chosen arbitrarily by plan order. The row lands in a real period, just not
--   necessarily the right one, and nothing anywhere says so.
--
--   That is worse than an error. An empty Payday reads as broken and the user
--   distrusts the screen; a row silently filed under the wrong September reads as
--   working and the user trusts a wrong number.
--
-- THE CHANGE (one branch, one behaviour)
--   0 matches  → CYC02, 'No cycle exists for month …'        (UNCHANGED)
--   1 match    → stamp it                                     (UNCHANGED)
--   2+ matches → CYC05, 'Month … is ambiguous …'              (NEW — was arbitrary)
--
--   CYC05 is a NEW SQLSTATE, deliberately distinct from CYC02. CYC02 means "no
--   period covers this key"; CYC05 means "this key cannot identify a period at
--   all". They need different fixes — create a period vs. write cycle_id — so they
--   must not share an error code.
--
--   The CYC-code registry, so the next one does not collide (all five are in use):
--     CYC01  overlapping periods (no_overlapping_cycles / create_budget_period)
--     CYC02  cannot resolve cycle_id — no match for this date or month
--     CYC03  period outside the current calendar year (migrate_17) + 14b anchor checks
--     CYC04  reset_budget_period future-only violation (migrate_18)
--     CYC05  month is ambiguous — more than one live period starts in it  ← THIS FILE
--   Nothing in the client switches on SQLSTATE (the codes appear only in comments
--   and messages), so CYC05 needs no client-side mapping to surface correctly.
--
--   The error names both candidate periods with their ranges, so whoever hits it
--   can see immediately which one they meant.
--
-- WHO THIS CAN AFFECT (read before applying)
--   The trigger returns early on INSERT when cycle_id is already set, so every
--   caller that stamps cycle_id explicitly is UNTOUCHED by this change:
--     • income_sources — the client now ALWAYS stamps it (this workstream's
--       client half; addIncomeSource/bulkAddIncomeSources refuse without a cycleId)
--     • the migrate_28 auto-continue carry-forward — stamps cycle_id + month
--     • any backfill that writes cycle_id directly
--   What CAN now raise:
--     • budget_categories written with p_cycle_id => NULL (create_category /
--       create_categories_bulk accept a null and let the trigger resolve). On a hub
--       with two same-month periods that insert previously landed arbitrarily and
--       will now fail with CYC05. BudgetView and SettingsView both pass a cycle id
--       (viewedCycle?.id / viewedCycleId), so this is the null-fallback path only.
--     • an UPDATE that changes `month` on either table without also setting cycle_id.
--   Both are exactly the cases that were silently wrong before. Failing them loudly
--   is the point of this migration — but on a hub that HAS two same-month periods,
--   expect a real, visible error until sequence step 3 repairs that hub.
--
-- ⚠ THIS FILE REBUILDS resolve_cycle_id() IN FULL — FROM THE COMMIT-12 BODY
--   Two files in this repo define resolve_cycle_id(). The live one is the LATER
--   one, scripts/migrate_move_cycle_trigger.sql (Commit 12), which added:
--       IF TG_OP = 'UPDATE' AND OLD.cycle_id IS DISTINCT FROM NEW.cycle_id
--         THEN RETURN NEW;   -- caller moved the row; trust them, do not re-resolve
--   and widened the transactions trigger to UPDATE OF (date, cycle_id).
--   Rebuilding from the EARLIER Commit-10 text (migrate_cycle_id_trigger.sql) would
--   silently revert the transaction-move feature. The body below is Commit 12's,
--   with ONLY the month branch changed, and the verify block asserts both the new
--   ambiguity raise AND that Commit 12's branch and trigger scope survived.
--
-- SCOPE — the transactions branch is NOT touched
--   It resolves by date containment, and the no_overlapping_cycles GiST constraint
--   guarantees at most one live match. Its LIMIT 1 is provably unambiguous and
--   stays, with the comment that says why.
--
-- IDEMPOTENT. CREATE OR REPLACE + DROP-IF-EXISTS triggers; safe to re-run.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   Re-run scripts/migrate_move_cycle_trigger.sql. It restores the arbitrary
--   LIMIT 1 month branch and leaves every already-written cycle_id untouched.
--
-- PRE-VERIFIED — this file and its dry run were executed against PostgreSQL 17 on
--   2026-09-10 before being handed over: the dry run fails at S2 against the
--   un-hardened trigger, passes 9/9 after this file, survives a second apply, and
--   goes red again after the documented rollback. Details in the dry run's header.
--
-- NEXT STEP after applying: scripts/migrate_29_harden_month_resolution_dryrun.sql
--   (behavioural proof; ends in ROLLBACK and commits nothing).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION resolve_cycle_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle_id uuid;
  v_ids      uuid[];
  v_detail   text;
BEGIN
  -- Case 2 — INSERT with an explicitly-provided cycle_id (manual override /
  -- backfill / the Commit-11.5 optimistic stamp): honour it, skip resolution.
  -- This is why the CYC05 raise below cannot reach any caller that stamps
  -- cycle_id — which, after this workstream, is every income_sources write.
  IF TG_OP = 'INSERT' AND NEW.cycle_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Case 4 (Commit 12) — UPDATE where the caller explicitly CHANGED cycle_id (a
  -- move). Trust the caller; do NOT re-resolve from date. IS DISTINCT FROM is
  -- null-safe and false when cycle_id is untouched (case 3: a date-only UPDATE
  -- leaves NEW.cycle_id = OLD.cycle_id, so this falls through to re-resolve).
  -- This branch is reachable for transactions only — its trigger fires on
  -- UPDATE OF (date, cycle_id); the categories/income triggers fire on
  -- UPDATE OF month, where cycle_id never changes within the SET list.
  IF TG_OP = 'UPDATE' AND OLD.cycle_id IS DISTINCT FROM NEW.cycle_id THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'transactions' THEN
    IF NEW.date IS NULL THEN
      RAISE EXCEPTION 'Cannot resolve cycle_id: transaction date is NULL'
        USING ERRCODE = 'CYC02';
    END IF;

    SELECT id INTO v_cycle_id
    FROM budget_cycles
    WHERE budget_centre_id = NEW.budget_centre_id
      AND NEW.date BETWEEN start_date AND end_date
      AND deleted_at IS NULL
    LIMIT 1;   -- the no_overlapping_cycles GiST constraint guarantees <= 1 live match

    IF v_cycle_id IS NULL THEN
      RAISE EXCEPTION 'No cycle exists containing date % in centre %',
        NEW.date, NEW.budget_centre_id
        USING ERRCODE = 'CYC02';
    END IF;

  ELSIF TG_TABLE_NAME IN ('budget_categories', 'income_sources') THEN
    IF NEW.month IS NULL THEN
      RAISE EXCEPTION 'Cannot resolve cycle_id: % month is NULL', TG_TABLE_NAME
        USING ERRCODE = 'CYC02';
    END IF;

    -- migrate_29 — collect ALL live matches rather than taking the first. Unlike the
    -- date branch above, nothing constrains a month to one period: periods may start
    -- in the same month, and a custom period spanning two months has no month at all.
    -- Ordering makes the error message deterministic, not the pick — there is no pick.
    SELECT array_agg(id ORDER BY start_date, id),
           string_agg(id::text || ' (' || start_date || ' → ' || end_date || ')',
                      ', ' ORDER BY start_date, id)
      INTO v_ids, v_detail
    FROM budget_cycles
    WHERE budget_centre_id = NEW.budget_centre_id
      AND to_char(start_date, 'YYYY-MM') = NEW.month
      AND deleted_at IS NULL;

    IF v_ids IS NULL OR array_length(v_ids, 1) = 0 THEN
      RAISE EXCEPTION 'No cycle exists for month % in centre %',
        NEW.month, NEW.budget_centre_id
        USING ERRCODE = 'CYC02';
    END IF;

    -- The whole point of migrate_29: a month that names more than one period names
    -- none of them. Refuse rather than file the row under an arbitrary period.
    IF array_length(v_ids, 1) > 1 THEN
      RAISE EXCEPTION
        'Month % is ambiguous in centre %: % live periods start in it [%]. Write cycle_id explicitly — a month cannot name a period.',
        NEW.month, NEW.budget_centre_id, array_length(v_ids, 1), v_detail
        USING ERRCODE = 'CYC05',
              HINT = 'Set cycle_id on the row instead of relying on month resolution.';
    END IF;

    v_cycle_id := v_ids[1];
  END IF;

  NEW.cycle_id := v_cycle_id;
  RETURN NEW;
END;
$$;

-- Triggers — re-created verbatim from Commit 12 so this file is self-contained and
-- the function swap above stays consistent with the column scopes it assumes.
-- Transactions: UPDATE OF (date, cycle_id) — the WIDENED Commit-12 scope, which is
-- what makes the move branch reachable. Do not narrow it back to `date`.
DROP TRIGGER IF EXISTS auto_resolve_cycle_id_transactions ON transactions;
CREATE TRIGGER auto_resolve_cycle_id_transactions
  BEFORE INSERT OR UPDATE OF date, cycle_id ON transactions
  FOR EACH ROW EXECUTE FUNCTION resolve_cycle_id();

DROP TRIGGER IF EXISTS auto_resolve_cycle_id_budget_categories ON budget_categories;
CREATE TRIGGER auto_resolve_cycle_id_budget_categories
  BEFORE INSERT OR UPDATE OF month ON budget_categories
  FOR EACH ROW EXECUTE FUNCTION resolve_cycle_id();

DROP TRIGGER IF EXISTS auto_resolve_cycle_id_income_sources ON income_sources;
CREATE TRIGGER auto_resolve_cycle_id_income_sources
  BEFORE INSERT OR UPDATE OF month ON income_sources
  FOR EACH ROW EXECUTE FUNCTION resolve_cycle_id();

-- ── SELF-VERIFYING STRUCTURAL CHECK ─────────────────────────────────────────
-- Asserts what this file is responsible for AND what it must not have broken.
-- Any failure aborts the transaction — nothing is applied.
DO $$
DECLARE
  v_n   int;
  v_src text;
  v_def text;
BEGIN
  -- (a) The function exists, exactly once, as a trigger function.
  SELECT count(*) INTO v_n FROM pg_proc p
    JOIN pg_type t ON t.oid = p.prorettype
   WHERE p.proname = 'resolve_cycle_id' AND t.typname = 'trigger';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: resolve_cycle_id() trigger function not found (got %)', v_n; END IF;

  -- (b) SECURITY DEFINER with a pinned search_path (unchanged from Commit 10/12).
  SELECT count(*) INTO v_n FROM pg_proc
   WHERE proname = 'resolve_cycle_id' AND prosecdef IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: resolve_cycle_id is not SECURITY DEFINER'; END IF;
  SELECT count(*) INTO v_n FROM pg_proc
   WHERE proname = 'resolve_cycle_id' AND 'search_path=public' = ANY(proconfig);
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: resolve_cycle_id does not pin search_path=public'; END IF;

  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'resolve_cycle_id';

  -- (c) THIS migration's contribution: the ambiguity raise exists.
  IF v_src NOT LIKE '%CYC05%'      THEN RAISE EXCEPTION 'FAIL: CYC05 ambiguity raise missing — month branch not hardened'; END IF;
  IF v_src NOT LIKE '%is ambiguous%' THEN RAISE EXCEPTION 'FAIL: ambiguity message missing'; END IF;
  IF v_src NOT LIKE '%array_length(v_ids, 1) > 1%'
    THEN RAISE EXCEPTION 'FAIL: the >1-match test is missing — the month branch may still pick arbitrarily'; END IF;

  -- (d) REGRESSION GUARD — this file rebuilds the whole function, so it must still
  --     carry everything Commits 10 and 12 put there. Losing any of these would be
  --     a silent feature revert, which is exactly the risk of a full-body rewrite.
  IF v_src NOT LIKE '%OLD.cycle_id IS DISTINCT FROM NEW.cycle_id%'
    THEN RAISE EXCEPTION 'FAIL: Commit-12 move branch missing — rebuilt from the wrong (Commit-10) body'; END IF;
  IF v_src NOT LIKE '%TG_OP = ''INSERT'' AND NEW.cycle_id IS NOT NULL%'
    THEN RAISE EXCEPTION 'FAIL: INSERT explicit-cycle_id early return missing'; END IF;
  IF v_src NOT LIKE '%BETWEEN start_date AND end_date%'
    THEN RAISE EXCEPTION 'FAIL: transactions date-containment branch missing'; END IF;
  IF v_src NOT LIKE '%CYC02%'
    THEN RAISE EXCEPTION 'FAIL: CYC02 raises missing'; END IF;

  -- (e) The month branch no longer resolves through a bare LIMIT 1. The date branch
  --     keeps exactly one (GiST-justified); anything more means the old month
  --     resolution survived the replace.
  SELECT (length(v_src) - length(replace(v_src, 'LIMIT 1', ''))) / length('LIMIT 1') INTO v_n;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected exactly 1 LIMIT 1 (the GiST-guaranteed date branch), found % — month branch may still LIMIT 1', v_n;
  END IF;

  -- (f) Trigger column scopes. The transactions trigger MUST still fire on cycle_id
  --     or Commit 12's move branch becomes dead code (see migrate_move_cycle_trigger).
  SELECT pg_get_triggerdef(oid) INTO v_def FROM pg_trigger
   WHERE tgname = 'auto_resolve_cycle_id_transactions' AND NOT tgisinternal;
  IF v_def IS NULL THEN RAISE EXCEPTION 'FAIL: transactions trigger missing'; END IF;
  IF v_def NOT LIKE '%UPDATE OF%'  THEN RAISE EXCEPTION 'FAIL: transactions trigger has no UPDATE OF scope: %', v_def; END IF;
  IF v_def NOT LIKE '%cycle_id%'   THEN RAISE EXCEPTION 'FAIL: transactions trigger not scoped to cycle_id — Commit-12 moves would be silently re-resolved: %', v_def; END IF;
  IF v_def NOT LIKE '%date%'       THEN RAISE EXCEPTION 'FAIL: transactions trigger not scoped to date: %', v_def; END IF;

  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgname IN ('auto_resolve_cycle_id_budget_categories', 'auto_resolve_cycle_id_income_sources')
     AND NOT tgisinternal;
  IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL: categories/income triggers missing (got %)', v_n; END IF;

  RAISE NOTICE 'migrate_29 OK: resolve_cycle_id() month branch now RAISEs CYC05 on >1 live match (Commit-10 + Commit-12 behaviour preserved; transactions trigger still scoped to date + cycle_id).';
END $$;

COMMIT;

-- =============================================================================
-- NEXT STEP — behavioural proof:
--   scripts/migrate_29_harden_month_resolution_dryrun.sql
-- Run it after this file. It ends in ROLLBACK and commits nothing.
--
-- THEN — find the hubs this now makes loud (read-only; run any time):
--   SELECT budget_centre_id,
--          to_char(start_date,'YYYY-MM')            AS month,
--          count(*)                                  AS live_periods,
--          string_agg(id::text, ', ' ORDER BY start_date) AS period_ids
--     FROM budget_cycles
--    WHERE deleted_at IS NULL
--    GROUP BY budget_centre_id, to_char(start_date,'YYYY-MM')
--   HAVING count(*) > 1
--    ORDER BY 1, 2;
--
--   Expect "The house" / 2026-09 to appear (50a8d1ff + b7e336d0). Any hub listed
--   here will get CYC05 on a month-resolved write until sequence step 3 repairs it.
--   Rows already written stay exactly where they are — this migration changes
--   future resolution only, never existing cycle_id values.
-- =============================================================================
