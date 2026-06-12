/**
 * api/paystack/checkout.test.js
 *
 * Covers the checkout serverless function: method/auth/validation gating, identity
 * derived from the JWT (never the body), and the Paystack init request shape.
 * Supabase is mocked to a stub auth client; global fetch is mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser } }),
}));

import handler, { resolvePlanCode } from './checkout.js';

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function mockReq({ method = 'POST', authorization, body } = {}) {
  return {
    method,
    headers: authorization ? { authorization } : {},
    body,
  };
}

const PS_OK = {
  ok: true,
  json: async () => ({ status: true, data: { authorization_url: 'https://checkout.paystack.com/abc' } }),
};

beforeEach(() => {
  vi.restoreAllMocks();
  getUser.mockReset();
  process.env.SUPABASE_URL = 'https://proj.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_123';
  process.env.PAYSTACK_PLAN_CODE_MONTHLY = 'PLN_month';
  process.env.PAYSTACK_PLAN_CODE_ANNUAL = 'PLN_year';
  getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'aj@example.com' } }, error: null });
  global.fetch = vi.fn(async () => PS_OK);
});

// ── resolvePlanCode (pure) ──────────────────────────────────────────────────
describe('resolvePlanCode', () => {
  it('maps monthly and annual to their configured plan codes', () => {
    expect(resolvePlanCode('monthly')).toBe('PLN_month');
    expect(resolvePlanCode('annual')).toBe('PLN_year');
  });

  it('returns null for an unknown interval', () => {
    expect(resolvePlanCode('weekly')).toBeNull();
    expect(resolvePlanCode(undefined)).toBeNull();
  });

  it('returns null when the env var for a valid interval is unset', () => {
    delete process.env.PAYSTACK_PLAN_CODE_ANNUAL;
    expect(resolvePlanCode('annual')).toBeNull();
  });
});

// ── handler gating ──────────────────────────────────────────────────────────
describe('checkout handler — gating', () => {
  it('405s a non-POST request', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('401s when no bearer token is present', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { plan_interval: 'monthly' } }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('missing_token');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('401s when the JWT does not resolve to a user', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad jwt' } });
    const res = mockRes();
    await handler(mockReq({ authorization: 'Bearer bad', body: { plan_interval: 'monthly' } }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('invalid_token');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('400s an invalid plan_interval', async () => {
    const res = mockRes();
    await handler(mockReq({ authorization: 'Bearer ok', body: { plan_interval: 'weekly' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid_plan_interval');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('500s when server env is misconfigured', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = mockRes();
    await handler(mockReq({ authorization: 'Bearer ok', body: { plan_interval: 'monthly' } }), res);
    expect(res.statusCode).toBe(500);
  });
});

// ── handler success + Paystack request shape ────────────────────────────────
describe('checkout handler — Paystack init', () => {
  it('returns the authorization_url on success', async () => {
    const res = mockRes();
    await handler(mockReq({ authorization: 'Bearer ok', body: { plan_interval: 'annual' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.authorization_url).toBe('https://checkout.paystack.com/abc');
  });

  it('sends the JWT email, the resolved plan code, and metadata.user_id from the token', async () => {
    const res = mockRes();
    await handler(mockReq({ authorization: 'Bearer ok', body: { plan_interval: 'annual' } }), res);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, opts] = global.fetch.mock.calls[0];
    const payload = JSON.parse(opts.body);
    expect(payload.email).toBe('aj@example.com');
    expect(payload.plan).toBe('PLN_year');           // annual → annual plan code
    expect(payload.amount).toBeUndefined();           // amount comes from the plan, never sent
    expect(payload.metadata).toEqual({ user_id: 'user-1', plan_interval: 'annual' });
    expect(opts.headers.Authorization).toBe('Bearer sk_test_123');
  });

  it('does NOT trust a user_id supplied in the request body', async () => {
    const res = mockRes();
    await handler(mockReq({ authorization: 'Bearer ok', body: { plan_interval: 'monthly', user_id: 'attacker' } }), res);
    const payload = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(payload.metadata.user_id).toBe('user-1');  // from the token, not the body
  });

  it('502s when Paystack reports a failure', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({ status: false, message: 'no plan' }) }));
    const res = mockRes();
    await handler(mockReq({ authorization: 'Bearer ok', body: { plan_interval: 'monthly' } }), res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toBe('payment_provider_error');
  });

  it('502s when the Paystack call throws', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network down'); });
    const res = mockRes();
    await handler(mockReq({ authorization: 'Bearer ok', body: { plan_interval: 'monthly' } }), res);
    expect(res.statusCode).toBe(502);
  });
});
