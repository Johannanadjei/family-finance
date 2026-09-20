-- =============================================================================
-- migrate_33_hub_activity_realtime.sql
--
-- MULTI-DEVICE FRESHNESS — the realtime signal channel.
--
-- Installs `public.hub_activity`: one row per hub, holding nothing but a revision
-- counter. AFTER-write triggers on the four cycle-aware tables bump it; the client
-- subscribes to THAT table over Realtime and, on any bump, re-fetches through the
-- normal RLS-enforced REST path.
--
-- ── WHY A TICKER TABLE AND NOT THE FOUR TABLES THEMSELVES ───────────────────
-- The obvious migration is `ALTER PUBLICATION supabase_realtime ADD TABLE
-- transactions, income_sources, budget_categories, budget_cycles`. It was
-- rejected, and the reason is this codebase's own history.
--
-- SELECT on these tables is NOT uniform across roles:
--
--   income_sources      can_view_income(budget_centre_id)   — owner/full_access ONLY;
--                                                             `standard` is DENIED
--                                                             (rls_income_sources.sql,
--                                                             F1 audit 2026-07-13)
--   transactions        is_budget_centre_member(...) AND (type='expense'
--                                                         OR can_view_income(...))
--                                                           — row-branched: expenses
--                                                             to all members, INCOME
--                                                             ROWS to viewIncome roles
--                                                             only (rls_transactions.sql)
--   budget_categories   is_budget_centre_member(...)        — uniform, no role branch
--   budget_cycles       member of the hub                   — uniform, no role branch
--
-- Publishing the first two would put income payloads — `label`,
-- `expected_amount`, whole income transaction rows — onto a channel that
-- `standard` members subscribe to. Supabase does apply SELECT RLS per subscriber
-- for postgres_changes, so in principle those payloads are filtered out. But:
--
--   (a) it cannot be verified from this repo, only in the live project;
--   (b) `transactions` needs a ROW-LEVEL branch (type='expense' OR …) to be
--       evaluated per event, not a whole-table gate, and postgres_changes accepts
--       exactly ONE filter per subscription, so the client cannot narrow it;
--   (c) F1 (2026-07-12) proved this exact data leaked when a membership-only
--       predicate was assumed sufficient, and F1's write-side twin (2026-07-16)
--       proved it again. "RLS presumably handles it" is the assumption that has
--       now failed twice on these two tables.
--
-- A ticker table removes the question instead of answering it. The payload on the
-- wire is `{ budget_centre_id, rev, updated_at }` for EVERY subscriber, whatever
-- their role. There is no financial content to leak, so there is no per-subscriber
-- RLS evaluation to get wrong. The refetch that follows goes through
-- transactions.service / income.service as usual, where the real policies apply
-- unchanged. Defence in depth also survives: hub_activity carries its own
-- membership SELECT policy, so a non-member cannot even learn that a hub is busy.
--
-- Secondary wins: one channel per hub instead of four; a fifth table added later
-- needs a trigger, not a new subscription; and WAL volume is one narrow row per
-- write instead of full tuples of the ledger.
--
-- ── GRANULARITY (accepted) ──────────────────────────────────────────────────
-- The triggers are FOR EACH ROW, so a bulk insert of N categories bumps N times
-- and broadcasts N events. The client debounces 300ms and coalesces them into one
-- refetch, so this costs messages, not requests. A statement-level trigger with a
-- transition table would halve the noise at the cost of real complexity; revisit
-- only if message volume becomes a billing concern.
--
-- ── WHAT IS NOT COVERED ─────────────────────────────────────────────────────
-- budget_centre_members is deliberately NOT triggered. Membership changes drive
-- the removedFromHub / needsOnboarding state machine in useBudgetCentre, which
-- reloadHub() does not re-run; a removed member still loses access on their next
-- relaunch. Wiring that live is a separate change with its own UX question
-- ("you were removed from this hub" mid-session), not a freshness fix.
--
-- SAFE TO RE-RUN. Creates nothing twice; the publication add is guarded.
--
-- ── ROLLBACK (down-migration) ───────────────────────────────────────────────
--   BEGIN;
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.hub_activity;
--   DROP TRIGGER IF EXISTS trg_hub_activity_transactions      ON public.transactions;
--   DROP TRIGGER IF EXISTS trg_hub_activity_income_sources    ON public.income_sources;
--   DROP TRIGGER IF EXISTS trg_hub_activity_budget_categories ON public.budget_categories;
--   DROP TRIGGER IF EXISTS trg_hub_activity_budget_cycles     ON public.budget_cycles;
--   DROP FUNCTION IF EXISTS public.bump_hub_activity();
--   DROP TABLE IF EXISTS public.hub_activity;
--   COMMIT;
--   -- The client degrades cleanly: subscribeToHubActivity's channel simply never
--   -- receives an event, and the foreground refetch + pull-to-refresh still work.
-- =============================================================================

BEGIN;

-- ── 1. The ticker table ─────────────────────────────────────────────────────
-- One row per hub. `rev` is a monotonic counter, not a timestamp comparison, so
-- two writes inside the same clock tick still produce two distinct revisions.
CREATE TABLE IF NOT EXISTS public.hub_activity (
  budget_centre_id uuid        PRIMARY KEY REFERENCES public.budget_centres(id) ON DELETE CASCADE,
  rev              bigint      NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hub_activity IS
  'Contentless realtime ticker: one row per hub, bumped by triggers on the cycle-aware tables. Carries NO financial data by design — see migrate_33.';

-- ── 2. RLS — read-only to members, write-only to the trigger ────────────────
-- SELECT: hub members (same gate as budget_categories / budget_cycles). There are
-- deliberately NO insert/update/delete policies: RLS is default-deny, so the only
-- writer is the SECURITY DEFINER trigger below. The REVOKEs make that explicit
-- rather than relying on policy absence alone (cf. CLAUDE.md §9.6 — Supabase's
-- pg_default_acl grants on new objects directly to anon AND authenticated).
ALTER TABLE public.hub_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hub_activity_select_member ON public.hub_activity;
CREATE POLICY hub_activity_select_member ON public.hub_activity
  FOR SELECT TO public
  USING (is_budget_centre_member(budget_centre_id));

REVOKE ALL    ON TABLE public.hub_activity FROM PUBLIC;
REVOKE ALL    ON TABLE public.hub_activity FROM anon, authenticated;
GRANT  SELECT ON TABLE public.hub_activity TO authenticated;

-- ── 3. The bump ─────────────────────────────────────────────────────────────
-- SECURITY DEFINER because the member performing the write has no privilege on
-- hub_activity at all (see the REVOKEs above) — the trigger must be able to write
-- it on their behalf. It reads only budget_centre_id from the row and writes only
-- the counter, so it cannot become a privilege-escalation path.
CREATE OR REPLACE FUNCTION public.bump_hub_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hub uuid;
BEGIN
  v_hub := COALESCE(NEW.budget_centre_id, OLD.budget_centre_id);
  IF v_hub IS NOT NULL THEN
    INSERT INTO public.hub_activity AS ha (budget_centre_id, rev, updated_at)
    VALUES (v_hub, 1, now())
    ON CONFLICT (budget_centre_id)
    DO UPDATE SET rev = ha.rev + 1, updated_at = now();
  END IF;
  RETURN NULL;   -- AFTER trigger: the return value is ignored
END;
$$;

REVOKE ALL ON FUNCTION public.bump_hub_activity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_hub_activity() FROM authenticated, anon;

-- ── 4. The triggers ─────────────────────────────────────────────────────────
-- DELETE is included for completeness. In practice every removal in this codebase
-- is a soft delete (an UPDATE of deleted_at), which the UPDATE branch already
-- catches; a true DELETE only happens on a permanent hub wipe.
DROP TRIGGER IF EXISTS trg_hub_activity_transactions ON public.transactions;
CREATE TRIGGER trg_hub_activity_transactions
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.bump_hub_activity();

DROP TRIGGER IF EXISTS trg_hub_activity_income_sources ON public.income_sources;
CREATE TRIGGER trg_hub_activity_income_sources
  AFTER INSERT OR UPDATE OR DELETE ON public.income_sources
  FOR EACH ROW EXECUTE FUNCTION public.bump_hub_activity();

DROP TRIGGER IF EXISTS trg_hub_activity_budget_categories ON public.budget_categories;
CREATE TRIGGER trg_hub_activity_budget_categories
  AFTER INSERT OR UPDATE OR DELETE ON public.budget_categories
  FOR EACH ROW EXECUTE FUNCTION public.bump_hub_activity();

DROP TRIGGER IF EXISTS trg_hub_activity_budget_cycles ON public.budget_cycles;
CREATE TRIGGER trg_hub_activity_budget_cycles
  AFTER INSERT OR UPDATE OR DELETE ON public.budget_cycles
  FOR EACH ROW EXECUTE FUNCTION public.bump_hub_activity();

-- ── 5. Publish it (and ONLY it) to Realtime ─────────────────────────────────
-- Default replica identity (the primary key) is deliberate. REPLICA IDENTITY FULL
-- would ship the OLD row on every UPDATE and inflate the WAL for no gain: the
-- client reads nothing from the payload, it only counts the event.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE EXCEPTION 'FAIL: publication supabase_realtime does not exist on this project';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'hub_activity'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hub_activity;
  END IF;
END $$;

-- ── Verification — self-asserting; any failure RAISES and rolls the TX back ──
DO $$
DECLARE
  v_n    int;
  v_qual text;
  v_tbl  text;
BEGIN
  -- Table + RLS
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
    WHERE nsp.nspname = 'public' AND c.relname = 'hub_activity' AND c.relrowsecurity IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: hub_activity missing or RLS not enabled'; END IF;

  -- Exactly ONE policy, and it is a SELECT gated on membership. A write policy
  -- appearing here would mean a client can forge activity.
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='hub_activity';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: expected exactly 1 policy on hub_activity, found %', v_n; END IF;
  SELECT qual INTO v_qual FROM pg_policies
    WHERE schemaname='public' AND tablename='hub_activity' AND policyname='hub_activity_select_member' AND cmd='SELECT';
  IF v_qual IS NULL THEN RAISE EXCEPTION 'FAIL: hub_activity_select_member (SELECT) missing'; END IF;
  IF v_qual NOT LIKE '%is_budget_centre_member%' THEN
    RAISE EXCEPTION 'FAIL: hub_activity_select_member lost its membership gate — a non-member could watch a hub (qual: %)', v_qual;
  END IF;

  -- No client may write the ticker, by grant as well as by policy.
  IF has_table_privilege('authenticated', 'public.hub_activity', 'INSERT')
     OR has_table_privilege('authenticated', 'public.hub_activity', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.hub_activity', 'DELETE')
    THEN RAISE EXCEPTION 'FAIL: authenticated can write hub_activity — the ticker must be trigger-only'; END IF;
  IF has_table_privilege('anon', 'public.hub_activity', 'SELECT')
    THEN RAISE EXCEPTION 'FAIL: anon can read hub_activity — guests must not watch hub traffic'; END IF;
  IF NOT has_table_privilege('authenticated', 'public.hub_activity', 'SELECT')
    THEN RAISE EXCEPTION 'FAIL: authenticated cannot read hub_activity — realtime would deliver nothing'; END IF;

  -- The bump function must be SECURITY DEFINER, or it cannot write past the REVOKEs.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='bump_hub_activity' AND p.prosecdef IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: bump_hub_activity missing or not SECURITY DEFINER'; END IF;

  -- All four triggers present. A missing one is a silently stale table.
  FOREACH v_tbl IN ARRAY ARRAY['transactions','income_sources','budget_categories','budget_cycles'] LOOP
    SELECT count(*) INTO v_n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='public' AND c.relname = v_tbl AND t.tgname = 'trg_hub_activity_' || v_tbl
        AND t.tgisinternal IS FALSE;
    IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: trg_hub_activity_% missing on %', v_tbl, v_tbl; END IF;
  END LOOP;

  -- Published — and the four data tables are NOT. This is the whole point of the
  -- design: if a later change publishes income_sources or transactions, the leak
  -- analysis at the top of this file has to be redone, so fail loudly here.
  SELECT count(*) INTO v_n FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='hub_activity';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: hub_activity is not in the supabase_realtime publication'; END IF;

  SELECT string_agg(tablename, ', ') INTO v_tbl FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public'
      AND tablename IN ('transactions','income_sources','budget_categories','budget_cycles');
  IF v_tbl IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: these tables are published to Realtime and must not be — income payloads would reach `standard` members on the wire: %', v_tbl;
  END IF;

  RAISE NOTICE 'migrate_33 OK: hub_activity installed, member-read / trigger-write, 4 triggers live, published to Realtime; no data table is published.';
END $$;

COMMIT;

-- =============================================================================
-- MANUAL VERIFICATION
--
-- A. The ticker bumps on a write (run as a hub member, against a real hub):
--   SELECT rev FROM hub_activity WHERE budget_centre_id = '<hub-uuid>';
--   -- ...log an expense in the app...
--   SELECT rev FROM hub_activity WHERE budget_centre_id = '<hub-uuid>';
--   -- expect rev to have increased
--
-- B. A client cannot forge activity:
--   UPDATE hub_activity SET rev = 999 WHERE budget_centre_id = '<hub-uuid>';
--   -- expect: permission denied for table hub_activity
--
-- C. A non-member sees nothing (run as a user in a different hub):
--   SELECT * FROM hub_activity WHERE budget_centre_id = '<someone-elses-hub>';
--   -- expect 0 rows
--
-- D. What the wire actually carries — the claim this design rests on. In the app,
--    DevTools → Network → WS → the realtime socket → Messages. Every payload for
--    `hub_activity` must contain ONLY budget_centre_id / rev / updated_at. If any
--    message carries an amount, a label or a category name, stop and re-read the
--    leak analysis at the top of this file.
--
-- E. Two devices: log an expense on device A; device B's dashboard should update
--    within ~1s without being touched.
-- =============================================================================
