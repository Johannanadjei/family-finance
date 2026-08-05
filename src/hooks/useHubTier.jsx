/**
 * hooks/useHubTier.jsx
 *
 * Resolves the ACTIVE HUB's effective plan tier — the tier of the hub's OWNER.
 * Called once in App.jsx; the result flows into FinanceContext as `hubPlan` and
 * is what every hub-scoped cap gate reads.
 *
 * WHY THIS EXISTS — the two halves of the freemium display bug
 *   Every hub-scoped cap is enforced server-side against the OWNER's tier
 *   (create_category CAT01, create_invite MEM01, update_centre_skin SKN01 — all
 *   resolve budget_centres.owner_id → subscriptions). The client used to gate on
 *   the VIEWER's tier instead, so the two disagreed for every non-owner:
 *     a. FALSE CAP — a member of a PAID hub saw "10 of 10", a truncated history
 *        window and PRO skin badges, while the server would have accepted the write.
 *     b. PAY-FOR-NOTHING — that member was then offered a Paystack button whose
 *        purchase attaches to THEIR user_id, which no cap RPC ever reads.
 *   Keying the caps on hubPlan closes (a). Once (a) is closed, (b)'s CTA only ever
 *   renders on a genuinely free hub — so the "ask your owner" line can never appear
 *   on a hub whose owner has already paid.
 *
 * NOT for the hub cap. create_hub gates on the CALLER's tier (a hub you create is
 * one you will own), so HubFooter keeps reading userPlan. See scripts/create_hub.sql.
 *
 * OWNER FAST PATH — when the viewer owns the active hub, the hub's tier IS their
 * own already-loaded tier, so we return it directly and never call the RPC. This
 * saves a round-trip on the common case, but the real reason is freshness: right
 * after checkout, PricingView polls refresh() on the user's subscription, and a
 * cached RPC result would sit stale while the owner watches for their upgrade to
 * land. Reading through userTier means the flip to Pro is instant.
 *
 * UNRESOLVED IS null, NOT 'free'. Callers treat null as "no caps yet" (every gate
 * is written `plan === 'free' && …`). A brief no-cap flash on a free hub is
 * harmless; a "10 of 10" flash on a PAID hub is bug (a) all over again. The same
 * bias applies on failure: an RPC error leaves tier null and surfaces `error`
 * rather than masking a failed fetch as 'free' (§12). The server RPCs are the real
 * enforcement, so a free hub still gets a truthful CAT01 on the write itself.
 *
 * @param {object|null} centre   — the active budget_centres row (needs id + owner_id)
 * @param {string|null} userId   — the viewer's auth user id
 * @param {'free'|'pro'} userTier — the viewer's OWN tier, from useSubscription
 * @param {boolean} userTierLoading — viewer's tier still resolving (gates the fast path)
 * @returns {{ tier: 'free'|'pro'|null, loading: boolean, error: string|null }}
 */

import { useState, useEffect, useCallback } from 'react';
import { getHubTier } from '../services/subscriptions.service';
import { waitForSession } from '../lib/auth';

export function useHubTier(centre, userId, userTier, userTierLoading = false) {
  const centreId = centre?.id     || null;
  const ownerId  = centre?.owner_id || null;
  const isOwner  = !!ownerId && !!userId && ownerId === userId;

  const [tier,    setTier]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    // No hub yet — pre-hydration, not a settled answer. Stay unresolved (null +
    // loading) exactly like useSubscription's pre-settle protection, so no gate
    // renders a cap off a state that hasn't been fetched.
    if (!centreId) {
      setTier(null);
      setLoading(true);
      return;
    }

    setError(null);

    // Owner fast path — no RPC. Hold at unresolved while the viewer's own tier is
    // still loading, so we never briefly publish 'free' for an owner who is on Pro.
    if (isOwner) {
      if (userTierLoading) { setTier(null); setLoading(true); return; }
      setTier(userTier || 'free');
      setLoading(false);
      return;
    }

    setLoading(true);

    // Auth-readiness gate — keep the cold-load query off a stale token (§12).
    const { error: sessionErr } = await waitForSession();
    if (sessionErr) {
      console.error('[useHubTier] session not ready:', sessionErr.message);
      setError(sessionErr.message);
      setTier(null);
      setLoading(false);
      return;
    }

    const { data, error: rpcErr } = await getHubTier(centreId);
    if (rpcErr) {
      // Truthful failure (§12): stay unresolved so no cap renders, and surface the
      // error. Never coerce a failed fetch into 'free' — that is a false cap.
      setError(rpcErr.message);
      setTier(null);
      setLoading(false);
      return;
    }

    setTier(data || 'free');
    setLoading(false);
  }, [centreId, isOwner, userTier, userTierLoading]);

  useEffect(() => { load(); }, [load]);

  return { tier, loading, error };
}
