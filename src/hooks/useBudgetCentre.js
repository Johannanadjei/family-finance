/**
 * hooks/useBudgetCentre.js
 *
 * Loads the active budget centre, its categories, and its members from Supabase.
 * Accepts an explicit centreId for hub switching; falls back to first centre if absent.
 *
 * STATE MACHINE:
 *   loading         → fetching from Supabase
 *   needsOnboarding → user has no budget centres at all (first-time user)
 *   ready           → centre + categories + members loaded
 *   error           → fetch failed
 *
 * CENTRE RESOLUTION:
 *   centreId provided → getCentreById(centreId); if null, falls back to first
 *   centreId absent   → first centre (existing behaviour, resume detection active)
 *
 * needsOnboarding fires ONLY when no centre is found at all.
 * An empty hub (centre with no categories) shows an empty state — NOT onboarding.
 * Resume detection (partial first-write recovery) applies only on initial load
 * when no centreId is provided.
 */

import { useState, useEffect, useCallback } from 'react';
import { getCentreById, getFirstCentre, updateCentre as updateCentreService, archiveCentre as archiveCentreService, deleteCentre as deleteCentreService, unarchiveCentre as unarchiveCentreService } from '../services/centres.service';
import { getCategories, addCategory as addCategoryService, bulkAddCategories as bulkAddCategoriesService, updateCategory as updateCategoryService, deleteCategory as deleteCategoryService } from '../services/categories.service';
import { getMembers, addMember as addMemberService, removeMember as removeMemberService, updateMemberRole as updateMemberRoleService } from '../services/members.service';
import { createInvite as createInviteService, getHubInvites as getHubInvitesService, cancelInvite as cancelInviteService } from '../services/invites.service';
import { getUserSession } from '../services/auth.service';
import { waitForSession } from '../lib/auth';

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useBudgetCentre(user, centreId) {
  const [centre,            setCentre]            = useState(null);
  const [categories,        setCategories]        = useState([]);
  // Previous month's categories — loaded on demand (Phase 2C) when the current
  // month's budget is empty, to drive the rollforward prompt + copy sheet. Kept
  // separate from `categories` (current month only); see loadPrevMonthCategories.
  const [prevMonthCategories, setPrevMonthCategories] = useState([]);
  const [members,           setMembers]           = useState([]);
  const [currentMemberRole, setCurrentMemberRole] = useState('standard');
  const [loading,           setLoading]           = useState(true);
  const [needsOnboarding,   setNeedsOnboarding]   = useState(false);
  const [error,             setError]             = useState(null);
  const [removedFromHub,    setRemovedFromHub]    = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setCentre(null);
      setCategories([]);
      setMembers([]);
      setCurrentMemberRole('standard');
      setLoading(false);
      setNeedsOnboarding(false);
      return;
    }

    setLoading(true);
    setError(null);
    setRemovedFromHub(false);

    // Auth-readiness gate — without it a cold-load centre query races the token
    // refresh; an RLS-blocked 200 returns null and the user is wrongly bounced
    // to onboarding (or sees an empty hub). See lib/auth.js.
    const { error: sessionErr } = await waitForSession();
    if (sessionErr) {
      console.error('[useBudgetCentre] session not ready:', sessionErr.message);
      setError('Could not verify your session. Please refresh.');
      setLoading(false);
      return;
    }

    // Resolve the centre to load
    let centreData, centreErr;

    if (centreId) {
      // Explicit hub switch — load by ID, fall back to first if stale/deleted
      const result = await getCentreById(centreId);
      if (result.error) {
        centreData = null;
        centreErr  = result.error;
      } else if (!result.data) {
        // Saved ID no longer valid — fall back gracefully
        const fallback = await getFirstCentre();
        centreData = fallback.data;
        centreErr  = fallback.error;
      } else {
        centreData = result.data;
        centreErr  = null;
      }
    } else {
      // Initial load — first available centre
      const result = await getFirstCentre();
      centreData = result.data;
      centreErr  = result.error;
    }

    if (centreErr) {
      console.error('[useBudgetCentre] centre fetch error:', centreErr.message);
      setError(centreErr.message);
      setLoading(false);
      return;
    }

    if (!centreData) {
      // No centres exist — first-time user needs onboarding
      setNeedsOnboarding(true);
      setCentre(null);
      setCategories([]);
      setMembers([]);
      setCurrentMemberRole('standard');
      setLoading(false);
      return;
    }

    const [catResult, memberResult] = await Promise.all([
      getCategories(centreData.id),
      getMembers(centreData.id),
    ]);

    if (catResult.error)    console.error('[useBudgetCentre] categories fetch error:', catResult.error.message);
    if (memberResult.error) console.error('[useBudgetCentre] members fetch error:', memberResult.error.message);

    // Services now return errors truthfully (data: null on failure), so guard
    // every array access with a local fallback before deriving state.
    const cats = catResult.data    || [];
    const mems = memberResult.data || [];

    // Derive the current user's role from their member row.
    // If the user is not found and the hub has members, they have been removed.
    // NOTE: without a realtime subscription, removed members lose access on their
    // next app reload or hub switch — not immediately.
    const currentMember = mems.find(m => m.user_id === user.id);
    const isRemoved     = !memberResult.error && mems.length > 0 && !currentMember;
    const derivedRole   = currentMember?.role ?? 'standard';

    // Resume detection: only on initial load (no centreId).
    // First centre has no categories → partial onboarding write — resume.
    if (!centreId && cats.length === 0) {
      setNeedsOnboarding(true);
      setCentre(centreData);
      setCategories([]);
      setMembers(mems);
      setCurrentMemberRole(derivedRole);
      setLoading(false);
      return;
    }

    setRemovedFromHub(isRemoved);
    setCentre(centreData);
    setCategories(cats);
    setMembers(mems);
    setCurrentMemberRole(derivedRole);
    setNeedsOnboarding(false);
    setLoading(false);
  }, [user, centreId]);

  useEffect(() => {
    load();
  }, [load]);

  const onOnboardingComplete = useCallback(() => {
    load();
  }, [load]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const addCategory = async (category) => {
    const id = centre?.id;
    if (!id) return { error: new Error('No active centre') };
    const { data, error } = await addCategoryService(id, category);
    if (error) return { error };
    setCategories(prev => [...prev, data]);
    return { data, error: null };
  };

  const updateCentre = useCallback(async (updates) => {
    const id = centre?.id;
    if (!id) return { error: new Error('No active centre') };
    const prev = centre;
    setCentre(c => ({ ...c, ...updates }));
    const { data, error } = await updateCentreService(id, updates);
    if (error) {
      setCentre(prev);
      console.error('[useBudgetCentre] updateCentre rollback:', error.message);
      return { error };
    }
    setCentre(data);
    return { data, error: null };
  }, [centre]);

  const updateCategory = useCallback(async (categoryId, updates) => {
    const prevCategories = categories;
    setCategories(cats => cats.map(c => c.id === categoryId ? { ...c, ...updates } : c));
    const { data, error } = await updateCategoryService(categoryId, updates);
    if (error) {
      setCategories(prevCategories);
      console.error('[useBudgetCentre] updateCategory rollback:', error.message);
      return { error };
    }
    setCategories(cats => cats.map(c => c.id === categoryId ? data : c));
    return { data, error: null };
  }, [categories]);

  const deleteCategory = useCallback(async (categoryId) => {
    const prevCategories = categories;
    setCategories(cats => cats.filter(c => c.id !== categoryId));
    const { error } = await deleteCategoryService(categoryId);
    if (error) {
      setCategories(prevCategories);
      console.error('[useBudgetCentre] deleteCategory rollback:', error.message);
      return { error };
    }
    return { error: null };
  }, [categories]);

  // Load the previous month's categories into `prevMonthCategories` (Phase 2C).
  // BudgetView fires this when the current month's budget is empty — the result
  // drives State 1 vs 2/3 of the rollforward prompt and the copy sheet's list.
  const loadPrevMonthCategories = useCallback(async (prevMonth) => {
    const id = centre?.id;
    if (!id) return { data: [], error: null };
    const { data, error } = await getCategories(id, prevMonth);
    if (error) {
      console.error('[useBudgetCentre] loadPrevMonthCategories error:', error.message);
      return { data: null, error };
    }
    setPrevMonthCategories(data || []);
    return { data: data || [], error: null };
  }, [centre?.id]);

  // Roll the budget plan forward (Phase 2C). Copies the recurring shape of each
  // previous-month category (name/icon/amount/is_fixed/sort_order) into `toMonth`
  // as a fresh row. `categoryIds` omitted → copy all; an array → only that subset.
  // Sources from the already-loaded `prevMonthCategories`. Optimistic N-row insert
  // (each keyed by a tempId), the whole block swapped for server rows on success
  // and removed on failure — mirrors useIncomeMutations.copyIncomeSourcesToMonth.
  const copyCategoriesToMonth = useCallback(async (fromMonth, toMonth, categoryIds) => {
    const id = centre?.id;
    if (!id) return { data: null, error: new Error('No active centre') };

    const toCopy = prevMonthCategories.filter(c =>
      c.month === fromMonth && !c.deleted_at && (!categoryIds || categoryIds.includes(c.id))
    );
    if (toCopy.length === 0) return { data: [], error: null };   // nothing to copy — not an error

    const newRows = toCopy.map(c => ({
      name:          c.name,
      icon:          c.icon,
      budget_amount: c.budget_amount,
      is_fixed:      c.is_fixed,
      sort_order:    c.sort_order,
      month:         toMonth,
    }));

    const optimistic = newRows.map(r => ({ ...r, id: crypto.randomUUID(), budget_centre_id: id, _optimistic: true }));
    const tempIds    = new Set(optimistic.map(o => o.id));
    setCategories(prev => [...prev, ...optimistic]);

    const { data, error } = await bulkAddCategoriesService(id, newRows);
    if (error) {
      setCategories(prev => prev.filter(c => !tempIds.has(c.id)));
      console.error('[useBudgetCentre] copyCategoriesToMonth rollback:', error.message);
      return { data: null, error };
    }

    setCategories(prev => [...prev.filter(c => !tempIds.has(c.id)), ...(data || []).map(d => ({ ...d, _optimistic: false }))]);
    return { data: data || [], error: null };
  }, [centre?.id, prevMonthCategories]);

  const archiveCentre = useCallback(async (centreId) => {
    const { error } = await archiveCentreService(centreId);
    if (error) console.error('[useBudgetCentre] archiveCentre error:', error.message);
    return { error: error || null };
  }, []);

  const permanentDeleteCentre = useCallback(async (centreId) => {
    const { error } = await deleteCentreService(centreId);
    if (error) console.error('[useBudgetCentre] permanentDeleteCentre error:', error.message);
    return { error: error || null };
  }, []);

  const restoreHub = useCallback(async (centreId) => {
    const { error } = await unarchiveCentreService(centreId);
    if (error) console.error('[useBudgetCentre] restoreHub error:', error.message);
    return { error: error || null };
  }, []);

  // ── Member + invite mutations ─────────────────────────────────────────────

  const inviteMember = useCallback(async ({ email, role }) => {
    const id = centre?.id;
    if (!id) return { error: new Error('No active centre') };
    const { data: authData, error: authErr } = await getUserSession();
    if (authErr) return { data: null, error: authErr };
    return createInviteService({ centreId: id, email, role, invitedBy: authData?.user?.id });
  }, [centre?.id]);

  const removeMemberFromHub = useCallback(async (memberId, memberRole) => {
    const { error } = await removeMemberService(memberId, memberRole);
    if (error) {
      console.error('[useBudgetCentre] removeMember error:', error.message);
      return { error };
    }
    setMembers(prev => prev.filter(m => m.id !== memberId));
    return { error: null };
  }, []);

  const updateMemberRoleInHub = useCallback(async (memberId, role) => {
    const { data, error } = await updateMemberRoleService(memberId, role);
    if (error) {
      console.error('[useBudgetCentre] updateMemberRole error:', error.message);
      return { error };
    }
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role } : m));
    return { data, error: null };
  }, []);

  const getInvites = useCallback(async () => {
    const id = centre?.id;
    if (!id) return { data: [], error: null };
    return getHubInvitesService(id);
  }, [centre?.id]);

  const cancelInviteFromHub = useCallback(async (inviteId) => {
    return cancelInviteService(inviteId);
  }, []);

  return {
    centre,
    centreId:            centre?.id || null,
    categories,
    members,
    currentMemberRole,
    loading,
    needsOnboarding,
    error,
    addCategory,
    updateCentre,
    updateCategory,
    deleteCategory,
    prevMonthCategories,
    loadPrevMonthCategories,
    copyCategoriesToMonth,
    archiveCentre,
    permanentDeleteCentre,
    restoreHub,
    inviteMember,
    removeMember:        removeMemberFromHub,
    updateMemberRole:    updateMemberRoleInHub,
    getInvites,
    cancelInvite:        cancelInviteFromHub,
    onOnboardingComplete,
    removedFromHub,
    reload: load,
  };
}
