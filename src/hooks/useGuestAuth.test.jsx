/**
 * hooks/useGuestAuth.test.jsx
 *
 * Covers the session-token rules added 2026-07-30 (P0-B). The token is the guest's
 * proof of PIN entry and the only thing that makes a submit succeed, so a session
 * without one must never be treated as authenticated — otherwise the guest types a
 * whole expense before discovering they are not logged in.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockAuthenticateGuest = vi.fn();
const mockGetCentreGuests   = vi.fn(async () => ({ data: [], error: null }));

vi.mock('../services/guests.service', () => ({
  authenticateGuest: (...a) => mockAuthenticateGuest(...a),
  getCentreGuests:   (...a) => mockGetCentreGuests(...a),
}));

import { useGuestAuth } from './useGuestAuth';

const SESSION_KEY = 'ffc_guest_session';
const TOKEN = 'c'.repeat(64);

const okResponse = {
  status:             'ok',
  id:                 'guest-1',
  name:               'Ama',
  allowed_categories: ['Food'],
  budget_centre_id:   'c-1',
  session_token:      TOKEN,
};

beforeEach(() => {
  sessionStorage.clear();
  mockAuthenticateGuest.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('useGuestAuth — session restore', () => {
  it('restores a stored session that has a token', () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      guestId: 'guest-1', guestName: 'Ama', allowedCategories: [], centreId: 'c-1', sessionToken: TOKEN,
    }));
    const { result } = renderHook(() => useGuestAuth('c-1'));
    expect(result.current.session?.sessionToken).toBe(TOKEN);
  });

  it('rejects a stored session with no token (pre-hardening or hand-crafted)', () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      guestId: 'guest-1', guestName: 'Ama', allowedCategories: [], centreId: 'c-1',
    }));
    const { result } = renderHook(() => useGuestAuth('c-1'));
    expect(result.current.session).toBeNull();
  });

  it('still rejects a stored session from a different centre', () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      guestId: 'guest-1', guestName: 'Ama', allowedCategories: [], centreId: 'other-hub', sessionToken: TOKEN,
    }));
    const { result } = renderHook(() => useGuestAuth('c-1'));
    expect(result.current.session).toBeNull();
  });
});

describe('useGuestAuth — authenticate', () => {
  it('stores the session token on a correct PIN', async () => {
    mockAuthenticateGuest.mockResolvedValueOnce({ data: okResponse, error: null });
    const { result } = renderHook(() => useGuestAuth('c-1'));

    await act(async () => { await result.current.authenticate('guest-1', '1234'); });

    expect(result.current.session.sessionToken).toBe(TOKEN);
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)).sessionToken).toBe(TOKEN);
  });

  it('refuses to start a session when the server returns ok with no token', async () => {
    // Should not happen, but storing such a session would leave the guest in a
    // state where every submit fails with GST01 and nothing explains why.
    mockAuthenticateGuest.mockResolvedValueOnce({ data: { ...okResponse, session_token: null }, error: null });
    const { result } = renderHook(() => useGuestAuth('c-1'));

    let outcome;
    await act(async () => { outcome = await result.current.authenticate('guest-1', '1234'); });

    expect(outcome.ok).toBe(false);
    expect(result.current.session).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('reports a wrong PIN without starting a session', async () => {
    mockAuthenticateGuest.mockResolvedValueOnce({ data: { status: 'wrong_pin' }, error: null });
    const { result } = renderHook(() => useGuestAuth('c-1'));

    let outcome;
    await act(async () => { outcome = await result.current.authenticate('guest-1', '9999'); });

    expect(outcome.ok).toBe(false);
    expect(result.current.session).toBeNull();
    expect(result.current.error).toMatch(/Incorrect PIN/i);
  });

  it('reports a lockout without starting a session', async () => {
    mockAuthenticateGuest.mockResolvedValueOnce({ data: { status: 'locked' }, error: null });
    const { result } = renderHook(() => useGuestAuth('c-1'));

    let outcome;
    await act(async () => { outcome = await result.current.authenticate('guest-1', '9999'); });

    expect(outcome.locked).toBe(true);
    expect(result.current.session).toBeNull();
    expect(result.current.error).toMatch(/15 minutes/i);
  });

  it('clears the stored session on sign out', async () => {
    mockAuthenticateGuest.mockResolvedValueOnce({ data: okResponse, error: null });
    const { result } = renderHook(() => useGuestAuth('c-1'));

    await act(async () => { await result.current.authenticate('guest-1', '1234'); });
    act(() => { result.current.signOut(); });

    expect(result.current.session).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });
});
