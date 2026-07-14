-- =============================================================================
-- can_view_income.sql
--
-- NEW HELPER (F1 RLS audit, 2026-07-12). Run BEFORE migrate_22 / migrate_23 —
-- both policies reference this function and will fail to create without it.
--
-- WHAT THIS DOES
--   can_view_income(centre_id uuid) RETURNS boolean
--     • True if the calling user (auth.uid()) is an active, non-deleted member
--       of the hub AND holds a role permitted to see income.
--     • The DB mirror of roles.js: PERMISSIONS[role].viewIncome
--         owner       → true
--         full_access → true
--         standard    → FALSE  ← the whole point of this function
--     • LANGUAGE sql, STABLE, SECURITY DEFINER — an RLS PREDICATE HELPER, the
--       same shape as its siblings is_budget_centre_member / is_budget_centre_owner.
--       SECURITY DEFINER lets it read budget_centre_members without recursing
--       through that table's own RLS.
--
-- WHY IT EXISTS
--   is_budget_centre_member() checks MEMBERSHIP ONLY — no role check. Every SELECT
--   policy on income_sources and transactions gated on it, so a `standard` member
--   could read income over direct REST despite the UI hiding it. Proven empirically
--   on 2026-07-12 against a live standard session: the standard member read back
--   `salary / 5000 GHS` from income_sources and the full income transaction, with
--   row counts identical to the owner's. This helper is the role check that was missing.
--
-- WHY NOT REUSE is_budget_centre_owner()
--   That helper keys off budget_centres.owner_id — the hub CREATOR, not the member
--   role. It returns false for `full_access`, who legitimately may see income. Gating
--   income on it would lock full_access out. Role must come from budget_centre_members.
--
-- ROLE VALUES: budget_centre_members_role_check allows exactly
--   ('owner', 'full_access', 'standard')  — see members_rbac.sql.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.can_view_income(centre_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
  select exists (
    select 1
    from public.budget_centre_members
    where budget_centre_id = centre_id
      and user_id          = auth.uid()
      and deleted_at       is null
      and role             in ('owner', 'full_access')
  );
$function$;

-- RLS helper — called in policy USING clauses by any authenticated user hitting a
-- guarded table. Same grant as its siblings.
GRANT EXECUTE ON FUNCTION public.can_view_income(uuid) TO authenticated;

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n int;
BEGIN
  -- (a) Exists with the expected (uuid) signature returning boolean.
  SELECT count(*) INTO v_n FROM pg_proc p
    JOIN pg_type t ON t.oid = p.prorettype
    WHERE p.proname = 'can_view_income'
      AND pg_get_function_identity_arguments(p.oid) = 'centre_id uuid'
      AND t.typname = 'bool';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: can_view_income(uuid) returning boolean not found (got %)', v_n; END IF;

  -- (b) SECURITY DEFINER — must read budget_centre_members without RLS recursion.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'can_view_income' AND prosecdef IS TRUE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: can_view_income is not SECURITY DEFINER'; END IF;

  -- (c) STABLE (provolatile = 's') — required for use in an RLS predicate.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'can_view_income' AND provolatile = 's';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: can_view_income is not STABLE'; END IF;

  -- (d) The role CHECK still allows exactly the three roles this function assumes.
  --     If a 4th role is ever added, this function MUST be revisited — a new role
  --     would silently fall through to "cannot view income".
  SELECT count(*) INTO v_n FROM pg_constraint
    WHERE conname = 'budget_centre_members_role_check'
      AND pg_get_constraintdef(oid) LIKE '%owner%'
      AND pg_get_constraintdef(oid) LIKE '%full_access%'
      AND pg_get_constraintdef(oid) LIKE '%standard%';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: budget_centre_members_role_check missing or does not cover the 3 expected roles'; END IF;

  RAISE NOTICE 'can_view_income OK: (uuid)->boolean installed (STABLE, SECURITY DEFINER).';
END $$;

COMMIT;
