-- backfill_user_names.sql
--
-- One-time backfill for public.users rows where name is NULL or empty.
-- Run ONCE in the Supabase SQL Editor (already executed 2026-05-26).
--
-- Priority matches accept_invite RPC: full_name metadata → email prefix.
-- Only updates rows where name IS NULL or TRIM(name) = '' — never overwrites
-- a real existing name. Zero rows affected if all names are already set.
UPDATE public.users u
SET    name = COALESCE(
  NULLIF(TRIM(au.raw_user_meta_data->>'full_name'), ''),
  split_part(au.email, '@', 1)
)
FROM   auth.users au
WHERE  au.id = u.id
  AND  (u.name IS NULL OR TRIM(u.name) = '');
