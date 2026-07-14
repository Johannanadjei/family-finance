-- =============================================================================
-- f1_preflight_check.sql   (F1 RLS audit — pre-flight, READ ONLY)
--
-- Run in the Supabase SQL editor BEFORE applying migrate_22 / migrate_23.
-- Contains NO writes, NO DDL, NO transaction — it only reads pg_policies / pg_proc.
--
-- STATE WHEN THIS WAS WRITTEN (2026-07-13):
--   can_view_income.sql has ALREADY been applied ("Success, no rows returned",
--   its DO-block self-verify raised no exception). It is inert — it creates a
--   helper function and changes no policy. So CHECK 4 below now expects the
--   helper to EXIST (count = 1). A count of 0 would mean that apply did not land.
--
-- GO / STOP gates — all four must hold before migrate_22 is applied:
--   1. income_sources policy count = 4  AND  transactions policy count = 4
--      (both migrations assert "= 4"; any other count makes them ABORT)
--   2. income_sources_select_member and transactions_select_member still gate on
--      bare is_budget_centre_member() — i.e. neither migration has run yet
--   3. No OTHER permissive SELECT policy on either table grants membership-only
--      read (it would OR the leak straight back open)
--   4. can_view_income() EXISTS exactly once — confirming the helper apply landed
-- =============================================================================

WITH counts AS (
  SELECT tablename, count(*)::text AS n
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('income_sources', 'transactions')
  GROUP BY tablename
),
quals AS (
  SELECT tablename, policyname, cmd, permissive, coalesce(qual, '(null)') AS qual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('income_sources', 'transactions')
),
helper AS (
  SELECT count(*)::text AS n
  FROM pg_proc
  WHERE proname = 'can_view_income'
)

-- CHECK 1: total policy count per table (BOTH must be exactly 4)
SELECT
  '1. POLICY COUNT'                                            AS check,
  tablename                                                    AS subject,
  n                                                            AS value,
  CASE WHEN n = '4' THEN 'OK - matches the =4 assertion'
       ELSE 'STOP - assertion in migrate_22/23 will ABORT' END AS verdict
FROM counts

UNION ALL

-- CHECK 2: the two _select_member quals (must still be bare is_budget_centre_member)
SELECT
  '2. TARGET QUAL',
  tablename || '.' || policyname,
  qual,
  CASE
    WHEN qual LIKE '%can_view_income%'
      THEN 'STOP - ALREADY MIGRATED, DB is not in the pre-migration state'
    WHEN qual LIKE '%is_budget_centre_member%' AND qual NOT LIKE '%type%'
      THEN 'VULNERABLE as expected - safe to migrate'
    ELSE 'STOP - unexpected qual, not what the migration was written against'
  END
FROM quals
WHERE policyname IN ('income_sources_select_member', 'transactions_select_member')

UNION ALL

-- CHECK 3: every OTHER policy on both tables, for the full picture.
--          Confirms _select_owner is creator-scoped, and that nothing else grants
--          membership-only SELECT back through the permissive OR.
SELECT
  '3. OTHER POLICIES',
  tablename || '.' || policyname || '  [' || cmd || '/' || permissive || ']',
  qual,
  CASE
    WHEN cmd = 'SELECT' AND permissive = 'PERMISSIVE' AND qual LIKE '%is_budget_centre_member%'
      THEN 'WATCH - permissive SELECT on membership; would re-open leak via OR'
    ELSE 'informational'
  END
FROM quals
WHERE policyname NOT IN ('income_sources_select_member', 'transactions_select_member')

UNION ALL

-- CHECK 4: can_view_income must now EXIST (the helper apply already ran).
SELECT
  '4. HELPER EXISTS',
  'public.can_view_income',
  n,
  CASE WHEN n = '1' THEN 'OK - helper landed; migrate_22/23 can reference it'
       WHEN n = '0' THEN 'STOP - helper MISSING; the can_view_income apply did not land, migrate_22 will ABORT'
       ELSE 'STOP - multiple overloads, ambiguous' END
FROM helper

ORDER BY 1, 2;