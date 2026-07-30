-- =============================================================================
-- migrate_26_invite_token_scope.sql   (P0-A(a) — pre-launch hardening, 2026-07-30)
--
-- FIXES: EVERY pending invite in the database is readable by ANYONE holding the
--        public anon key — token, invited_email, budget_centre_id and role.
--
-- PAIRS WITH: accept_invite.sql (P0-A(b), the identity binding). Apply both —
--             they close ONE finding from two ends. Either alone shrinks it.
-- CLIENT:     ships WITH the invites.service.getInviteByToken swap to this RPC.
--             Run this migration FIRST. Between the migration and the client
--             deploy the OLD client shows "invalid invite" to anon visitors —
--             it fails CLOSED, which is why one transaction is fine pre-launch.
--
-- ── THE BUG ──────────────────────────────────────────────────────────────────
-- The policy named "Anyone can read pending invite by token" does not mention
-- the token at all:
--
--   FOR SELECT USING (status = 'pending' AND expires_at > now())
--
-- and it carries no TO clause, so it applies to PUBLIC — which includes `anon`.
-- The name describes the CLIENT's query (invites.service filtered .eq('token', …)),
-- not the policy. RLS never sees a WHERE clause, so the narrowing was never a
-- control: a bare
--
--   GET /rest/v1/centre_invites?select=*
--
-- with the anon key baked into the frontend bundle returns every live invite in
-- the project. Tokens are the whole authorization for /join, and
-- centre_invites.role admits 'full_access' — a role that can read household
-- income — so a leaked token is a hub JOIN, not merely an information leak.
--
-- ── WHY AN RPC AND NOT A TIGHTER POLICY ──────────────────────────────────────
-- "You may read only the row whose token you supplied" is NOT expressible as an
-- RLS predicate: a policy is evaluated per candidate row and cannot reference the
-- caller's WHERE clause. The token has to arrive as an ARGUMENT. That is exactly
-- what a SECURITY DEFINER function does — and it lets us project only the columns
-- /join needs instead of SELECT *, so the token is never echoed back.
--
-- ── WHAT KEEPS WORKING (verified in the source before writing this) ──────────
--   • anon /join — this RPC is granted to anon and is SECURITY DEFINER, so an
--     unauthenticated invitee still reads their invite. Asserted at (d).
--   • accept_invite — SECURITY DEFINER with its OWN internal token lookup. It
--     never depended on the dropped SELECT policy. Acceptance is unaffected.
--   • MembersSection's invite list — runs on "Hub managers can manage invites",
--     which is FOR ALL and therefore covers SELECT for owner/full_access.
--     UNTOUCHED, asserted at (f).
--   • "Invitee can accept their own invite" (FOR UPDATE, email-bound) — untouched,
--     asserted at (g).
-- What CHANGES for a real user: a `standard` member can no longer read their
-- hub's pending invites over REST. They were never shown them — the roster lives
-- behind can('settings') — so nothing visible changes.
--
-- ── MALFORMED TOKENS ─────────────────────────────────────────────────────────
-- p_token is TEXT, not UUID, and cast inside an exception block that returns NULL.
-- A junk token therefore yields "invite not found" instead of a raw cast error
-- surfacing to an unauthenticated visitor. The cast happens BEFORE the lookup so
-- the unique index on centre_invites(token) is still used.
--
-- REVERSIBLE: re-create the dropped policy from members_rbac.sql. This migration
-- reads no data and writes none — nothing is destructive.
-- =============================================================================

BEGIN;

-- 1. The token-scoped read path. Returns the invite as a json object shaped
--    EXACTLY like the select it replaces — { role, invited_email, expires_at,
--    budget_centres: { id, name, icon, currency } } — so JoinView needs no
--    change. NULL when the token is unknown, malformed, non-pending or expired;
--    the caller cannot distinguish those cases, which is deliberate (no oracle).
CREATE OR REPLACE FUNCTION public.get_invite_by_token(p_token text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token  uuid;
  v_result json;
BEGIN
  -- Guard the cast: an unauthenticated visitor with a mangled link gets a clean
  -- "not found", not a type error.
  BEGIN
    v_token := p_token::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;

  SELECT json_build_object(
           'role',           ci.role,
           'invited_email',  ci.invited_email,
           'expires_at',     ci.expires_at,
           'budget_centres', json_build_object(
             'id',       bc.id,
             'name',     bc.name,
             'icon',     bc.icon,
             'currency', bc.currency
           )
         )
    INTO v_result
    FROM centre_invites ci
    JOIN budget_centres bc ON bc.id = ci.budget_centre_id
   WHERE ci.token      = v_token
     AND ci.status     = 'pending'
     AND ci.expires_at > now()
     AND bc.deleted_at IS NULL;

  RETURN v_result;   -- NULL when nothing matched
END;
$$;

-- The /join screen is reachable without a session, so anon needs EXECUTE. Being
-- explicit rather than relying on Supabase's default ACL (CLAUDE.md §9.6): here
-- anon+authenticated IS the intent, so these grants are correct, not a hole.
REVOKE ALL     ON FUNCTION public.get_invite_by_token(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_invite_by_token(text) TO anon, authenticated;

-- 2. Close the leak. Nothing else grants a token-less read of centre_invites.
DROP POLICY IF EXISTS "Anyone can read pending invite by token" ON centre_invites;

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n int;
BEGIN
  -- (a) Function installed with the expected signature and return type.
  SELECT count(*) INTO v_n FROM pg_proc p
    JOIN pg_type t ON t.oid = p.prorettype
   WHERE p.proname = 'get_invite_by_token'
     AND pg_get_function_identity_arguments(p.oid) = 'p_token text'
     AND t.typname = 'json';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: get_invite_by_token(text) returning json not found (got %)', v_n; END IF;

  -- (b) SECURITY DEFINER — it must read centre_invites/budget_centres past RLS.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'get_invite_by_token' AND prosecdef IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: get_invite_by_token is not SECURITY DEFINER'; END IF;

  -- (c) STABLE (provolatile = 's').
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'get_invite_by_token' AND provolatile = 's';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: get_invite_by_token is not STABLE'; END IF;

  -- (d) MUST-PASS: anon AND authenticated hold EXECUTE. /join has no session, so
  --     a missing anon grant would break every legitimate invitee — fail loudly.
  SELECT count(*) INTO v_n FROM information_schema.routine_privileges
   WHERE routine_name    = 'get_invite_by_token'
     AND grantee        IN ('anon', 'authenticated')
     AND privilege_type  = 'EXECUTE';
  IF v_n < 2 THEN RAISE EXCEPTION 'FAIL: anon/authenticated lack EXECUTE on get_invite_by_token (got %) — /join would break', v_n; END IF;

  -- (e) MUST-FAIL: the leak is closed. No SELECT-command policy remains on
  --     centre_invites. The manager policy is FOR ALL (cmd='ALL'), so a
  --     cmd='SELECT' policy here could only be a token-less read grant.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'centre_invites' AND cmd = 'SELECT';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: % SELECT policy/policies still on centre_invites — token-less read remains open', v_n; END IF;

  -- (f) MUST-PASS: hub managers KEEP their invite list (MembersSection).
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'centre_invites'
     AND policyname = 'Hub managers can manage invites' AND cmd = 'ALL';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: manager policy missing — MembersSection would lose the invite list'; END IF;

  -- (g) MUST-PASS: the invitee's own accept-UPDATE policy is untouched.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'centre_invites'
     AND policyname = 'Invitee can accept their own invite';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: invitee accept policy missing'; END IF;

  -- (h) RLS still enabled (a disabled table would make all of the above moot).
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.centre_invites'::regclass)
    THEN RAISE EXCEPTION 'FAIL: RLS not enabled on centre_invites'; END IF;

  -- (i) Exactly 2 policies remain: the manager ALL policy + the invitee UPDATE.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'centre_invites';
  IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL: expected 2 policies on centre_invites, found %', v_n; END IF;

  RAISE NOTICE 'migrate_26 OK: token reads go through get_invite_by_token(text); world-readable invite policy dropped; anon EXECUTE + manager + invitee policies intact.';
END $$;

COMMIT;

-- =============================================================================
-- Post-commit checks with real sessions (test accounts) — BOTH directions:
--
-- MUST FAIL (the attack):
--   -- anon, no session: must return ZERO rows (was: every pending invite)
--   GET /rest/v1/centre_invites?select=token,invited_email,role
--   -- standard session: must now return ZERO rows (never had UI for it)
--   GET /rest/v1/centre_invites?select=*&budget_centre_id=eq.<hub>
--
-- MUST PASS (legitimate access):
--   -- anon: must return the invite json
--   POST /rest/v1/rpc/get_invite_by_token   {"p_token":"<a live token>"}
--   -- anon: must return null, NOT an error
--   POST /rest/v1/rpc/get_invite_by_token   {"p_token":"not-a-uuid"}
--   -- owner/full_access session: MembersSection list must still work
--   GET /rest/v1/centre_invites?select=*&budget_centre_id=eq.<hub>
--   -- the real invitee: /join end-to-end must still reach the dashboard
--
-- AFTER APPLYING: members_rbac.sql is updated in the same commit so a Strategy-B
-- replay cannot reintroduce the dropped policy.
-- =============================================================================
