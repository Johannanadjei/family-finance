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
import { getCategories, addCategory as addCategoryService, updateCategory as updateCategoryService, deleteCategory as deleteCategoryService } from '../services/categories.service';
import { getMembers, addMember as addMemberService, removeMember as removeMemberService, updateMemberRole as updateMemberRoleService } from '../services/members.service';
import { updateIncomeSource as updateIncomeSourceService } from '../services/income.service';
import { createInvite as createInviteService, getHubInvites as getHubInvitesService, cancelInvite as cancelInviteService } from '../services/invites.service';
import { getUserSession } from '../services/auth.service';

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useBudgetCentre(user, centreId) {
  const [centre,            setCentre]            = useState(null);
  const [categories,        setCategories]        = useState([]);
  const [members,           setMembers]           = useState([]);
  const [currentMemberRole, setCurrentMemberRole] = useState('standard');
  const [loading,           setLoading]           = useState(true);
  const [needsOnboarding,   setNeedsOnboarding]   = useState(false);
  const [error,             setError]             = useState(null);

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

    // Derive the current user's role from their member row
    const currentMember = memberResult.data.find(m => m.user_id === user.id);
    const derivedRole   = currentMember?.role ?? 'standard';

    // Resume detection: only on initial load (no centreId).
    // First centre has no categories → partial onboarding write — resume.
    if (!centreId && catResult.data.length === 0) {
      setNeedsOnboarding(true);
      setCentre(centreData);
      setCategories([]);
      setMembers(memberResult.data);
      setCurrentMemberRole(derivedRole);
      setLoading(false);
      return;
    }

    setCentre(centreData);
    setCategories(catResult.data);
    setMembers(memberResult.data);
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

  const updateIncomeSource = useCallback(async (sourceId, updates) => {
    const { data, error } = await updateIncomeSourceService(sourceId, updates);
    if (error) {
      console.error('[useBudgetCentre] updateIncomeSource error:', error.message);
      return { error };
    }
    return { data, error: null };
  }, []);

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
    updateIncomeSource,
    archiveCentre,
    permanentDeleteCentre,
    restoreHub,
    inviteMember,
    removeMember:        removeMemberFromHub,
    updateMemberRole:    updateMemberRoleInHub,
    getInvites,
    cancelInvite:        cancelInviteFromHub,
    onOnboardingComplete,
    reload: load,
  };
}
