-- =============================================================================
-- f2_identity_erasure_counts.sql  (Identity/erasure audit — scope, READ ONLY)
--
-- Run in the Supabase SQL editor. Contains NO writes, NO DDL, NO transaction —
-- it is COUNTS ONLY. No personal data is returned by this query: every column is
-- an integer. (The last two columns compare against users.email internally but
-- return only a count, never the address itself.)
--
-- Companion to f2_identity_fk_diag.sql. That query establishes WHETHER identity
-- deletes are blocked; this one establishes HOW WIDELY, and sizes the part of the
-- problem that no FK change can fix.
--
-- WHY THIS EXISTS (2026-08-30): see the header of f2_identity_fk_diag.sql for the
-- privacy.md §5.1(c) / §6.2 background.
--
-- HOW TO READ THE OUTPUT:
--
--   blocked_by_user_preferences vs total_users
--     handle_new_user() seeds a user_preferences row for every signup, and that
--     FK is NO ACTION. If these two numbers are EQUAL, the block is universal:
--     no account is deletable today by any route, including admin SQL — not even
--     an account that never logged a transaction. That is the single most
--     important number here.
--
--   blocked_by_transactions / blocked_by_owned_hubs / blocked_by_memberships
--     Additional independent blockers. A user can be blocked by several at once;
--     these do not sum. Each is a separate table the erasure design must handle.
--
--   tx_rows_with_inline_name
--     transactions.logged_by_name is `text NOT NULL DEFAULT ''`, written on every
--     insert (transactions.service.js:125) as:
--         full_name || user?.email || ''
--     It is a denormalised STRING COPY, not a foreign key. Dropping or re-pointing
--     any FK does not touch it, and soft delete does not touch it.
--
--   tx_rows_where_inline_name_is_an_email
--     The subset of the above where the stored string matches a live users.email —
--     i.e. rows where a user had no full_name at insert time and their EMAIL
--     ADDRESS was copied inline into the transaction row. These rows hold personal
--     data that survives deletion of both auth.users and public.users, and they
--     need a separate scrub in any erasure design. A non-zero value here is the
--     finding that matters most for §5.1(c).
--     NOTE this undercounts: it can only match emails of users who still exist.
--     Inline emails belonging to already-departed users cannot be detected this
--     way, so treat the result as a FLOOR, not a total.
--
--   guest_rows_with_name
--     guest_users.name is guest-supplied personal data, soft-deleted only.
--
-- NOTE ON ROLE: the SQL editor runs as a privileged role that bypasses RLS, so
-- these counts are true totals for the table, not the caller's visible subset.
-- =============================================================================

SELECT
  (SELECT count(*) FROM public.users)                        AS total_users,

  (SELECT count(*) FROM public.users u
     WHERE EXISTS (SELECT 1 FROM public.user_preferences p
                    WHERE p.user_id = u.id))                 AS blocked_by_user_preferences,

  (SELECT count(*) FROM public.users u
     WHERE EXISTS (SELECT 1 FROM public.transactions t
                    WHERE t.logged_by_user_id = u.id))       AS blocked_by_transactions,

  (SELECT count(*) FROM public.users u
     WHERE EXISTS (SELECT 1 FROM public.budget_centres b
                    WHERE b.owner_id = u.id))                AS blocked_by_owned_hubs,

  (SELECT count(*) FROM public.users u
     WHERE EXISTS (SELECT 1 FROM public.budget_centre_members m
                    WHERE m.user_id = u.id))                 AS blocked_by_memberships,

  (SELECT count(*) FROM public.transactions
     WHERE logged_by_name <> '')                             AS tx_rows_with_inline_name,

  (SELECT count(*) FROM public.transactions t
     WHERE EXISTS (SELECT 1 FROM public.users u
                    WHERE u.email = t.logged_by_name))       AS tx_rows_where_inline_name_is_an_email,

  (SELECT count(*) FROM public.transactions
     WHERE submitted_by_name <> '')                          AS tx_rows_with_inline_guest_name,

  (SELECT count(*) FROM public.guest_users
     WHERE name <> '')                                       AS guest_rows_with_name;
