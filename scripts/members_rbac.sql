-- =============================================================================
-- members_rbac.sql
--
-- Member roles + invite system for Money B.O.S
--
-- Run this entire file in the Supabase SQL editor in one go.
-- Safe to re-run — all DDL uses IF EXISTS / IF NOT EXISTS guards.
--
-- Order:
--   1. Extend budget_centre_members role constraint
--   2. Migrate old 'member' rows to 'full_access'
--   3. Create centre_invites table + RLS
--   4. Update budget_centres RLS to allow member reads
--   5. Verification queries
-- =============================================================================


-- =============================================================================
-- 1. ALTER budget_centre_members — extend role constraint
-- =============================================================================

-- Drop old constraint (may be named differently — handle both)
ALTER TABLE budget_centre_members
  DROP CONSTRAINT IF EXISTS budget_centre_members_role_check;

ALTER TABLE budget_centre_members
  DROP CONSTRAINT IF EXISTS budget_centre_members_role_fkey;

-- Add new constraint covering all four roles
ALTER TABLE budget_centre_members
  ADD CONSTRAINT budget_centre_members_role_check
  CHECK (role IN ('owner', 'full_access', 'standard', 'view_only'));

-- Confirm the column exists and has no NOT NULL gap
-- (role should already be NOT NULL from the original schema — this is a no-op if so)
ALTER TABLE budget_centre_members
  ALTER COLUMN role SET NOT NULL;

ALTER TABLE budget_centre_members
  ALTER COLUMN role SET DEFAULT 'full_access';


-- =============================================================================
-- 2. Migrate old generic 'member' rows to 'full_access'
-- =============================================================================

UPDATE budget_centre_members
SET    role = 'full_access'
WHERE  role = 'member';


-- =============================================================================
-- 3. CREATE centre_invites table
-- =============================================================================

CREATE TABLE IF NOT EXISTS centre_invites (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_centre_id uuid        NOT NULL REFERENCES budget_centres(id) ON DELETE CASCADE,
  invited_email    text        NOT NULL,
  role             text        NOT NULL
                               CHECK (role IN ('full_access', 'standard', 'view_only')),
  token            uuid        DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  invited_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  expires_at       timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Index for the /join?token=... lookup (hot path — always single row)
CREATE UNIQUE INDEX IF NOT EXISTS centre_invites_token_idx
  ON centre_invites (token);

-- Index for listing pending invites per hub (MembersSection query)
CREATE INDEX IF NOT EXISTS centre_invites_centre_status_idx
  ON centre_invites (budget_centre_id, status);

-- Index for duplicate-invite check (invited_email + centre + status)
CREATE INDEX IF NOT EXISTS centre_invites_email_centre_idx
  ON centre_invites (budget_centre_id, invited_email, status);


-- ── RLS on centre_invites ─────────────────────────────────────────────────────

ALTER TABLE centre_invites ENABLE ROW LEVEL SECURITY;

-- Hub owners and full_access members can view, create, and cancel invites
-- for their own hub.
DROP POLICY IF EXISTS "Hub managers can manage invites" ON centre_invites;

CREATE POLICY "Hub managers can manage invites"
ON centre_invites
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM   budget_centre_members bcm
    WHERE  bcm.budget_centre_id = centre_invites.budget_centre_id
    AND    bcm.user_id           = auth.uid()
    AND    bcm.role              IN ('owner', 'full_access')
    AND    bcm.deleted_at        IS NULL
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM   budget_centre_members bcm
    WHERE  bcm.budget_centre_id = centre_invites.budget_centre_id
    AND    bcm.user_id           = auth.uid()
    AND    bcm.role              IN ('owner', 'full_access')
    AND    bcm.deleted_at        IS NULL
  )
);

-- Anyone (including unauthenticated) can read a pending, non-expired invite
-- by its token. This is the /join?token=... lookup.
DROP POLICY IF EXISTS "Anyone can read pending invite by token" ON centre_invites;

CREATE POLICY "Anyone can read pending invite by token"
ON centre_invites
FOR SELECT
USING (
  status     = 'pending'
  AND expires_at > now()
);

-- Authenticated users can update the status of an invite addressed to their
-- own email (to mark it 'accepted'). This fires during invite acceptance.
DROP POLICY IF EXISTS "Invitee can accept their own invite" ON centre_invites;

CREATE POLICY "Invitee can accept their own invite"
ON centre_invites
FOR UPDATE
USING (
  invited_email = (
    SELECT email FROM auth.users WHERE id = auth.uid()
  )
  AND status = 'pending'
)
WITH CHECK (
  status = 'accepted'
);


-- =============================================================================
-- 4. UPDATE budget_centres RLS — allow members (not just owners) to read
-- =============================================================================

-- Drop the existing owner-only SELECT policy.
-- The policy name may vary — drop by likely names and the safe fallback.
DROP POLICY IF EXISTS "budget_centres_select_owner"  ON budget_centres;
DROP POLICY IF EXISTS "budget_centres_select_member" ON budget_centres;
DROP POLICY IF EXISTS "budget_centres_insert"        ON budget_centres;
DROP POLICY IF EXISTS "budget_centres_update"        ON budget_centres;

-- New policy: owner OR active member can read a hub
CREATE POLICY "Members can view their centres"
ON budget_centres
FOR SELECT
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM   budget_centre_members bcm
    WHERE  bcm.budget_centre_id = budget_centres.id
    AND    bcm.user_id           = auth.uid()
    AND    bcm.deleted_at        IS NULL
  )
);

-- Ensure INSERT/UPDATE/DELETE policies remain owner-only.
-- These may already exist — recreate defensively.

DROP POLICY IF EXISTS "Owners can insert centres"  ON budget_centres;
DROP POLICY IF EXISTS "Owners can update centres"  ON budget_centres;
DROP POLICY IF EXISTS "Owners can delete centres"  ON budget_centres;

CREATE POLICY "Owners can insert centres"
ON budget_centres
FOR INSERT
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update centres"
ON budget_centres
FOR UPDATE
USING  (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can delete centres"
ON budget_centres
FOR DELETE
USING (owner_id = auth.uid());


-- =============================================================================
-- 5. Verification queries
--
-- Run these after applying the migration.
-- Expected output documented inline.
-- =============================================================================

-- 5a. Confirm role constraint on budget_centre_members
--     Expected: one row with constraint name 'budget_centre_members_role_check'
--     and check_clause containing all four role values.
SELECT conname, pg_get_constraintdef(oid) AS check_clause
FROM   pg_constraint
WHERE  conrelid = 'budget_centre_members'::regclass
AND    conname  = 'budget_centre_members_role_check';

-- 5b. Confirm no 'member' rows remain
--     Expected: 0
SELECT COUNT(*) AS legacy_member_rows
FROM   budget_centre_members
WHERE  role = 'member';

-- 5c. Confirm centre_invites table exists with correct columns
--     Expected: 9 rows (id, budget_centre_id, invited_email, role, token,
--               invited_by, status, expires_at, created_at)
SELECT column_name, data_type, column_default, is_nullable
FROM   information_schema.columns
WHERE  table_name = 'centre_invites'
ORDER  BY ordinal_position;

-- 5d. Confirm RLS is enabled on centre_invites
--     Expected: rowsecurity = true
SELECT relname, relrowsecurity
FROM   pg_class
WHERE  relname = 'centre_invites';

-- 5e. Confirm all three policies exist on centre_invites
--     Expected: 3 rows
SELECT policyname, cmd, permissive
FROM   pg_policies
WHERE  tablename = 'centre_invites'
ORDER  BY policyname;

-- 5f. Confirm the new budget_centres SELECT policy exists
--     Expected: 'Members can view their centres' in results
SELECT policyname, cmd, permissive
FROM   pg_policies
WHERE  tablename = 'budget_centres'
ORDER  BY policyname;
