import { describe, it, expect, vi, beforeEach } from 'vitest';

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
      single:     () => mockResolve(),
      then:       (fn) => Promise.resolve(mockResolve()).then(fn),
    };
    return q;
  };
  return { supabase: { from: () => chain() } };
});

import { getMembers, updateMemberRole, removeMember } from './members.service';

beforeEach(() => {
  mockResolve = () => ({ data: null, error: null });
});

// ── getMembers ────────────────────────────────────────────────────────────────

describe('getMembers', () => {
  it('returns data array on success', async () => {
    mockResolve = () => ({ data: [], error: null });
    const { data, error } = await getMembers('c-1');
    expect(Array.isArray(data)).toBe(true);
    expect(error).toBeNull();
  });

  it('returns empty array on null data', async () => {
    mockResolve = () => ({ data: null, error: null });
    const { data } = await getMembers('c-1');
    expect(data).toEqual([]);
  });
});

// ── updateMemberRole ──────────────────────────────────────────────────────────

describe('updateMemberRole', () => {
  it('returns updated row on success', async () => {
    const row = { id: 'mem-1', role: 'view_only' };
    mockResolve = () => ({ data: row, error: null });
    const { data, error } = await updateMemberRole('mem-1', 'view_only');
    expect(data.role).toBe('view_only');
    expect(error).toBeNull();
  });

  it('returns error on Supabase failure', async () => {
    mockResolve = () => ({ data: null, error: new Error('db error') });
    const { error } = await updateMemberRole('mem-1', 'view_only');
    expect(error).toBeTruthy();
  });
});

// ── removeMember ──────────────────────────────────────────────────────────────

describe('removeMember', () => {
  it('returns error null on success', async () => {
    mockResolve = () => ({ error: null });
    const { error } = await removeMember('mem-2', 'standard');
    expect(error).toBeNull();
  });

  it('blocks owner removal without hitting Supabase', async () => {
    const spy = vi.fn();
    mockResolve = spy;
    const { error } = await removeMember('mem-1', 'owner');
    expect(error.message).toMatch(/owner cannot be removed/i);
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns error on Supabase failure', async () => {
    mockResolve = () => ({ error: new Error('db error') });
    const { error } = await removeMember('mem-2', 'full_access');
    expect(error).toBeTruthy();
  });
});
