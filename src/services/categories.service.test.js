import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockRpcResult;   // { data, error } the mocked supabase.rpc resolves to
let rpcCalls;        // [{ name, args }] captured per rpc() call

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (name, args) => { rpcCalls.push({ name, args }); return Promise.resolve(mockRpcResult); },
  },
}));

import { addCategory, bulkAddCategories } from './categories.service';

beforeEach(() => {
  mockRpcResult = { data: null, error: null };
  rpcCalls      = [];
});

// Category-cap gate (CAT01): both mutations route through SECURITY DEFINER RPCs
// (create_category / create_categories_bulk) instead of a direct INSERT — the cap is
// enforced server-side. cycle_id is passed as the RPC's p_cycle_id (was an in-row
// field before). A CAT01 SQLSTATE maps to a friendly upgrade Error carrying .code.

describe('addCategory', () => {
  const base = { name: 'Groceries', budget_amount: 500, month: '2026-05', sort_order: 0 };

  it('calls create_category and returns the row when valid', async () => {
    mockRpcResult = { data: { id: 'cat-1', ...base }, error: null };
    const { data, error } = await addCategory('c-1', base);
    expect(error).toBeNull();
    expect(data.id).toBe('cat-1');
    expect(rpcCalls[0].name).toBe('create_category');
    expect(rpcCalls[0].args).toMatchObject({ p_centre_id: 'c-1', p_name: 'Groceries', p_month: '2026-05' });
  });

  it('returns a validation error (no RPC call) when month is missing', async () => {
    const { data, error } = await addCategory('c-1', { name: 'Groceries', budget_amount: 500 });
    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(rpcCalls).toHaveLength(0);
  });

  it('forwards cycle_id as p_cycle_id when supplied', async () => {
    mockRpcResult = { data: { id: 'cat-1' }, error: null };
    await addCategory('c-1', base, 'cyc-9');
    expect(rpcCalls[0].args.p_cycle_id).toBe('cyc-9');
  });

  it('passes p_cycle_id = null when no cycleId supplied', async () => {
    mockRpcResult = { data: { id: 'cat-1' }, error: null };
    await addCategory('c-1', base);
    expect(rpcCalls[0].args.p_cycle_id).toBeNull();
  });

  it('maps a CAT01 rejection to a friendly upgrade error carrying the code', async () => {
    mockRpcResult = { data: null, error: { code: 'CAT01', message: 'category limit reached: 10 of 10 for tier free' } };
    const { data, error } = await addCategory('c-1', base, 'cyc-9');
    expect(data).toBeNull();
    expect(error.code).toBe('CAT01');
    expect(error.message).toContain('Upgrade to Pro');
  });

  it('passes through a non-cap RPC error', async () => {
    mockRpcResult = { data: null, error: { code: '42501', message: 'permission denied' } };
    const { data, error } = await addCategory('c-1', base, 'cyc-9');
    expect(data).toBeNull();
    expect(error.code).toBe('42501');
  });
});

describe('bulkAddCategories', () => {
  const base = { name: 'Groceries', budget_amount: 500, month: '2026-05', sort_order: 0 };

  it('calls create_categories_bulk with the validated rows + p_cycle_id', async () => {
    mockRpcResult = { data: [{ id: 'n1' }, { id: 'n2' }], error: null };
    const { data, error } = await bulkAddCategories('c-1', [base, { ...base, name: 'Transport' }], 'cyc-9');
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(rpcCalls[0].name).toBe('create_categories_bulk');
    expect(rpcCalls[0].args.p_centre_id).toBe('c-1');
    expect(rpcCalls[0].args.p_cycle_id).toBe('cyc-9');
    expect(rpcCalls[0].args.p_categories).toHaveLength(2);
  });

  it('passes p_cycle_id = null when no cycleId supplied', async () => {
    mockRpcResult = { data: [], error: null };
    await bulkAddCategories('c-1', [base]);
    expect(rpcCalls[0].args.p_cycle_id).toBeNull();
  });

  it('returns a validation error (no RPC call) when a row has no month', async () => {
    const { data, error } = await bulkAddCategories('c-1', [{ name: 'Groceries', budget_amount: 500 }]);
    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(rpcCalls).toHaveLength(0);
  });

  it('maps a CAT01 rejection to a friendly upgrade error carrying the code', async () => {
    mockRpcResult = { data: null, error: { code: 'CAT01', message: 'category limit reached' } };
    const { data, error } = await bulkAddCategories('c-1', [base], 'cyc-9');
    expect(data).toBeNull();
    expect(error.code).toBe('CAT01');
    expect(error.message).toContain('Upgrade to Pro');
  });
});
