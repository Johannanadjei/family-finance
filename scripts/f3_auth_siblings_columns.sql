-- =============================================================================
-- f3_auth_siblings_columns.sql  (Identity/erasure audit — auth.* siblings, READ ONLY)
--
-- Run in the Supabase SQL editor. NO writes, NO DDL, NO transaction — it reads
-- pg_attribute / pg_constraint / pg_class only. Returns object NAMES, TYPES and
-- FK actions, never any row data. No personal data can appear in the output.
--
-- WHY THIS EXISTS (2026-08-30):
--   f2_auth_users_columns.sql audited auth.users COLUMNS. It could not see
--   sibling tables, and f3_erasure_runbook.sql §B.7 touches five of them:
--
--     auth.identities     DELETE — identity_data holds the Google sub, email,
--                         name and picture. Leaving it would also leave a live
--                         OAuth login path around the scrambled password.
--     auth.sessions       DELETE — live session rows.
--     auth.refresh_tokens DELETE — live refresh credentials.
--     auth.mfa_factors    DELETE — holds a phone number and a friendly name.
--     auth.one_time_tokens DELETE — pending magic-link / recovery tokens.
--
--   These are Supabase-managed and defined nowhere in this repo, so the runbook's
--   assumptions about them cannot be verified from source. This query confirms
--   them live BEFORE the runbook is trusted with a real erasure — exactly the
--   role f2_auth_users_columns.sql played for auth.users.
--
-- ── THE ONE ROW THAT MATTERS MOST ────────────────────────────────────────────
--   section = 'CRITICAL', object = 'auth.refresh_tokens.user_id'
--
--   GoTrue stores THIS user_id as varchar, not uuid — it is the only one of the
--   five that differs. The runbook therefore casts: `WHERE user_id = v_uid::text`
--   (f3_erasure_runbook.sql §B.7). If this row comes back saying the live type is
--   uuid, that cast is WRONG and will fail with an operator error, aborting the
--   erasure transaction. Fix the cast before running the runbook.
--
-- ── HOW TO READ THE REST ─────────────────────────────────────────────────────
--   section = 'TABLE'
--     'EXISTS'  -> the runbook's to_regclass guard will let that DELETE run.
--     'ABSENT'  -> guard makes it a silent no-op. Fine, but know which ones
--                  are not actually being cleaned on this GoTrue version.
--
--   section = 'COLUMN'
--     'CONFIRMED - exists as expected'  -> the runbook's assumption holds.
--     'MISSING - revise the runbook'    -> that DELETE's WHERE clause is wrong.
--     'present (not in plan)'           -> READ THESE, the same way you read them
--                                          for auth.users. Any column here that
--                                          could hold a name, address, phone,
--                                          IP or device string is personal data
--                                          the runbook is not yet accounting
--                                          for. The rows are DELETED outright,
--                                          so an extra column is usually covered
--                                          automatically — but confirm that,
--                                          rather than assume it.
--     detail 'GENERATED (stored)'       -> expected on auth.identities.email:
--                                          it is derived from identity_data, so
--                                          it disappears with the row and cannot
--                                          be updated directly. Informational —
--                                          the runbook deletes rather than
--                                          updates, so nothing depends on it.
--
--   section = 'FK INTO'
--     Children referencing these five tables. 'BLOCKS parent delete' (NO ACTION
--     or RESTRICT) means a DELETE errors while a child row exists — the runbook
--     would abort and roll back. Expected here is CASCADE throughout
--     (auth.mfa_challenges -> mfa_factors, auth.refresh_tokens -> sessions).
--     Anything that BLOCKS must be handled in §B.7 before that DELETE.
--
--   section = 'NOT SCRUBBED'
--     auth.audit_log_entries. Holds IP addresses and login events on a separate
--     retention basis; the runbook deliberately does not touch it, and that is
--     open question #1 for counsel. Listed here only so its existence and size
--     are on the record — no column of it is read.
--
-- NOTE ON ROLE: the SQL editor runs as a privileged role, so catalog access is
-- unrestricted and RLS filters nothing here.
--
-- NOTE ON THE ::text CASTS — DO NOT REMOVE THEM. Same trap documented at length
-- in f2_identity_fk_diag.sql: pg_attribute.attname / pg_class.relname are "name"
-- and confdeltype is "char", and concatenating either with an untyped literal is
-- ambiguous ("operator is not unique: unknown || char"). Every || operand below
-- is cast explicitly.
-- =============================================================================

WITH expected_tables (tbl, planned_action) AS (
  VALUES
    ('auth.identities'::text,      'DELETE - Google sub/email/name/picture'::text),
    ('auth.sessions',              'DELETE - live sessions'),
    ('auth.refresh_tokens',        'DELETE - live refresh credentials'),
    ('auth.mfa_factors',           'DELETE - phone + friendly_name'),
    ('auth.one_time_tokens',       'DELETE - pending magic-link/recovery tokens')
),
live_tables AS (
  SELECT et.tbl, et.planned_action, to_regclass(et.tbl) AS reloid
    FROM expected_tables et
),
expected_cols (tbl, column_name, why) AS (
  VALUES
    -- The columns the runbook's WHERE clauses actually depend on.
    ('auth.identities'::text,   'user_id'::text,       'DELETE key'::text),
    ('auth.identities',         'identity_data',       'the PII payload being destroyed'),
    ('auth.identities',         'provider',            'context only'),
    ('auth.sessions',           'user_id',             'DELETE key'),
    ('auth.refresh_tokens',     'user_id',             'DELETE key - SEE THE CRITICAL ROW'),
    ('auth.refresh_tokens',     'session_id',          'cascade path from auth.sessions'),
    ('auth.mfa_factors',        'user_id',             'DELETE key'),
    ('auth.one_time_tokens',    'user_id',             'DELETE key')
),
live_cols AS (
  SELECT
    lt.tbl,
    a.attname::text                            AS column_name,
    format_type(a.atttypid, a.atttypmod)::text AS data_type,
    CASE WHEN a.attnotnull THEN 'NOT NULL' ELSE 'nullable' END AS nullability,
    CASE WHEN a.attgenerated <> '' THEN ' | GENERATED (stored)' ELSE '' END AS generated
  FROM live_tables lt
  JOIN pg_attribute a ON a.attrelid = lt.reloid
  WHERE lt.reloid IS NOT NULL
    AND a.attnum > 0
    AND NOT a.attisdropped
)
SELECT * FROM (

  -- ── 1. Does each table exist at all? ────────────────────────────────────────
  SELECT 1 AS sort, 'TABLE'::text AS section, lt.tbl AS object,
         CASE WHEN lt.reloid IS NULL THEN 'ABSENT' ELSE 'EXISTS' END AS detail,
         lt.planned_action AS planned,
         CASE WHEN lt.reloid IS NULL
              THEN 'ABSENT - to_regclass guard makes this DELETE a no-op'
              ELSE 'EXISTS - runbook DELETE will run' END AS verdict
    FROM live_tables lt

  -- ── 2. THE CRITICAL ROW: the refresh_tokens.user_id cast ────────────────────
  UNION ALL
  SELECT 0, 'CRITICAL', 'auth.refresh_tokens.user_id',
         COALESCE((SELECT lc.data_type FROM live_cols lc
                    WHERE lc.tbl = 'auth.refresh_tokens' AND lc.column_name = 'user_id'),
                  'column or table absent'),
         'runbook casts v_uid::text for this one comparison',
         CASE
           WHEN (SELECT lc.data_type FROM live_cols lc
                  WHERE lc.tbl = 'auth.refresh_tokens' AND lc.column_name = 'user_id') IS NULL
             THEN 'ABSENT - drop that DELETE from the runbook'
           WHEN (SELECT lc.data_type FROM live_cols lc
                  WHERE lc.tbl = 'auth.refresh_tokens' AND lc.column_name = 'user_id')
                LIKE 'character varying%'
             THEN 'CONFIRMED - the ::text cast in the runbook is correct'
           WHEN (SELECT lc.data_type FROM live_cols lc
                  WHERE lc.tbl = 'auth.refresh_tokens' AND lc.column_name = 'user_id') = 'text'
             THEN 'CONFIRMED - text; the ::text cast is correct'
           WHEN (SELECT lc.data_type FROM live_cols lc
                  WHERE lc.tbl = 'auth.refresh_tokens' AND lc.column_name = 'user_id') = 'uuid'
             THEN 'MISMATCH - live type is uuid. REMOVE the ::text cast in §B.7 or the erasure ABORTS'
           ELSE 'UNEXPECTED TYPE - inspect before running the runbook'
         END

  -- ── 3. Column-by-column: planned, missing, and the unplanned ones ───────────
  UNION ALL
  SELECT 2, 'COLUMN',
         COALESCE(lc.tbl, ec.tbl) || '.' || COALESCE(lc.column_name, ec.column_name),
         COALESCE(lc.data_type, '-') || ' | ' || COALESCE(lc.nullability, '-')
           || COALESCE(lc.generated, ''),
         COALESCE(ec.why, '(not referenced by the runbook)'),
         CASE
           WHEN lc.column_name IS NULL THEN 'MISSING - revise the runbook'
           WHEN ec.column_name IS NULL THEN 'present (not in plan)'
           ELSE 'CONFIRMED - exists as expected'
         END
    FROM live_cols lc
    FULL OUTER JOIN expected_cols ec
      ON ec.tbl = lc.tbl AND ec.column_name = lc.column_name

  -- ── 4. Anything referencing these tables that could BLOCK the DELETEs ───────
  UNION ALL
  SELECT 3, 'FK INTO',
         prn.nspname::text || '.' || pr.relname::text
           || '  <-  ' || chn.nspname::text || '.' || ch.relname::text,
         CASE c.confdeltype
           WHEN 'a' THEN 'NO ACTION'   WHEN 'r' THEN 'RESTRICT'
           WHEN 'c' THEN 'CASCADE'     WHEN 'n' THEN 'SET NULL'
           WHEN 'd' THEN 'SET DEFAULT' ELSE 'UNKNOWN:' || c.confdeltype::text
         END,
         c.conname::text,
         CASE WHEN c.confdeltype IN ('a','r')
              THEN 'BLOCKS parent delete - handle in runbook §B.7 before that DELETE'
              ELSE 'permits parent delete' END
    FROM pg_constraint c
    JOIN pg_class     ch  ON ch.oid  = c.conrelid
    JOIN pg_namespace chn ON chn.oid = ch.relnamespace
    JOIN pg_class     pr  ON pr.oid  = c.confrelid
    JOIN pg_namespace prn ON prn.oid = pr.relnamespace
   WHERE c.contype = 'f'
     AND c.confrelid IN (SELECT reloid FROM live_tables WHERE reloid IS NOT NULL)

  -- ── 5. On the record: the table the runbook deliberately leaves alone ───────
  UNION ALL
  SELECT 4, 'NOT SCRUBBED', 'auth.audit_log_entries',
         CASE WHEN to_regclass('auth.audit_log_entries') IS NULL
              THEN 'ABSENT' ELSE 'EXISTS' END,
         'holds IPs + login events; separate retention basis',
         'LEFT ALONE BY DESIGN - open question #1 for counsel'

) gate
ORDER BY sort, section, object;
