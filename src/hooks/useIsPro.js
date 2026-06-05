/**
 * hooks/useIsPro.js
 *
 * Thin derived helper — reads isPro from SubscriptionContext. Makes NO DB call
 * of its own (it reads the single subscription fetch already in context). Future
 * feature gates import this instead of comparing tier strings by hand.
 *
 * For numeric caps, read getLimitsForTier(tier) from lib/plans.js with the tier
 * from useSubscriptionContext().
 */

import { useSubscriptionContext } from '../context/SubscriptionContext';

/** @returns {boolean} whether the current user is on an active Pro plan. */
export function useIsPro() {
  return useSubscriptionContext().isPro;
}
