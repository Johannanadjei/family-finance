/**
 * services/billing.service.js
 *
 * Post-purchase billing actions for the signed-in user's own subscription.
 * Sibling of checkout.service.js: that file gets you INTO Pro, this one manages
 * the subscription you already have.
 *
 * NOT a Supabase query — it POSTs the project's own serverless function
 * (api/paystack/manage-link.js), which derives identity from the bearer token and
 * looks up the caller's subscription server-side. Lives in services/ to keep
 * network I/O out of view orchestrators (§6).
 *
 * Contract (§6): returns { data, error }, never throws.
 */

import { waitForSession } from '../lib/auth';

const MANAGE_LINK_ENDPOINT = '/api/paystack/manage-link';

/**
 * Fetch a Paystack-hosted manage-subscription link for the current user. The page
 * it points at is where the customer updates their card or cancels — we deliberately
 * do not implement either ourselves, so no card data and no cancel authority sits in
 * this app. A resulting cancellation reaches us as a webhook event.
 *
 * The request carries no body: sending a subscription code would be pointless (the
 * server ignores it and resolves the subscription from the JWT).
 *
 * @returns {Promise<{ data: { link: string }|null, error: any }>}
 */
export const getManageLink = async () => {
  // Auth-readiness gate — a valid, non-expired session token (§12). The serverless
  // function rejects a missing/stale token with 401.
  const { data: session, error: sessionErr } = await waitForSession();
  if (sessionErr) {
    console.error('[billing.service] session not ready:', sessionErr.message);
    return { data: null, error: sessionErr };
  }

  const token = session?.access_token;
  if (!token) {
    const err = new Error('No access token');
    console.error('[billing.service] getManageLink error:', err.message);
    return { data: null, error: err };
  }

  try {
    const res = await fetch(MANAGE_LINK_ENDPOINT, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });

    const body = await res.json().catch(() => null);
    const link = body?.link;
    if (!res.ok || !link) {
      const err = new Error(body?.error || 'manage_link_failed');
      console.error('[billing.service] getManageLink failed:', res.status, err.message);
      return { data: null, error: err };
    }

    return { data: { link }, error: null };
  } catch (e) {
    console.error('[billing.service] getManageLink threw:', e.message);
    return { data: null, error: e };
  }
};
