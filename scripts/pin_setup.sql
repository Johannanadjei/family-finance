-- PIN login: add pin_hash column to users table.
-- Run once in Supabase SQL editor.
-- NULL = no PIN set. Never empty string.

ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash text;
