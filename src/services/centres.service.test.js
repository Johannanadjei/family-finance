/**
 * services/centres.service.test.js
 *
 * Focus: updateCentre's three-state contract after the .single() → .maybeSingle()
 * swap. An UPDATE can match zero rows when RLS blocks the write — .maybeSingle()
 * returns { data: null, error: null } (permission-denied-without-exception) instead
 * of the 406 .single() would raise.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockResult;   // resolved by the terminal .maybeSingle()
let usedSingle;   // true if .single() was called (should never happen for updateCentre)
let updateArg;    // payload passed to .update() — asserts the column whitelist

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
  return { supabase: { from: () => make() } };
});

vi.mock('../lib/auth', () => ({ warnOnEmptyColdLoad: vi.fn() }));

import { updateCentre } from './centres.service';

beforeEach(() => {
  mockResult = { data: null, error: null };
  usedSingle = false;
  updateArg  = undefined;
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

// ── Cycle-anchor whitelist (Commit 14b) ────────────────────────────────────────
// createCentre persists the same fields via the identical cleanAnchor() helper.
describe('updateCentre — cycle-anchor whitelist', () => {
  it('persists fixed_day with its anchor_day', async () => {
    mockResult = { data: { id: 'c-1' }, error: null };
    await updateCentre('c-1', { cycle_anchor_type: 'fixed_day', cycle_anchor_day: 25 });
    expect(updateArg).toEqual({ cycle_anchor_type: 'fixed_day', cycle_anchor_day: 25 });
  });

  it('nulls anchor_day for non-fixed_day anchors', async () => {
    mockResult = { data: { id: 'c-1' }, error: null };
    await updateCentre('c-1', { cycle_anchor_type: 'last_working_day', cycle_anchor_day: 25 });
    expect(updateArg).toEqual({ cycle_anchor_type: 'last_working_day', cycle_anchor_day: null });
  });

  it('falls back to calendar for an unknown anchor type', async () => {
    mockResult = { data: { id: 'c-1' }, error: null };
    await updateCentre('c-1', { cycle_anchor_type: 'weekly', cycle_anchor_day: 9 });
    expect(updateArg).toEqual({ cycle_anchor_type: 'calendar', cycle_anchor_day: null });
  });

  it('clamps a fixed_day anchor_day into 1..31', async () => {
    mockResult = { data: { id: 'c-1' }, error: null };
    await updateCentre('c-1', { cycle_anchor_type: 'fixed_day', cycle_anchor_day: 99 });
    expect(updateArg.cycle_anchor_day).toBe(31);
  });

  it('does not touch anchor columns when no anchor field is supplied', async () => {
    mockResult = { data: { id: 'c-1' }, error: null };
    await updateCentre('c-1', { timezone: 'UTC' });
    expect(updateArg).toEqual({ timezone: 'UTC' });
  });
});
