import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn();

const mockInvite = {
  id:               'inv-1',
  budget_centre_id: 'c-1',
  invited_email:    'bob@test.com',
  role:             'standard',
  token:            'tok-abc',
  status:           'pending',
  expires_at:       new Date(Date.now() + 86400000).toISOString(),
  budget_centres:   { id: 'c-1', name: 'Home Hub', icon: '🏠', currency: 'GHS' },
};

// Chainable Supabase mock — each test overrides resolve values via mockResolve
let mockResolve;
const mockRpc = vi.fn();

vi.mock('../lib/supabase', () => {
  const chain = () => {
    const q = {
      from:        () => q,
      select:      () => q,
      insert:      (...args) => { mockInsert(...args); return q; },
      update:      () => q,
      eq:          () => q,
      is:          () => q,
      order:       () => q,
      maybeSingle: () => mockResolve(),
      single:      () => mockResolve(),
      then:        (fn) => Promise.resolve(mockResolve()).then(fn),
    };
    return q;
  };
  return { supabase: { from: () => chain(), rpc: (...args) => mockRpc(...args) } };
});

import {
  createInvite, getInviteByToken, getHubInvites, cancelInvite, acceptInvite,
} from './invites.service';

beforeEach(() => {
  mockResolve = () => ({ data: null, error: null });
  mockRpc.mockReset();
  mockInsert.mockClear();
});

// ── createInvite ──────────────────────────────────────────────────────────────

describe('createInvite', () => {
  it('calls the create_invite RPC with centre, email, and role', async () => {
    mockRpc.mockResolvedValueOnce({ data: mockInvite, error: null });
    await createInvite({ centreId: 'c-1', email: 'bob@test.com', role: 'standard' });
    expect(mockRpc).toHaveBeenCalledWith('create_invite', {
      p_centre_id:     'c-1',
      p_invited_email: 'bob@test.com',
      p_role:          'standard',
    });
  });

  it('returns the invite row on success', async () => {
    mockRpc.mockResolvedValueOnce({ data: mockInvite, error: null });
    const { data, error } = await createInvite({ centreId: 'c-1', email: 'bob@test.com', role: 'standard' });
    expect(error).toBeNull();
    expect(data).toEqual(mockInvite);
  });

  it('maps a MEM01 cap rejection to the friendly upgrade message + keeps the code', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'MEM01', message: 'member limit reached: 2 of 2 for tier free' } });
    const { data, error } = await createInvite({ centreId: 'c-1', email: 'bob@test.com', role: 'standard' });
    expect(data).toBeNull();
    expect(error.code).toBe('MEM01');
    expect(error.message).toMatch(/member limit/i);
    expect(error.message).toMatch(/upgrade to pro/i);
  });

  it('passes a generic RPC error through unmapped', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('db error') });
    const { data, error } = await createInvite({ centreId: 'c-1', email: 'bob@test.com', role: 'standard' });
    expect(data).toBeNull();
    expect(error.message).toBe('db error');
  });
});

// ── getInviteByToken ──────────────────────────────────────────────────────────

describe('getInviteByToken', () => {
  it('returns invite on success', async () => {
    mockResolve = () => ({ data: mockInvite, error: null });
    const { data, error } = await getInviteByToken('tok-abc');
    expect(data).toEqual(mockInvite);
    expect(error).toBeNull();
  });

  it('returns null when token not found', async () => {
    mockResolve = () => ({ data: null, error: null });
    const { data, error } = await getInviteByToken('bad-token');
    expect(data).toBeNull();
    expect(error).toBeNull();
  });

  it('returns error on Supabase failure', async () => {
    mockResolve = () => ({ data: null, error: new Error('db error') });
    const { data, error } = await getInviteByToken('tok-abc');
    expect(error).toBeTruthy();
  });
});

// ── getHubInvites ─────────────────────────────────────────────────────────────

describe('getHubInvites', () => {
  it('returns array on success', async () => {
    mockResolve = () => ({ data: [mockInvite], error: null });
    const { data, error } = await getHubInvites('c-1');
    expect(Array.isArray(data)).toBe(true);
    expect(error).toBeNull();
  });

  it('returns empty array on null data', async () => {
    mockResolve = () => ({ data: null, error: null });
    const { data } = await getHubInvites('c-1');
    expect(data).toEqual([]);
  });
});

// ── cancelInvite ──────────────────────────────────────────────────────────────

describe('cancelInvite', () => {
  it('returns error null on success', async () => {
    mockResolve = () => ({ error: null });
    const { error } = await cancelInvite('inv-1');
    expect(error).toBeNull();
  });

  it('returns error on Supabase failure', async () => {
    mockResolve = () => ({ error: new Error('db error') });
    const { error } = await cancelInvite('inv-1');
    expect(error).toBeTruthy();
  });
});

// ── acceptInvite ──────────────────────────────────────────────────────────────

describe('acceptInvite', () => {
  it('calls rpc accept_invite with token and name', async () => {
    mockRpc.mockResolvedValueOnce({ data: { centreId: 'c-1', memberId: 'mem-2' }, error: null });
    await acceptInvite({ token: 'tok-abc', name: 'Alice' });
    expect(mockRpc).toHaveBeenCalledWith('accept_invite', { p_token: 'tok-abc', p_name: 'Alice' });
  });

  it('passes empty string for name when omitted', async () => {
    mockRpc.mockResolvedValueOnce({ data: { centreId: 'c-1', memberId: 'mem-2' }, error: null });
    await acceptInvite({ token: 'tok-abc' });
    expect(mockRpc).toHaveBeenCalledWith('accept_invite', { p_token: 'tok-abc', p_name: '' });
  });

  it('returns centreId on success', async () => {
    mockRpc.mockResolvedValueOnce({ data: { centreId: 'c-1', memberId: 'mem-2' }, error: null });
    const { data, error } = await acceptInvite({ token: 'tok-abc' });
    expect(error).toBeNull();
    expect(data.centreId).toBe('c-1');
  });

  it('returns error on RPC failure', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('invite_not_found') });
    const { data, error } = await acceptInvite({ token: 'bad' });
    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });
});
