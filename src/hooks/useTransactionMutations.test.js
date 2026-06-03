import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';

vi.mock('../services/transactions.service', () => ({
  addTransaction:         vi.fn(),
  updateTransaction:      vi.fn(),
  deleteTransaction:      vi.fn(),
  moveTransactionToCycle: vi.fn(),
}));

import { useTransactionMutations } from './useTransactionMutations';
import {
  addTransaction         as dbAdd,
  updateTransaction      as dbUpdate,
  deleteTransaction      as dbDelete,
  moveTransactionToCycle as dbMove,
} from '../services/transactions.service';

const TXS = [
  { id: 'tx-1', type: 'expense', amount: 200, category_name: 'Groceries', cycle_id: 'cyc-may', _optimistic: false },
  { id: 'tx-2', type: 'income',  amount: 500, category_name: 'Gift',      cycle_id: 'cyc-may', _optimistic: false },
];

// Harness: the hook takes txs + its setter from the owner (useFinance), so we wrap
// it in a tiny stateful hook to exercise the real optimistic/rollback transitions.
const harness = (initial = TXS) =>
  renderHook(() => {
    const [txs, setTxs] = useState(initial);
    const muts = useTransactionMutations({ centreId: 'c1', txs, setTxs });
    return { txs, ...muts };
  });

beforeEach(() => { vi.clearAllMocks(); });

describe('useTransactionMutations — moveTransaction', () => {
  it('optimistically removes the tx from the viewed slice', async () => {
    dbMove.mockResolvedValue({ data: { id: 'tx-1', cycle_id: 'cyc-jun' }, error: null });
    const { result } = harness();
    await act(async () => { await result.current.moveTransaction('tx-1', 'cyc-jun'); });
    expect(result.current.txs.find(t => t.id === 'tx-1')).toBeUndefined();
    expect(result.current.txs).toHaveLength(1);
  });

  it('calls the service with (txId, cycleId) and returns the moved row on success', async () => {
    dbMove.mockResolvedValue({ data: { id: 'tx-1', cycle_id: 'cyc-jun' }, error: null });
    const { result } = harness();
    let ret;
    await act(async () => { ret = await result.current.moveTransaction('tx-1', 'cyc-jun'); });
    expect(dbMove).toHaveBeenCalledWith('tx-1', 'cyc-jun');
    expect(ret.data.cycle_id).toBe('cyc-jun');
    expect(ret.error).toBeNull();
  });

  it('rolls back (restores the tx) when the service errors', async () => {
    dbMove.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const { result } = harness();
    let ret;
    await act(async () => { ret = await result.current.moveTransaction('tx-1', 'cyc-jun'); });
    expect(result.current.txs.find(t => t.id === 'tx-1')).toBeTruthy();   // restored
    expect(result.current.txs).toHaveLength(2);
    expect(ret.error).toEqual({ message: 'permission denied' });
  });

  it('returns an error without calling the service for an unknown id', async () => {
    const { result } = harness();
    let ret;
    await act(async () => { ret = await result.current.moveTransaction('nope', 'cyc-jun'); });
    expect(ret.error).toBeInstanceOf(Error);
    expect(dbMove).not.toHaveBeenCalled();
  });
});

describe('useTransactionMutations — add/update/delete (extracted, unchanged behaviour)', () => {
  it('addTransaction prepends an optimistic row then reconciles to the server row', async () => {
    dbAdd.mockResolvedValue({ data: { id: 'srv-9', amount: 50, category_name: 'Snacks' }, error: null });
    const { result } = harness();
    await act(async () => { await result.current.addTransaction({ amount: 50, category_name: 'Snacks' }); });
    expect(result.current.txs[0].id).toBe('srv-9');
    expect(result.current.txs[0]._optimistic).toBe(false);
  });

  it('addTransaction rolls back the optimistic row on error', async () => {
    dbAdd.mockResolvedValue({ data: null, error: { message: 'insert failed' } });
    const { result } = harness();
    await act(async () => { await result.current.addTransaction({ amount: 50, category_name: 'Snacks' }); });
    expect(result.current.txs).toHaveLength(2);   // optimistic row removed
  });

  it('updateTransaction applies updates optimistically and reconciles on success', async () => {
    dbUpdate.mockResolvedValue({ data: { id: 'tx-1', amount: 999 }, error: null });
    const { result } = harness();
    await act(async () => { await result.current.updateTransaction('tx-1', { amount: 999 }); });
    expect(result.current.txs.find(t => t.id === 'tx-1').amount).toBe(999);
  });

  it('deleteTransaction removes optimistically and rolls back on error', async () => {
    dbDelete.mockResolvedValue({ error: { message: 'delete failed' } });
    const { result } = harness();
    await act(async () => { await result.current.deleteTransaction('tx-1'); });
    expect(result.current.txs.find(t => t.id === 'tx-1')).toBeTruthy();   // restored
  });
});
