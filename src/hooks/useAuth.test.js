/**
 * hooks/useAuth.test.js
 *
 * Covers the stable-user-ref contract: Supabase fires a fresh session.user object
 * on every auth event, but useAuth must keep the same reference when the identity
 * (user.id) is unchanged, so consumer hooks keyed on [user] stop refetching.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAuth } from './useAuth';

// Auth mock — capture the onAuthStateChange callback so tests can fire events.
let authCallback = null;
const getSession = vi.fn();
const onAuthStateChange = vi.fn((cb) => {
  authCallback = cb;
  return { data: { subscription: { unsubscribe: vi.fn() } } };
});
const signOut = vi.fn().mockResolvedValue({ error: null });

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: () => getSession(), onAuthStateChange: (cb) => onAuthStateChange(cb), signOut: () => signOut() } },
}));

vi.mock('../lib/storage', () => ({ clearPrefs: vi.fn() }));

const session = (id) => ({ user: { id, email: `${id}@x.io` } });

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authCallback = null;
    getSession.mockResolvedValue({ data: { session: null } });
  });

  it('sets the user and flips loading false on initial session restore', async () => {
    getSession.mockResolvedValue({ data: { session: session('user-1') } });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.id).toBe('user-1');
  });

  it('returns null user and loading false when there is no session', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it('keeps the SAME user reference when a later event carries the same id', async () => {
    getSession.mockResolvedValue({ data: { session: session('user-1') } });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.user?.id).toBe('user-1'));

    const first = result.current.user;
    // Simulate TOKEN_REFRESHED / focus SIGNED_IN — a brand-new object, same id.
    await act(async () => { authCallback('TOKEN_REFRESHED', session('user-1')); });
    expect(result.current.user).toBe(first);   // identical reference — no churn
  });

  it('swaps the reference when the user id changes', async () => {
    getSession.mockResolvedValue({ data: { session: session('user-1') } });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.user?.id).toBe('user-1'));

    const first = result.current.user;
    await act(async () => { authCallback('SIGNED_IN', session('user-2')); });
    expect(result.current.user).not.toBe(first);
    expect(result.current.user?.id).toBe('user-2');
  });

  it('clears the user on SIGNED_OUT', async () => {
    getSession.mockResolvedValue({ data: { session: session('user-1') } });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.user?.id).toBe('user-1'));

    await act(async () => { authCallback('SIGNED_OUT', null); });
    expect(result.current.user).toBeNull();
  });
});
