/**
 * lib/auth.test.js
 *
 * Covers the auth-readiness gate that fixes data-loss-on-refresh.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: vi.fn(), refreshSession: vi.fn() } },
}));

import { supabase } from './supabase';
import { waitForSession, warnOnEmptyColdLoad } from './auth';

describe('waitForSession', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns a present, fresh session without refreshing', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 't', expires_at: 9_999_999_999 } }, error: null });
    const { data, error } = await waitForSession();
    expect(error).toBeNull();
    expect(data.access_token).toBe('t');
    expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
  });

  it('refreshes an expired-but-present session before returning', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'old', expires_at: 1000 } }, error: null });
    supabase.auth.refreshSession.mockResolvedValue({ data: { session: { access_token: 'new', expires_at: 9_999_999_999 } }, error: null });
    const { data, error } = await waitForSession();
    expect(supabase.auth.refreshSession).toHaveBeenCalled();
    expect(data.access_token).toBe('new');
    expect(error).toBeNull();
  });

  it('returns the refresh error when refreshSession fails', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { expires_at: 1000 } }, error: null });
    supabase.auth.refreshSession.mockResolvedValue({ data: null, error: new Error('refresh failed') });
    const { data, error } = await waitForSession();
    expect(data).toBeNull();
    expect(error.message).toBe('refresh failed');
  });

  it('returns the error immediately when getSession errors', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: null, error: new Error('net') });
    const { data, error } = await waitForSession();
    expect(data).toBeNull();
    expect(error.message).toBe('net');
  });

  it('gives up with "Session not established" after all attempts', async () => {
    vi.useFakeTimers();
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const promise = waitForSession(2);
    await vi.runAllTimersAsync();
    const { data, error } = await promise;
    expect(data).toBeNull();
    expect(error.message).toMatch(/session not established/i);
    vi.useRealTimers();
  });
});

describe('warnOnEmptyColdLoad', () => {
  // Fresh module per test so the internal "session first seen" timestamp is null.
  afterEach(() => { vi.useRealTimers(); vi.resetModules(); });

  it('warns for empty results only after a session has been held >1s', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.doMock('./supabase', () => ({
      supabase: { auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { expires_at: 9_999_999_999 } }, error: null }),
        refreshSession: vi.fn(),
      } },
    }));
    const mod = await import('./auth');
    await mod.waitForSession();             // marks session seen at T0

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mod.warnOnEmptyColdLoad('t', []);       // age 0 < 1s → no warn
    expect(warnSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1500);           // age 1.5s — inside 1s..5s window
    mod.warnOnEmptyColdLoad('t', []);       // empty → warn
    expect(warnSpy).toHaveBeenCalledTimes(1);

    mod.warnOnEmptyColdLoad('t', [{ id: 1 }]); // non-empty → never warns
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it('does NOT warn for an empty result past the upper bound (not a cold-load race)', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.doMock('./supabase', () => ({
      supabase: { auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { expires_at: 9_999_999_999 } }, error: null }),
        refreshSession: vi.fn(),
      } },
    }));
    const mod = await import('./auth');
    await mod.waitForSession();             // marks session seen at T0

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.advanceTimersByTime(6000);           // age 6s — past the 5s upper bound
    mod.warnOnEmptyColdLoad('t', []);       // empty but too old → legitimate, no warn
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
