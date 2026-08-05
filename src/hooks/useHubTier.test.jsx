/**
 * hooks/useHubTier.test.jsx
 *
 * The hub's tier = its OWNER's tier. These tests pin the three behaviours that make
 * the freemium display fix correct rather than merely different:
 *   • a NON-OWNER of a Pro hub resolves to 'pro' (closes the false-cap bug — the
 *     member of a paid hub who was being shown "10 of 10" and sold an upgrade)
 *   • the OWNER never hits the RPC (fast path, and stays live through checkout)
 *   • failure and pre-hydration stay NULL, never 'free' (§12: an unresolved tier
 *     must not render as a cap the hub may not have)
 */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetHubTier   = vi.fn();
const mockWaitForSession = vi.fn();

vi.mock('../services/subscriptions.service', () => ({
  getHubTier: (...a) => mockGetHubTier(...a),
}));
vi.mock('../lib/auth', () => ({
  waitForSession: (...a) => mockWaitForSession(...a),
}));

import { useHubTier } from './useHubTier';

const OWNED  = { id: 'centre-1', owner_id: 'user-1' };
const JOINED = { id: 'centre-2', owner_id: 'owner-9' };   // viewer is a member, not the owner

beforeEach(() => {
  vi.clearAllMocks();
  mockWaitForSession.mockResolvedValue({ data: {}, error: null });
  mockGetHubTier.mockResolvedValue({ data: 'free', error: null });
});

describe('useHubTier — non-owner (the RPC path)', () => {
  it("resolves a PAID hub to 'pro' for a member who is on free themselves", async () => {
    // The bug this closes: the viewer's own tier is free, but the hub is paid for,
    // so no cap may render and no upgrade may be offered.
    mockGetHubTier.mockResolvedValue({ data: 'pro', error: null });
    const { result } = renderHook(() => useHubTier(JOINED, 'user-1', 'free'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tier).toBe('pro');
    expect(mockGetHubTier).toHaveBeenCalledWith('centre-2');
  });

  it("resolves a FREE hub to 'free' for a member who is on pro themselves", async () => {
    // The mirror case: the viewer pays, but this hub's owner does not, so the caps
    // are real and the server would reject the write.
    mockGetHubTier.mockResolvedValue({ data: 'free', error: null });
    const { result } = renderHook(() => useHubTier(JOINED, 'user-1', 'pro'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tier).toBe('free');
  });

  it('awaits the session before querying (cold-load token gate, §12)', async () => {
    const { result } = renderHook(() => useHubTier(JOINED, 'user-1', 'free'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockWaitForSession).toHaveBeenCalled();
  });
});

describe('useHubTier — owner fast path', () => {
  it("mirrors the viewer's own tier without calling the RPC", async () => {
    const { result } = renderHook(() => useHubTier(OWNED, 'user-1', 'pro'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tier).toBe('pro');
    expect(mockGetHubTier).not.toHaveBeenCalled();
  });

  it('stays unresolved while the viewer\'s own tier is still loading', async () => {
    // Publishing 'free' here would flash a cap at an owner who is actually on Pro.
    const { result } = renderHook(() => useHubTier(OWNED, 'user-1', 'free', true));

    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.tier).toBeNull();
    expect(mockGetHubTier).not.toHaveBeenCalled();
  });

  it('tracks a live upgrade — free → pro without a refetch', async () => {
    // After checkout, PricingView polls refresh() on the user's own subscription.
    // The owner's hub tier must follow it immediately.
    const { result, rerender } = renderHook(
      ({ tier }) => useHubTier(OWNED, 'user-1', tier),
      { initialProps: { tier: 'free' } },
    );
    await waitFor(() => expect(result.current.tier).toBe('free'));

    rerender({ tier: 'pro' });
    await waitFor(() => expect(result.current.tier).toBe('pro'));
    expect(mockGetHubTier).not.toHaveBeenCalled();
  });
});

describe('useHubTier — unresolved states never render as a cap', () => {
  it('keeps tier null and surfaces the error when the RPC fails', async () => {
    mockGetHubTier.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const { result } = renderHook(() => useHubTier(JOINED, 'user-1', 'free'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tier).toBeNull();          // NOT 'free' — that is a false cap
    expect(result.current.error).toBe('permission denied');
  });

  it('keeps tier null and surfaces the error when the session is not ready', async () => {
    mockWaitForSession.mockResolvedValue({ data: null, error: { message: 'no session' } });
    const { result } = renderHook(() => useHubTier(JOINED, 'user-1', 'free'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tier).toBeNull();
    expect(result.current.error).toBe('no session');
    expect(mockGetHubTier).not.toHaveBeenCalled();
  });

  it('holds at loading with a null tier before the centre hydrates', async () => {
    const { result } = renderHook(() => useHubTier(null, 'user-1', 'free'));

    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.tier).toBeNull();
    expect(mockGetHubTier).not.toHaveBeenCalled();
  });
});
