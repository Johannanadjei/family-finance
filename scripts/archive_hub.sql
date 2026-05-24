-- Archive hub migration
-- Run this in the Supabase SQL editor before deploying archive/delete hub functionality.

ALTER TABLE budget_centres ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_budget_centres_is_archived
  ON budget_centres (is_archived)
  WHERE is_archived = false;
