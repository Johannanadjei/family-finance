/**
 * context/SubscriptionContext.jsx
 *
 * Provides the user's subscription/plan state to the dashboard tree.
 * Called once in App.jsx (via DashboardProviders) — useSubscription's return is
 * passed straight in as the value prop (spread pattern, like FinanceContext).
 *
 * WHAT LIVES HERE:
 *   subscription, tier ('free'|'pro'), isActive, isPro, isLoading, error, refresh.
 *
 * Consumers read isPro via the useIsPro() helper, or the full object via
 * useSubscriptionContext(). Foundation commit: no gates read this yet.
 */

import { createContext, useContext } from 'react';

const SubscriptionContext = createContext(null);

/**
 * SubscriptionProvider — wraps the dashboard with subscription state.
 * @param {{ children, value }} props — value is the useSubscription() return object
 */
export function SubscriptionProvider({ children, value }) {
  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

/**
 * useSubscriptionContext — read subscription state from any dashboard component.
 * Must be used inside SubscriptionProvider.
 * @returns {ReturnType<import('../hooks/useSubscription').useSubscription>}
 */
export function useSubscriptionContext() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscriptionContext must be used inside SubscriptionProvider');
  return ctx;
}
