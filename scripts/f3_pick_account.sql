-- =============================================================================
-- f3_pick_account.sql  (Identity erasure — dry-run account picker, READ ONLY)
--
-- Run in the Supabase SQL editor. ONE statement, SELECT only. No writes, no DDL,
-- no transaction, no function calls that mutate anything. Running it twice
-- changes nothing and running it by accident costs nothing.
--
-- WHY THIS EXISTS (2026-08-30):
--   Step 1 of the f3_erasure_runbook.sql dry run is choosing which account to
--   point it at. That choice needs per-account SHAPE — does this person own a
--   hub, is anyone else in it, did they ever log a transaction — because the
--   shape decides which branch of the runbook the dry run will exercise.
--   Reading it off the app screen by screen is slow and error-prone; this is the
--   same information in one row per account.
--
-- NO FULL ADDRESSES IN THE OUTPUT. masked_email is deliberately lossy
-- (a***@example.com): enough to recognise your own throwaway account, not enough
-- to be a personal-data extract of the whole user table. This matches the
-- discipline of the other f2_/f3_ diagnostics, which return counts and catalog
-- names only. The runbook itself needs the FULL address at §B.1 — read that one
-- off the account you have chosen, not out of a table dump.
--
-- ── HOW TO READ THE OUTPUT ───────────────────────────────────────────────────
--   hubs_owned            Hubs where this user is owner_id and the hub is live.
--                         0 means the runbook's ownership branch does nothing —
--                         a thin dry run that proves little.
--   others_in_their_hubs  Live members of those hubs OTHER than the user. This
--                         is the number that picks the branch:
--                           0  -> WIND-UP branch (hub soft-deleted, name
--                                 scrubbed, guest names scrubbed)
--                          >0  -> TRANSFER branch (ownership moves to the
--                                 longest-standing full_access member, or a
--                                 promoted standard member if there is none)
--   memberships           Live rows in budget_centre_members, including hubs
--                         owned by other people. All are soft-deleted by §B.4.
--   tx_logged             Rows carrying this user's name inline in
--                         logged_by_name. >0 means the dry run actually
--                         exercises the denormalised-name scrub, which is the
--                         part with no FK and no cascade to fall back on.
--   subs                  Subscription rows. The runbook must NOT touch these
--                         (7-year retention, privacy.md §6.3) and its
--                         verification block asserts the count is unchanged, so
--                         an account with subs > 0 tests that counter-assertion
--                         too. Nothing here is billed or cancelled by a dry run.
--
-- ── CHOOSING ─────────────────────────────────────────────────────────────────
--   Pick a throwaway account you recognise by its masked email. Prefer one with
--   hubs_owned >= 1 and tx_logged > 0 so the run has something real to do.
--   Note its branch from others_in_their_hubs before you run PART A — then PART
--   A's prediction is a check on your understanding, not just an announcement.
--   Do not pick your own primary account: the dry run would roll back safely,
--   but you want output that is calm to read, not output you have to trust.
--
--   Copy the id (for the three uuid lines) and the account's real email (for the
--   §B.1 guard, which refuses to touch a row whose address does not match).
--
-- NOTE ON ROLE: the SQL editor runs as a privileged role that bypasses RLS, so
-- this lists every account, not the caller's visible subset.
-- =============================================================================

SELECT
  u.id,
  left(u.email, 1) || '***@' || split_part(u.email, '@', 2) AS masked_email,
  u.created_at::date                                        AS joined,

  (SELECT count(*) FROM public.budget_centres b
    WHERE b.owner_id = u.id
      AND b.deleted_at IS NULL)                             AS hubs_owned,

  (SELECT count(*) FROM public.budget_centre_members m
    WHERE m.user_id = u.id
      AND m.deleted_at IS NULL)                             AS memberships,

  (SELECT count(*) FROM public.transactions t
    WHERE t.logged_by_user_id = u.id)                       AS tx_logged,

  (SELECT count(*) FROM public.subscriptions s
    WHERE s.user_id = u.id)                                 AS subs,

  -- The branch decider: live members of this user's own live hubs, excluding
  -- the user. 0 -> wind-up, >0 -> transfer.
  (SELECT count(*)
     FROM public.budget_centre_members m2
     JOIN public.budget_centres b2 ON b2.id = m2.budget_centre_id
    WHERE b2.owner_id = u.id
      AND b2.deleted_at IS NULL
      AND m2.deleted_at IS NULL
      AND m2.user_id <> u.id)                               AS others_in_their_hubs

FROM public.users u
ORDER BY u.created_at DESC;
