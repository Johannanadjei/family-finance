-- =============================================================================
-- rls_budget_categories.sql  —  v2 (2026-08-23)
--
-- v2 CLOSES LEAK 1 of the RLS cap-enforcement sweep (docs/rls-cap-enforcement-plan.md).
-- Unlike v1, this file is NOT a passive transcript of production — it CHANGES two
-- policies. Running it is a deliberate act. Step 0 preflight (GREEN, 2026-08-22,
-- scripts/rls_sweep_preflight.sql) is its precondition.
--
-- WHAT CHANGED FROM v1
--   budget_categories_insert  WITH CHECK is_budget_centre_member(...)  →  WITH CHECK (false)
--   budget_categories_update  USING      is_budget_centre_member(...)  →  USING (is_budget_centre_member(...) AND deleted_at IS NULL)
--                             WITH CHECK <none — blind-write fallback> →  WITH CHECK (is_budget_centre_member(...))
--   The two SELECT policies are byte-identical to v1 and are recreated unchanged.
--
-- WHY (a) — INSERT denied outright rather than made tier-aware.
-- The category cap (CAT01) lived only in create_category(); any member could
-- POST /rest/v1/budget_categories with their own token and walk straight past it.
-- A tier-aware WITH CHECK cannot be written: counting rows in budget_categories
-- from inside a policy ON budget_categories is infinite policy recursion, it could
-- not hold the advisory lock create_category uses (two concurrent inserts at
-- limit-1 both pass), and it would still skip the RPC's name/amount validation and
-- icon defaulting. WITH CHECK (false) states the real rule instead of maintaining a
-- second, weaker copy of the cap: THIS TABLE HAS EXACTLY ONE WRITE DOOR, AND IT IS
-- create_category (plus create_categories_bulk for onboarding/rollforward).
--
-- WHY (b) — deleted_at IS NULL on UPDATE's USING, not its WITH CHECK.
-- USING is evaluated against the OLD row. A soft-deleted category therefore matches
-- nothing, so PATCH ...?id=eq.<deleted> setting deleted_at=null resurrects nothing.
-- Putting the guard on WITH CHECK instead would REVERSE this and break soft-delete:
-- WITH CHECK sees the NEW row, whose deleted_at is non-null by definition. The
-- verify block asserts the guard is on USING and ABSENT from WITH CHECK, because
-- moving it is the one edit that looks equivalent and is not.
--   Soft-delete still works: the row is live at the moment of the UPDATE (old row
--   passes). Only a SECOND update to an already-deleted row is blocked — exactly
--   the resurrection case, and nothing else.
--
-- WHY (c) — the explicit WITH CHECK is load-bearing, not redundant.
-- Given no WITH CHECK, Postgres silently reuses USING for the post-image. v1 had
-- none, so the new row was never checked and a member could PATCH budget_centre_id
-- to move a category into another hub. Same defect, same fix, as
-- rls_income_sources.sql and rls_transactions.sql already assert on.
--
-- NOT CLOSED HERE (deliberate): PATCH of cycle_id to concentrate existing categories
-- into one cycle. RLS cannot express "this UPDATE must not push the destination
-- cycle over its cap" — a WITH CHECK sees only the new row, and a same-table count
-- subquery recurses. The complete answer is a BEFORE INSERT OR UPDATE row trigger;
-- that is decision D3 in the plan and is NOT taken in this pass. Relocation cannot
-- create net-new categories, only concentrate ones already paid for.
--
-- WHY THE RPCs STILL WORK (preflight P2 / P2b — the blocker that had to clear first)
-- WITH CHECK (false) would brick every category write if the definer RPCs were
-- subject to these policies. They are not: budget_categories is owned by `postgres`,
-- which holds rolbypassrls = true, and relforcerowsecurity = false. BYPASSRLS
-- outranks FORCE, so the exemption holds even if FORCE were ever flipped on. The
-- verify block asserts this precondition rather than trusting the preflight to stay
-- true — if it ever fails, category creation is broken and this file says so.
--
-- WRITERS TO THIS TABLE, AND WHICH LAYER GOVERNS THEM
--   create_category            INSERT   SECURITY DEFINER — exempt. Holds the CAT01 cap + advisory lock.
--   create_categories_bulk     INSERT   SECURITY DEFINER — exempt. Onboarding starters + period rollforward.
--   reset_budget_period        UPDATE   SECURITY DEFINER — exempt. Soft-deletes categories.
--   categories.service.js
--     updateCategory           UPDATE   governed here. Already filters deleted_at client-side; now server-enforced.
--     deleteCategory           UPDATE   governed here. Row is live at delete time, so it passes.
--                                       Re-deleting an already-deleted row now matches 0 rows
--                                       (a silent no-op, not an error) — correct and idempotent.
--     NO client path INSERTs into this table. Verified by grep over src/ for
--     .from('budget_categories').insert — zero hits. (a) breaks nothing.
--
-- POLICIES INSTALLED BY THIS FILE (table: public.budget_categories, all PERMISSIVE, roles = public)
--   budget_categories_insert        INSERT  WITH CHECK false
--   budget_categories_select_member SELECT  USING      is_budget_centre_member(budget_centre_id)
--   budget_categories_select_owner  SELECT  USING      is_budget_centre_owner(budget_centre_id)
--   budget_categories_update        UPDATE  USING      is_budget_centre_member(budget_centre_id) AND deleted_at IS NULL
--                                           WITH CHECK is_budget_centre_member(budget_centre_id)
--
-- Depends on is_budget_centre_member / is_budget_centre_owner (committed 9a92591) —
-- those helper functions MUST exist before these policies are created.
--
-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
-- The plan doc says "re-run scripts/rls_budget_categories.sql verbatim". That was
-- true of v1 and is NOT true of this file — re-running it now REAPPLIES the fix.
-- To restore v1, either:
--     git show c926499:scripts/rls_budget_categories.sql
-- or paste this, which is v1's two changed policies verbatim:
--
--   BEGIN;
--   DROP POLICY IF EXISTS budget_categories_insert ON public.budget_categories;
--   CREATE POLICY budget_categories_insert ON public.budget_categories
--     FOR INSERT TO public
--     WITH CHECK (is_budget_centre_member(budget_centre_id));
--   DROP POLICY IF EXISTS budget_categories_update ON public.budget_categories;
--   CREATE POLICY budget_categories_update ON public.budget_categories
--     FOR UPDATE TO public
--     USING (is_budget_centre_member(budget_centre_id));
--   COMMIT;
--
-- Fully reversible, non-destructive: policy definitions only, no row is read,
-- written or deleted. Blast radius if wrong: category writes fail loudly with a
-- 42501 the user sees as an error toast — noisy, not silent, reverted in one paste.
--
-- MIGRATION RISK IF LOST: data-isolation collapse — any user could read/write any
-- hub's budget categories, and the CAT01 category cap becomes bypassable again by
-- anyone who can send an HTTP request with their own token.
-- =============================================================================
BEGIN;

ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;

-- LEAK 1 (a) — direct INSERT denied. create_category / create_categories_bulk are
-- SECURITY DEFINER and exempt, so this closes the cap bypass without touching any
-- legitimate path. Do NOT "restore" a membership predicate here: is_budget_centre_member
-- is exactly what let a member at 10/10 insert an 11th category by curl.
DROP POLICY IF EXISTS budget_categories_insert ON public.budget_categories;
CREATE POLICY budget_categories_insert ON public.budget_categories
  FOR INSERT TO public
  WITH CHECK (false);

-- Unchanged from v1.
DROP POLICY IF EXISTS budget_categories_select_member ON public.budget_categories;
CREATE POLICY budget_categories_select_member ON public.budget_categories
  FOR SELECT TO public
  USING (is_budget_centre_member(budget_centre_id));

-- Unchanged from v1.
DROP POLICY IF EXISTS budget_categories_select_owner ON public.budget_categories;
CREATE POLICY budget_categories_select_owner ON public.budget_categories
  FOR SELECT TO public
  USING (is_budget_centre_owner(budget_centre_id));

-- LEAK 1 (b) + (c) — resurrection guard on the OLD row (USING), explicit post-image
-- rule on the NEW row (WITH CHECK).
--
-- The two clauses are deliberately NOT the same expression, and the asymmetry is the
-- whole point:
--   USING      adds deleted_at IS NULL → a soft-deleted row is untouchable. Editing
--              and soft-deleting live rows still work (old row is live).
--   WITH CHECK omits deleted_at → soft-delete (live → deleted) is still permitted.
--              It must NOT be copied from USING. Adding deleted_at IS NULL here
--              would block every soft-delete in the app.
DROP POLICY IF EXISTS budget_categories_update ON public.budget_categories;
CREATE POLICY budget_categories_update ON public.budget_categories
  FOR UPDATE TO public
  USING (is_budget_centre_member(budget_centre_id) AND deleted_at IS NULL)
  WITH CHECK (is_budget_centre_member(budget_centre_id));

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n     int;
  v_qual  text;
  v_check text;
BEGIN
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
    WHERE nsp.nspname = 'public' AND c.relname = 'budget_categories' AND c.relrowsecurity IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: RLS not enabled on budget_categories'; END IF;

  -- Precondition for (a): the definer RPCs must be exempt from these policies, or
  -- WITH CHECK (false) silently breaks ALL category creation. Owner BYPASSRLS
  -- outranks FORCE, so either condition alone is sufficient.
  SELECT count(*) INTO v_n
    FROM pg_class c
    JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
    JOIN pg_roles r       ON r.oid   = c.relowner
   WHERE nsp.nspname = 'public' AND c.relname = 'budget_categories'
     AND (r.rolbypassrls IS TRUE OR c.relforcerowsecurity IS FALSE);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL: budget_categories owner does not bypass RLS and FORCE is on — WITH CHECK (false) would break create_category / create_categories_bulk for every user. Do not install this file until preflight P2/P2b is green again.';
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='budget_categories' AND policyname='budget_categories_insert'        AND cmd='INSERT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: budget_categories_insert (INSERT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='budget_categories' AND policyname='budget_categories_select_member' AND cmd='SELECT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: budget_categories_select_member (SELECT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='budget_categories' AND policyname='budget_categories_select_owner'  AND cmd='SELECT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: budget_categories_select_owner (SELECT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='budget_categories' AND policyname='budget_categories_update'        AND cmd='UPDATE';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: budget_categories_update (UPDATE) missing'; END IF;

  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='budget_categories';
  IF v_n <> 4 THEN RAISE EXCEPTION 'FAIL: expected 4 policies on budget_categories, found %', v_n; END IF;

  -- LEAK 1 (a) — the new-row clause must be the literal constant false.
  -- NULL is checked FIRST and on its own: on an INSERT policy a NULL with_check is
  -- not "no rule", it is NO RESTRICTION AT ALL — the widest possible state, and the
  -- one a careless re-run of v1 would leave behind.
  SELECT with_check INTO v_check FROM pg_policies
    WHERE schemaname='public' AND tablename='budget_categories' AND policyname='budget_categories_insert';
  IF v_check IS NULL THEN
    RAISE EXCEPTION 'FAIL: budget_categories_insert has NULL with_check — INSERT is UNRESTRICTED. The CAT01 cap bypass is wide open.';
  END IF;
  IF btrim(lower(v_check), '() ') <> 'false' THEN
    RAISE EXCEPTION 'FAIL: budget_categories_insert new-row clause is not the literal false — LEAK 1 REINTRODUCED. Any member can POST /rest/v1/budget_categories and walk past the CAT01 category cap. This is what a re-run of v1 of this file looks like (with_check: %)', v_check;
  END IF;

  SELECT qual, with_check INTO v_qual, v_check FROM pg_policies
    WHERE schemaname='public' AND tablename='budget_categories' AND policyname='budget_categories_update';

  -- LEAK 1 (b) — resurrection guard, on the OLD row.
  IF v_qual IS NULL THEN
    RAISE EXCEPTION 'FAIL: budget_categories_update has NULL qual — every row in the table is updatable by anyone.';
  END IF;
  IF v_qual NOT LIKE '%deleted_at IS NULL%' THEN
    RAISE EXCEPTION 'FAIL: budget_categories_update USING does not carry deleted_at IS NULL — the RESURRECTION path is REINTRODUCED. A member can PATCH a soft-deleted category back to life (deleted_at=null), restoring rows the CAT01 cap already counted as gone (qual: %)', v_qual;
  END IF;
  IF v_qual NOT LIKE '%is_budget_centre_member%' THEN
    RAISE EXCEPTION 'FAIL: budget_categories_update USING lost its membership gate — hub isolation on writes is gone (qual: %)', v_qual;
  END IF;

  -- LEAK 1 (c) — explicit post-image rule. NULL is checked FIRST and on its own: a
  -- NULL with_check is not "no rule", Postgres silently falls back to USING.
  IF v_check IS NULL THEN
    RAISE EXCEPTION 'FAIL: budget_categories_update has NULL with_check — the BLIND-WRITE path is REINTRODUCED. Postgres falls back to USING for the post-image, so a member can PATCH budget_centre_id and move a category into another hub.';
  END IF;
  IF v_check NOT LIKE '%is_budget_centre_member%' THEN
    RAISE EXCEPTION 'FAIL: budget_categories_update WITH CHECK does not gate on is_budget_centre_member — a category can be written into a hub the caller is not a member of (with_check: %)', v_check;
  END IF;
  -- The asymmetry is load-bearing. deleted_at belongs on USING (old row) ONLY.
  -- On WITH CHECK it would evaluate against the NEW row, whose deleted_at is
  -- non-null by definition during a soft delete — blocking every category deletion
  -- in the app. This asserts nobody "tidied" the two clauses into matching.
  IF v_check LIKE '%deleted_at%' THEN
    RAISE EXCEPTION 'FAIL: budget_categories_update WITH CHECK references deleted_at — this blocks ALL soft-deletes (the new row always has deleted_at set). The guard belongs on USING, which sees the old row (with_check: %)', v_check;
  END IF;

  RAISE NOTICE 'rls_budget_categories v2 OK: RLS enabled + 4 policies installed. INSERT denied (create_category is the only write door); UPDATE carries the resurrection guard on USING and an explicit post-image WITH CHECK. LEAK 1 CLOSED.';
END $$;

COMMIT;
