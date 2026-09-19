/**
 * lib/pwa.test.js
 *
 * initPwaUpdates — the service-worker update lifecycle (CLAUDE.md §13).
 *
 * LAUNCH_TS, _initialised and _handled are module state, so every scenario
 * re-imports the module through loadPwa(). Fake timers are installed BEFORE that
 * import so LAUNCH_TS lands on the fake clock and advanceTimersByTime moves it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn(() => vi.fn()) }));

const PRELOAD_KEY = 'bos:preload-reloaded';

let reload;
let swListeners;
let addedListeners;

const realWindowAdd   = window.addEventListener.bind(window);
const realDocumentAdd = document.addEventListener.bind(document);

/** Fresh module instance + the mocked registerSW that instance actually called. */
async function loadPwa() {
  vi.resetModules();
  const mod = await import('./pwa.js');
  const { registerSW } = await import('virtual:pwa-register');
  return { ...mod, registerSW };
}

const fireControllerChange = () => (swListeners.controllerchange || []).forEach(fn => fn());

const firePreloadError = () => {
  const e = new Event('vite:preloadError', { cancelable: true });
  window.dispatchEvent(e);
  return e;
};

beforeEach(() => {
  vi.useFakeTimers();

  reload = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true, writable: true,
    value: { ...window.location, reload },
  });

  swListeners = {};
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true, writable: true,
    value: { addEventListener: (t, fn) => { (swListeners[t] ||= []).push(fn); } },
  });

  // window/document outlive the module, so listeners from a previous test would
  // otherwise still fire and double-count reloads. Record them, strip them after.
  addedListeners = [];
  vi.spyOn(window, 'addEventListener').mockImplementation((t, fn, o) => {
    addedListeners.push([window, t, fn, o]); realWindowAdd(t, fn, o);
  });
  vi.spyOn(document, 'addEventListener').mockImplementation((t, fn, o) => {
    addedListeners.push([document, t, fn, o]); realDocumentAdd(t, fn, o);
  });
});

afterEach(() => {
  addedListeners.forEach(([target, t, fn, o]) => target.removeEventListener(t, fn, o));
  vi.restoreAllMocks();
  vi.useRealTimers();
  sessionStorage.clear();
});

describe('initPwaUpdates — registration', () => {
  it('passes onNeedReload so autoUpdate cannot hard-reload on its own', async () => {
    const { initPwaUpdates, registerSW } = await loadPwa();
    initPwaUpdates();
    expect(registerSW).toHaveBeenCalledTimes(1);
    const opts = registerSW.mock.calls[0][0];
    expect(opts.immediate).toBe(true);
    expect(typeof opts.onNeedReload).toBe('function');
  });

  it('is idempotent — a second call registers nothing further', async () => {
    const { initPwaUpdates, registerSW } = await loadPwa();
    initPwaUpdates();
    initPwaUpdates();
    initPwaUpdates();
    expect(registerSW).toHaveBeenCalledTimes(1);
  });

  it('returns a reload handle for callers', async () => {
    const { initPwaUpdates } = await loadPwa();
    initPwaUpdates().reload();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('checks for an update hourly and whenever the tab becomes visible', async () => {
    const { initPwaUpdates, registerSW } = await loadPwa();
    initPwaUpdates();
    const update = vi.fn(() => Promise.resolve());
    registerSW.mock.calls[0][0].onRegisteredSW('/sw.js', { update });

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(update).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('tolerates a missing registration in onRegisteredSW', async () => {
    const { initPwaUpdates, registerSW } = await loadPwa();
    initPwaUpdates();
    expect(() => registerSW.mock.calls[0][0].onRegisteredSW('/sw.js', undefined)).not.toThrow();
  });
});

describe('initPwaUpdates — update path', () => {
  it('reloads silently when a new SW takes control within the fresh-launch window', async () => {
    const { initPwaUpdates } = await loadPwa();
    initPwaUpdates();
    vi.advanceTimersByTime(14000);
    fireControllerChange();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('dispatches pwaUpdateReady and does NOT reload once the session is long-lived', async () => {
    const { initPwaUpdates } = await loadPwa();
    initPwaUpdates();
    const onUpdate = vi.fn();
    window.addEventListener('pwaUpdateReady', onUpdate);

    vi.advanceTimersByTime(20000);
    fireControllerChange();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('ignores a second controllerchange — one update decision per page load', async () => {
    const { initPwaUpdates } = await loadPwa();
    initPwaUpdates();
    const onUpdate = vi.fn();
    window.addEventListener('pwaUpdateReady', onUpdate);

    vi.advanceTimersByTime(20000);
    fireControllerChange();
    fireControllerChange();

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('latches onNeedReload and controllerchange together — exactly one dispatch', async () => {
    const { initPwaUpdates, registerSW } = await loadPwa();
    initPwaUpdates();
    const { onNeedReload } = registerSW.mock.calls[0][0];
    const onUpdate = vi.fn();
    window.addEventListener('pwaUpdateReady', onUpdate);

    vi.advanceTimersByTime(20000);
    onNeedReload();
    fireControllerChange();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('latches onNeedReload and controllerchange on a fresh launch — exactly one reload', async () => {
    const { initPwaUpdates, registerSW } = await loadPwa();
    initPwaUpdates();
    const { onNeedReload } = registerSW.mock.calls[0][0];

    onNeedReload();
    fireControllerChange();

    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('initPwaUpdates — preloadError recovery', () => {
  it('reloads once, and the sessionStorage guard blocks the second attempt', async () => {
    const { initPwaUpdates } = await loadPwa();
    initPwaUpdates();

    firePreloadError();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(PRELOAD_KEY)).toBe('1');

    firePreloadError();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('preventDefaults the event so Vite does not surface a raw ChunkLoadError', async () => {
    const { initPwaUpdates } = await loadPwa();
    initPwaUpdates();
    expect(firePreloadError().defaultPrevented).toBe(true);
  });

  it('does not reload when the guard is already set from an earlier attempt', async () => {
    sessionStorage.setItem(PRELOAD_KEY, '1');
    const { initPwaUpdates } = await loadPwa();
    initPwaUpdates();
    firePreloadError();
    expect(reload).not.toHaveBeenCalled();
  });

  it('clears the guard 5s after a successful load so the next deploy can recover', async () => {
    sessionStorage.setItem(PRELOAD_KEY, '1');
    const { initPwaUpdates } = await loadPwa();
    initPwaUpdates();

    expect(sessionStorage.getItem(PRELOAD_KEY)).toBe('1');
    vi.advanceTimersByTime(5000);
    expect(sessionStorage.getItem(PRELOAD_KEY)).toBeNull();
  });
});
