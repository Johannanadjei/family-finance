/**
 * services/checkout.service.test.js
 *
 * Covers startCheckout: success (correct POST shape + bearer token), session-not-ready,
 * non-OK response, and a thrown fetch. waitForSession and global fetch are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const waitForSession = vi.fn();
vi.mock('../lib/auth', () => ({ waitForSession: () => waitForSession() }));

import { startCheckout } from './checkout.service';

beforeEach(() => {
  vi.restoreAllMocks();
  waitForSession.mockResolvedValue({ data: { access_token: 'tok-123' }, error: null });
  global.fetch = vi.fn(async () => ({
    ok:   true,
    json: async () => ({ authorization_url: 'https://checkout.paystack.com/abc' }),
  }));
});

describe('startCheckout', () => {
  it('POSTs the interval with a bearer token and returns the authorization_url', async () => {
    const { data, error } = await startCheckout('monthly');

    expect(error).toBeNull();
    expect(data.authorization_url).toBe('https://checkout.paystack.com/abc');

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/paystack/checkout');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer tok-123');
    expect(JSON.parse(opts.body)).toEqual({ plan_interval: 'monthly' });
  });

  it('returns an error and never fetches when the session is not ready', async () => {
    waitForSession.mockResolvedValue({ data: null, error: new Error('Session not established') });

    const { data, error } = await startCheckout('monthly');

    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns an error when the endpoint responds non-OK', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_plan_interval' }) }));

    const { data, error } = await startCheckout('weekly');

    expect(data).toBeNull();
    expect(error.message).toBe('invalid_plan_interval');
  });

  it('returns an error when fetch throws', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network'); });

    const { data, error } = await startCheckout('annual');

    expect(data).toBeNull();
    expect(error.message).toBe('network');
  });
});
