/**
 * HouseholdContext.jsx
 *
 * Single source of truth for household config across the entire app.
 * Provides household data, categories, currency formatter, and category icon lookup.
 *
 * ARCHITECTURE:
 *   - HouseholdProvider wraps the dashboard in App.jsx
 *   - Any component calls useHouseholdContext() to access household data
 *   - fmt is created once per household load — never recreated on re-render
 *   - No prop threading — zero coupling between parent and child components
 *
 * WHAT LIVES HERE:
 *   household     — full Supabase household row
 *   categories    — Supabase budget_categories for this household
 *   fmt           — currency-aware number formatter
 *   getCatIcon    — emoji lookup by category name
 *
 * WHAT DOES NOT LIVE HERE:
 *   transactions  — useFinance owns these
 *   incomes       — useFinance owns these
 *   theme         — localStorage, useFinance owns this
 *   workspaces    — useFinance owns these
 */

import { createContext, useContext, useMemo } from 'react';
import { makeFmt, getCategoryIcon } from '../lib/finance';

const HouseholdContext = createContext(null);

/**
 * HouseholdProvider — wrap around the authenticated dashboard only.
 * Not used during onboarding or on the guest portal.
 */
export function HouseholdProvider({ household, categories, children }) {
  const fmt = useMemo(
    () => makeFmt(household?.currency || 'GHS'),
    [household?.currency]
  );

  const getCatIcon = useMemo(
    () => (categoryName) => getCategoryIcon(categoryName, categories),
    [categories]
  );

  const value = useMemo(() => ({
    household,
    categories,
    fmt,
    getCatIcon,
  }), [household, categories, fmt, getCatIcon]);

  return (
    <HouseholdContext.Provider value={value}>
      {children}
    </HouseholdContext.Provider>
  );
}

/**
 * useHouseholdContext — read household config from any component.
 * @returns {{ household, categories, fmt, getCatIcon }}
 */
export function useHouseholdContext() {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error('useHouseholdContext must be used inside HouseholdProvider');
  return ctx;
}
