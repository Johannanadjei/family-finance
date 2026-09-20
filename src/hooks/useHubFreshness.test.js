import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHubFreshness, STALE_AFTER_MS, DEBOUNCE_MS } from './useHubFreshness';

// jsdom leaves document.visibilityState read-only; redefine it per case.
const setVisibility = (state) => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
};

const fireVisibility = (state) => {
  setVisibility(state);
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
};

const fireOnline = () => {
  act(() => { window.dispatchEvent(new Event('online')); });
};

const tick = async (ms) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
};

// lastLoadedAt is a ref of a ms timestamp; `agoMs` ago means that stale.
const stamp = (agoMs) => ({ current: Date.now() - agoMs });

describe('useHubFreshness', () => {
  let reloadHub;

  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
    reloadHub = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => { vi.useRealTimers(); });

  const mount = (overrides = {}) => renderHook(() => useHubFreshness({
    centreId:     'centre-1',
    reloadHub,
    lastLoadedAt: stamp(STALE_AFTER_MS + 1000),
    ...overrides,
  }));

  it('refetches on visibilitychange → visible once the data is stale', async () => {
    mount();
    fireVisibility('visible');
    expect(reloadHub).not.toHaveBeenCalled();   // debounced, not immediate
    await tick(DEBOUNCE_MS);
    expect(reloadHub).toHaveBeenCalledTimes(1);
  });

  it('does not refetch when the data is fresher than the staleness window', async () => {
    mount({ lastLoadedAt: stamp(STALE_AFTER_MS - 5000) });
    fireVisibility('visible');
    await tick(DEBOUNCE_MS * 4);
    expect(reloadHub).not.toHaveBeenCalled();
  });

  it('ignores a visibilitychange to hidden', async () => {
    mount();
    fireVisibility('hidden');
    await tick(DEBOUNCE_MS * 4);
    expect(reloadHub).not.toHaveBeenCalled();
  });

  it('coalesces tab-flicker into a single refetch', async () => {
    mount();
    fireVisibility('visible');
    await tick(DEBOUNCE_MS / 2);
    fireVisibility('hidden');
    fireVisibility('visible');
    await tick(DEBOUNCE_MS / 2);
    fireVisibility('visible');
    await tick(DEBOUNCE_MS);
    expect(reloadHub).toHaveBeenCalledTimes(1);
  });

  it('refetches when the network comes back', async () => {
    mount();
    fireOnline();
    await tick(DEBOUNCE_MS);
    expect(reloadHub).toHaveBeenCalledTimes(1);
  });

  it('drops a trigger that lands while a refetch is still running', async () => {
    let release;
    reloadHub.mockImplementation(() => new Promise(r => { release = r; }));
    const lastLoadedAt = stamp(STALE_AFTER_MS + 1000);
    mount({ lastLoadedAt });

    fireVisibility('visible');
    await tick(DEBOUNCE_MS);
    expect(reloadHub).toHaveBeenCalledTimes(1);

    fireVisibility('visible');           // second trigger, first still in flight
    await tick(DEBOUNCE_MS);
    expect(reloadHub).toHaveBeenCalledTimes(1);

    await act(async () => { release(); });
  });

  it('registers nothing until a hub resolves', async () => {
    mount({ centreId: null });
    fireVisibility('visible');
    fireOnline();
    await tick(DEBOUNCE_MS * 4);
    expect(reloadHub).not.toHaveBeenCalled();
  });

  it('registers nothing when disabled', async () => {
    mount({ enabled: false });
    fireVisibility('visible');
    fireOnline();
    await tick(DEBOUNCE_MS * 4);
    expect(reloadHub).not.toHaveBeenCalled();
  });

  it('removes its listeners and cancels a pending refetch on unmount', async () => {
    const { unmount } = mount();
    fireVisibility('visible');
    unmount();
    await tick(DEBOUNCE_MS * 4);
    expect(reloadHub).not.toHaveBeenCalled();

    fireVisibility('visible');
    fireOnline();
    await tick(DEBOUNCE_MS * 4);
    expect(reloadHub).not.toHaveBeenCalled();
  });

  it('calls the latest reloadHub, not the one captured at mount', async () => {
    const later = vi.fn().mockResolvedValue(undefined);
    const lastLoadedAt = stamp(STALE_AFTER_MS + 1000);
    const { rerender } = renderHook(
      ({ fn }) => useHubFreshness({ centreId: 'centre-1', reloadHub: fn, lastLoadedAt }),
      { initialProps: { fn: reloadHub } },
    );
    rerender({ fn: later });
    fireVisibility('visible');
    await tick(DEBOUNCE_MS);
    expect(reloadHub).not.toHaveBeenCalled();
    expect(later).toHaveBeenCalledTimes(1);
  });
});
