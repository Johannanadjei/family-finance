-- =============================================================================
-- migrate_cycles_schema.sql
--
-- Commit 1 of the Budget Cycles project — schema foundation only.
-- ZERO app behaviour change: the table ships empty, timezone defaults to 'UTC',
-- and no app code reads any of this yet (Commits 2+). Tables are ready to
-- receive the Commit 2 backfill without modification.
--
-- Run this entire file in the Supabase SQL editor in one go.
-- Safe to re-run — all DDL uses IF EXISTS / IF NOT EXISTS guards and the whole
-- migration is wrapped in a transaction (atomic: any failure rolls back cleanly).
--
-- Order:
--   1. btree_gist extension (required by the no-overlap exclusion constraint)
--   2. budget_cycles table + CHECK constraints
--   3. no-overlap exclusion constraint (GiST)
--   4. lookup index (find cycle containing a date)
--   5. budget_centres.timezone column (default 'UTC')
--   6. RLS: members read; owner/full_access write
--   7. Verification queries
-- =============================================================================

BEGIN;

-- 1. Extension — needed for `budget_centre_id WITH =` in the GiST exclusion.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. New table.
CREATE TABLE IF NOT EXISTS budget_cycles (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_centre_id uuid        NOT NULL REFERENCES budget_centres(id) ON DELETE CASCADE,
  name             text        NOT NULL,
  start_date       date        NOT NULL,
  end_date         date        NOT NULL,
  anchor_type      text        NOT NULL CHECK (anchor_type IN ('calendar', 'payday', 'custom')),
  anchor_day       smallint    CHECK (anchor_day IS NULL OR (anchor_day BETWEEN 1 AND 31)),
  created_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  CHECK (end_date >= start_date),
  -- anchor_day is present IFF the cycle is payday-anchored
  CHECK ((anchor_type = 'payday') = (anchor_day IS NOT NULL))
);

-- 3. DB-enforced non-overlap per hub for non-deleted cycles.
--    A unique index would only block identical ranges — an exclusion constraint
--    blocks any overlap (&&). Guarded so the migration is safe to re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'no_overlapping_cycles'
  ) THEN
    ALTER TABLE budget_cycles ADD CONSTRAINT no_overlapping_cycles
      EXCLUDE USING gist (
        budget_centre_id WITH =,
        daterange(start_date, end_date, '[]') WITH &&
      ) WHERE (deleted_at IS NULL);
  END IF;
END $$;

-- 4. For "find the cycle containing date X" queries.
CREATE INDEX IF NOT EXISTS idx_cycles_centre_dates
  ON budget_cycles(budget_centre_id, start_date, end_date)
  WHERE deleted_at IS NULL;

-- 5. Hub timezone column. Defaults to 'UTC'; Commit 4 self-corrects on first
--    cycle-aware load using the browser timezone.
ALTER TABLE budget_centres
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';

-- 6. RLS — mirrors the in-repo members_rbac.sql precedent (direct auth.uid()
--    policies, no SECURITY DEFINER). Active member = deleted_at IS NULL;
--    budget_centre_members has no `status` column.
ALTER TABLE budget_cycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view cycles in their hubs" ON budget_cycles;
CREATE POLICY "Members can view cycles in their hubs"
ON budget_cycles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM budget_centre_members bcm
    WHERE bcm.budget_centre_id = budget_cycles.budget_centre_id
    AND   bcm.user_id          = auth.uid()
    AND   bcm.deleted_at        IS NULL
  )
);

DROP POLICY IF EXISTS "Owners and full_access can manage cycles" ON budget_cycles;
CREATE POLICY "Owners and full_access can manage cycles"
ON budget_cycles FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM budget_centre_members bcm
    WHERE bcm.budget_centre_id = budget_cycles.budget_centre_id
    AND   bcm.user_id          = auth.uid()
    AND   bcm.deleted_at        IS NULL
    AND   bcm.role             IN ('owner', 'full_access')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM budget_centre_members bcm
    WHERE bcm.budget_centre_id = budget_cycles.budget_centre_id
    AND   bcm.user_id          = auth.uid()
    AND   bcm.deleted_at        IS NULL
    AND   bcm.role             IN ('owner', 'full_access')
  )
);

COMMIT;

-- =============================================================================
-- 7. Verification queries — run after COMMIT to confirm the schema landed.
-- =============================================================================
-- Expect: budget_cycles columns as defined above.
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'budget_cycles' ORDER BY ordinal_position;
--
-- Expect: the no_overlapping_cycles exclusion constraint present.
--   SELECT conname, contype FROM pg_constraint WHERE conname = 'no_overlapping_cycles';
--
-- Expect: budget_centres.timezone exists, NOT NULL, default 'UTC'.
--   SELECT column_name, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'budget_centres' AND column_name = 'timezone';
--
-- Expect: two RLS policies on budget_cycles.
--   SELECT polname FROM pg_policies WHERE tablename = 'budget_cycles';
-- =============================================================================
