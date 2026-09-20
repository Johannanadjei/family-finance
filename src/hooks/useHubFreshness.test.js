import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// The realtime channel is mocked at the SERVICE boundary (CLAUDE.md §8) — the
// hook must never know it is talking to Supabase.
const { subscribeToHubActivity, channel } = vi.hoisted(() => {
  const channel = { handler: null, unsubscribe: vi.fn(), subscribeCalls: 0 };
  return {
    channel,
    subscribeToHubActivity: vi.fn((centreId, onActivity) => {
      channel.handler = onActivity;
      channel.subscribeCalls += 1;
      return channel.unsubscribe;
    }),
  };
});
vi.mock('../services/realtime.service', () => ({ subscribeToHubActivity }));

import { useHubFreshness, STALE_AFTER_MS, DEBOUNCE_MS, REALTIME_DEBOUNCE_MS } from './useHubFreshness';

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

// ── Realtime ─────────────────────────────────────────────────────────────────
describe('useHubFreshness — realtime', () => {
  let reloadHub;

  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
    reloadHub = vi.fn().mockResolvedValue(undefined);
    subscribeToHubActivity.mockClear();
    channel.unsubscribe.mockClear();
    channel.handler = null;
    channel.subscribeCalls = 0;
  });
  afterEach(() => { vi.useRealTimers(); });

  // Fresh data on purpose: realtime must refetch anyway.
  const mountRt = (overrides = {}) => renderHook(
    (props) => useHubFreshness({
      centreId: 'centre-1', reloadHub, lastLoadedAt: stamp(0), realtime: true,
      ...overrides, ...props,
    }),
    { initialProps: {} },
  );

  const emit = () => act(() => { channel.handler?.(); });

  it('subscribes to the active hub', () => {
    mountRt();
    expect(subscribeToHubActivity).toHaveBeenCalledTimes(1);
    expect(subscribeToHubActivity.mock.calls[0][0]).toBe('centre-1');
  });

  it('does not subscribe unless realtime is opted into', () => {
    mountRt({ realtime: false });
    expect(subscribeToHubActivity).not.toHaveBeenCalled();
  });

  it('does not subscribe without a hub, or when disabled', () => {
    mountRt({ centreId: null });
    mountRt({ enabled: false });
    expect(subscribeToHubActivity).not.toHaveBeenCalled();
  });

  it('refetches on a change event, after the realtime debounce', async () => {
    mountRt();
    emit();
    expect(reloadHub).not.toHaveBeenCalled();
    await tick(REALTIME_DEBOUNCE_MS);
    expect(reloadHub).toHaveBeenCalledTimes(1);
  });

  it('refetches even when the data is fresh — an event IS the change', async () => {
    mountRt({ lastLoadedAt: stamp(0) });
    emit();
    await tick(REALTIME_DEBOUNCE_MS);
    expect(reloadHub).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst of events into one refetch', async () => {
    mountRt();
    emit(); emit(); emit();
    await tick(REALTIME_DEBOUNCE_MS / 2);
    emit();
    await tick(REALTIME_DEBOUNCE_MS);
    expect(reloadHub).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes and re-subscribes on a hub switch', () => {
    const { rerender } = renderHook(
      ({ cid }) => useHubFreshness({ centreId: cid, reloadHub, lastLoadedAt: stamp(0), realtime: true }),
      { initialProps: { cid: 'centre-1' } },
    );
    expect(channel.subscribeCalls).toBe(1);

    rerender({ cid: 'centre-2' });
    expect(channel.unsubscribe).toHaveBeenCalledTimes(1);
    expect(channel.subscribeCalls).toBe(2);
    expect(subscribeToHubActivity.mock.calls[1][0]).toBe('centre-2');
  });

  it('unsubscribes on unmount, and a late event cannot refetch', async () => {
    const { unmount } = mountRt();
    const fire = channel.handler;
    unmount();
    expect(channel.unsubscribe).toHaveBeenCalledTimes(1);

    act(() => { fire?.(); });
    await tick(REALTIME_DEBOUNCE_MS * 4);
    expect(reloadHub).not.toHaveBeenCalled();
  });

  it('does not re-subscribe on an unrelated re-render', () => {
    const { rerender } = mountRt();
    rerender({});
    rerender({});
    expect(channel.subscribeCalls).toBe(1);
    expect(channel.unsubscribe).not.toHaveBeenCalled();
  });

  it('drops an event that lands while a refetch is running', async () => {
    let release;
    reloadHub.mockImplementation(() => new Promise(r => { release = r; }));
    mountRt();

    emit();
    await tick(REALTIME_DEBOUNCE_MS);
    expect(reloadHub).toHaveBeenCalledTimes(1);

    emit();
    await tick(REALTIME_DEBOUNCE_MS);
    expect(reloadHub).toHaveBeenCalledTimes(1);

    await act(async () => { release(); });
  });

  it('survives a rejecting refetch without leaving the guard stuck', async () => {
    reloadHub.mockRejectedValue(new Error('network'));
    mountRt();
    emit();
    await tick(REALTIME_DEBOUNCE_MS);
    expect(reloadHub).toHaveBeenCalledTimes(1);

    reloadHub.mockResolvedValue(undefined);
    emit();
    await tick(REALTIME_DEBOUNCE_MS);
    expect(reloadHub).toHaveBeenCalledTimes(2);   // guard released, not latched
  });
});
