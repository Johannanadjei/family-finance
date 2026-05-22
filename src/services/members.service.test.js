/**
 * services/members.service.test.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => {
  const make = () => {
    const q = {
      from:       () => q,
      select:     () => q,
      insert:     () => q,
      update:     () => q,
      eq:         () => q,
      is:         () => q,
      single:     () => Promise.resolve({ data: { id: 'mem-1', budget_centre_id: 'c-1', user_id: 'u-1', role: 'member' }, error: null }),
      then:       (res) => res({ data: [], error: null }),
    };
    return q;
  };
  return { supabase: { from: () => make() } };
});

import { getMembers, addMember, removeMember } from './members.service';

describe('getMembers', () => {
  it('returns data array on success', async () => {
    const { data, error } = await getMembers('c-1');
    expect(Array.isArray(data)).toBe(true);
    expect(error).toBeNull();
  });
});

describe('addMember', () => {
  it('returns data on success', async () => {
    const { data, error } = await addMember('c-1', 'u-2');
    expect(data).toBeTruthy();
    expect(error).toBeNull();
  });
});

describe('removeMember', () => {
  it('returns error null on success', async () => {
    const { error } = await removeMember('mem-1');
    expect(error).toBeNull();
  });
});
