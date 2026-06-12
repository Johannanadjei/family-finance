/**
 * api/paystack/checkout.js — Vercel serverless function (Node runtime).
 *
 * Initializes a Paystack transaction for the AUTHENTICATED caller and returns the
 * hosted-checkout URL the client redirects to. Plan-based: we pass the plan code, so
 * Paystack auto-creates the recurring subscription on payment (no card data ever touches
 * us). `amount` is also sent — Paystack requires it on transaction/initialize even when a
 * plan is supplied; the plan governs the actual recurring billing.
 *
 * SECURITY — identity comes from the verified Supabase JWT, NEVER the request body. A
 * caller can only ever start a checkout for themselves; a spoofed user_id is impossible.
 *
 * Env (server-only, set in Vercel — never VITE_-prefixed):
 *   PAYSTACK_SECRET_KEY          Paystack API auth (sk_test_… / sk_live_…)
 *   SUPABASE_URL                 project URL (non-secret; falls back to VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY    validates the caller's JWT server-side
 *   PAYSTACK_PLAN_CODE_MONTHLY   PLN_… for ₵40/month
 *   PAYSTACK_PLAN_CODE_ANNUAL    PLN_… for ₵400/year
 *
 * Ships DARK: no UI calls this yet (Commit 2 wires the pricing page).
 */

import { createClient } from '@supabase/supabase-js';
import { PRICING } from '../../src/lib/pricing.js';

const PAYSTACK_INIT_URL = 'https://api.paystack.co/transaction/initialize';
const CALLBACK_URL      = 'https://family-finance-plum.vercel.app/pricing?checkout=return';

// Canonical interval ('monthly' | 'annual') → the env var holding its Paystack plan code.
// Plan codes live in env (never committed): a clean test↔live swap with no code change.
const PLAN_CODE_ENV = {
  monthly: 'PAYSTACK_PLAN_CODE_MONTHLY',
  annual:  'PAYSTACK_PLAN_CODE_ANNUAL',
};

/**
 * Resolve a requested interval to its configured Paystack plan code.
 * @param {string} interval — 'monthly' | 'annual'
 * @returns {string|null} the PLN_ code, or null if the interval is invalid / unconfigured
 */
export function resolvePlanCode(interval) {
  const envKey = PLAN_CODE_ENV[interval];
  if (!envKey) return null;
  return process.env[envKey] || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  // 1. Auth — pull the bearer token; identity is derived from it, not from the body.
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('[checkout] missing supabase env');
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error: userErr } = await supabase.auth.getUser(token);
  const user = data?.user;
  if (userErr || !user?.email) return res.status(401).json({ error: 'invalid_token' });

  // 2. Validate the requested plan and resolve its Paystack plan code.
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const interval = body?.plan_interval;
  const planCode = resolvePlanCode(interval);
  if (!planCode) return res.status(400).json({ error: 'invalid_plan_interval' });

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error('[checkout] missing PAYSTACK_SECRET_KEY');
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  // 3. Initialize the transaction. `plan` drives recurring billing; `amount` is required
  //    by Paystack even so. metadata.user_id is echoed back on charge.success so the
  //    webhook can map the payment to this user.
  try {
    const psRes = await fetch(PAYSTACK_INIT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email:        user.email,
        amount:       PRICING[interval].amount,   // pesewas; required by Paystack even with a plan
        plan:         planCode,
        callback_url: CALLBACK_URL,
        metadata:     { user_id: user.id, plan_interval: interval },
      }),
    });

    const psBody = await psRes.json().catch(() => null);
    const url = psBody?.data?.authorization_url;
    if (!psRes.ok || !psBody?.status || !url) {
      console.error('[checkout] paystack init failed:', psRes.status, psBody?.message);
      return res.status(502).json({ error: 'payment_provider_error' });
    }

    return res.status(200).json({ authorization_url: url });
  } catch (e) {
    console.error('[checkout] paystack init threw:', e.message);
    return res.status(502).json({ error: 'payment_provider_error' });
  }
}
