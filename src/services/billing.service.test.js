/**
 * services/billing.service.test.js
 *
 * Covers getManageLink: success (correct POST shape + bearer token), session-not-ready,
 * missing token, non-OK response, and a thrown fetch. Mirrors checkout.service.test.js —
 * waitForSession and global fetch are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const waitForSession = vi.fn();
vi.mock('../lib/auth', () => ({ waitForSession: () => waitForSession() }));

import { getManageLink } from './billing.service';

beforeEach(() => {
  vi.restoreAllMocks();
  waitForSession.mockResolvedValue({ data: { access_token: 'tok-123' }, error: null });
  global.fetch = vi.fn(async () => ({
    ok:   true,
    json: async () => ({ link: 'https://paystack.com/manage/xyz' }),
  }));
});

describe('getManageLink', () => {
  it('POSTs with a bearer token and returns the hosted link', async () => {
    const { data, error } = await getManageLink();

    expect(error).toBeNull();
    expect(data.link).toBe('https://paystack.com/manage/xyz');

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/paystack/manage-link');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer tok-123');
  });

  it('sends no subscription code — the server resolves it from the JWT', async () => {
    await getManageLink();
    expect(global.fetch.mock.calls[0][1].body).toBeUndefined();
  });

  it('returns an error and never fetches when the session is not ready', async () => {
    waitForSession.mockResolvedValue({ data: null, error: new Error('Session not established') });
    const { data, error } = await getManageLink();

    expect(data).toBeNull();
    expect(error.message).toBe('Session not established');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns an error when the session carries no access token', async () => {
    waitForSession.mockResolvedValue({ data: {}, error: null });
    const { data, error } = await getManageLink();

    expect(data).toBeNull();
    expect(error.message).toBe('No access token');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('surfaces the server error code on a non-OK response', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({ error: 'no_subscription' }) }));
    const { data, error } = await getManageLink();

    expect(data).toBeNull();
    expect(error.message).toBe('no_subscription');
  });

  it('returns an error when the response is OK but carries no link', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    const { data, error } = await getManageLink();

    expect(data).toBeNull();
    expect(error.message).toBe('manage_link_failed');
  });

  it('returns an error when fetch throws', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network down'); });
    const { data, error } = await getManageLink();

    expect(data).toBeNull();
    expect(error.message).toBe('network down');
  });
});
