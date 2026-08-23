-- rls_sweep_preflight.sql
--
-- STEP 0 PREFLIGHT — RLS cap-enforcement sweep (docs/rls-cap-enforcement-plan.md).
-- Scope: Leaks 1 + 3 only. Leak 2 is a deliberate won't-fix, so the plan's P3
-- (default ACL for new helpers) and P5 (guest read paths) are retired — they only
-- ever gated Leak 2's new functions and restrictive policies.
--
-- Covers every remaining BLOCKING check in one run: P1/P1b (policy drift),
-- P2/P2b/P2c (FORCE RLS + definer ownership), P4/P4b (relation-level privileges),
-- and P6 (informational only — Leak 2 is skipped).
--
-- ═══ READ ONLY — and verifiably so ════════════════════════════════════════════
-- This file is ONE statement: a WITH clause, ten SELECT branches joined by
-- UNION ALL, one ORDER BY, one semicolon at the very end. Nothing else.
-- It reads pg_class, pg_policies, pg_proc, pg_roles, pg_namespace, and takes three
-- COUNT(*)s. It changes nothing and can be run on production.
--
-- The file deliberately contains NO write or schema keywords anywhere — not in the
-- SQL, not in a comment, not inside a quoted string. An earlier draft embedded a
-- regex literal spelling out a write keyword, in order to SEARCH for that keyword
-- inside pg_proc.prosrc. The Supabase editor's pre-run text scan matched the
-- literal and warned about a schema change that did not exist. The words are gone
-- rather than explained away, so the scan has nothing left to match.
--
-- Two places where that constraint shaped the SQL, both noted again at the point
-- of use so a later reader does not "tidy" them back:
--   • P4 reads privilege LETTERS from pg_class.relacl instead of querying the
--     standard privileges view in information_schema, whose own identifiers carry
--     an ACL verb. The letters are also more precise than that view.
--   • P1 reports the per-policy command from pg_policies.cmd as DATA. No branch
--     filters on a command name, so no command name appears as a literal.
--
-- To re-verify before running, grep this file for the write and schema verbs
-- (the nine of them: the four DML verbs, and the five schema verbs). Zero hits are
-- expected. The keyword list is intentionally NOT written out here — spelling it
-- in a comment would reintroduce exactly the text that caused the false warning.
-- If that grep is ever non-empty, do not run this file.
--
-- OUTPUT: one result set, four text columns — section | item | detail | verdict.
-- A single UNION on purpose: the Supabase editor renders only the LAST result set
-- when a script holds several statements, so separate SELECTs would silently
-- discard everything but the final one.
--
-- HOW TO READ IT: any verdict containing "BLOCKER" or "DRIFT" stops the sweep and
-- forces a redesign of the affected step. Paste the whole grid back.

WITH tbls AS (
  SELECT c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity,
         c.relowner, c.relacl
  FROM   pg_class c
  JOIN   pg_namespace n ON n.oid = c.relnamespace
  WHERE  n.nspname = 'public'
    AND  c.relname IN ('budget_categories','budget_centre_members','budget_cycles',
                       'transactions','income_sources','centre_invites',
                       'budget_centres','subscriptions')
),
targets AS (
  -- The two relations Leaks 1 and 3 actually touch. P1 and P4 are scoped to these.
  SELECT * FROM tbls
  WHERE  relname IN ('budget_categories','budget_centre_members')
),
fns AS (
  -- Every SECURITY DEFINER function in public. Listing them by name is what put
  -- keyword-shaped literals in the previous draft. Taking the whole set instead is
  -- both cleaner and wider — it cannot miss an RPC that was forgotten from a list.
  SELECT p.oid, p.proname, p.prosecdef, p.proowner,
         pg_get_function_identity_arguments(p.oid) AS args
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.prosecdef
    AND  p.prokind = 'f'
)

-- ═══ P1 — live policy text vs the repo rls_*.sql files ════════════════════════
-- Every "Before" table in the plan was transcribed from
-- scripts/rls_budget_categories.sql and scripts/rls_budget_centre_members.sql,
-- both marked "extracted verbatim from production 2026-06-05". Months of
-- hand-edits may have moved production away from them. This is the only check
-- that the plan is designed against what is actually running.
--
-- Read the detail column against the repo file line by line. Two things in
-- particular decide whether the Leak 1 / Leak 3 design still holds:
--   • the new-row clause on each policy — the plan relies on both row-change
--     policies currently having NONE, which is what makes the blind-write
--     fallback the thing being closed.
--   • permissive vs restrictive — the plan assumes all four on each relation are
--     permissive, so they OR together.
SELECT 'P1  policy (live)'::text                                     AS section,
       (tablename || ' :: ' || policyname)::text                     AS item,
       (cmd
         || '  |  ' || permissive
         || '  |  roles=' || roles::text
         || '  |  old-row '  || COALESCE(qual, '(none)')
         || '  |  new-row '  || COALESCE(with_check, '(none)'))::text AS detail,
       'compare line by line with the repo file'::text                AS verdict
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  tablename IN ('budget_categories','budget_centre_members')

UNION ALL
-- P1b — policy COUNT per relation. The plan expects exactly 4 on each. A count
-- above 4 is the dangerous direction: a policy that exists only in production has
-- no repo line to be compared against, so the row-by-row read above cannot
-- surface it by omission. A count below 4 means something was already removed.
SELECT 'P1b policy count',
       t.relname,
       count(p.policyname)::text || ' live (the plan expects 4)',
       CASE WHEN count(p.policyname) = 4 THEN 'ok'
            ELSE '*** DRIFT: repo files describe 4 — reconcile before writing ***'
       END
FROM   targets t
LEFT   JOIN pg_policies p
       ON p.schemaname = 'public' AND p.tablename = t.relname
GROUP  BY t.relname

UNION ALL
-- ═══ P2 — FORCE RLS ═══════════════════════════════════════════════════════════
-- THE blocking check for Leak 1, and with far higher stakes for Leak 3.
-- When relforcerowsecurity is true, policies apply to the owning role as well —
-- so the SECURITY DEFINER RPCs would NOT be exempt from the new policies, and a
-- deny-write policy would break the category RPC (Leak 1) and the hub RPC behind
-- new-user signup (Leak 3, MUST-PASS 3.3). Every "the RPCs are unaffected" claim
-- in the plan rests on this column reading false.
SELECT 'P2  force rls',
       relname,
       'rowsecurity=' || relrowsecurity
         || '   FORCE=' || relforcerowsecurity
         || '   owning role=' || relowner::regrole::text,
       CASE
         WHEN relforcerowsecurity
           THEN '*** BLOCKER: FORCE RLS is ON — the RPCs are NOT exempt ***'
         WHEN NOT relrowsecurity
           THEN '*** BLOCKER: RLS is OFF here — policies do nothing ***'
         ELSE 'ok'
       END
FROM   tbls

UNION ALL
-- ═══ P2b — do the SECURITY DEFINER owners match the owning roles? ═════════════
-- A SECURITY DEFINER function runs as the FUNCTION's owner. Policies are bypassed
-- for the relation's owning role (given FORCE off) or for any role holding
-- BYPASSRLS. A function owned by neither has RLS applied to its writes, which
-- collapses the premise of Leaks 1 and 3 even when P2 reads false. P2 and P2b only
-- mean something read together.
SELECT 'P2b secdef owner',
       f.proname || '(' || f.args || ')',
       'owner=' || f.proowner::regrole::text
         || '   bypassrls=' || r.rolbypassrls
         || '   super=' || r.rolsuper,
       CASE
         WHEN r.rolsuper OR r.rolbypassrls
           THEN 'ok — owner bypasses RLS outright'
         WHEN f.proowner IN (SELECT relowner FROM tbls)
           THEN 'ok — owner matches the relation owner'
         ELSE '*** BLOCKER: owner is neither a relation owner nor BYPASSRLS ***'
       END
FROM   fns f
JOIN   pg_roles r ON r.oid = f.proowner

UNION ALL
-- P2c — one owning role across the eight relations, or several? P2b compares
-- against the SET of owners. If that set has more than one member, "matches the
-- relation owner" has to be read per relation rather than as a single fact.
SELECT 'P2c owner spread',
       'distinct owning roles across the 8 relations',
       string_agg(DISTINCT relowner::regrole::text, ', '),
       CASE WHEN count(DISTINCT relowner) = 1
            THEN 'ok — single owner, P2b reads as one fact'
            ELSE 'read P2b per relation, not in aggregate' END
FROM   tbls

UNION ALL
-- ═══ P4 — relation-level privileges held by the client roles ══════════════════
-- Leaks 1 and 3 both close a door at the POLICY layer. Whether the client roles
-- ALSO hold the row-adding privilege at the relation level decides whether that
-- is the right instrument or merely the available one — and the choice should be
-- made knowingly. If the privilege is held, withdrawing it is a second and
-- independent lock. If it is not held, the policy is already the only thing
-- standing there, and the deny-write policy is exactly right.
--
-- Read from pg_class.relacl rather than the standard privileges view in
-- information_schema: that view's own identifiers carry an ACL verb, which is the
-- text this file must not contain. The letters are also more precise. An aclitem
-- renders as `<role>=<letters>/<owner>` — the letters that matter here are
--   r = read a row      a = add a row      w = change a row      d = remove a row
--   D = empty the relation   x = reference   t = trigger
-- An empty role name (rendered as `=r/owner`) means the pseudo-role PUBLIC.
SELECT 'P4  relation acl',
       t.relname || ' -> '
         || COALESCE(NULLIF(split_part(acl::text, '=', 1), ''), 'PUBLIC'),
       'letters=' || split_part(split_part(acl::text, '=', 2), '/', 1)
         || '   (full aclitem: ' || acl::text || ')',
       CASE
         WHEN split_part(split_part(acl::text, '=', 2), '/', 1) LIKE '%a%'
           THEN 'holds the row-add letter at relation level — a second lock is available'
         ELSE 'no row-add letter — the policy is the only gate on this path'
       END
FROM   targets t,
       unnest(t.relacl) AS acl
WHERE  COALESCE(NULLIF(split_part(acl::text, '=', 1), ''), 'PUBLIC')
       IN ('authenticated','anon','PUBLIC')

UNION ALL
-- P4b — did P4 return nothing for a relation because no client role holds
-- anything, or because the relation has no explicit ACL at all? A NULL relacl
-- means default privileges (owner only), and unnest of NULL yields no rows — so
-- silence in P4 would otherwise be ambiguous. This branch makes it explicit.
SELECT 'P4b acl present',
       t.relname,
       CASE WHEN t.relacl IS NULL
              THEN 'relacl IS NULL — default privileges, owner only'
            ELSE COALESCE(array_length(t.relacl, 1), 0)::text || ' aclitem entries'
       END,
       CASE WHEN t.relacl IS NULL
              THEN 'no client role holds anything at relation level — P4 silence explained'
            ELSE 'see the P4 rows above for the client-role entries'
       END
FROM   targets t

UNION ALL
-- ═══ P6 — NULL cycle_id row counts ════════════════════════════════════════════
-- INFORMATIONAL ONLY. These sized the `cycle_id IS NULL` fail-open clause in the
-- Leak 2 restrictive policies, which will not now be written. Kept because it was
-- queued, and because a surprising number here would be worth knowing regardless.
SELECT 'P6  null cycle_id (info)',
       'transactions',
       (SELECT count(*) FROM public.transactions WHERE cycle_id IS NULL)::text
         || ' of ' || (SELECT count(*) FROM public.transactions)::text || ' rows',
       'informational — Leak 2 skipped'

UNION ALL
SELECT 'P6  null cycle_id (info)',
       'budget_categories',
       (SELECT count(*) FROM public.budget_categories WHERE cycle_id IS NULL)::text
         || ' of ' || (SELECT count(*) FROM public.budget_categories)::text || ' rows',
       'informational — Leak 2 skipped'

UNION ALL
SELECT 'P6  null cycle_id (info)',
       'income_sources',
       (SELECT count(*) FROM public.income_sources WHERE cycle_id IS NULL)::text
         || ' of ' || (SELECT count(*) FROM public.income_sources)::text || ' rows',
       'informational — Leak 2 skipped'

ORDER BY 1, 2;
