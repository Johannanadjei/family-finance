/**
 * context/FinanceContext.jsx
 *
 * Provides all useFinance values to the dashboard component tree.
 * Called once in App.jsx — result passed as value prop.
 * Eliminates financeValues prop drilling across views.
 *
 * WHAT LIVES HERE:
 *   Everything returned by useFinance — txs, incomes, derived values,
 *   mutations, navigation, state, preferences. Plus `userPlan` (the tier),
 *   spread in by App.jsx from useSubscription().
 *
 *   cycles vs visibleCycles (history visibility gate): `visibleCycles` is the
 *   tier-windowed list (newest 3 for free, all for Pro) — views use it for ALL
 *   navigation (getCycleNav, viewedCycle resolution, the move-to-period list).
 *   `cycles` is the FULL list, kept only for internal plumbing (active-cycle
 *   resolution, mutation hooks, the hidden-cycle count behind the upgrade
 *   affordance). Never navigate off `cycles` directly — it leaks hidden periods.
 *
 * WHAT DOES NOT LIVE HERE:
 *   centre config, fmt, getCatIcon — those live in BudgetCentreContext.
 *   useFinance is NOT called here — App.jsx calls it and passes the result.
 */

import { createContext, useContext } from 'react';

const FinanceContext = createContext(null);

/**
 * FinanceProvider — wraps the dashboard with financial state.
 * @param {{ children, value }} props — value is the useFinance() return object
 */
export function FinanceProvider({ children, value }) {
  return (
    <FinanceContext.Provider value={value}>
      {children}
    </FinanceContext.Provider>
  );
}

/**
 * useFinanceContext — read financial state from any dashboard component.
 * Must be used inside FinanceProvider.
 * @returns {ReturnType<import('../hooks/useFinance').useFinance>}
 */
export function useFinanceContext() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinanceContext must be used inside FinanceProvider');
  return ctx;
}
