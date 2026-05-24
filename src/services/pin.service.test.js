/**
 * services/pin.service.test.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => {
  const chain = {
    from:        () => chain,
    select:      () => chain,
    eq:          () => chain,
    update:      () => chain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then:        (resolve) => resolve({ data: null, error: null }),
  };
  return { supabase: chain };
});

import { supabase }                         from '../lib/supabase';
import { getPinHash, savePinHash, clearPinHash } from './pin.service';

const makeFreshChain = () => {
  const c = {};
  c.from        = vi.fn(() => c);
  c.select      = vi.fn(() => c);
  c.eq          = vi.fn(() => c);
  c.update      = vi.fn(() => c);
  c.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  c.then        = (resolve) => resolve({ error: null });
  return c;
};

describe('pin.service', () => {
  let chain;
  beforeEach(() => {
    chain = makeFreshChain();
    vi.spyOn(supabase, 'from').mockReturnValue(chain);
  });

  // ── getPinHash ────────────────────────────────────────────────────────────

  it('getPinHash — selects pin_hash from users for the given userId', async () => {
    chain.maybeSingle.mockResolvedValue({ data: { pin_hash: 'abc123' }, error: null });
    const { data } = await getPinHash('user-1');
    expect(data).toBe('abc123');
    expect(supabase.from).toHaveBeenCalledWith('users');
    expect(chain.select).toHaveBeenCalledWith('pin_hash');
    expect(chain.eq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('getPinHash — returns null when no row found', async () => {
    chain.maybeSingle.mockResolvedValue({ data: null, error: null });
    const { data } = await getPinHash('user-1');
    expect(data).toBeNull();
  });

  it('getPinHash — returns null on error (graceful)', async () => {
    chain.maybeSingle.mockResolvedValue({ data: null, error: { message: 'network' } });
    const { data, error } = await getPinHash('user-1');
    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });

  // ── savePinHash ───────────────────────────────────────────────────────────

  it('savePinHash — calls update with the given hash', async () => {
    const spy = vi.fn().mockResolvedValue({ error: null });
    chain.update = vi.fn(() => ({ eq: spy }));
    await savePinHash('user-1', 'deadbeef');
    expect(chain.update).toHaveBeenCalledWith({ pin_hash: 'deadbeef' });
  });

  it('savePinHash — returns { error: null } on success', async () => {
    chain.then = (resolve) => resolve({ error: null });
    const { error } = await savePinHash('user-1', 'abc');
    expect(error).toBeNull();
  });

  // ── clearPinHash ──────────────────────────────────────────────────────────

  it('clearPinHash — calls update with pin_hash: null', async () => {
    const spy = vi.fn().mockResolvedValue({ error: null });
    chain.update = vi.fn(() => ({ eq: spy }));
    await clearPinHash('user-1');
    expect(chain.update).toHaveBeenCalledWith({ pin_hash: null });
  });

  it('clearPinHash — returns { error: null } on success', async () => {
    chain.then = (resolve) => resolve({ error: null });
    const { error } = await clearPinHash('user-1');
    expect(error).toBeNull();
  });
});
