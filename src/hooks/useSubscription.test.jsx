/**
 * hooks/useSubscription.test.jsx
 *
 * Covers: free default (no row), pro resolution, error path, refresh, and the
 * null-user pre-settle regression (isLoading must STAY true for a null user).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSubscription }     from './useSubscription';

vi.mock('../lib/auth', () => ({
  waitForSession: vi.fn().mockResolvedValue({ data: { session: { expires_at: 9999999999 } }, error: null }),
}));

// Mock the real client away so importActual on the service below never calls
// createClient (no Supabase env in tests). getCurrentSubscription is mocked, so
// no supabase method is actually exercised — only the pure resolveSubscription
// from the real module is used.
vi.mock('../lib/supabase', () => ({ supabase: {} }));

vi.mock('../services/subscriptions.service', async () => {
  const actual = await vi.importActual('../services/subscriptions.service');
  return { ...actual, getCurrentSubscription: vi.fn() };
});

import { getCurrentSubscription } from '../services/subscriptions.service';

const mockUser = { id: 'user-1', email: 'test@test.com' };

const proRow = {
  id: 'sub-1', user_id: 'user-1', tier: 'pro', status: 'active',
  current_period_end: '2999-01-01T00:00:00Z', cancel_at_period_end: false,
};

describe('useSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentSubscription.mockResolvedValue({ data: null, error: null });
  });

  it('defaults to free when the user has no subscription row', async () => {
    const { result } = renderHook(() => useSubscription(mockUser));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tier).toBe('free');
    expect(result.current.isPro).toBe(false);
    expect(result.current.subscription).toBeNull();
  });

  it('resolves to pro for an active, in-period pro row', async () => {
    getCurrentSubscription.mockResolvedValue({ data: proRow, error: null });
    const { result } = renderHook(() => useSubscription(mockUser));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tier).toBe('pro');
    expect(result.current.isPro).toBe(true);
    expect(result.current.isActive).toBe(true);
  });

  it('surfaces a fetch error and falls back to free', async () => {
    getCurrentSubscription.mockResolvedValue({ data: null, error: { message: 'rls denied' } });
    const { result } = renderHook(() => useSubscription(mockUser));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('rls denied');
    expect(result.current.tier).toBe('free');
    expect(result.current.isPro).toBe(false);
  });

  it('exposes a refresh function', async () => {
    const { result } = renderHook(() => useSubscription(mockUser));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(typeof result.current.refresh).toBe('function');
  });

  // Regression — the Flash-fix lesson. A null user is pre-hydration, not a settled
  // "free" answer: isLoading must STAY true and never pre-settle to false.
  it('keeps isLoading true for a null user (no pre-settle), reports free', async () => {
    const { result } = renderHook(() => useSubscription(null));
    // give any (incorrect) async settle a chance to run
    await Promise.resolve();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.tier).toBe('free');
    expect(result.current.isPro).toBe(false);
    expect(getCurrentSubscription).not.toHaveBeenCalled();
  });
});
