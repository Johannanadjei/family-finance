-- =============================================================================
-- migrate_14b_fix_naming.sql
--
-- Fix for Commit 14b — cycle NAME corruption (Bug 4), the sibling of the dual-basis
-- range bug already fixed in migrate_14b_fix_dual_basis.sql.
--
-- THE BUG
--   The dual-basis fix made the cycle RANGE server-authoritative
--   (v_ref := GREATEST(p_reference_date, max_end+1)) but left the NAME
--   client-authoritative:
--     v_name := COALESCE(NULLIF(btrim(p_name), ''), cycle_majority_name(v_start, v_end));
--   The client computes p_name (lib/cycles.cycleDefaultName) from ITS OWN, possibly
--   STALE, view of the cycles array. When that view lagged the DB, the client sent a
--   stale basis name (e.g. 'June 2026') while the server marched the range forward to
--   the next free slot (July, Aug, …). COALESCE preferred the non-null stale p_name,
--   so every forward-marched cycle was stored with the WRONG name. The correct
--   cycle_majority_name(v_start, v_end) fallback was never reached.
--   Observed in The Adjei household: cycles for Jul 2026 … Feb 2027 all named 'June 2026'.
--
-- THE FIX (Option 1 — server-authoritative naming)
--   The RPC now ALWAYS computes v_name := cycle_majority_name(v_start, v_end). The
--   client's p_name is IGNORED for the persisted name. This is the literal completion
--   of the dual-basis rule: the server is authoritative for everything that depends on
--   server state — and the name depends on the server-clamped range. Enforcing it at
--   the boundary means no current or future caller can ever reintroduce the bug.
--
--   p_name is KEPT in the signature (vestigial) so the service and all callers are
--   untouched — their value is now silently dropped. The JS twin cycleDefaultName is
--   unchanged: it still drives the Settings next-cycle PREVIEW (display-only estimate).
--
-- PLUS: data repair. Existing rows corrupted by the old behaviour are renamed to their
--   correct majority-month name using the same cycle_majority_name helper. Idempotent,
--   single-column (name only), all hubs (the <> guard makes it self-limiting).
--
-- SCOPE: re-creates ONLY create_cycle_by_anchor (signature unchanged) + one UPDATE.
--   Columns, CHECK constraints, cycle_anchored_day, and cycle_majority_name are
--   untouched. cycle_majority_name already exists (14b), so the UPDATE can call it.
--
-- Run this entire file in the Supabase SQL editor in one go. Safe to re-run.
-- Run BEFORE deploying the matching code (SQL first, code second — like 14b).
-- =============================================================================

BEGIN;

-- 1. Re-create the RPC with server-authoritative naming. Body is identical to
--    migrate_14b_fix_dual_basis.sql EXCEPT step 7 (v_name) — see the marked line.
CREATE OR REPLACE FUNCTION create_cycle_by_anchor(
  p_centre_id      uuid,
  p_anchor_type    text,
  p_anchor_day     smallint,
  p_reference_date date,
  p_name           text DEFAULT NULL   -- VESTIGIAL post-fix: accepted for signature
                                        -- stability, but IGNORED for the persisted name.
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

  -- 7. Name: SERVER-AUTHORITATIVE (Bug 4 fix). Always derive from the server-clamped
  --    range — the client's p_name is intentionally ignored. The name depends on
  --    server state (the marched-forward range), so the server owns it. This was the
  --    one line that previously consulted p_name via COALESCE/NULLIF.
  v_name := cycle_majority_name(v_start, v_end);

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

-- 2. Data repair. Rename every cycle corrupted by the old client-authoritative name
--    to its correct majority-month name. Idempotent (the <> guard selects nothing
--    once names are correct), single-column, all hubs. cycle_majority_name is
--    non-null for any valid range and name is NOT NULL by schema, so <> is exact.
UPDATE budget_cycles
SET name = cycle_majority_name(start_date, end_date)
WHERE deleted_at IS NULL
  AND name <> cycle_majority_name(start_date, end_date);

COMMIT;

-- =============================================================================
-- Verification — run after COMMIT.
-- =============================================================================
-- A. Data repair landed: every live cycle's name now matches its range. Expect 0.
--   SELECT count(*) FROM budget_cycles
--   WHERE deleted_at IS NULL
--     AND name <> cycle_majority_name(start_date, end_date);
--
-- B. Inspect The Adjei household (the same SELECT AJ ran) — names should be correct
--    (Jul 2026 … Feb 2027 no longer all 'June 2026'):
--   SELECT id, name, start_date, end_date
--   FROM budget_cycles
--   WHERE budget_centre_id = 'b9aae0dc-941d-474e-8183-07864250a9fb'
--   ORDER BY start_date;
--
-- C. RPC is now name-authoritative — the divergence case the dual-basis fix never
--    tested (it only passed p_name = NULL). On a THROWAWAY/test hub with a cycle
--    ending 2026-06-30, call the RPC with an intentionally WRONG p_name and a
--    reference behind prev.end. Expect the returned row named for the SERVER range
--    ('July 2026'), NOT the wrong p_name. (Inserts a real row — use a test hub.)
--   -- 0. (setup, if needed) ensure a June 2026 cycle exists on the test hub:
--   SELECT * FROM create_cycle_by_anchor('<test-hub-id>'::uuid, 'calendar', NULL, '2026-06-15'::date, NULL);
--   -- 1. request with a stale reference AND a deliberately wrong name:
--   SELECT id, name, start_date, end_date
--   FROM create_cycle_by_anchor('<test-hub-id>'::uuid, 'calendar', NULL, '2026-06-03'::date, 'June 2026');
--   -- expect: start_date 2026-07-01, end_date 2026-07-31, name 'July 2026' (p_name ignored)
--
-- D. Helper sanity (unchanged twin):
--   SELECT cycle_majority_name('2026-07-01', '2026-07-31');   -- expect 'July 2026'
-- =============================================================================
