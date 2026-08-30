-- =============================================================================
-- f2_auth_users_columns.sql  (Identity/erasure audit — auth.users shape, READ ONLY)
--
-- Run in the Supabase SQL editor. NO writes, NO DDL, NO transaction — it reads
-- pg_attribute only. Returns column NAMES and TYPES, never any row data.
--
-- WHY THIS EXISTS (2026-08-30):
--   Step 7 of the erasure runbook anonymises the auth.users row IN PLACE rather
--   than deleting it, because subscriptions.user_id -> auth.users is ON DELETE
--   CASCADE (migrate_19_subscriptions.sql:33) and deleting the row would destroy
--   the billing records privacy.md §6.3 commits to retaining for 7 years.
--
--   auth.users is Supabase-managed and is NOT defined anywhere in this repo, so
--   its column list cannot be verified from source. This query confirms the
--   columns the runbook intends to scrub actually exist, with the types and
--   nullability the scrub assumes.
--
-- HOW TO READ THE OUTPUT:
--   verdict = 'CONFIRMED - exists as expected' -> runbook step 7 is safe for it
--   verdict = 'MISSING - revise runbook step 7'-> that scrub line must be dropped
--                                                 or renamed before the runbook
--                                                 is written
--   verdict = 'present (not in scrub plan)'    -> READ THESE. auth.users carries
--                                                 extra identity columns such as
--                                                 email_change / phone_change /
--                                                 raw_app_meta_data that can hold
--                                                 an email address or profile
--                                                 data. Any of these holding PII
--                                                 must be ADDED to the scrub.
--
--   nullability matters: a NOT NULL column cannot be scrubbed to NULL, so it
--   needs a tombstone value instead (the approach already planned for
--   public.users.email, which is NOT NULL and unique).
-- =============================================================================

WITH expected(column_name, planned_action) AS (
  VALUES
    ('email',              'scrub to tombstone'),
    ('encrypted_password', 'scramble - blocks re-authentication'),
    ('phone',              'scrub if present'),
    ('raw_user_meta_data', 'scrub - holds full_name from signup'),
    ('banned_until',       'set - hard-stops any future login')
),
live AS (
  SELECT
    a.attname::text                            AS column_name,
    format_type(a.atttypid, a.atttypmod)::text AS data_type,
    CASE WHEN a.attnotnull THEN 'NOT NULL' ELSE 'nullable' END AS nullability
  FROM pg_attribute a
  WHERE a.attrelid = 'auth.users'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped
)
SELECT
  COALESCE(l.column_name, e.column_name) AS column_name,
  l.data_type,
  l.nullability,
  e.planned_action,
  CASE
    WHEN l.column_name IS NULL THEN 'MISSING - revise runbook step 7'
    WHEN e.column_name IS NULL THEN 'present (not in scrub plan)'
    ELSE 'CONFIRMED - exists as expected'
  END AS verdict
FROM live l
FULL OUTER JOIN expected e ON e.column_name = l.column_name
ORDER BY (e.column_name IS NULL), COALESCE(l.column_name, e.column_name);
