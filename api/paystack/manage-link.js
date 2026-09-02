/**
 * api/paystack/manage-link.js — Vercel serverless function (Node runtime).
 *
 * Returns a short-lived Paystack-hosted "manage subscription" link for the
 * AUTHENTICATED caller's own subscription. On that page the customer can update
 * their card or cancel. We never render a cancel UI ourselves and never hold card
 * data; the resulting cancel comes back to us as a webhook event.
 *
 * SECURITY — identity comes from the verified Supabase JWT, NEVER the request body,
 * exactly as checkout.js does. The subscription is looked up BY THAT USER ID, so a
 * caller can only ever get a manage link for their own subscription. A spoofed
 * subscription code or user_id in the body is ignored — there is no body input at all.
 *
 * WHY service-role for the lookup: `subscriptions` is own-row-read under RLS, and we
 * are already holding a service-role client to validate the JWT. We re-filter
 * `user_id = user.id` explicitly rather than leaning on RLS (defense in depth, §6).
 *
 * WHY any non-deleted row qualifies (not just status='active'): a past_due customer
 * needs this page most of all — it is where a failed card gets replaced. We require
 * only that we hold a paystack_subscription_id to ask about.
 *
 * Env (server-only, set in Vercel — never VITE_-prefixed):
 *   PAYSTACK_SECRET_KEY          Paystack API auth (sk_test_… / sk_live_…)
 *   SUPABASE_URL                 project URL (non-secret; falls back to VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY    validates the caller's JWT + reads their subscription
 *
 * POST (not GET) despite being a read: the returned link is single-use and
 * short-lived, and POST keeps it off any intermediary cache.
 */

import { createClient } from '@supabase/supabase-js';

const PAYSTACK_API = 'https://api.paystack.co';

/**
 * Build the Paystack manage-link URL for a subscription code.
 * The code is path-encoded — it comes from our own DB, but a code containing a
 * path separator must never be able to retarget the request at another endpoint.
 * @param {string} subscriptionCode — e.g. 'SUB_vsyqdmlzble3uii'
 * @returns {string}
 */
export function manageLinkUrl(subscriptionCode) {
  return `${PAYSTACK_API}/subscription/${encodeURIComponent(subscriptionCode)}/manage/link`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  // 1. Auth — identity is derived from the bearer token, not from the body.
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret      = process.env.PAYSTACK_SECRET_KEY;
  if (!supabaseUrl || !serviceKey || !secret) {
    console.error('[manage-link] missing server env');
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user?.id) return res.status(401).json({ error: 'invalid_token' });

  // 2. The caller's own subscription code. Newest live row wins, mirroring
  //    getCurrentSubscription() so the client and this route never disagree about
  //    which subscription "yours" means.
  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .select('paystack_subscription_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subErr) {
    console.error('[manage-link] subscription lookup failed:', subErr.message);
    return res.status(500).json({ error: 'lookup_failed' });
  }

  const code = sub?.paystack_subscription_id;
  if (!code) return res.status(404).json({ error: 'no_subscription' });

  // 3. Ask Paystack for the hosted manage page.
  try {
    const psRes = await fetch(manageLinkUrl(code), {
      method:  'GET',
      headers: { Authorization: `Bearer ${secret}` },
    });

    const psBody = await psRes.json().catch(() => null);
    const link = psBody?.data?.link;
    if (!psRes.ok || !psBody?.status || !link) {
      console.error('[manage-link] paystack link failed:', psRes.status, psBody?.message);
      return res.status(502).json({ error: 'payment_provider_error' });
    }

    return res.status(200).json({ link });
  } catch (e) {
    console.error('[manage-link] paystack call threw:', e.message);
    return res.status(502).json({ error: 'payment_provider_error' });
  }
}
