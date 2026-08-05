/**
 * context/FinanceContext.jsx
 *
 * Provides all useFinance values to the dashboard component tree.
 * Called once in App.jsx — result passed as value prop.
 * Eliminates financeValues prop drilling across views.
 *
 * WHAT LIVES HERE:
 *   Everything returned by useFinance — txs, incomes, derived values,
 *   mutations, navigation, state, preferences. Plus TWO plan tiers, both spread
 *   in by App.jsx. They are NOT interchangeable:
 *
 *     hubPlan  — the ACTIVE HUB's tier = its OWNER's tier (useHubTier → hub_tier
 *                RPC). This is what every hub-scoped cap must read: categories,
 *                members, skins, history. It matches what create_category /
 *                create_invite / update_centre_skin actually enforce, so the
 *                displayed cap state agrees with the server's. `null` until
 *                resolved — every gate is written `hubPlan === 'free' && …`, so
 *                null renders NO cap rather than a possibly-false one.
 *
 *     userPlan — the VIEWER's own account tier (useSubscription). Correct for
 *                exactly one cap: the hub cap in HubFooter, because create_hub
 *                gates on the CALLER's tier. Also what PlanSection / PricingView
 *                sell, since a subscription attaches to the payer's user_id.
 *
 *   Reaching for userPlan on a hub-scoped cap is the bug this split exists to
 *   prevent: it showed members of PAID hubs a false cap, then sold them an
 *   upgrade that could never lift it.
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
