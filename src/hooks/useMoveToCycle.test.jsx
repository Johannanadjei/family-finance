import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMoveToCycle } from './useMoveToCycle';

const TXS = [{ id: 'tx-1', cycle_id: 'cyc-a' }];

// Far-future cycles are never "past" (getToday uses the real clock); cyc-past has ended.
const FUTURE = { start_date: '2999-01-01', end_date: '2999-12-31', deleted_at: null };
const CYCLES = [
  { id: 'cyc-a', name: 'A', ...FUTURE },
  { id: 'cyc-b', name: 'B', ...FUTURE },
  { id: 'cyc-past', name: 'Past', start_date: '2000-01-01', end_date: '2000-01-31', deleted_at: null },
];

let moveTransaction;
const harness = () => renderHook(() => useMoveToCycle({ txs: TXS, cycles: CYCLES, moveTransaction }));

beforeEach(() => { moveTransaction = vi.fn().mockResolvedValue({ data: {}, error: null }); });

describe('useMoveToCycle', () => {
  it('openMove opens the sheet for the chosen tx; closeMove clears it', () => {
    const { result } = harness();
    act(() => result.current.openMove('tx-1'));
    expect(result.current.moveTx.id).toBe('tx-1');
    act(() => result.current.closeMove());
    expect(result.current.moveTx).toBeNull();
  });

  it('moveDestinations excludes the tx\'s own cycle', () => {
    const { result } = harness();
    act(() => result.current.openMove('tx-1'));
    expect(result.current.moveDestinations.map(c => c.id)).not.toContain('cyc-a');
    expect(result.current.moveDestinations.map(c => c.id)).toContain('cyc-b');
  });

  it('confirming a move to a current/future period calls moveTransaction immediately', async () => {
    const { result } = harness();
    act(() => result.current.openMove('tx-1'));
    await act(async () => { result.current.confirmMove('cyc-b'); });
    await waitFor(() => expect(moveTransaction).toHaveBeenCalledWith('tx-1', 'cyc-b'));
  });

  it('holds a move to a PAST period behind the guard (no immediate call)', async () => {
    const { result } = harness();
    act(() => result.current.openMove('tx-1'));
    await act(async () => { result.current.confirmMove('cyc-past'); });
    // Guard intercepts — moveTransaction must NOT fire until the user confirms.
    expect(moveTransaction).not.toHaveBeenCalled();
  });

  it('surfaces a move error when the mutation fails', async () => {
    moveTransaction = vi.fn().mockResolvedValue({ data: null, error: { message: 'denied' } });
    const { result } = harness();
    act(() => result.current.openMove('tx-1'));
    await act(async () => { result.current.confirmMove('cyc-b'); });
    await waitFor(() => expect(result.current.moveError).toBeTruthy());
  });

  // History gate: DailyView/LogView pass `visibleCycles` (not the full list) as
  // `cycles`, so the move-to-period options only ever contain visible periods — a
  // free user can never move a transaction into a hidden cycle.
  it('offers only the cycles it is given (views pass visibleCycles → hidden periods absent)', () => {
    const HIDDEN = { id: 'cyc-hidden', name: 'Old Hidden', ...FUTURE };
    // Simulate the view passing the windowed list — HIDDEN is excluded by the caller.
    const { result } = renderHook(() => useMoveToCycle({ txs: TXS, cycles: CYCLES, moveTransaction }));
    act(() => result.current.openMove('tx-1'));
    const ids = result.current.moveDestinations.map(c => c.id);
    expect(ids).toEqual(['cyc-b', 'cyc-past']);   // exactly the given live cycles, minus the tx's own
    expect(ids).not.toContain(HIDDEN.id);          // a cycle never passed in can't be a destination
  });
});
