-- =============================================================================
-- f3_preview_only.sql  (Identity erasure — PART A preview, standalone, READ ONLY)
--
-- This is PART A of scripts/f3_erasure_runbook.sql lifted out on its own, with
-- the subject's uuid pre-filled. It is ONE SQL statement: a single SELECT built
-- from three CTEs. There is no BEGIN, no CREATE, no DO block, no UPDATE/DELETE/
-- INSERT and no ROLLBACK anywhere in this file — none of PART B came with it.
-- Running it cannot change a row, and running it twice cannot either.
--
-- WHY IT EXISTS: PART A is the step you run BEFORE anything is at stake, and
-- copying it out of a 650-line file means selecting the right line range under
-- pressure. Copying the wrong range of the runbook is the one mistake that
-- actually matters, so this removes the need to make that selection at all.
-- The runbook remains the source of truth; keep this in step with it if PART A
-- ever changes.
--
-- WHAT TO CONFIRM IN THE OUTPUT:
--   sort 0  SUBJECT           the masked email must be the account you chose.
--                             'NO SUCH USER — STOP' means the uuid is wrong.
--   sort 1  budget_centres    one row per owned hub, each naming the branch the
--                             erasure would take (TRANSFER to a named successor,
--                             or WIND UP). Confirm these match what
--                             f3_pick_account.sql led you to expect.
--   sort 2+ every surface the scrub would touch, as counts.
--
--   Rows 6 and 7 OVERLAP where the subject logged a transaction under their own
--   email — those two counts do not sum. The runbook's run log reports the
--   actual writes.
--
-- Subject pre-filled: f9f6fc6c-0a24-46c1-8225-6a2e1f293169
-- =============================================================================

WITH params AS (
  -- ══════════════════════════════════════════════════════════════════════════
  -- The subject, pre-filled. Change it here if you retarget this preview.
  SELECT 'f9f6fc6c-0a24-46c1-8225-6a2e1f293169'::uuid AS uid
  -- ══════════════════════════════════════════════════════════════════════════
),
subject AS (
  SELECT u.id, u.email, u.name, u.avatar_url, u.pin_hash
    FROM public.users u, params p
   WHERE u.id = p.uid
),
owned_hubs AS (
  SELECT
    b.id AS hub_id,
    (SELECT count(*) FROM public.budget_centre_members m
      WHERE m.budget_centre_id = b.id AND m.deleted_at IS NULL
        AND m.user_id <> p.uid)                                   AS other_members,
    (SELECT m.user_id FROM public.budget_centre_members m
      WHERE m.budget_centre_id = b.id AND m.deleted_at IS NULL
        AND m.user_id <> p.uid AND m.role IN ('owner','full_access')
      ORDER BY m.joined_at ASC, m.user_id ASC LIMIT 1)            AS successor_full,
    (SELECT m.user_id FROM public.budget_centre_members m
      WHERE m.budget_centre_id = b.id AND m.deleted_at IS NULL
        AND m.user_id <> p.uid
      ORDER BY m.joined_at ASC, m.user_id ASC LIMIT 1)            AS successor_any
  FROM public.budget_centres b, params p
  WHERE b.owner_id = p.uid AND b.deleted_at IS NULL
)
SELECT * FROM (
  -- ── identity confirmation ───────────────────────────────────────────────────
  SELECT 0 AS sort, 'SUBJECT' AS surface, 'confirm this is the requester' AS action,
         (SELECT count(*) FROM subject) AS row_count,
         COALESCE((SELECT left(email,1) || '***@' || split_part(email,'@',2) FROM subject),
                  'NO SUCH USER — STOP') AS detail

  -- ── hub ownership branch, one row per owned hub ─────────────────────────────
  UNION ALL
  SELECT 1, 'budget_centres', 'ownership branch', count(*),
         'no hubs owned — nothing to transfer or wind up'
    FROM owned_hubs HAVING count(*) = 0
  UNION ALL
  SELECT 1, 'budget_centres', 'ownership branch', 1,
         'hub ' || hub_id::text || ' -> ' ||
         CASE
           WHEN successor_full IS NOT NULL
             THEN 'TRANSFER to longest-standing full_access member ' || successor_full::text
           WHEN successor_any IS NOT NULL
             THEN 'TRANSFER to longest-standing member ' || successor_any::text ||
                  ' (PROMOTED from standard — no full_access member exists; review this)'
           ELSE 'WIND UP (sole member): hub soft-deleted, name scrubbed, ' ||
                'guest names + guest-submitted names scrubbed'
         END
    FROM owned_hubs

  -- ── every surface the scrub touches, as counts ──────────────────────────────
  UNION ALL SELECT 2, 'public.users', 'email -> tombstone, name/avatar_url/pin_hash cleared',
         (SELECT count(*) FROM subject), 'the subject row itself'
  UNION ALL SELECT 3, 'auth.users', 'scrub 12 identity columns + set banned_until',
         (SELECT count(*) FROM auth.users a, params p WHERE a.id = p.uid), 'the auth row itself'
  UNION ALL SELECT 4, 'auth.identities', 'DELETE (Google sub/email/name/picture)',
         (SELECT count(*) FROM auth.identities i, params p WHERE i.user_id = p.uid),
         'beyond the gate list — see header'
  UNION ALL SELECT 5, 'budget_centre_members', 'soft-delete the subject''s memberships',
         (SELECT count(*) FROM public.budget_centre_members m, params p
           WHERE m.user_id = p.uid AND m.deleted_at IS NULL), 'removes them from every roster'
  UNION ALL SELECT 6, 'transactions.logged_by_name', 'clear to '''' (name copy, no FK)',
         (SELECT count(*) FROM public.transactions t, params p
           WHERE t.logged_by_user_id = p.uid AND t.logged_by_name <> ''),
         'amounts, dates and categories are RETAINED — household financial record'
  UNION ALL SELECT 7, 'transactions.logged_by_name', 'clear legacy rows holding the EMAIL',
         (SELECT count(*) FROM public.transactions t, subject s WHERE t.logged_by_name = s.email),
         'pre-fix rows (91c8227 stopped new ones); floor only, see f2 counts header. '
         'OVERLAPS the row above where the subject logged it themselves — these two '
         'counts do not sum'
  UNION ALL SELECT 8, 'centre_invites', 'tombstone invited_email where it is the subject',
         (SELECT count(*) FROM public.centre_invites c, subject s WHERE c.invited_email = s.email),
         'invites addressed TO the subject'
  UNION ALL SELECT 9, 'centre_invites', 'cancel pending invites the subject SENT',
         (SELECT count(*) FROM public.centre_invites c, params p
           WHERE c.invited_by = p.uid AND c.status = 'pending'),
         'invitee addresses NOT scrubbed — third-party data'
  UNION ALL SELECT 10, 'guest_users', 'scrub name + pin_hash — WIND-UP HUBS ONLY',
         (SELECT count(*) FROM public.guest_users g
           WHERE g.budget_centre_id IN (SELECT hub_id FROM owned_hubs
                                         WHERE successor_full IS NULL AND successor_any IS NULL)),
         'guests in a TRANSFERRED hub belong to the surviving household — untouched'
  UNION ALL SELECT 11, 'subscriptions', 'LEFT ALONE (7-year retention, privacy.md §6.3)',
         (SELECT count(*) FROM public.subscriptions s, params p WHERE s.user_id = p.uid),
         'verification asserts this count is UNCHANGED after the scrub'
) preview
ORDER BY sort, detail;
