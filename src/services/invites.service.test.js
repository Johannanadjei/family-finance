import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('../lib/supabase', () => {
  const chain = () => {
    const q = {
      from:       () => q,
      select:     () => q,
      insert:     () => q,
      update:     () => q,
      eq:         () => q,
      is:         () => q,
      order:      () => q,
      maybeSingle:() => mockResolve(),
      single:     () => mockResolve(),
      then:       (fn) => Promise.resolve(mockResolve()).then(fn),
    };
    return q;
  };
  return { supabase: { from: () => chain() } };
});

import {
  createInvite, getInviteByToken, getHubInvites, cancelInvite, acceptInvite,
} from './invites.service';

beforeEach(() => {
  mockResolve = () => ({ data: null, error: null });
});

// ── createInvite ──────────────────────────────────────────────────────────────

describe('createInvite', () => {
  it('returns error when duplicate pending invite exists', async () => {
    let call = 0;
    mockResolve = () => {
      call++;
      if (call === 1) return { data: { id: 'inv-existing' }, error: null }; // dup check
      return { data: null, error: null };
    };
    const { data, error } = await createInvite({ centreId: 'c-1', email: 'bob@test.com', role: 'standard', invitedBy: 'u-1' });
    expect(data).toBeNull();
    expect(error.message).toMatch(/pending invite already exists/i);
  });

  it('returns inserted invite when no duplicate', async () => {
    let call = 0;
    mockResolve = () => {
      call++;
      if (call === 1) return { data: null,      error: null }; // no dup
      if (call === 2) return { data: null,      error: null }; // no existing member
      return { data: mockInvite, error: null };                 // insert
    };
    const { data, error } = await createInvite({ centreId: 'c-1', email: 'BOB@TEST.COM', role: 'standard', invitedBy: 'u-1' });
    expect(error).toBeNull();
    expect(data).toEqual(mockInvite);
  });

  it('returns error on Supabase failure', async () => {
    mockResolve = () => ({ data: null, error: new Error('db error') });
    const { data, error } = await createInvite({ centreId: 'c-1', email: 'bob@test.com', role: 'standard', invitedBy: 'u-1' });
    expect(data).toBeNull();
    expect(error).toBeTruthy();
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
  it('returns error when invite not found', async () => {
    mockResolve = () => ({ data: null, error: null });
    const { data, error } = await acceptInvite({ token: 'bad', userId: 'u-2' });
    expect(data).toBeNull();
    expect(error.message).toMatch(/not found/i);
  });

  it('returns error when invite is expired', async () => {
    const expired = { ...mockInvite, expires_at: new Date(Date.now() - 1000).toISOString() };
    mockResolve = () => ({ data: expired, error: null });
    const { data, error } = await acceptInvite({ token: 'tok-abc', userId: 'u-2' });
    expect(data).toBeNull();
    expect(error.message).toMatch(/expired/i);
  });

  it('returns member + centreId on success', async () => {
    const member = { id: 'mem-2', user_id: 'u-2', role: 'standard' };
    let call = 0;
    mockResolve = () => {
      call++;
      if (call === 1) return { data: mockInvite, error: null }; // getInviteByToken
      if (call === 2) return { data: member,     error: null }; // insert member
      return { error: null };                                    // mark accepted
    };
    const { data, error } = await acceptInvite({ token: 'tok-abc', userId: 'u-2' });
    expect(error).toBeNull();
    expect(data.member).toEqual(member);
    expect(data.centreId).toBe('c-1');
  });

  it('returns error when member insert fails', async () => {
    let call = 0;
    mockResolve = () => {
      call++;
      if (call === 1) return { data: mockInvite,             error: null };
      return           { data: null, error: new Error('constraint') };
    };
    const { data, error } = await acceptInvite({ token: 'tok-abc', userId: 'u-2' });
    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });
});
