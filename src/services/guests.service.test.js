/**
 * services/guests.service.test.js
 *
 * Covers the guest SESSION-TOKEN contract added 2026-07-30 (P0-B). The point of
 * these tests is that the write path carries proof of PIN entry: before the fix
 * submit_guest_transaction authorized on (guestId, centreId) alone, and both are
 * effectively public (get_centre_guests hands guest ids to the anon key; the portal
 * URL carries the centre id).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: (...args) => mockRpc(...args) },
}));

vi.mock('../lib/crypto', () => ({
  hashPin: vi.fn(async (pin) => `sha256-of-${pin}`),
}));

import { authenticateGuest, submitGuestTransaction } from './guests.service';

const validSubmit = {
  guestId:      'guest-1',
  centreId:     'c-1',
  amount:       250,
  categoryName: 'Food',
  description:  'market run',
  date:         '2026-07-30',
  week:         'Week 5',
  currency:     'GHS',
  sessionToken: 'a'.repeat(64),
};

beforeEach(() => {
  mockRpc.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ── authenticateGuest ─────────────────────────────────────────────────────────

describe('authenticateGuest', () => {
  it('hashes the PIN before it leaves the client', async () => {
    mockRpc.mockResolvedValueOnce({ data: [{ status: 'ok', session_token: 'tok' }], error: null });
    await authenticateGuest('guest-1', '1234');
    expect(mockRpc).toHaveBeenCalledWith('authenticate_guest', {
      p_guest_id: 'guest-1',
      p_pin_hash: 'sha256-of-1234',
    });
  });

  it('returns the session token minted on a correct PIN', async () => {
    const token = 'b'.repeat(64);
    mockRpc.mockResolvedValueOnce({
      data:  [{ status: 'ok', id: 'guest-1', name: 'Ama', allowed_categories: ['Food'], budget_centre_id: 'c-1', session_token: token }],
      error: null,
    });
    const { data, error } = await authenticateGuest('guest-1', '1234');
    expect(error).toBeNull();
    expect(data.status).toBe('ok');
    expect(data.session_token).toBe(token);
  });

  it('returns no token for a wrong PIN', async () => {
    mockRpc.mockResolvedValueOnce({
      data:  [{ status: 'wrong_pin', id: null, name: null, allowed_categories: null, budget_centre_id: null, session_token: null }],
      error: null,
    });
    const { data } = await authenticateGuest('guest-1', '9999');
    expect(data.status).toBe('wrong_pin');
    expect(data.session_token).toBeNull();
  });

  it('returns no token while the guest is locked out', async () => {
    mockRpc.mockResolvedValueOnce({
      data:  [{ status: 'locked', id: null, name: null, allowed_categories: null, budget_centre_id: null, session_token: null }],
      error: null,
    });
    const { data } = await authenticateGuest('guest-1', '9999');
    expect(data.status).toBe('locked');
    expect(data.session_token).toBeNull();
  });

  it('returns the error on RPC failure', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('db error') });
    const { data, error } = await authenticateGuest('guest-1', '1234');
    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });
});

// ── submitGuestTransaction ────────────────────────────────────────────────────

describe('submitGuestTransaction', () => {
  it('sends the session token to the RPC', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'tx-1', error: null });
    await submitGuestTransaction(validSubmit);
    expect(mockRpc).toHaveBeenCalledWith('submit_guest_transaction', expect.objectContaining({
      p_guest_id:      'guest-1',
      p_centre_id:     'c-1',
      p_session_token: validSubmit.sessionToken,
    }));
  });

  it('sends an explicit null token when none is supplied, never omits the arg', async () => {
    // Omitting the argument would make PostgREST fail to resolve the function; an
    // explicit null reaches the server guard and comes back as GST01.
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    const { sessionToken, ...noToken } = validSubmit;
    await submitGuestTransaction(noToken);
    expect(mockRpc.mock.calls[0][1]).toHaveProperty('p_session_token', null);
  });

  it('returns the transaction id on success', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'tx-1', error: null });
    const { data, error } = await submitGuestTransaction(validSubmit);
    expect(data).toBe('tx-1');
    expect(error).toBeNull();
  });

  it('maps a rejected session to friendly copy and keeps the code', async () => {
    const rpcErr = new Error('guest_session_invalid: guest session is missing, expired, or not for this guest');
    rpcErr.code = 'GST01';
    mockRpc.mockResolvedValueOnce({ data: null, error: rpcErr });

    const { data, error } = await submitGuestTransaction(validSubmit);
    expect(data).toBeNull();
    expect(error.code).toBe('GST01');
    expect(error.message).toMatch(/PIN again/i);
    expect(error.message).not.toMatch(/guest_session_invalid/);
  });

  it('passes a non-session error through unmapped', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('category_not_allowed: Rent') });
    const { data, error } = await submitGuestTransaction(validSubmit);
    expect(data).toBeNull();
    expect(error.code).toBeUndefined();
    expect(error.message).toMatch(/category_not_allowed/);
  });
});
