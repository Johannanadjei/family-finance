-- =============================================================================
-- f2_identity_fk_diag.sql   (Identity/erasure audit — FK topology, READ ONLY)
--
-- Run in the Supabase SQL editor. Contains NO writes, NO DDL, NO transaction —
-- it only reads pg_constraint / pg_class / pg_namespace / pg_attribute.
--
-- WHY THIS EXISTS (2026-08-30):
--   privacy.md §5.1(c) promises a deletion right, and §6.2 promises deletion or
--   anonymisation within 90 days of account closure. A code trace found the app
--   has NO account-deletion flow, NO hard deletes (every service writes
--   deleted_at), and NO erasure/anonymisation routine anywhere in src/ or the 63
--   SQL scripts. Worse, the FK topology in schema_base.sql suggests deleting an
--   identity row would ERROR rather than cascade:
--
--     public.users.id -> auth.users(id)              ON DELETE CASCADE  (:203)
--     user_preferences.user_id      -> public.users  no ON DELETE clause (:204)
--     budget_centres.owner_id       -> public.users  no ON DELETE clause (:205)
--     budget_centre_members.user_id -> public.users  no ON DELETE clause (:207)
--     transactions.logged_by_user_id-> public.users  no ON DELETE clause (:214)
--
--   No ON DELETE clause = NO ACTION. So the CASCADE from auth.users into
--   public.users is then refused by those four references. Because
--   handle_new_user() seeds a user_preferences row for EVERY signup, this would
--   block for every account — even one that never logged a transaction.
--
-- WHY IT MUST BE CONFIRMED LIVE, NOT READ FROM THE REPO:
--   schema_base.sql:5-9 warns that some production objects were created by hand
--   in the SQL Editor and only later back-filled into the repo. The repo is a
--   copy, not the authority. This query diffs live state against that copy.
--
-- HOW TO READ THE OUTPUT:
--   verdict = 'matches repo'            -> repo is accurate for that FK
--   verdict = 'MISMATCH'                -> live ON DELETE differs; repo is stale
--   verdict = 'IN REPO, MISSING LIVE'   -> repo overstates what is enforced
--   verdict = 'LIVE ONLY - not in repo' -> UNDOCUMENTED FK into an identity
--                                          table; another blocker the erasure
--                                          design must handle. Read these rows
--                                          carefully — they are the hazard
--                                          schema_base.sql:5-9 warns about.
--   effect_on_erasure = 'BLOCKS parent delete' -> NO ACTION/RESTRICT: a delete
--                                          of the parent identity row errors
--                                          while any child row exists.
--
-- NOTE ON ROLE: the SQL editor runs as a privileged role, so catalog access is
-- unrestricted and RLS does not filter anything here.
--
-- NOTE ON THE ::text CASTS — DO NOT REMOVE THEM:
--   pg_constraint.confdeltype is the internal "char" type (not char(n)), and
--   pg_namespace.nspname / pg_class.relname / pg_attribute.attname are "name".
--   Concatenating those with an untyped literal is AMBIGUOUS and Postgres
--   rejects it outright:
--       ERROR: 42725: operator is not unique: unknown || "char"
--   (hit on the first run of this file, 2026-08-30). Every operand of a || here
--   is therefore cast explicitly.
--   The COMPARISONS are a different matter and need no cast: `CASE c.confdeltype
--   WHEN 'a'` and `WHERE c.contype = 'f'` resolve the untyped literal to "char"
--   against the unique "char" = "char" operator. Those are correct as written —
--   casting them would be noise, not a fix.
-- =============================================================================

WITH live AS (
  SELECT
    c.conname                                   AS constraint_name,
    chn.nspname::text || '.' || ch.relname::text  AS child_table,
    prn.nspname::text || '.' || pr.relname::text  AS parent_table,
    (SELECT string_agg(a.attname::text, ', ' ORDER BY k.ord)
       FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
       JOIN pg_attribute a
         ON a.attrelid = c.conrelid AND a.attnum = k.attnum)  AS child_columns,
    CASE c.confdeltype
      WHEN 'a' THEN 'NO ACTION'   WHEN 'r' THEN 'RESTRICT'
      WHEN 'c' THEN 'CASCADE'     WHEN 'n' THEN 'SET NULL'
      WHEN 'd' THEN 'SET DEFAULT' ELSE 'UNKNOWN:' || c.confdeltype::text
    END                                         AS on_delete_live,
    c.confdeltype::text                         AS raw_confdeltype
  FROM pg_constraint c
  JOIN pg_class     ch  ON ch.oid  = c.conrelid
  JOIN pg_namespace chn ON chn.oid = ch.relnamespace
  JOIN pg_class     pr  ON pr.oid  = c.confrelid
  JOIN pg_namespace prn ON prn.oid = pr.relnamespace
  WHERE c.contype = 'f'
    AND c.confrelid IN ('public.users'::regclass, 'auth.users'::regclass)
),
repo (constraint_name, child_table, on_delete_repo) AS (
  VALUES
    ('users_id_fkey',                       'public.users',                 'CASCADE'),
    ('user_preferences_user_id_fkey',       'public.user_preferences',      'NO ACTION'),
    ('budget_centres_owner_id_fkey',        'public.budget_centres',        'NO ACTION'),
    ('budget_centre_members_user_id_fkey',  'public.budget_centre_members', 'NO ACTION'),
    ('transactions_logged_by_user_id_fkey', 'public.transactions',          'NO ACTION')
)
SELECT
  COALESCE(l.constraint_name, r.constraint_name) AS constraint_name,
  COALESCE(l.child_table,     r.child_table)     AS child_table,
  l.child_columns,
  l.parent_table,
  l.on_delete_live,
  l.raw_confdeltype,
  r.on_delete_repo,
  CASE
    WHEN l.constraint_name IS NULL           THEN 'IN REPO, MISSING LIVE'
    WHEN r.constraint_name IS NULL           THEN 'LIVE ONLY - not in repo'
    WHEN l.on_delete_live = r.on_delete_repo THEN 'matches repo'
    ELSE 'MISMATCH'
  END AS verdict,
  CASE
    WHEN l.on_delete_live IN ('NO ACTION','RESTRICT') THEN 'BLOCKS parent delete'
    WHEN l.on_delete_live IS NULL                     THEN '-'
    ELSE 'permits parent delete'
  END AS effect_on_erasure
FROM live l
FULL OUTER JOIN repo r ON r.constraint_name = l.constraint_name
ORDER BY (r.constraint_name IS NULL), COALESCE(l.child_table, r.child_table);
