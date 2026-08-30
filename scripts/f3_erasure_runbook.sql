-- =============================================================================
-- f3_erasure_runbook.sql   (Identity erasure — DPO runbook, Act 843 §33 / privacy.md §5.1(c))
--
-- Anonymises ONE data subject in place. It does NOT delete their identity rows,
-- because it cannot: see "WHY ANONYMISE, NOT DELETE" below.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THIS FILE, AS COMMITTED, CANNOT ERASE ANYTHING.
--   PART A is read-only. PART B ends in ROLLBACK, not COMMIT. A DPO who runs the
--   whole file unedited performs a full dry run and changes zero rows. Turning
--   ROLLBACK into COMMIT (§B.9) is the single deliberate act that makes it real.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHO RUNS THIS: the DPO (or the person acting as it), in the Supabase SQL
-- editor, which connects as a privileged role — RLS does not filter anything
-- here, so every count below is a true total, not the caller's visible subset.
-- There is deliberately NO app UI and NO stored function for this (see
-- "WHY NOT AN RPC" below). It is a manual, logged, human-authorised act.
--
-- ── HOW TO RUN IT ────────────────────────────────────────────────────────────
--   1. Record the request: who asked, when, how identity was verified. Erasure
--      is irreversible; the only undo is a point-in-time restore of the whole
--      database, which would also revert every unrelated write since.
--   2. Get the subject's user id (uuid) and their email address.
--   3. PART A — paste the uuid into the ONE marked line, run PART A alone.
--      Read the output. Confirm the masked email matches the requester, and
--      confirm every hub branch decision is what you expect. STOP if anything
--      looks wrong — PART A has changed nothing.
--   4. PART B — paste the SAME uuid and the subject's email into the two marked
--      lines. Run PART B with the trailing ROLLBACK still in place. This is a
--      REAL dry run: every write executes, the verification block asserts the
--      result, the run log prints, and then it all rolls back.
--   5. Only if step 4 ends with the run log printed and no FAIL: change the
--      final ROLLBACK to COMMIT and run PART B once more.
--   6. Save the run log output with the request record. That is the evidence
--      the erasure happened and what it touched.
--
-- ── WHY ANONYMISE, NOT DELETE ────────────────────────────────────────────────
--   f2_identity_fk_diag.sql (2026-08-30) established that a DELETE of an
--   identity row is refused outright: public.users.id -> auth.users is ON DELETE
--   CASCADE, but user_preferences / budget_centres.owner_id /
--   budget_centre_members.user_id / transactions.logged_by_user_id all reference
--   public.users with NO ON DELETE clause (= NO ACTION). handle_new_user() seeds
--   a user_preferences row for EVERY signup, so the block is universal — no
--   account is deletable today by any route, including admin SQL.
--   Separately, subscriptions.user_id -> auth.users is ON DELETE CASCADE
--   (migrate_19_subscriptions.sql:33), so a delete that DID succeed would
--   destroy the billing records privacy.md §6.3 commits to keeping for 7 years.
--   In-place anonymisation satisfies the erasure duty (no personal data remains)
--   while keeping referential integrity and the retention obligation intact.
--
-- ── WHY NOT AN RPC ───────────────────────────────────────────────────────────
--   CLAUDE.md §9.6 requires SECURITY DEFINER RPCs for cross-user writes from the
--   app. This is NOT an app write. A permanent erase_user() function in the
--   public schema would be a standing account-destruction primitive, and
--   Supabase's pg_default_acl grants EXECUTE on every new public function
--   directly to `authenticated` and `anon` — a missed REVOKE would hand every
--   signed-in user a wipe button. A script that exists only in the repo, run by
--   hand, has no ACL surface at all.
--
-- ── WHAT IS DELIBERATELY LEFT ALONE ──────────────────────────────────────────
--   subscriptions      — 7-year financial retention, privacy.md §6.3. Holds no
--                        name or email; paystack ids are pseudonymous and live
--                        in Paystack's system, whose own erasure is a separate
--                        processor request (privacy.md §4.2).
--   user_preferences   — theme/notification toggles. No personal data, and the
--                        row keeps the NO ACTION FK satisfied. Leaving it costs
--                        nothing and deleting it buys nothing.
--   auth.audit_log_entries — append-only security log (holds IPs and login
--                        events). Separate retention basis and separate
--                        decision; this runbook does not touch it. FLAGGED for
--                        counsel — see the open question at the end of the file.
--   free text          — transaction descriptions, income notes, category and
--                        hub names in hubs that SURVIVE. These belong to the
--                        household's shared financial record, not to the
--                        departing member, and erasing them would delete other
--                        people's data. v_scrub_free_text (§B.1) overrides this
--                        for the subject's own transaction descriptions only.
--   other people's data — invitee email addresses on invites the subject sent
--                        are third-party PII. Pending invites are CANCELLED so
--                        they cannot be acted on, but the addresses are not
--                        scrubbed by this subject's request.
--
-- ── COLUMNS SCRUBBED IN auth.users ───────────────────────────────────────────
--   Confirmed live against the gate query f2_auth_users_columns.sql (2026-08-30).
--   All are nullable, so all scrub to NULL except the two noted:
--     email                       -> tombstone (unique-safe, see §B.6)
--     encrypted_password          -> non-verifiable garbage (blocks re-auth)
--     phone, phone_change, phone_change_token
--     email_change, email_change_token_current, email_change_token_new
--     confirmation_token, recovery_token, reauthentication_token
--     raw_user_meta_data          -> {} (held full_name from signup)
--     raw_app_meta_data           -> whitelist rebuild, keeps provider/providers
--     banned_until                -> SET (hard-stops any future login)
--   NOT touched (structural, not personal): id, aud, role, instance_id, every
--   timestamp, is_anonymous / is_sso_user / is_super_admin, deleted_at.
--
-- ── auth.* TABLES BEYOND auth.users — READ BEFORE FIRST RUN ──────────────────
--   The gate query audited auth.users COLUMNS only. It could not see sibling
--   tables, and two of them hold personal data that would survive everything
--   above:
--     auth.identities — identity_data jsonb holds the Google `sub`, email, name
--                       and picture for OAuth users. Leaving it would also leave
--                       a live Google login path around the scrambled password
--                       (the ban still refuses it, but the data would remain).
--                       This script DELETEs the subject's identity rows.
--     auth.sessions / auth.refresh_tokens / auth.mfa_factors /
--     auth.one_time_tokens — live credentials and, for mfa_factors, a phone
--                       number and friendly name. Deleted, so the erasure takes
--                       effect immediately rather than at next token expiry.
--   These go beyond the nine-column list this runbook was scoped to. In PART B
--   every one is guarded by to_regclass, so a missing table is a silent no-op
--   rather than an error. PART A reads auth.identities UNGUARDED (a plain SELECT
--   cannot be conditional) — it exists on every current Supabase project, and if
--   it ever did not, PART A would simply error, having changed nothing.
--   They SHOULD get their own gate query before the first real run, the way
--   auth.users did.
--
-- ── HOW THIS FILE WAS TESTED BEFORE IT EVER SAW A REAL ROW ───────────────────
--   Executed end to end on 2026-08-30 against a throwaway PostgreSQL 16 with a
--   stub of the live shapes (auth.users per GoTrue including the generated
--   auth.identities.email column, public.* per schema_base.sql + members_rbac.sql
--   + migrate_19 + migrate_27, updated_at triggers included), seeded to hit every
--   branch at once: a hub with two full_access candidates (the longest-standing
--   one won), a sole-member hub (wound up), a hub with only standard members (the
--   promote branch), a hub owned by someone else, a soft-deleted transaction
--   carrying the name, a legacy transaction carrying the email, guests in both a
--   wound-up and a surviving hub, and invites in both directions.
--   Confirmed: PART A previews all three branches; PART B commits correctly;
--   a second run is idempotent; and the verification block FAILS as it should
--   when the scrub is deliberately broken — tested by removing the
--   logged_by_name sweep, by leaving raw_user_meta_data intact, by pasting a
--   mismatched email, by pasting a non-existent uuid, and by forcing a wind-up
--   on a hub that still had live members. Each raised and rolled back.
--   That is a stub, not production: it proves the LOGIC, not the live schema.
--   PART A against the real database is still the check that matters.
--
-- ── SOFT DELETE IS NOT ERASURE ───────────────────────────────────────────────
--   Every scrub below deliberately OMITS a `deleted_at IS NULL` filter — the one
--   place in this repo where that is correct. A soft-deleted transaction still
--   holds its logged_by_name, and a soft-deleted membership still names the
--   member. Erasure has to reach those rows too, or it erases only what the app
--   happens to display.
--
-- ── IDEMPOTENCY ──────────────────────────────────────────────────────────────
--   Re-running on an already-erased subject is safe: the email tombstone is
--   derived from the subject's own uuid so it is stable, every scrub target is
--   already at its scrubbed value, and the hub loop finds nothing left to
--   transfer. §B.2 detects this and says so rather than failing.
-- =============================================================================


-- #############################################################################
-- ##  PART A — DRY-RUN PREVIEW.  READ ONLY.  NO TRANSACTION, NO WRITES.       ##
-- ##  Run this ALONE first. It returns counts and branch decisions only —     ##
-- ##  the single piece of personal data it emits is a MASKED email, so the    ##
-- ##  DPO can confirm they are about to erase the right person.               ##
-- #############################################################################

WITH params AS (
  -- ══════════════════════════════════════════════════════════════════════════
  -- EDIT THIS ONE LINE: the subject's user id.
  SELECT '00000000-0000-0000-0000-000000000000'::uuid AS uid
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


-- #############################################################################
-- ##  PART B — THE ERASURE.  TRANSACTIONAL.  ENDS IN ROLLBACK BY DEFAULT.     ##
-- #############################################################################

BEGIN;

-- ── B.0  Run log. Temp, dies with the transaction; printed at §B.8 ───────────
CREATE TEMP TABLE IF NOT EXISTS f3_run_log (
  seq           serial,
  step          text,
  detail        text,
  rows_affected bigint
) ON COMMIT DROP;

DO $erase$
DECLARE
  -- ══════════════════════════════════════════════════════════════════════════
  -- EDIT THESE TWO LINES. The email is not decoration: §B.2 refuses to touch a
  -- row whose email does not match it, which is what catches a mis-pasted uuid.
  v_uid            uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_expect_email   text := 'paste.the.subjects.email@example.com';
  -- ── B.1  Optional. Default false: free text is the household's record, not
  --         the departing member's. True also clears the subject's own
  --         transaction descriptions. Read the header before changing.
  v_scrub_free_text boolean := false;
  -- ══════════════════════════════════════════════════════════════════════════

  v_old_email  text;
  v_tombstone  text;
  v_already    boolean;
  v_hub        record;
  v_succ       uuid;
  v_branch     text;
  v_n          bigint;
BEGIN
  v_tombstone := 'erased-' || v_uid::text || '@erased.invalid';

  -- ── B.2  Resolve the subject and refuse to proceed on a mismatch ───────────
  SELECT u.email INTO v_old_email FROM public.users u WHERE u.id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL: no public.users row for % — wrong uuid, or already hard-deleted', v_uid;
  END IF;

  v_already := (v_old_email = v_tombstone);
  IF v_already THEN
    RAISE NOTICE 'NOTE: % is already erased. Re-running is safe and idempotent; '
                 'the sweeps below will simply find nothing left to do.', v_uid;
  ELSIF lower(v_old_email) <> lower(trim(v_expect_email)) THEN
    RAISE EXCEPTION 'FAIL: email mismatch for %. The row does not hold the address you '
                    'pasted. Nothing has been changed — re-check the uuid.', v_uid;
  END IF;

  -- Record the pre-scrub subscription count; §B.7 asserts it is unchanged.
  SELECT count(*) INTO v_n FROM public.subscriptions WHERE user_id = v_uid;
  INSERT INTO f3_run_log(step, detail, rows_affected)
  VALUES ('B.2 resolve', 'subject resolved; subscriptions retained (must not change)', v_n);

  -- ── B.3  Hub ownership. Transfer where anyone remains, wind up where nobody does.
  FOR v_hub IN
    SELECT b.id FROM public.budget_centres b
     WHERE b.owner_id = v_uid AND b.deleted_at IS NULL
     ORDER BY b.created_at
  LOOP
    -- Preferred successor: longest-standing member who already holds management
    -- rights. joined_at ASC = longest-standing; user_id breaks a tie so the
    -- choice is deterministic and a dry run predicts the real run exactly.
    SELECT m.user_id INTO v_succ
      FROM public.budget_centre_members m
     WHERE m.budget_centre_id = v_hub.id
       AND m.deleted_at IS NULL
       AND m.user_id <> v_uid
       AND m.role IN ('owner', 'full_access')
     ORDER BY m.joined_at ASC, m.user_id ASC
     LIMIT 1;

    v_branch := 'transfer to full_access';

    -- Fallback: members exist but none has management rights. Promote the
    -- longest-standing one rather than winding up — winding up here would
    -- destroy OTHER people's financial records, which no erasure request
    -- authorises. PART A flags this branch for the DPO to review.
    IF v_succ IS NULL THEN
      SELECT m.user_id INTO v_succ
        FROM public.budget_centre_members m
       WHERE m.budget_centre_id = v_hub.id
         AND m.deleted_at IS NULL
         AND m.user_id <> v_uid
       ORDER BY m.joined_at ASC, m.user_id ASC
       LIMIT 1;
      IF v_succ IS NOT NULL THEN v_branch := 'transfer to PROMOTED standard member'; END IF;
    END IF;

    IF v_succ IS NOT NULL THEN
      UPDATE public.budget_centres SET owner_id = v_succ WHERE id = v_hub.id;
      UPDATE public.budget_centre_members
         SET role = 'owner'
       WHERE budget_centre_id = v_hub.id AND user_id = v_succ AND deleted_at IS NULL;
      INSERT INTO f3_run_log(step, detail, rows_affected)
      VALUES ('B.3 hub ' || v_hub.id::text, v_branch || ' -> ' || v_succ::text, 1);

    ELSE
      -- WIND UP. Sole member, so nothing here belongs to anyone else.
      UPDATE public.budget_centres
         SET name        = 'Erased hub',
             description = NULL,
             is_archived = true,
             deleted_at  = COALESCE(deleted_at, now())
       WHERE id = v_hub.id;

      -- Guest names are guest-supplied personal data. They are scrubbed ONLY on
      -- this branch: in a transferred hub the guests still serve the surviving
      -- household and their data is not the subject's to erase.
      UPDATE public.guest_users
         SET name       = 'Erased guest',
             pin_hash   = 'ERASED-' || gen_random_uuid()::text,
             is_active  = false,
             deleted_at = COALESCE(deleted_at, now())
       WHERE budget_centre_id = v_hub.id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      INSERT INTO f3_run_log(step, detail, rows_affected)
      VALUES ('B.3 hub ' || v_hub.id::text, 'WIND UP: guest identities scrubbed', v_n);

      -- Guest session rows are live credentials for a hub that no longer exists.
      DELETE FROM public.guest_sessions
       WHERE guest_id IN (SELECT id FROM public.guest_users WHERE budget_centre_id = v_hub.id);

      -- The inline guest-name copy on the transaction rows themselves.
      UPDATE public.transactions
         SET submitted_by_name = ''
       WHERE budget_centre_id = v_hub.id AND submitted_by_name <> '';

      -- Pending invites to a dead hub must not stay acceptable. The invitee
      -- addresses are third-party data and are NOT scrubbed here.
      UPDATE public.centre_invites
         SET status = 'cancelled'
       WHERE budget_centre_id = v_hub.id AND status = 'pending';

      INSERT INTO f3_run_log(step, detail, rows_affected)
      VALUES ('B.3 hub ' || v_hub.id::text, 'WIND UP: hub soft-deleted + name scrubbed', 1);
    END IF;
  END LOOP;

  -- ── B.4  Memberships. Soft-delete so the subject leaves every roster ───────
  UPDATE public.budget_centre_members
     SET deleted_at = now()
   WHERE user_id = v_uid AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO f3_run_log(step, detail, rows_affected)
  VALUES ('B.4 memberships', 'soft-deleted', v_n);

  -- ── B.5  The denormalised name copies on transactions ──────────────────────
  -- logged_by_name has no FK, so no cascade and no soft delete ever reaches it.
  -- The row itself is retained: the amount, date and category are the surviving
  -- household's financial record, and once the name is gone the row is no longer
  -- personal data. logged_by_user_id is kept and now points at an anonymised row.
  UPDATE public.transactions SET logged_by_name = ''
   WHERE logged_by_user_id = v_uid AND logged_by_name <> '';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO f3_run_log(step, detail, rows_affected)
  VALUES ('B.5 logged_by_name', 'cleared on the subject''s rows', v_n);

  -- Legacy rows that captured the EMAIL inline, from before the fallback was
  -- removed (91c8227). Matched on the exact address, which is unambiguous.
  IF NOT v_already THEN
    UPDATE public.transactions SET logged_by_name = '' WHERE logged_by_name = v_old_email;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    INSERT INTO f3_run_log(step, detail, rows_affected)
    VALUES ('B.5 logged_by_name', 'cleared legacy rows holding the email inline', v_n);
  END IF;

  IF v_scrub_free_text THEN
    UPDATE public.transactions SET description = ''
     WHERE logged_by_user_id = v_uid AND description <> '';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    INSERT INTO f3_run_log(step, detail, rows_affected)
    VALUES ('B.5 free text', 'OPT-IN: descriptions cleared on the subject''s rows', v_n);
  END IF;

  -- ── B.6  Invites ───────────────────────────────────────────────────────────
  IF NOT v_already THEN
    -- invited_email is NOT NULL, so it takes the tombstone rather than NULL.
    UPDATE public.centre_invites
       SET invited_email = v_tombstone,
           status        = CASE WHEN status = 'pending' THEN 'cancelled' ELSE status END
     WHERE invited_email = v_old_email;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    INSERT INTO f3_run_log(step, detail, rows_affected)
    VALUES ('B.6 invites', 'invites TO the subject: address tombstoned', v_n);
  END IF;

  -- Invites the subject SENT that are still open. Cancelled so they cannot be
  -- accepted by someone acting on a dead account's authority. invited_by is left
  -- pointing at the anonymised row (its FK is ON DELETE SET NULL, not a leak).
  UPDATE public.centre_invites SET status = 'cancelled'
   WHERE invited_by = v_uid AND status = 'pending';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO f3_run_log(step, detail, rows_affected)
  VALUES ('B.6 invites', 'pending invites SENT by the subject: cancelled', v_n);

  -- ── B.7  The identity rows themselves ──────────────────────────────────────
  UPDATE public.users
     SET email      = v_tombstone,
         name       = '',
         avatar_url = NULL,   -- OAuth profile picture URL
         pin_hash   = NULL    -- guest-portal PIN, a credential
   WHERE id = v_uid;
  INSERT INTO f3_run_log(step, detail, rows_affected)
  VALUES ('B.7 public.users', 'email tombstoned; name/avatar/pin cleared', 1);

  -- auth.users. Column list confirmed live by f2_auth_users_columns.sql.
  -- encrypted_password is not hashed to anything — it is set to a string that
  -- cannot be a valid bcrypt hash, so no password can ever verify against it,
  -- with no dependency on pgcrypto being reachable from this search_path.
  -- banned_until is a century out rather than 'infinity' so every GoTrue code
  -- path and driver treats it as an ordinary timestamp comparison.
  UPDATE auth.users AS u
     SET email                      = v_tombstone,
         encrypted_password         = 'ERASED-' || gen_random_uuid()::text,
         phone                      = NULL,
         phone_change               = NULL,
         phone_change_token         = NULL,
         email_change               = NULL,
         email_change_token_current = NULL,
         email_change_token_new     = NULL,
         confirmation_token         = NULL,
         recovery_token             = NULL,
         reauthentication_token     = NULL,
         raw_user_meta_data         = '{}'::jsonb,
         -- Whitelist rebuild, not a blacklist: keeps only the two structural
         -- keys GoTrue reasons about and drops everything else, including any
         -- OAuth sub/email/name a blacklist would have to predict.
         raw_app_meta_data          = (
           SELECT COALESCE(jsonb_object_agg(e.k, e.v), '{}'::jsonb)
             FROM jsonb_each(COALESCE(u.raw_app_meta_data, '{}'::jsonb)) AS e(k, v)
            WHERE e.k IN ('provider', 'providers')
         ),
         banned_until               = now() + interval '100 years'
   WHERE u.id = v_uid;
  INSERT INTO f3_run_log(step, detail, rows_affected)
  VALUES ('B.7 auth.users', '12 identity columns scrubbed; login hard-stopped', 1);

  -- Sibling auth tables — see the header warning. Guarded, so a table that does
  -- not exist on this GoTrue version is a no-op, not an error: plpgsql only
  -- plans a statement when it actually executes.
  IF to_regclass('auth.identities') IS NOT NULL THEN
    DELETE FROM auth.identities WHERE user_id = v_uid;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    INSERT INTO f3_run_log(step, detail, rows_affected)
    VALUES ('B.7 auth.identities', 'deleted (Google sub/email/name/picture + login path)', v_n);
  END IF;

  IF to_regclass('auth.mfa_factors') IS NOT NULL THEN
    DELETE FROM auth.mfa_factors WHERE user_id = v_uid;
  END IF;
  IF to_regclass('auth.one_time_tokens') IS NOT NULL THEN
    DELETE FROM auth.one_time_tokens WHERE user_id = v_uid;
  END IF;
  IF to_regclass('auth.refresh_tokens') IS NOT NULL THEN
    -- GoTrue stores this one as text, not uuid.
    DELETE FROM auth.refresh_tokens WHERE user_id = v_uid::text;
  END IF;
  IF to_regclass('auth.sessions') IS NOT NULL THEN
    DELETE FROM auth.sessions WHERE user_id = v_uid;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    INSERT INTO f3_run_log(step, detail, rows_affected)
    VALUES ('B.7 auth sessions', 'live sessions/tokens/factors deleted — effective now', v_n);
  END IF;

  RAISE NOTICE 'f3: scrub complete for %. Verification runs next.', v_uid;
END;
$erase$;


-- ── B.8  VERIFICATION — self-asserting. Any FAIL raises, and because the whole
--         of PART B is one transaction, the raise rolls back every write above.
--         Re-reads from the tables; it does not trust the scrub block's own
--         report. Same shape as every migrate_*.sql verification block.
DO $verify$
DECLARE
  -- Must match §B.1 — the same uuid, pasted a third time on purpose. If this one
  -- is wrong the assertions below check a different row, find it dirty, and fail
  -- loudly rather than passing a half-done erasure.
  v_uid       uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_tombstone text;
  v_n         bigint;
  v_before    bigint;
BEGIN
  v_tombstone := 'erased-' || v_uid::text || '@erased.invalid';

  -- (a) public.users fully scrubbed.
  SELECT count(*) INTO v_n FROM public.users
   WHERE id = v_uid AND (email <> v_tombstone OR name <> ''
                         OR avatar_url IS NOT NULL OR pin_hash IS NOT NULL);
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: public.users still holds personal data'; END IF;

  -- (b) auth.users: every scrubbed column empty, and the ban actually set.
  SELECT count(*) INTO v_n FROM auth.users
   WHERE id = v_uid
     AND (email <> v_tombstone
          OR COALESCE(phone, '') <> ''
          OR COALESCE(phone_change, '') <> ''
          OR COALESCE(phone_change_token, '') <> ''
          OR COALESCE(email_change, '') <> ''
          OR COALESCE(email_change_token_current, '') <> ''
          OR COALESCE(email_change_token_new, '') <> ''
          OR COALESCE(confirmation_token, '') <> ''
          OR COALESCE(recovery_token, '') <> ''
          OR COALESCE(reauthentication_token, '') <> ''
          OR COALESCE(raw_user_meta_data, '{}'::jsonb) <> '{}'::jsonb
          OR banned_until IS NULL
          OR banned_until <= now());
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: auth.users still holds personal data or is not banned'; END IF;

  -- (c) raw_app_meta_data keeps ONLY structural keys, and holds no address.
  SELECT count(*) INTO v_n FROM auth.users
   WHERE id = v_uid
     AND (EXISTS (SELECT 1 FROM jsonb_object_keys(COALESCE(raw_app_meta_data,'{}'::jsonb)) k
                   WHERE k NOT IN ('provider','providers'))
          OR COALESCE(raw_app_meta_data::text,'') LIKE '%@%');
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: raw_app_meta_data still carries identity keys'; END IF;

  -- (d) No OAuth identity row survives (it would re-expose sub + email).
  IF to_regclass('auth.identities') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM auth.identities WHERE user_id = v_uid;
    IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: % auth.identities row(s) survive', v_n; END IF;
  END IF;

  -- (e) No inline name copy survives on any transaction row.
  SELECT count(*) INTO v_n FROM public.transactions
   WHERE logged_by_user_id = v_uid AND logged_by_name <> '';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: % transaction row(s) still carry the name', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.transactions t
   WHERE t.logged_by_name = v_tombstone
      OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_uid AND t.logged_by_name = u.email);
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: % transaction row(s) still carry an address', v_n; END IF;

  -- (f) Off every roster, and owner of nothing.
  SELECT count(*) INTO v_n FROM public.budget_centre_members
   WHERE user_id = v_uid AND deleted_at IS NULL;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: % live membership row(s) remain', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.budget_centres
   WHERE owner_id = v_uid AND deleted_at IS NULL;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: % live hub(s) still owned by the subject', v_n; END IF;

  -- (g) No open invite path in or out.
  SELECT count(*) INTO v_n FROM public.centre_invites
   WHERE (invited_by = v_uid AND status = 'pending')
      OR (invited_email = v_tombstone AND status = 'pending');
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: % pending invite(s) remain', v_n; END IF;

  -- (h) THE COUNTER-ASSERTION: nothing that had to survive was destroyed.
  --     A scrub that also wiped the billing record would breach privacy.md §6.3
  --     just as surely as one that left the email behind.
  SELECT rows_affected INTO v_before FROM f3_run_log WHERE step = 'B.2 resolve' LIMIT 1;
  SELECT count(*) INTO v_n FROM public.subscriptions WHERE user_id = v_uid;
  IF v_n <> v_before THEN
    RAISE EXCEPTION 'FAIL: subscriptions changed from % to % — 7-year retention breached',
                    v_before, v_n;
  END IF;

  -- (i) No hub that still had another member was wound up.
  SELECT count(*) INTO v_n
    FROM public.budget_centres b
   WHERE b.name = 'Erased hub' AND b.deleted_at IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.budget_centre_members m
                  WHERE m.budget_centre_id = b.id AND m.deleted_at IS NULL);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL: % wound-up hub(s) still have live members — other people''s data', v_n;
  END IF;

  RAISE NOTICE 'f3 VERIFIED: no personal data remains for %; retained records intact.', v_uid;
END;
$verify$;

-- ── B.9  The run log, then the terminator ────────────────────────────────────
--         Save this output with the erasure request record.
SELECT seq, step, detail, rows_affected FROM f3_run_log ORDER BY seq;

-- ═════════════════════════════════════════════════════════════════════════════
-- DRY RUN  -> leave as ROLLBACK. Everything above ran and is now discarded.
-- REAL RUN -> change the next line to COMMIT; and run PART B again.
-- ═════════════════════════════════════════════════════════════════════════════
ROLLBACK;


-- =============================================================================
-- OPEN QUESTIONS FOR COUNSEL (do not resolve in code — privacy.md is parked)
--
--   1. auth.audit_log_entries holds IP addresses and login events tied to the
--      subject. This runbook does not touch it. Is the security-log basis enough
--      to retain it after an erasure request, and for how long?
--   2. Paystack holds customer records for any subject who ever paid. Erasure
--      there is a processor request (privacy.md §4.2) with no automation here —
--      the DPO must raise it separately. Worth a line in the runbook once the
--      process is agreed.
--   3. The PROMOTED-standard-member branch (§B.3 fallback) changes another
--      member's role without their asking, as the least-bad alternative to
--      destroying their records. Confirm that is acceptable, or specify what a
--      hub with no full_access member should do instead.
-- =============================================================================
