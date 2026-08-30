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
  v_uid            uuid := 'f9f6fc6c-0a24-46c1-8225-6a2e1f293169'::uuid;
  v_expect_email   text := 'PASTE-REAL-EMAIL-HERE';
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
  v_uid       uuid := 'f9f6fc6c-0a24-46c1-8225-6a2e1f293169'::uuid;
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
