import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';

vi.mock('../lib/auth', () => ({
  waitForSession: vi.fn().mockResolvedValue({ data: { session: {} }, error: null }),
  warnOnEmptyColdLoad: vi.fn(),
  sessionAgeMs: vi.fn(() => 0),
}));
vi.mock('../services/transactions.service', () => ({ getTransactionsByCycle: vi.fn() }));
vi.mock('../services/income.service',       () => ({ getIncomeSources: vi.fn() }));
vi.mock('../services/cycles.service',       () => ({ getCyclesForCentre: vi.fn() }));

import { useHubLoad } from './useHubLoad';
import { getTransactionsByCycle } from '../services/transactions.service';
import { getIncomeSources } from '../services/income.service';
import { getCyclesForCentre } from '../services/cycles.service';
import { waitForSession } from '../lib/auth';

const TXS    = [{ id: 'tx-1', type: 'expense', amount: 5 }];
const INCS   = [{ id: 'inc-1', label: 'Salary' }];
const CYCLES = [{ id: 'cyc-1', name: 'September' }];
const ERR    = { message: 'permission denied' };

// Collects every setState call so the loud/silent contract can be asserted on the
// SEQUENCE of writes, not just the end state.
const makeSetters = () => {
  const calls = { txs: [], incomes: [], cycles: [], loading: [], loaded: [], error: [], cyclesLoading: [] };
  return {
    calls,
    setTxs:           v => calls.txs.push(v),
    setAllIncomes:    v => calls.incomes.push(v),
    setCycles:        v => calls.cycles.push(v),
    setCyclesLoading: v => calls.cyclesLoading.push(v),
    setLoading:       v => calls.loading.push(v),
    setLoaded:        v => calls.loaded.push(v),
    setError:         v => calls.error.push(v),
  };
};

const mount = ({ centreId = 'centre-1', cycleId = 'cyc-1', reloadCategories = null, setters }) =>
  renderHook(() => {
    const viewedCycleIdRef = useRef(cycleId);
    viewedCycleIdRef.current = cycleId;
    const { setTxs, setAllIncomes, setCycles, setCyclesLoading, setLoading, setLoaded, setError } = setters;
    return useHubLoad({
      centreId, viewedCycleIdRef, reloadCategories,
      setTxs, setAllIncomes, setCycles, setCyclesLoading, setLoading, setLoaded, setError,
    });
  });

describe('useHubLoad', () => {
  let setters;

  beforeEach(() => {
    vi.clearAllMocks();
    waitForSession.mockResolvedValue({ data: { session: {} }, error: null });
    getTransactionsByCycle.mockResolvedValue({ data: TXS,    error: null });
    getIncomeSources.mockResolvedValue({       data: INCS,   error: null });
    getCyclesForCentre.mockResolvedValue({     data: CYCLES, error: null });
    setters = makeSetters();
  });

  describe('load — loud', () => {
    it('flips loading, clears the stale arrays, then writes the fetched rows', async () => {
      const { result } = mount({ setters });
      await act(async () => { await result.current.load('cyc-1'); });

      expect(setters.calls.loading).toEqual([true, false]);
      expect(setters.calls.txs).toEqual([[], TXS]);         // cleared, then filled
      expect(setters.calls.incomes).toEqual([[], INCS]);
      expect(setters.calls.loaded).toEqual([true]);
    });

    it('writes the empty result on failure — a hub switch must not keep stale rows', async () => {
      getTransactionsByCycle.mockResolvedValue({ data: null, error: ERR });
      const { result } = mount({ setters });
      await act(async () => { await result.current.load('cyc-1'); });

      expect(setters.calls.error).toContain(ERR.message);
      expect(setters.calls.txs).toEqual([[], []]);
      expect(setters.calls.loaded).toEqual([]);             // never flips on a failed fetch
    });
  });

  describe('load — silent', () => {
    it('never flips loading and never clears before fetching', async () => {
      const { result } = mount({ setters });
      await act(async () => { await result.current.load('cyc-1', { silent: true }); });

      expect(setters.calls.loading).toEqual([]);
      expect(setters.calls.txs).toEqual([TXS]);             // no leading []
      expect(setters.calls.incomes).toEqual([INCS]);
      expect(setters.calls.loaded).toEqual([true]);
    });

    it('leaves the on-screen data untouched when the fetch fails (§12 — no phantom empty)', async () => {
      getTransactionsByCycle.mockResolvedValue({ data: null, error: ERR });
      const { result } = mount({ setters });
      await act(async () => { await result.current.load('cyc-1', { silent: true }); });

      expect(setters.calls.txs).toEqual([]);                // nothing written at all
      expect(setters.calls.incomes).toEqual([]);
      expect(setters.calls.error).toContain(ERR.message);   // ...but the failure is visible
      expect(setters.calls.loaded).toEqual([]);
    });

    it('surfaces a session failure without blanking the view', async () => {
      waitForSession.mockResolvedValue({ data: null, error: new Error('Session not established') });
      const { result } = mount({ setters });
      await act(async () => { await result.current.load('cyc-1', { silent: true }); });

      expect(getTransactionsByCycle).not.toHaveBeenCalled();
      expect(setters.calls.txs).toEqual([]);
      expect(setters.calls.loading).toEqual([]);
      expect(setters.calls.error).toContain('Could not verify your session. Please retry.');
    });
  });

  describe('loadCycles', () => {
    it('flips cyclesLoading and writes the cycles on the loud path', async () => {
      const { result } = mount({ setters });
      await act(async () => { await result.current.loadCycles(); });

      expect(setters.calls.cyclesLoading).toEqual([true, false]);
      expect(setters.calls.cycles).toEqual([CYCLES]);
    });

    it('writes [] on a loud failure — hub A periods must not show under hub B', async () => {
      getCyclesForCentre.mockResolvedValue({ data: null, error: ERR });
      const { result } = mount({ setters });
      await act(async () => { await result.current.loadCycles(); });

      expect(setters.calls.cycles).toEqual([[]]);
    });

    it('does not flip cyclesLoading or wipe the cycles on a silent failure', async () => {
      getCyclesForCentre.mockResolvedValue({ data: null, error: ERR });
      const { result } = mount({ setters });
      await act(async () => { await result.current.loadCycles({ silent: true }); });

      expect(setters.calls.cyclesLoading).toEqual([]);
      expect(setters.calls.cycles).toEqual([]);
    });
  });

  describe('reloadHub', () => {
    it('re-fetches every cycle-aware slice — cycles, categories, transactions, income', async () => {
      const reloadCategories = vi.fn().mockResolvedValue(undefined);
      const { result } = mount({ setters, reloadCategories });
      await act(async () => { await result.current.reloadHub(); });

      expect(getCyclesForCentre).toHaveBeenCalledWith('centre-1');
      expect(reloadCategories).toHaveBeenCalledTimes(1);
      expect(getTransactionsByCycle).toHaveBeenCalledWith('centre-1', 'cyc-1');
      expect(getIncomeSources).toHaveBeenCalledWith('centre-1');
    });

    it('is silent end to end — no skeleton, no blank cycle gate', async () => {
      const { result } = mount({ setters });
      await act(async () => { await result.current.reloadHub(); });

      expect(setters.calls.loading).toEqual([]);
      expect(setters.calls.cyclesLoading).toEqual([]);
      expect(setters.calls.txs).toEqual([TXS]);
    });

    it('works with no categories reloader wired in', async () => {
      const { result } = mount({ setters, reloadCategories: null });
      await act(async () => { await result.current.reloadHub(); });
      expect(getTransactionsByCycle).toHaveBeenCalledTimes(1);
    });

    it('does nothing without an active hub', async () => {
      const { result } = mount({ setters, centreId: null });
      await act(async () => { await result.current.reloadHub(); });
      expect(getCyclesForCentre).not.toHaveBeenCalled();
      expect(getTransactionsByCycle).not.toHaveBeenCalled();
    });

    it('reads the viewed cycle at call time, not at creation time', async () => {
      const setters2 = makeSetters();
      const { result, rerender } = renderHook(
        ({ cid }) => {
          const viewedCycleIdRef = useRef(cid);
          viewedCycleIdRef.current = cid;
          return useHubLoad({
            centreId: 'centre-1', viewedCycleIdRef, reloadCategories: null,
            setTxs: setters2.setTxs, setAllIncomes: setters2.setAllIncomes,
            setCycles: setters2.setCycles, setCyclesLoading: setters2.setCyclesLoading,
            setLoading: setters2.setLoading, setLoaded: setters2.setLoaded, setError: setters2.setError,
          });
        },
        { initialProps: { cid: 'cyc-1' } },
      );
      const before = result.current.reloadHub;
      rerender({ cid: 'cyc-2' });
      expect(result.current.reloadHub).toBe(before);        // stable identity
      await act(async () => { await result.current.reloadHub(); });
      expect(getTransactionsByCycle).toHaveBeenCalledWith('centre-1', 'cyc-2');
    });
  });

  describe('lastLoadedAt', () => {
    it('stamps only on a clean fetch', async () => {
      const { result } = mount({ setters });
      expect(result.current.lastLoadedAt.current).toBe(0);

      await act(async () => { await result.current.load('cyc-1'); });
      const stamped = result.current.lastLoadedAt.current;
      expect(stamped).toBeGreaterThan(0);

      getTransactionsByCycle.mockResolvedValue({ data: null, error: ERR });
      await act(async () => { await result.current.load('cyc-1', { silent: true }); });
      expect(result.current.lastLoadedAt.current).toBe(stamped);   // unchanged
    });
  });

  describe('reload', () => {
    it('is loud, and targets the viewed cycle', async () => {
      const { result } = mount({ setters });
      await act(async () => { await result.current.reload(); });
      expect(getTransactionsByCycle).toHaveBeenCalledWith('centre-1', 'cyc-1');
      expect(setters.calls.loading).toEqual([true, false]);
    });
  });
});
