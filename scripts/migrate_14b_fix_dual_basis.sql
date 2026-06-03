-- =============================================================================
-- migrate_14b_fix_dual_basis.sql
--
-- Fix for Commit 14b — create_cycle_by_anchor dual-basis bug (CYC03 on auto-create).
--
-- THE BUG
--   create_cycle_by_anchor built the cycle range from p_reference_date (computed
--   CLIENT-side from the JS `cycles` array's latest cycle) but applied the
--   forward-only clamp from a DIFFERENT basis: max(end_date) read live from the DB.
--   When the client's view lagged the DB (e.g. the DB already had a June cycle the
--   client hadn't loaded), p_reference_date pointed into an already-covered period.
--   The calendar branch then built that covered month (e.g. 2026-06-01..2026-06-30),
--   the clamp shoved v_start forward to max_end+1 (2026-07-01) WITHOUT re-deriving
--   v_end, and v_start > v_end raised CYC03 — a 400 on auto-create.
--
-- THE FIX (Option A — make the RPC authoritative)
--   Derive an effective reference up front that can never sit behind the DB's
--   coverage: v_ref := GREATEST(p_reference_date, max_end + 1). Build the whole
--   range from v_ref. Now v_end >= v_ref >= max_end + 1 > max_end, so the range can
--   never invert; the start-clamp still produces the M1 short transition cycle for
--   anchored cycles whose period started before max_end+1, and the CYC03 guard
--   reverts to a genuine never-should-happen safety net.
--
--   The client's p_reference_date is treated as a HINT; the server is authoritative
--   for the no-overlap invariant because that invariant depends on server state.
--   The JS twin (lib/cycles.anchorToDateRange) gets the same GREATEST so the Settings
--   preview matches what the RPC will actually create.
--
-- SCOPE: re-creates ONLY create_cycle_by_anchor (signature unchanged). Columns,
--   CHECK constraints, cycle_anchored_day, and cycle_majority_name are untouched.
--   Uses CREATE OR REPLACE (not DROP) so the existing GRANT survives; the GRANT is
--   re-issued anyway for idempotent belt-and-suspenders (matching migrate_14b_anchor).
--
-- Run this entire file in the Supabase SQL editor in one go. Safe to re-run.
-- Run BEFORE deploying the matching code (SQL first, code second — like 14b).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION create_cycle_by_anchor(
  p_centre_id      uuid,
  p_anchor_type    text,
  p_anchor_day     smallint,
  p_reference_date date,
  p_name           text DEFAULT NULL
) RETURNS budget_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_end   date;
  v_ref        date;
  v_start      date;
  v_end        date;
  v_cand       date;
  v_cyc_anchor text;
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

  -- 2. Validate the anchor (defence-in-depth; the service + DB CHECK also guard).
  IF p_anchor_type NOT IN ('calendar', 'fixed_day', 'last_working_day', 'last_day_of_month') THEN
    RAISE EXCEPTION 'Invalid anchor type: %', p_anchor_type;
  END IF;
  IF p_anchor_type = 'fixed_day' AND (p_anchor_day IS NULL OR p_anchor_day < 1 OR p_anchor_day > 31) THEN
    RAISE EXCEPTION 'fixed_day anchor requires anchor_day between 1 and 31';
  END IF;
  IF p_reference_date IS NULL THEN
    RAISE EXCEPTION 'reference_date is required';
  END IF;

  -- 3. Authoritative effective reference (dual-basis fix). The client's
  --    p_reference_date is a HINT; the server forces it to at least the day after
  --    the latest existing cycle, so the range can never land inside covered time.
  SELECT max(end_date) INTO v_prev_end
  FROM budget_cycles
  WHERE budget_centre_id = p_centre_id AND deleted_at IS NULL;

  v_ref := GREATEST(p_reference_date, COALESCE(v_prev_end + 1, p_reference_date));

  -- 4. Compute the cycle range that CONTAINS the effective reference.
  IF p_anchor_type = 'calendar' THEN
    v_start := date_trunc('month', v_ref)::date;
    v_end   := (v_start + interval '1 month' - interval '1 day')::date;
  ELSE
    -- Start-anchored: the cycle runs from one month's anchor to the day before the
    -- next month's anchor. Pick the window the effective reference falls in.
    v_cand := cycle_anchored_day(p_anchor_type, p_anchor_day, v_ref);
    IF v_ref >= v_cand THEN
      v_start := v_cand;
      v_end   := cycle_anchored_day(p_anchor_type, p_anchor_day, (v_ref + interval '1 month')::date) - 1;
    ELSE
      v_start := cycle_anchored_day(p_anchor_type, p_anchor_day, (v_ref - interval '1 month')::date);
      v_end   := v_cand - 1;
    END IF;
  END IF;

  -- 5. Forward-only start clamp (M1): an anchored period containing v_ref may have
  --    STARTED before max_end+1 — clamp the start so the new cycle never overlaps
  --    the previous one (short transition cycle). v_end is already > v_prev_end via
  --    the effective reference, so this can no longer invert the range.
  IF v_prev_end IS NOT NULL AND v_start <= v_prev_end THEN
    v_start := v_prev_end + 1;
  END IF;

  -- Dead-safety net: with the effective reference this can no longer trip.
  IF v_start > v_end THEN
    RAISE EXCEPTION 'Computed cycle range is empty after clamp (start % > end %)', v_start, v_end
      USING ERRCODE = 'CYC03';
  END IF;

  -- 6. Map hub anchor → cycle-row anchor vocabulary; cycle anchor_day stays NULL.
  v_cyc_anchor := CASE WHEN p_anchor_type = 'calendar' THEN 'calendar' ELSE 'custom' END;

  -- 7. Name: prefer the client-computed cycleDefaultName, else the server twin.
  v_name := COALESCE(NULLIF(btrim(p_name), ''), cycle_majority_name(v_start, v_end));

  -- 8. Insert. The GiST exclusion constraint enforces no-overlap; trap it and
  --    re-raise a friendly, machine-detectable error (custom SQLSTATE CYC01).
  BEGIN
    INSERT INTO budget_cycles (budget_centre_id, name, start_date, end_date, anchor_type)
    VALUES (p_centre_id, v_name, v_start, v_end, v_cyc_anchor)
    RETURNING * INTO v_cycle;
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'A cycle overlapping % already exists in this hub', v_start
        USING ERRCODE = 'CYC01';
  END;

  RETURN v_cycle;
END;
$$;

-- CREATE OR REPLACE preserves the existing grant; re-issue anyway (idempotent).
GRANT EXECUTE ON FUNCTION create_cycle_by_anchor(uuid, text, smallint, date, text) TO authenticated;

COMMIT;

-- =============================================================================
-- Verification — run after COMMIT.
-- =============================================================================
-- Regression case: a hub with a June cycle, asked to create one with a reference
-- BEHIND the latest end. PRE-FIX this raised CYC03; POST-FIX it returns the next
-- free (July) cycle. Use a THROWAWAY/test hub — this inserts a real cycle row.
--   -- 0. (setup, if needed) ensure a June 2026 cycle exists on the test hub:
--   SELECT * FROM create_cycle_by_anchor('<test-hub-id>'::uuid, 'calendar', NULL, '2026-06-15'::date, NULL);
--   -- 1. now request with a reference behind prev.end — expect a JULY row, no error:
--   SELECT id, name, start_date, end_date, anchor_type
--   FROM create_cycle_by_anchor('<test-hub-id>'::uuid, 'calendar', NULL, '2026-06-01'::date, NULL);
--   -- expect: start_date 2026-07-01, end_date 2026-07-31, name 'July 2026', anchor_type 'calendar'
--
-- Happy path unchanged (reference already = prev.end+1):
--   SELECT start_date, end_date FROM create_cycle_by_anchor('<test-hub-id>'::uuid, 'calendar', NULL, '2026-08-01'::date, NULL);
--   -- expect: 2026-08-01 .. 2026-08-31
-- =============================================================================
