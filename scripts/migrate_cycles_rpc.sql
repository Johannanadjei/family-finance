-- =============================================================================
-- migrate_cycles_rpc.sql
--
-- Commit 3 of the Budget Cycles project — server-side calendar-cycle creation.
--
-- Why SECURITY DEFINER (per CLAUDE.md §9.6):
--   Creating a cycle is a privileged write. Rather than rely on the row-level
--   INSERT policy (owner/full_access only, from migrate_cycles_schema.sql), this
--   RPC runs as the function owner and performs its OWN authorization: it requires
--   the caller (auth.uid()) to be an active member of the centre. This keeps the
--   "any member may auto-create the calendar cycle for a month they're viewing"
--   rule in one server-side place — the client never inserts into budget_cycles
--   directly. Mirrors accept_invite / authenticate_guest.
--
-- The name is generated SERVER-SIDE via to_char(start, 'FMMonth YYYY') so a
-- JS-created cycle's name is byte-identical to the Commit 2 backfill's output
-- (migrate_cycles_backfill.sql STEP 1). The client never supplies a name.
--
-- Overlap: the no_overlapping_cycles GiST exclusion constraint (Commit 1) fires
-- if a cycle already covers this month. We trap it and re-raise a friendly message
-- under custom SQLSTATE 'CYC01' so the service can surface "already exists" cleanly.
--
-- Run this entire file in the Supabase SQL editor in one go. Safe to re-run
-- (CREATE OR REPLACE). Validate manually with sample inputs after running:
--   SELECT * FROM create_calendar_cycle('<a centre you belong to>'::uuid, '2026-07');
--   -- second call with the same month should error: SQLSTATE CYC01.
-- =============================================================================

CREATE OR REPLACE FUNCTION create_calendar_cycle(
  p_centre_id uuid,
  p_month_string text
) RETURNS budget_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date date;
  v_end_date   date;
  v_name       text;
  v_cycle      budget_cycles;
BEGIN
  -- 1. Authorize: caller must be an active member of the centre.
  IF NOT EXISTS (
    SELECT 1 FROM budget_centre_members
    WHERE budget_centre_id = p_centre_id
      AND user_id          = auth.uid()
      AND deleted_at       IS NULL
  ) THEN
    RAISE EXCEPTION 'User is not a member of this centre' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate month format (defence-in-depth; the service checks it too).
  IF p_month_string !~ '^[0-9]{4}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'Invalid month format: %, expected YYYY-MM', p_month_string;
  END IF;

  -- 3. Compute the calendar-month bounds and the display name.
  v_start_date := (p_month_string || '-01')::date;
  v_end_date   := (v_start_date + interval '1 month' - interval '1 day')::date;
  v_name       := to_char(v_start_date, 'FMMonth YYYY');   -- matches Commit 2 backfill

  -- 4. Insert. The GiST exclusion constraint enforces no-overlap; trap it and
  --    re-raise a friendly, machine-detectable error (custom SQLSTATE CYC01).
  BEGIN
    INSERT INTO budget_cycles (budget_centre_id, name, start_date, end_date, anchor_type)
    VALUES (p_centre_id, v_name, v_start_date, v_end_date, 'calendar')
    RETURNING * INTO v_cycle;
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'A cycle already exists for % in this hub', p_month_string
        USING ERRCODE = 'CYC01';
  END;

  RETURN v_cycle;
END;
$$;

-- Any authenticated user may call it; the in-function auth.uid() check is the gate.
GRANT EXECUTE ON FUNCTION create_calendar_cycle(uuid, text) TO authenticated;
