/**
 * BudgetCentreContext.jsx
 *
 * Single source of truth for the active budget centre.
 * Provides centre config, categories, currency formatter, and icon lookup
 * to all components without prop threading.
 *
 * WHAT LIVES HERE:
 *   centre      — full Supabase budget_centres row
 *   categories  — Supabase budget_categories for the active month
 *   members     — Supabase budget_centre_members
 *   fmt         — currency-aware formatter, created once per centre load
 *   getCatIcon  — category name → emoji lookup
 *
 * WHAT DOES NOT LIVE HERE:
 *   transactions  — useFinance owns these
 *   income sources — useFinance owns these
 *   theme         — localStorage, useFinance owns this
 */

import { createContext, useContext, useMemo } from 'react';
import { makeFmt, getCategoryIcon } from '../lib/finance';
import { can as canRole } from '../lib/roles';

const BudgetCentreContext = createContext(null);

export function BudgetCentreProvider({ centre, categories, allCategories, reloadCategories, members, currentMemberRole, currentUserId, addCategory, updateCentre, updateCategory, deleteCategory, prevMonthCategories, loadPrevMonthCategories, copyCategoriesToMonth, archiveCentre, permanentDeleteCentre, restoreHub, inviteMember, removeMember, updateMemberRole, getInvites, cancelInvite, centreCount, children }) {
  const fmt = useMemo(
    () => makeFmt(centre?.currency || 'GHS'),
    [centre?.currency]
  );

  const getCatIcon = useMemo(
    () => (categoryName) => getCategoryIcon(categoryName, categories),
    [categories]
  );

  const can = useMemo(
    () => (permission) => canRole(currentMemberRole, permission),
    [currentMemberRole]
  );

  const value = useMemo(() => ({
    centre,
    categories,
    allCategories,
    reloadCategories,
    members,
    currentMemberRole,
    currentUserId,
    can,
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
    removeMember,
    updateMemberRole,
    getInvites,
    cancelInvite,
    centreCount,
    fmt,
    getCatIcon,
  }), [centre, categories, allCategories, reloadCategories, members, currentMemberRole, currentUserId, can, addCategory, updateCentre, updateCategory, deleteCategory, prevMonthCategories, loadPrevMonthCategories, copyCategoriesToMonth, archiveCentre, permanentDeleteCentre, restoreHub, inviteMember, removeMember, updateMemberRole, getInvites, cancelInvite, centreCount, fmt, getCatIcon]);

  return (
    <BudgetCentreContext.Provider value={value}>
      {children}
    </BudgetCentreContext.Provider>
  );
}

/**
 * useBudgetCentreContext — read active centre config from any component.
 * Must be used inside BudgetCentreProvider.
 * @returns {{ centre, categories, members, fmt, getCatIcon }}
 */
export function useBudgetCentreContext() {
  const ctx = useContext(BudgetCentreContext);
  if (!ctx) throw new Error('useBudgetCentreContext must be used inside BudgetCentreProvider');
  return ctx;
}
