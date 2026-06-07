/**
 * services/centres.service.test.js
 *
 * Focus: updateCentre's three-state contract after the .single() → .maybeSingle()
 * swap. An UPDATE can match zero rows when RLS blocks the write — .maybeSingle()
 * returns { data: null, error: null } (permission-denied-without-exception) instead
 * of the 406 .single() would raise.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockResult;     // resolved by the terminal .maybeSingle()
let usedSingle;     // true if .single() was called (should never happen for updateCentre)
let updateArg;      // payload passed to .update() — asserts the column whitelist
let mockAuth;       // resolved by supabase.auth.getUser()
let mockRpcResult;  // resolved by supabase.rpc('create_hub', …)
let rpcCalled;      // true if .rpc() was invoked
let rpcArgs;        // args passed to .rpc() — asserts the param mapping

vi.mock('../lib/supabase', () => {
  const make = () => {
    const q = {
      from:        () => q,
      update:      (arg) => { updateArg = arg; return q; },
      select:      () => q,
      is:          () => q,
      eq:          () => q,
      single:      () => { usedSingle = true; return Promise.resolve(mockResult); },
      maybeSingle: () => Promise.resolve(mockResult),
    };
    return q;
  };
  return {
    supabase: {
      from: () => make(),
      auth: { getUser: () => Promise.resolve(mockAuth) },
      rpc:  (_name, args) => { rpcCalled = true; rpcArgs = args; return Promise.resolve(mockRpcResult); },
    },
  };
});

vi.mock('../lib/auth', () => ({ warnOnEmptyColdLoad: vi.fn() }));

import { updateCentre, createCentre } from './centres.service';

beforeEach(() => {
  mockResult    = { data: null, error: null };
  usedSingle    = false;
  updateArg     = undefined;
  mockAuth      = { data: { user: { id: 'u-1' } }, error: null };
  mockRpcResult = { data: null, error: null };
  rpcCalled     = false;
  rpcArgs       = undefined;
});

describe('updateCentre — three-state contract', () => {
  // timezone updates bypass validateString/validateCurrency, isolating the chain.
  it('returns the server row on a successful write (success-with-data)', async () => {
    mockResult = { data: { id: 'c-1', timezone: 'Africa/Accra' }, error: null };
    const { data, error } = await updateCentre('c-1', { timezone: 'Africa/Accra' });
    expect(data).toEqual({ id: 'c-1', timezone: 'Africa/Accra' });
    expect(error).toBeNull();
  });

  it('returns { data: null, error: null } when the write matches zero rows (RLS-blocked)', async () => {
    mockResult = { data: null, error: null };
    const { data, error } = await updateCentre('c-1', { timezone: 'Africa/Accra' });
    expect(data).toBeNull();
    expect(error).toBeNull();   // permission-denied-without-exception, NOT a 406
  });

  it('surfaces an explicit error truthfully (error-with-error)', async () => {
    mockResult = { data: null, error: { message: 'boom' } };
    const { data, error } = await updateCentre('c-1', { timezone: 'Africa/Accra' });
    expect(data).toBeNull();
    expect(error?.message).toBe('boom');
  });

  it('uses .maybeSingle() not .single() (a zero-row UPDATE must not 406)', async () => {
    await updateCentre('c-1', { timezone: 'Africa/Accra' });
    expect(usedSingle).toBe(false);
  });

  it('returns a validation error without hitting the DB on invalid input', async () => {
    const { data, error } = await updateCentre('c-1', { name: '' });
    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });
});

describe('createCentre — atomic RPC + hub-cap gate', () => {
  it('returns the created hub row on success', async () => {
    mockRpcResult = { data: { id: 'c-9', name: 'New Hub' }, error: null };
    const { data, error } = await createCentre({ name: 'New Hub', currency: 'GHS' });
    expect(error).toBeNull();
    expect(data).toEqual({ id: 'c-9', name: 'New Hub' });
    expect(rpcCalled).toBe(true);
    expect(rpcArgs.p_name).toBe('New Hub');
    expect(rpcArgs.p_currency).toBe('GHS');
  });

  it('maps a HUB01 cap rejection to the friendly upgrade message + preserves the code', async () => {
    mockRpcResult = { data: null, error: { code: 'HUB01', message: 'hub limit reached: 1 of 1 for tier free' } };
    const { data, error } = await createCentre({ name: 'Second Hub', currency: 'GHS' });
    expect(data).toBeNull();
    expect(error.code).toBe('HUB01');
    expect(error.message).toMatch(/reached your plan's hub limit/i);
    expect(error.message).toMatch(/Upgrade to Pro/i);
  });

  it('surfaces a non-cap RPC error truthfully', async () => {
    mockRpcResult = { data: null, error: { code: '23505', message: 'boom' } };
    const { data, error } = await createCentre({ name: 'X', currency: 'GHS' });
    expect(data).toBeNull();
    expect(error.message).toBe('boom');
    expect(error.code).not.toBe('HUB01');
  });

  it('returns a validation error WITHOUT calling the RPC on a blank name', async () => {
    const { data, error } = await createCentre({ name: '', currency: 'GHS' });
    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(rpcCalled).toBe(false);
  });

  it('returns Not authenticated without calling the RPC when there is no user', async () => {
    mockAuth = { data: { user: null }, error: null };
    const { data, error } = await createCentre({ name: 'X', currency: 'GHS' });
    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(rpcCalled).toBe(false);
  });
});
