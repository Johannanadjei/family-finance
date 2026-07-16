-- =============================================================================
-- f1_writecheck_diag.sql   (F1 RLS audit — write-check discrimination, read-only)
--
-- ONE statement, ONE result set — the Supabase SQL editor only renders the LAST
-- result, so anything else returning rows would hide this grid. The RLS-status and
-- full-policy-dump queries are parked at the bottom as comments; run them
-- separately if section 2 turns out not to settle it.
--
-- WHY THIS EXISTS
-- The BEFORE probe contradicted its own EXPECTED block on two tests:
--   T2 income_sources UPDATE (blind PATCH)  -> ACTUAL 0 rows   (expected 1 row, leak)
--   T4 transactions UPDATE expense->income  -> ACTUAL 42501     (expected 1 row, leak)
-- Both are AFTER-state signatures, but no write migration has been applied. This
-- query settles why, before migrate_24/25 are touched.
--
-- LEADING HYPOTHESIS — `with_check IS NULL` does NOT mean "no check". Postgres:
-- "If only a USING clause is specified, that clause will be used for both the
-- USING and WITH CHECK cases." So a NULL with_check INHERITS qual. If qual on
-- transactions_update is already type-aware, the inherited check rejects an income
-- post-image on its own — which is exactly T4, with no DB drift required.
--
-- THE ROW THAT ANSWERS IT — transactions_update:
--   check_type = INHERITED and effective_check mentions type/can_view_income
--     -> hypothesis confirmed. Path (d) was already closed; the "with_check NULL =
--        vulnerable" inference was wrong. migrate_24's UPDATE half is hardening
--        (making an inherited check explicit), not a fix.
--   check_type = INHERITED and effective_check is bare membership
--     -> hypothesis dead. Something else rejected T4; look at `permissive` for a
--        RESTRICTIVE policy, and at any policyname we never named.
--   check_type = EXPLICIT
--     -> DRIFT. Last session read this as NULL live. migrate_24 partially applied,
--        or someone changed it. STOP and reconcile before applying anything.
--
-- (T2 needs no query: an UPDATE ... WHERE must READ the row, so SELECT policies
-- apply to the existing row. migrate_22 made it invisible to a standard member, so
-- the UPDATE matches nothing. The read-side fix closed that path as a side effect.)
--
-- READ-ONLY. Catalog reads only — no writes, no DDL, safe to run on production.
-- =============================================================================

SELECT
  tablename,
  policyname,
  cmd,
  permissive,                                   -- RESTRICTIVE would AND in, and would
                                                -- NOT have shown up as an OR-trap earlier
  CASE
    WHEN with_check IS NOT NULL THEN 'EXPLICIT'
    WHEN qual IS NOT NULL       THEN 'INHERITED (with_check IS NULL -> qual is reused)'
    ELSE                             'NO CHECK AT ALL'
  END                        AS check_type,
  coalesce(with_check, qual) AS effective_check, -- what ACTUALLY gates the new row
  qual,                                          -- USING — read this as closely as with_check
  with_check                                     -- explicit WITH CHECK, if any
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('transactions', 'income_sources')
ORDER BY
  -- write paths first: the UPDATE rows are the ones under investigation
  CASE cmd WHEN 'UPDATE' THEN 0 WHEN 'INSERT' THEN 1 WHEN 'ALL' THEN 2 ELSE 3 END,
  tablename,
  policyname;


-- ── Parked: RLS enabled / forced. Run on its own if needed. ──────────────────
-- SELECT relname,
--        relrowsecurity      AS rls_enabled,
--        relforcerowsecurity AS rls_forced_for_owner
-- FROM pg_class
-- WHERE oid IN ('public.transactions'::regclass, 'public.income_sources'::regclass);
