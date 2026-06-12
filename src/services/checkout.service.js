/**
 * services/checkout.service.js
 *
 * Starts a Paystack checkout for the authenticated user. NOT a Supabase query — it
 * POSTs the project's own serverless function (api/paystack/checkout.js), which
 * derives identity from the bearer token server-side and returns the hosted-checkout
 * URL. Lives in services/ (not the view) to keep network I/O out of view
 * orchestrators, matching the §6 boundary.
 *
 * Contract (§6): returns { data, error }, never throws. The view redirects with
 * window.location.assign(data.authorization_url) on success.
 */

import { waitForSession } from '../lib/auth';

const CHECKOUT_ENDPOINT = '/api/paystack/checkout';

/**
 * Initialize a Paystack checkout for the given billing interval.
 * @param {'monthly'|'annual'} interval
 * @returns {Promise<{ data: { authorization_url: string }|null, error: any }>}
 */
export const startCheckout = async (interval) => {
  // Auth-readiness gate — a valid, non-expired session token (§12). The serverless
  // function rejects a missing/stale token with 401.
  const { data: session, error: sessionErr } = await waitForSession();
  if (sessionErr) {
    console.error('[checkout.service] session not ready:', sessionErr.message);
    return { data: null, error: sessionErr };
  }

  const token = session?.access_token;
  if (!token) {
    const err = new Error('No access token');
    console.error('[checkout.service] startCheckout error:', err.message);
    return { data: null, error: err };
  }

  try {
    const res = await fetch(CHECKOUT_ENDPOINT, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ plan_interval: interval }),
    });

    const body = await res.json().catch(() => null);
    const url  = body?.authorization_url;
    if (!res.ok || !url) {
      const err = new Error(body?.error || 'checkout_failed');
      console.error('[checkout.service] startCheckout failed:', res.status, err.message);
      return { data: null, error: err };
    }

    return { data: { authorization_url: url }, error: null };
  } catch (e) {
    console.error('[checkout.service] startCheckout threw:', e.message);
    return { data: null, error: e };
  }
};
