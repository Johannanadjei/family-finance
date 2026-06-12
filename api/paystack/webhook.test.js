/**
 * api/paystack/webhook.test.js
 *
 * Covers the webhook serverless function: HMAC verification (valid/invalid/length),
 * event → RPC-arg mapping per event type, idempotent replay (same args), and the
 * response contract (401 on bad sig before any DB touch; 200 ack otherwise).
 * The service-role client is mocked to capture the rpc() call.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

const rpc = vi.fn(async () => ({ data: null, error: null }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc }),
}));

import handler, { verifySignature, mapEvent } from './webhook.js';

const SECRET = 'sk_test_123';
const sign = (raw, secret = SECRET) => crypto.createHmac('sha512', secret).update(raw).digest('hex');

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

// Async-iterable request that yields the raw bytes, mirroring Vercel's Node stream.
function mockReq({ method = 'POST', raw = '', signature } = {}) {
  const buf = Buffer.from(raw);
  return {
    method,
    headers: { 'x-paystack-signature': signature },
    async *[Symbol.asyncIterator]() { yield buf; },
  };
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
  process.env.PAYSTACK_SECRET_KEY = SECRET;
  process.env.SUPABASE_URL = 'https://proj.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
});

// ── verifySignature (pure) ──────────────────────────────────────────────────
describe('verifySignature', () => {
  const raw = JSON.stringify({ event: 'charge.success' });

  it('accepts a correct HMAC-SHA512 signature', () => {
    expect(verifySignature(raw, sign(raw), SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verifySignature(raw + 'x', sign(raw), SECRET)).toBe(false);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifySignature(raw, sign(raw, 'wrong'), SECRET)).toBe(false);
  });

  it('rejects a missing signature or secret', () => {
    expect(verifySignature(raw, undefined, SECRET)).toBe(false);
    expect(verifySignature(raw, sign(raw), undefined)).toBe(false);
  });

  it('rejects a length-mismatched signature without throwing', () => {
    expect(verifySignature(raw, 'short', SECRET)).toBe(false);
  });
});

// ── mapEvent (pure) ─────────────────────────────────────────────────────────
describe('mapEvent', () => {
  it('returns null for an unhandled event', () => {
    expect(mapEvent({ event: 'customeridentification.success', data: {} })).toBeNull();
  });

  it('maps charge.success: user from metadata, provisional annual period end', () => {
    const args = mapEvent({
      event: 'charge.success',
      data: {
        status: 'success',
        paid_at: '2026-06-12T00:00:00.000Z',
        customer: { email: 'aj@example.com', customer_code: 'CUS_1' },
        plan: { plan_code: 'PLN_year', interval: 'annually' },
        metadata: { user_id: 'user-1', plan_interval: 'annual' },
      },
    });
    expect(args.p_event_type).toBe('charge.success');
    expect(args.p_user_id).toBe('user-1');
    expect(args.p_email).toBe('aj@example.com');
    expect(args.p_customer_id).toBe('CUS_1');
    expect(args.p_plan_code).toBe('PLN_year');
    expect(args.p_plan_interval).toBe('annual');
    expect(args.p_period_start).toBe('2026-06-12T00:00:00.000Z');
    expect(args.p_period_end).toBe('2027-06-12T00:00:00.000Z'); // +1 year
  });

  it('maps subscription.create: binds subscription id + authoritative next_payment_date', () => {
    const args = mapEvent({
      event: 'subscription.create',
      data: {
        status: 'active',
        subscription_code: 'SUB_abc',
        next_payment_date: '2026-07-12T00:00:00.000Z',
        customer: { email: 'aj@example.com', customer_code: 'CUS_1' },
        plan: { plan_code: 'PLN_month', interval: 'monthly' },
      },
    });
    expect(args.p_subscription_id).toBe('SUB_abc');
    expect(args.p_plan_interval).toBe('monthly');
    expect(args.p_period_end).toBe('2026-07-12T00:00:00.000Z');
    expect(args.p_period_start).toBeNull();
  });

  it('maps invoice.payment_failed pulling the subscription code from the nested object', () => {
    const args = mapEvent({
      event: 'invoice.payment_failed',
      data: {
        status: 'failed',
        subscription: { subscription_code: 'SUB_abc', status: 'attention' },
        customer: { email: 'aj@example.com', customer_code: 'CUS_1' },
      },
    });
    expect(args.p_event_type).toBe('invoice.payment_failed');
    expect(args.p_subscription_id).toBe('SUB_abc');
  });

  it('maps subscription.disable', () => {
    const args = mapEvent({
      event: 'subscription.disable',
      data: {
        status: 'complete',
        subscription_code: 'SUB_abc',
        customer: { email: 'aj@example.com', customer_code: 'CUS_1' },
      },
    });
    expect(args.p_event_type).toBe('subscription.disable');
    expect(args.p_subscription_id).toBe('SUB_abc');
  });
});

// ── handler response contract + routing ─────────────────────────────────────
describe('webhook handler', () => {
  const event = { event: 'charge.success', data: { metadata: { user_id: 'user-1' }, customer: {}, plan: {} } };
  const raw = JSON.stringify(event);

  it('405s a non-POST request', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('401s an invalid signature BEFORE any DB touch', async () => {
    const res = mockRes();
    await handler(mockReq({ raw, signature: 'deadbeef' }), res);
    expect(res.statusCode).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('200s and calls the RPC with mapped args on a valid signed event', async () => {
    const res = mockRes();
    await handler(mockReq({ raw, signature: sign(raw) }), res);
    expect(res.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe('apply_subscription_event');
    expect(args.p_event_type).toBe('charge.success');
    expect(args.p_user_id).toBe('user-1');
  });

  it('200s and ignores a handled-signature but unknown event (no RPC)', async () => {
    const unknown = JSON.stringify({ event: 'transfer.success', data: {} });
    const res = mockRes();
    await handler(mockReq({ raw: unknown, signature: sign(unknown) }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ignored).toBe('transfer.success');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('is idempotent: replaying the same event calls the RPC with identical args', async () => {
    const res1 = mockRes();
    const res2 = mockRes();
    await handler(mockReq({ raw, signature: sign(raw) }), res1);
    await handler(mockReq({ raw, signature: sign(raw) }), res2);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][1]).toEqual(rpc.mock.calls[1][1]); // convergent args; SQL dedupes
  });

  it('still 200s when the RPC reports an error (ack receipt; failure is logged)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'db down' } });
    const res = mockRes();
    await handler(mockReq({ raw, signature: sign(raw) }), res);
    expect(res.statusCode).toBe(200);
  });
});
