/**
 * hooks/useSubscription.jsx
 *
 * Loads the current user's subscription and resolves it to a plan view.
 * Called once in App.jsx; the return is passed into SubscriptionContext.
 *
 * Source of truth: the subscriptions table (no row → free, per Approach 1).
 * Replaces the old getUserPlan(users.plan) read.
 *
 * PRE-SETTLE PROTECTION (Flash-fix lesson, see docs/engineering-decisions.md):
 * while `user` is null — the pre-hydration state, NOT a settled answer — isLoading
 * STAYS true. We do not pre-settle it to false, because doing so would flash the
 * free/locked UI for a beat before the real fetch resolves once the user hydrates.
 * A null user never reaches the dashboard anyway (it sits behind the auth gate).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getCurrentSubscription, resolveSubscription } from '../services/subscriptions.service';
import { waitForSession } from '../lib/auth';

export function useSubscription(user) {
  const [subscription, setSubscription] = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  const load = useCallback(async () => {
    if (!user) {
      // Pre-settle protection: keep loading true on a null user. Do NOT flip it
      // false — null user is pre-hydration, not "settled free".
      setSubscription(null);
      setLoading(true);
      return;
    }

    setLoading(true);
    setError(null);

    // Auth-readiness gate — keep the cold-load query off a stale token (§12).
    const { error: sessionErr } = await waitForSession();
    if (sessionErr) {
      console.error('[useSubscription] session not ready:', sessionErr.message);
      setError(sessionErr.message);
      setLoading(false);
      return;
    }

    const { data, error: subErr } = await getCurrentSubscription(user.id);
    if (subErr) {
      setError(subErr.message);
      setSubscription(null);
      setLoading(false);
      return;
    }

    setSubscription(data || null);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const { tier, isActive, isPro } = useMemo(() => resolveSubscription(subscription), [subscription]);

  return { subscription, tier, isActive, isPro, isLoading: loading, error, refresh: load };
}
