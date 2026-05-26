-- migrate_invite_expires_at.sql
--
-- Ensures centre_invites.expires_at is never NULL.
-- Run ONCE in the Supabase SQL Editor (already executed 2026-05-26).
-- Source of truth for rollback: DROP NOT NULL + DROP DEFAULT reverses steps 2–3.
--
-- Step 1: Backfill any existing NULL rows before the constraint is added.
-- Uses created_at + 7 days so the window stays meaningful relative to creation time.
-- No row is destroyed — all existing invites are preserved.
UPDATE centre_invites
SET    expires_at = created_at + INTERVAL '7 days'
WHERE  expires_at IS NULL;

-- Step 2: Add a column DEFAULT so the database enforces the invariant going forward.
ALTER TABLE centre_invites
ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '7 days');

-- Step 3: Add NOT NULL. Safe because Step 1 has already eliminated all NULLs.
ALTER TABLE centre_invites
ALTER COLUMN expires_at SET NOT NULL;
