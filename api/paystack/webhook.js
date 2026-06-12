/**
 * api/paystack/webhook.js — Vercel serverless function (Node runtime).
 *
 * The ONLY writer of the subscriptions table. Paystack POSTs subscription lifecycle
 * events here; we verify the signature, normalize the payload, and hand it to the
 * apply_subscription_event RPC (service_role). The handler stays thin on purpose —
 * all the upsert/idempotency logic lives in SQL (CLAUDE.md §9.6).
 *
 * SIGNATURE: Paystack signs the RAW request body with HMAC-SHA512 keyed by your
 * PAYSTACK_SECRET_KEY (there is NO separate webhook secret). We compute over the exact
 * received bytes and timing-safe compare. An invalid signature is rejected BEFORE any
 * DB touch — this is the only thing standing between a public URL and forged upgrades.
 *
 * RESPONSE CONTRACT:
 *   - invalid signature        → 401 (a rejected request, not an internal error)
 *   - valid sig, our error      → 200 (ack receipt; don't make Paystack retry an event we
 *                                  own but failed to persist — the failure is logged)
 *   - valid sig, unknown event  → 200 ignored
 *
 * Env (server-only): PAYSTACK_SECRET_KEY, SUPABASE_URL (or VITE_SUPABASE_URL),
 * SUPABASE_SERVICE_ROLE_KEY.
 */

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// The only events we act on. Everything else is acknowledged and ignored.
const HANDLED = new Set([
  'charge.success',
  'subscription.create',
  'subscription.disable',
  'invoice.payment_failed',
]);

/**
 * Timing-safe HMAC-SHA512 check of the raw body against the x-paystack-signature header.
 * @param {Buffer|string} rawBody  exact received bytes
 * @param {string} signature        x-paystack-signature header value
 * @param {string} secret           PAYSTACK_SECRET_KEY
 * @returns {boolean}
 */
export function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return false;   // timingSafeEqual requires equal lengths
  return crypto.timingSafeEqual(a, b);
}

/** Map Paystack's interval vocabulary onto our canonical 'monthly' | 'annual'. */
function canonInterval(v) {
  if (!v) return null;
  const s = String(v).toLowerCase();
  if (s === 'monthly' || s === 'month') return 'monthly';
  if (s === 'annual' || s === 'annually' || s === 'yearly' || s === 'year') return 'annual';
  return null;
}

/** start ISO + interval → period-end ISO (provisional; subscription.* events override). */
function computeEnd(startIso, interval) {
  if (!startIso || !interval) return null;
  const d = new Date(startIso);
  if (Number.isNaN(d.getTime())) return null;
  if (interval === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (interval === 'annual') d.setFullYear(d.getFullYear() + 1);
  else return null;
  return d.toISOString();
}

/**
 * Normalize a Paystack event into apply_subscription_event RPC args.
 * Returns null for events we don't handle.
 * @param {object} event  parsed Paystack webhook body
 * @returns {object|null} the RPC argument object (p_* keys), or null
 */
export function mapEvent(event) {
  const type = event?.event;
  if (!HANDLED.has(type)) return null;

  const d        = event?.data || {};
  const customer = d.customer || {};
  const plan     = d.plan || d.subscription?.plan || {};
  const metadata = d.metadata || {};

  // metadata.plan_interval (we stamp it at checkout, already canonical) is preferred;
  // Paystack's own plan.interval ('annually' etc.) is the fallback.
  const interval = canonInterval(metadata.plan_interval) || canonInterval(plan.interval);

  const subCode = d.subscription_code || d.subscription?.subscription_code || null;

  // Period end: subscription.* events carry next_payment_date (authoritative); a
  // charge.success carries paid_at, from which we derive a provisional end.
  let periodStart = null;
  let periodEnd   = null;
  if (type === 'charge.success') {
    periodStart = d.paid_at || d.paidAt || null;
    periodEnd   = computeEnd(periodStart, interval);
  } else {
    periodEnd = d.next_payment_date || d.subscription?.next_payment_date || null;
  }

  return {
    p_event_type:      type,
    p_user_id:         metadata.user_id || null,
    p_email:           customer.email || null,
    p_subscription_id: subCode,
    p_customer_id:     customer.customer_code || null,
    p_plan_code:       plan.plan_code || null,
    p_paystack_status: d.status || d.subscription?.status || null,
    p_plan_interval:   interval,
    p_period_start:    periodStart,
    p_period_end:      periodEnd,
  };
}

/**
 * Read the raw request bytes. Vercel's Node body parsing is lazy, so reading the stream
 * BEFORE touching req.body gives us the exact bytes Paystack signed. If the stream was
 * already drained (a runtime pre-parsed it), fall back to the parsed body.
 */
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length) return Buffer.concat(chunks);

  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
  if (req.body && typeof req.body === 'object') return Buffer.from(JSON.stringify(req.body), 'utf8');
  return Buffer.alloc(0);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const secret = process.env.PAYSTACK_SECRET_KEY;

  let raw;
  try {
    raw = await getRawBody(req);
  } catch (e) {
    console.error('[webhook] raw body read failed:', e.message);
    return res.status(200).json({ received: true });
  }

  // Verify BEFORE any parse or DB touch.
  if (!verifySignature(raw, req.headers['x-paystack-signature'], secret)) {
    console.error('[webhook] invalid signature');
    return res.status(401).json({ error: 'invalid_signature' });
  }

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch (e) {
    console.error('[webhook] malformed json:', e.message);
    return res.status(200).json({ received: true });
  }

  const rpcArgs = mapEvent(event);
  if (!rpcArgs) return res.status(200).json({ received: true, ignored: event?.event || null });

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { error } = await supabase.rpc('apply_subscription_event', rpcArgs);
    if (error) console.error('[webhook] apply_subscription_event error:', error.message);
  } catch (e) {
    console.error('[webhook] rpc threw:', e.message);
  }

  // Always ack a validly-signed event so Paystack stops retrying. Failures are logged.
  return res.status(200).json({ received: true });
}
