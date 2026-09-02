/**
 * api/paystack/manage-link.test.js
 *
 * Covers the manage-link serverless function: method/auth/env gating, that the
 * subscription is looked up by the JWT's user id (never a body-supplied one), the
 * Paystack request shape, and every failure path.
 *
 * Supabase is mocked to a stub client exposing auth.getUser + a chainable query
 * builder terminating in maybeSingle(); global fetch is mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser     = vi.fn();
const maybeSingle = vi.fn();
const eq          = vi.fn();

// Chainable query-builder stub: every link returns the same object, and the chain
// terminates at maybeSingle(). `eq` is captured so we can assert the user filter.
const builder = {
  select: () => builder,
  eq:     (...args) => { eq(...args); return builder; },
  is:     () => builder,
  order:  () => builder,
  limit:  () => builder,
  maybeSingle: () => maybeSingle(),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser }, from: () => builder }),
}));

import handler, { manageLinkUrl } from './manage-link.js';

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function mockReq({ method = 'POST', authorization, body } = {}) {
  return { method, headers: { ...(authorization ? { authorization } : {}) }, body };
}

const PS_OK = {
  ok: true,
  json: async () => ({ status: true, data: { link: 'https://paystack.com/manage/xyz' } }),
};

beforeEach(() => {
  vi.restoreAllMocks();
  getUser.mockReset();
  maybeSingle.mockReset();
  eq.mockReset();
  process.env.SUPABASE_URL = 'https://proj.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_123';
  getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'aj@example.com' } }, error: null });
  maybeSingle.mockResolvedValue({ data: { paystack_subscription_id: 'SUB_abc' }, error: null });
  global.fetch = vi.fn(async () => PS_OK);
});

// ── manageLinkUrl (pure) ────────────────────────────────────────────────────
describe('manageLinkUrl', () => {
  it('builds the Paystack manage-link path for a subscription code', () => {
    expect(manageLinkUrl('SUB_abc')).toBe('https://api.paystack.co/subscription/SUB_abc/manage/link');
  });

  it('path-encodes the code so it cannot retarget the request', () => {
    expect(manageLinkUrl('SUB/../transaction')).not.toContain('/../');
  });
});

// ── gating ──────────────────────────────────────────────────────────────────
describe('manage-link handler — gating', () => {
  it('405s a non-POST request', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('401s when no bearer token is present', async () => {
    const res = mockRes();
    await handler(mockReq({}), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('missing_token');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('401s when the JWT does not resolve to a user', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad jwt' } });
    const res = mockRes();
    await handler(mockReq({ authorization: 'Bearer bad' }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('invalid_token');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('500s when server env is misconfigured', async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    const res = mockRes();
    await handler(mockReq({ authorization: 'Bearer ok' }), res);
    expect(res.statusCode).toBe(500);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ── identity + lookup ───────────────────────────────────────────────────────
describe('manage-link handler — subscription lookup', () => {
  it('looks the subscription up by the JWT user id, not anything in the body', async () => {
    const res = mockRes();
    await handler(mockReq({ authorization: 'Bearer ok', body: { user_id: 'attacker', subscription_code: 'SUB_evil' } }), res);
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(global.fetch.mock.calls[0][0]).toContain('SUB_abc');   // our row, not the body's
    expect(res.statusCode).toBe(200);
  });

  it('404s when the caller has no subscription row', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = mockRes();
    await handler(mockReq({ authorization: 'Bearer ok' }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('no_subscription');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('404s when the row carries no paystack_subscription_id', async () => {
    maybeSingle.mockResolvedValue({ data: { paystack_subscription_id: null }, error: null });
    const res = mockRes();
    await handler(mockReq({ authorization: 'Bearer ok' }), res);
    expect(res.statusCode).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('500s when the lookup itself fails — never silently treated as "no subscription"', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'rls boom' } });
    const res = mockRes();
    await handler(mockReq({ authorization: 'Bearer ok' }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('lookup_failed');
  });
});

// ── Paystack call ───────────────────────────────────────────────────────────
describe('manage-link handler — Paystack', () => {
  it('returns the hosted link on success and sends the secret key', async () => {
    const res = mockRes();
    await handler(mockReq({ authorization: 'Bearer ok' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.link).toBe('https://paystack.com/manage/xyz');

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.paystack.co/subscription/SUB_abc/manage/link');
    expect(opts.method).toBe('GET');
    expect(opts.headers.Authorization).toBe('Bearer sk_test_123');
  });

  it('502s when Paystack reports a failure', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({ status: false, message: 'not found' }) }));
    const res = mockRes();
    await handler(mockReq({ authorization: 'Bearer ok' }), res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toBe('payment_provider_error');
  });

  it('502s when Paystack returns 200 with no link', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ status: true, data: {} }) }));
    const res = mockRes();
    await handler(mockReq({ authorization: 'Bearer ok' }), res);
    expect(res.statusCode).toBe(502);
  });

  it('502s when the Paystack call throws', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network down'); });
    const res = mockRes();
    await handler(mockReq({ authorization: 'Bearer ok' }), res);
    expect(res.statusCode).toBe(502);
  });
});
