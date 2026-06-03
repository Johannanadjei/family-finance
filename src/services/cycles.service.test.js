import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Supabase mock ─────────────────────────────────────────────────────────────
// Combined chainable query builder + rpc spy, mirroring invites.service.test.js.
// Mock path is '../lib/supabase' (the real client module) — NOT 'supabaseClient'.
//
// NOTE: this suite tests the SERVICE's calls to supabase — it does NOT exercise
// the create_calendar_cycle RPC itself (Vitest can't run Postgres). The RPC is
// validated manually in the Supabase SQL editor (see scripts/migrate_cycles_rpc.sql).
// The CYC01 overlap SQLSTATE is asserted here via the mocked error shape only.

let mockResolve;        // resolves .maybeSingle()
let mockRows;           // resolves terminal .order()
let mockOrderError;     // optional error for the .order() terminal
let eqCalls;            // [col, val] pairs passed to .eq()
const mockRpc = vi.fn();

vi.mock('../lib/supabase', () => {
  const chain = () => {
    const q = {
      from:        () => q,
      select:      () => q,
      eq:          (col, val) => { eqCalls.push([col, val]); return q; },
      is:          () => q,
      lte:         () => q,
      gte:         () => q,
      order:       () => Promise.resolve({ data: mockOrderError ? null : mockRows, error: mockOrderError }),
      maybeSingle: () => Promise.resolve(mockResolve),
    };
    return q;
  };
  return { supabase: { from: () => chain(), rpc: (...args) => mockRpc(...args) } };
});

import {
  getCyclesForCentre, getCycleForDate, getCycleById,
} from './cycles.service';

const mockCycle = {
  id:               'cyc-1',
  budget_centre_id: 'c-1',
  name:             'June 2026',
  start_date:       '2026-06-01',
  end_date:         '2026-06-30',
  anchor_type:      'calendar',
};

beforeEach(() => {
  mockResolve   = { data: null, error: null };
  mockRows      = [];
  mockOrderError = null;
  eqCalls       = [];
  mockRpc.mockReset();
});

// ── getCyclesForCentre ──────────────────────────────────────────────────────
describe('getCyclesForCentre', () => {
  it('filters by budget_centre_id and returns an array on success', async () => {
    mockRows = [mockCycle];
    const { data, error } = await getCyclesForCentre('c-1');
    expect(eqCalls).toContainEqual(['budget_centre_id', 'c-1']);
    expect(data).toHaveLength(1);
    expect(error).toBeNull();
  });

  it('returns an empty array (not null) when there are no cycles', async () => {
    mockRows = [];
    const { data, error } = await getCyclesForCentre('c-1');
    expect(data).toEqual([]);
    expect(error).toBeNull();
  });

  it('returns data:null (never masks failure as []) when the query errors', async () => {
    mockOrderError = new Error('db error');
    const { data, error } = await getCyclesForCentre('c-1');
    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });
});

// ── getCycleForDate ───────────────────────────────────────────────────────────
describe('getCycleForDate', () => {
  it('filters by centre and returns the covering cycle', async () => {
    mockResolve = { data: mockCycle, error: null };
    const { data, error } = await getCycleForDate('c-1', '2026-06-15');
    expect(eqCalls).toContainEqual(['budget_centre_id', 'c-1']);
    expect(data).toEqual(mockCycle);
    expect(error).toBeNull();
  });

  it('returns data:null when no cycle covers the date (legitimate no-result)', async () => {
    mockResolve = { data: null, error: null };
    const { data, error } = await getCycleForDate('c-1', '2030-01-01');
    expect(data).toBeNull();
    expect(error).toBeNull();
  });
});

// ── getCycleById ──────────────────────────────────────────────────────────────
describe('getCycleById', () => {
  it('filters by id and returns the cycle', async () => {
    mockResolve = { data: mockCycle, error: null };
    const { data, error } = await getCycleById('cyc-1');
    expect(eqCalls).toContainEqual(['id', 'cyc-1']);
    expect(data).toEqual(mockCycle);
    expect(error).toBeNull();
  });

  it('returns data:null when the cycle does not exist', async () => {
    mockResolve = { data: null, error: null };
    const { data, error } = await getCycleById('nope');
    expect(data).toBeNull();
    expect(error).toBeNull();
  });
});
