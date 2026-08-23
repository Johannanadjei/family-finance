-- =============================================================================
-- rls_budget_centre_members.sql  —  v2 (2026-08-23)
--
-- v2 CLOSES LEAK 3 of the RLS cap-enforcement sweep (docs/rls-cap-enforcement-plan.md).
-- Unlike v1, this file is NOT a passive transcript of production — it CHANGES two
-- policies. Running it is a deliberate act. Step 0 preflight (GREEN, 2026-08-22,
-- scripts/rls_sweep_preflight.sql) and Step 3 (rls_budget_categories v2, verified
-- live) are its preconditions.
--
-- ⚠ HIGHEST-STAKES FILE IN THE SWEEP. If the definer-exemption assumption is wrong,
-- this does not degrade a feature — it breaks NEW-USER SIGNUP, because create_hub
-- writes the owner's own member row. The verify block asserts that precondition
-- rather than trusting it. Test 3.3 (a genuinely new account) is mandatory.
--
-- WHAT CHANGED FROM v1
--   budget_centre_members_insert  WITH CHECK is_budget_centre_owner(...)  →  WITH CHECK (false)
--   budget_centre_members_update  USING      is_budget_centre_owner(...)  →  USING (is_budget_centre_owner(...) AND deleted_at IS NULL)
--                                 WITH CHECK <none — blind-write fallback> →  WITH CHECK (is_budget_centre_owner(...))
--   The two SELECT policies are byte-identical to v1 and are recreated unchanged.
--
-- WHY (a) — INSERT denied outright.
-- v1's INSERT policy was already narrow (owner-only), but narrow at the WRONG
-- PARTY: the owner is precisely who the member cap (MEM01) constrains. An owner of
-- a Free hub at 2/2 could POST /rest/v1/budget_centre_members with their own token
-- and seat a third member without an invite ever existing. Membership must be
-- obtainable ONLY through create_invite (counts active + pending, issuance gate)
-- and accept_invite (counts active only, race-proof ceiling — Decision D8). Both
-- resolve the OWNER's tier. Deny-direct-insert is what turns MEM01 from a
-- front-door courtesy into a real ceiling. Neither asymmetry is changed here.
--
-- WHY (b) — deleted_at IS NULL on UPDATE's USING, not its WITH CHECK.
-- USING is evaluated against the OLD row, so a soft-deleted member matches nothing
-- and cannot be un-deleted. Putting the guard on WITH CHECK instead would REVERSE
-- this and break removeMember(): WITH CHECK sees the NEW row, whose deleted_at is
-- non-null by definition during a removal. The verify block asserts the guard is on
-- USING and ABSENT from WITH CHECK, because moving it is the one edit that looks
-- equivalent and is not.
--   Removal still works: the row is live at the moment of the UPDATE. Only a SECOND
--   update to an already-removed row is blocked — exactly the resurrection case.
--
-- WHY (c) — the explicit WITH CHECK is load-bearing, not redundant.
-- Given no WITH CHECK, Postgres silently reuses USING for the post-image. v1 had
-- none, so the new row was never checked: an owner could PATCH budget_centre_id and
-- move a member row into another hub they own. Same defect, same fix, as
-- rls_income_sources.sql and rls_transactions.sql already assert on.
--
-- ── THE UPSERT VECTOR — why (b) is load-bearing for a SECOND path ─────────────
-- This table has UNIQUE (budget_centre_id, user_id) (schema_base.sql:193), which
-- budget_categories does not. That makes a resurrection reachable WITHOUT any PATCH:
-- PostgREST supports upsert via `Prefer: resolution=merge-duplicates`, so an owner
-- can POST a member row that conflicts with a SOFT-DELETED row's unique key and
-- carries deleted_at = null — turning an "add" into an un-delete.
--
-- (a) DOES NOT CLOSE THIS. Postgres applies an INSERT policy's WITH CHECK only to
-- rows actually appended by the INSERT path; when the conflict path is taken
-- instead, WITH CHECK (false) is never evaluated. The write is governed by the
-- UPDATE policy: USING against the existing row, WITH CHECK against the merged row.
-- The soft-deleted row fails the new USING (deleted_at IS NULL) and the upsert is
-- rejected. Note ON CONFLICT DO UPDATE RAISES on a USING failure rather than
-- silently skipping the row the way a plain UPDATE does — so this vector fails loud.
--
-- So the deleted_at guard on USING closes two distinct doors, and it is the ONLY
-- thing closing the upsert one. Do not "simplify" it away on the reasoning that
-- INSERT is already denied — that reasoning is exactly wrong here.
--
-- ── PRE-EXISTING BUG THIS FILE DOES NOT CAUSE AND DOES NOT FIX ────────────────
-- Plan test 3.7 (owner re-invites a previously REMOVED member) is ALREADY BROKEN in
-- production, before and after this change, and the cause is in accept_invite, not
-- in RLS:
--   • accept_invite step 3's duplicate guard filters `deleted_at IS NULL`, so a
--     soft-deleted member is invisible to it and the flow proceeds (accept_invite.sql:117-124)
--   • step 4 is a BARE INSERT with no ON CONFLICT clause (accept_invite.sql:157-160)
--   • the soft-deleted row still occupies UNIQUE (budget_centre_id, user_id)
--   ⇒ the insert raises 23505 unique_violation. Re-invite fails.
-- The RPC is SECURITY DEFINER and exempt from every policy here, so this file
-- neither creates nor worsens it. Recorded because a future fix must go INSIDE the
-- RPC — `ON CONFLICT (budget_centre_id, user_id) DO UPDATE SET deleted_at = NULL,
-- role = EXCLUDED.role` — which is safe (definer, and MEM01 is already enforced at
-- step 3b above it). Do NOT "fix" it with a client-side PostgREST upsert: that is
-- the exact vector the paragraph above closes, and it would bypass MEM01 entirely.
--
-- WHY THE RPCs STILL WORK (preflight P2 / P2b — the blocker that had to clear first)
-- WITH CHECK (false) would break signup and every invite acceptance if the definer
-- RPCs were subject to these policies. They are not: budget_centre_members is owned
-- by `postgres`, which holds rolbypassrls = true, and relforcerowsecurity = false.
-- BYPASSRLS outranks FORCE, so the exemption holds even if FORCE were flipped on.
--
-- WRITERS TO THIS TABLE, AND WHICH LAYER GOVERNS THEM
--   create_hub          INSERT  SECURITY DEFINER — exempt. The owner's own member row (create_hub.sql:122).
--                                                 THIS IS WHY 3.3 IS THE MANDATORY TEST.
--   accept_invite       INSERT  SECURITY DEFINER — exempt. The invitee's row, with the MEM01 backstop.
--   members.service.js
--     getMembers        SELECT  governed here — unchanged by v2.
--     updateMemberRole  UPDATE  governed here. Live row passes the new USING.
--     removeMember      UPDATE  governed here. Row is live at removal time, so it passes.
--                               Re-removing an already-removed member now matches 0 rows
--                               (a silent no-op, not an error) — correct and idempotent.
--     NO client path INSERTs into this table — no insert anywhere in src/. (a) breaks nothing.
--
-- POLICIES INSTALLED BY THIS FILE (table: public.budget_centre_members, all PERMISSIVE, roles = public)
--   budget_centre_members_insert        INSERT  WITH CHECK false
--   budget_centre_members_select        SELECT  USING      is_budget_centre_member(budget_centre_id)
--   budget_centre_members_select_owner  SELECT  USING      is_budget_centre_owner(budget_centre_id)
--   budget_centre_members_update        UPDATE  USING      is_budget_centre_owner(budget_centre_id) AND deleted_at IS NULL
--                                               WITH CHECK is_budget_centre_owner(budget_centre_id)
--
-- NOTE the predicate difference from rls_budget_categories v2, which is deliberate
-- and matches what preflight P1 found live: categories' UPDATE is MEMBER-scoped
-- (any member edits a budget line), members' UPDATE is OWNER-scoped (only the owner
-- changes roles or removes people). Do not harmonise them.
--
-- Depends on is_budget_centre_member / is_budget_centre_owner (committed 9a92591) —
-- those helper functions MUST exist before these policies are created.
--
-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
-- The plan doc's Step 4 row said "re-run this file verbatim". That was true of v1
-- and is NOT true of this file — re-running it now REAPPLIES the fix. To restore
-- v1, either:
--     git show c926499:scripts/rls_budget_centre_members.sql
-- or paste this, which is v1's two changed policies verbatim:
--
--   BEGIN;
--   DROP POLICY IF EXISTS budget_centre_members_insert ON public.budget_centre_members;
--   CREATE POLICY budget_centre_members_insert ON public.budget_centre_members
--     FOR INSERT TO public
--     WITH CHECK (is_budget_centre_owner(budget_centre_id));
--   DROP POLICY IF EXISTS budget_centre_members_update ON public.budget_centre_members;
--   CREATE POLICY budget_centre_members_update ON public.budget_centre_members
--     FOR UPDATE TO public
--     USING (is_budget_centre_owner(budget_centre_id));
--   COMMIT;
--
-- Fully reversible, non-destructive: policy definitions only, no row is read,
-- written or deleted. The two SELECT policies are byte-identical across v1 and v2
-- and need no rollback at all.
--
-- MIGRATION RISK IF LOST: security gap on the membership table itself — the table
-- the is_budget_centre_member helper reads to gate every other table. Without
-- these, hub membership (who can join / see / modify members) is unguarded, and
-- the MEM01 member cap becomes bypassable by any hub owner with an HTTP client.
-- =============================================================================
BEGIN;

ALTER TABLE public.budget_centre_members ENABLE ROW LEVEL SECURITY;

-- LEAK 3 (a) — direct INSERT denied. create_hub / accept_invite are SECURITY
-- DEFINER and exempt, so this closes the MEM01 bypass without touching any
-- legitimate path. Do NOT "restore" the owner predicate here: is_budget_centre_owner
-- is exactly what let an owner at 2/2 seat a third member by curl. Narrow is not
-- the same as correct when it is narrow at the party the cap constrains.
DROP POLICY IF EXISTS budget_centre_members_insert ON public.budget_centre_members;
CREATE POLICY budget_centre_members_insert ON public.budget_centre_members
  FOR INSERT TO public
  WITH CHECK (false);

-- Unchanged from v1.
DROP POLICY IF EXISTS budget_centre_members_select ON public.budget_centre_members;
CREATE POLICY budget_centre_members_select ON public.budget_centre_members
  FOR SELECT TO public
  USING (is_budget_centre_member(budget_centre_id));

-- Unchanged from v1.
DROP POLICY IF EXISTS budget_centre_members_select_owner ON public.budget_centre_members;
CREATE POLICY budget_centre_members_select_owner ON public.budget_centre_members
  FOR SELECT TO public
  USING (is_budget_centre_owner(budget_centre_id));

-- LEAK 3 (b) + (c) — resurrection guard on the OLD row (USING), explicit post-image
-- rule on the NEW row (WITH CHECK).
--
-- The two clauses are deliberately NOT the same expression:
--   USING      adds deleted_at IS NULL → a removed member is untouchable, closing
--              BOTH the plain PATCH resurrection AND the merge-duplicates upsert
--              (see THE UPSERT VECTOR above — the INSERT deny does not cover it).
--              Role changes and removals of LIVE members still work.
--   WITH CHECK omits deleted_at → removeMember (live → removed) is still permitted.
--              It must NOT be copied from USING. Adding deleted_at IS NULL here
--              would block every member removal in the app.
DROP POLICY IF EXISTS budget_centre_members_update ON public.budget_centre_members;
CREATE POLICY budget_centre_members_update ON public.budget_centre_members
  FOR UPDATE TO public
  USING (is_budget_centre_owner(budget_centre_id) AND deleted_at IS NULL)
  WITH CHECK (is_budget_centre_owner(budget_centre_id));

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n     int;
  v_qual  text;
  v_check text;
BEGIN
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
    WHERE nsp.nspname = 'public' AND c.relname = 'budget_centre_members' AND c.relrowsecurity IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: RLS not enabled on budget_centre_members'; END IF;

  -- Precondition for (a). Stakes are higher here than on budget_categories: if the
  -- definer RPCs are NOT exempt, WITH CHECK (false) breaks create_hub, and new-user
  -- signup fails for everyone.
  SELECT count(*) INTO v_n
    FROM pg_class c
    JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
    JOIN pg_roles r       ON r.oid   = c.relowner
   WHERE nsp.nspname = 'public' AND c.relname = 'budget_centre_members'
     AND (r.rolbypassrls IS TRUE OR c.relforcerowsecurity IS FALSE);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL: budget_centre_members owner does not bypass RLS and FORCE is on — WITH CHECK (false) would break create_hub (NEW-USER SIGNUP) and accept_invite for every user. Do not install this file until preflight P2/P2b is green again.';
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='budget_centre_members' AND policyname='budget_centre_members_insert'       AND cmd='INSERT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: budget_centre_members_insert (INSERT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='budget_centre_members' AND policyname='budget_centre_members_select'       AND cmd='SELECT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: budget_centre_members_select (SELECT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='budget_centre_members' AND policyname='budget_centre_members_select_owner' AND cmd='SELECT';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: budget_centre_members_select_owner (SELECT) missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='budget_centre_members' AND policyname='budget_centre_members_update'       AND cmd='UPDATE';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: budget_centre_members_update (UPDATE) missing'; END IF;

  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='budget_centre_members';
  IF v_n <> 4 THEN RAISE EXCEPTION 'FAIL: expected 4 policies on budget_centre_members, found %', v_n; END IF;

  -- LEAK 3 (a) — the new-row clause must be the literal constant false.
  -- NULL is checked FIRST and on its own: on an INSERT policy a NULL with_check is
  -- not "no rule", it is NO RESTRICTION AT ALL.
  SELECT with_check INTO v_check FROM pg_policies
    WHERE schemaname='public' AND tablename='budget_centre_members' AND policyname='budget_centre_members_insert';
  IF v_check IS NULL THEN
    RAISE EXCEPTION 'FAIL: budget_centre_members_insert has NULL with_check — INSERT is UNRESTRICTED. Any user could seat themselves in any hub.';
  END IF;
  IF btrim(lower(v_check), '() ') <> 'false' THEN
    RAISE EXCEPTION 'FAIL: budget_centre_members_insert new-row clause is not the literal false — LEAK 3 REINTRODUCED. An owner can POST /rest/v1/budget_centre_members and seat members past the MEM01 cap without an invite. This is what a re-run of v1 of this file looks like (with_check: %)', v_check;
  END IF;

  SELECT qual, with_check INTO v_qual, v_check FROM pg_policies
    WHERE schemaname='public' AND tablename='budget_centre_members' AND policyname='budget_centre_members_update';

  -- LEAK 3 (b) — resurrection guard, on the OLD row. Closes BOTH the plain PATCH
  -- and the merge-duplicates upsert; the INSERT deny above covers neither.
  IF v_qual IS NULL THEN
    RAISE EXCEPTION 'FAIL: budget_centre_members_update has NULL qual — every member row in the table is updatable by anyone.';
  END IF;
  IF v_qual NOT LIKE '%deleted_at IS NULL%' THEN
    RAISE EXCEPTION 'FAIL: budget_centre_members_update USING does not carry deleted_at IS NULL — the RESURRECTION path is REINTRODUCED, by BOTH routes: PATCH deleted_at=null, and the PostgREST merge-duplicates UPSERT against the (budget_centre_id, user_id) unique key, which the INSERT policy does NOT cover (Postgres checks an INSERT WITH CHECK only for rows actually appended). An owner can restore removed members past the MEM01 cap (qual: %)', v_qual;
  END IF;
  IF v_qual NOT LIKE '%is_budget_centre_owner%' THEN
    RAISE EXCEPTION 'FAIL: budget_centre_members_update USING lost its ownership gate — role changes and removals are no longer owner-scoped (qual: %)', v_qual;
  END IF;

  -- LEAK 3 (c) — explicit post-image rule. NULL is checked FIRST and on its own: a
  -- NULL with_check is not "no rule", Postgres silently falls back to USING.
  IF v_check IS NULL THEN
    RAISE EXCEPTION 'FAIL: budget_centre_members_update has NULL with_check — the BLIND-WRITE path is REINTRODUCED. Postgres falls back to USING for the post-image, so an owner can PATCH budget_centre_id and move a member row into another hub.';
  END IF;
  IF v_check NOT LIKE '%is_budget_centre_owner%' THEN
    RAISE EXCEPTION 'FAIL: budget_centre_members_update WITH CHECK does not gate on ownership — a member row can be written into a hub the caller does not own (with_check: %)', v_check;
  END IF;
  -- The asymmetry is load-bearing. deleted_at belongs on USING (old row) ONLY.
  -- On WITH CHECK it would evaluate against the NEW row, whose deleted_at is
  -- non-null by definition during a removal — blocking every removeMember() call.
  IF v_check LIKE '%deleted_at%' THEN
    RAISE EXCEPTION 'FAIL: budget_centre_members_update WITH CHECK references deleted_at — this blocks ALL member removals (the new row always has deleted_at set). The guard belongs on USING, which sees the old row (with_check: %)', v_check;
  END IF;

  RAISE NOTICE 'rls_budget_centre_members v2 OK: RLS enabled + 4 policies installed. INSERT denied (create_hub / accept_invite are the only write doors); UPDATE carries the resurrection guard on USING — closing both PATCH and merge-duplicates upsert — and an explicit owner-scoped post-image WITH CHECK. LEAK 3 CLOSED.';
END $$;

COMMIT;
