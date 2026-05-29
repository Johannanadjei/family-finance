/**
 * hooks/useModalChrome.test.js
 *
 * Unit tests for the shared modal-chrome behaviour: body scroll-lock,
 * inert-on-root, back-button intercept, and the stacking coordinator.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useModalChrome } from './useModalChrome';

let root;

// A programmatic close / unmount-while-open registers a one-shot { once: true }
// popstate swallower (see useModalChrome cleanup) that only auto-removes once a
// popstate actually arrives. In a real browser history.back() reliably fires
// that popstate; jsdom NEVER fires popstate on back(), so swallowers from prior
// tests pile up on window and would silently eat a later test's popstate.
// stopImmediatePropagation means one popstate drains exactly one swallower, so
// drain in a loop: dispatch, and if a sentinel registered last still fires, the
// stack is clear. No modal is mounted at beforeEach time, so this only ever
// touches leftover swallowers.
function drainSwallowers() {
  act(() => {
    for (let i = 0; i < 100; i++) {
      let reached = false;
      const sentinel = () => { reached = true; };
      window.addEventListener('popstate', sentinel);
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.removeEventListener('popstate', sentinel);
      if (reached) break; // nothing stopped propagation → no swallowers left
    }
  });
}

beforeEach(() => {
  drainSwallowers();
  window.history.replaceState(null, ''); // clear dummy entries pushed on open

  root = document.createElement('div');
  root.id = 'app-shell';
  root.inert = false; // jsdom doesn't implement the inert IDL property; seed the default
  document.body.appendChild(root);
  document.body.style.overflow = '';
});

afterEach(() => {
  root.remove();
  document.body.style.overflow = '';
});

describe('useModalChrome', () => {
  it('locks body scroll and inerts the root when open', () => {
    renderHook(() => useModalChrome({ isOpen: true, onClose: vi.fn() }));
    expect(document.body.style.overflow).toBe('hidden');
    expect(root.inert).toBe(true);
  });

  it('does nothing while closed', () => {
    renderHook(() => useModalChrome({ isOpen: false, onClose: vi.fn() }));
    expect(document.body.style.overflow).toBe('');
    expect(root.inert).toBe(false);
  });

  it('restores scroll and removes inert on close', () => {
    const { rerender } = renderHook(
      ({ isOpen }) => useModalChrome({ isOpen, onClose: vi.fn() }),
      { initialProps: { isOpen: true } }
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender({ isOpen: false });
    expect(document.body.style.overflow).toBe('');
    expect(root.inert).toBe(false);
  });

  it('restores the prior overflow value, not a hardcoded empty string', () => {
    document.body.style.overflow = 'scroll';
    const { rerender } = renderHook(
      ({ isOpen }) => useModalChrome({ isOpen, onClose: vi.fn() }),
      { initialProps: { isOpen: true } }
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender({ isOpen: false });
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('calls onClose when the back button (popstate) fires', () => {
    const onClose = vi.fn();
    renderHook(() => useModalChrome({ isOpen: true, onClose }));
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('pops its own history entry on programmatic close without firing onClose again', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const onClose = vi.fn();
    const { rerender } = renderHook(
      ({ isOpen }) => useModalChrome({ isOpen, onClose }),
      { initialProps: { isOpen: true } }
    );
    rerender({ isOpen: false });
    expect(back).toHaveBeenCalledTimes(1);   // our dummy entry popped
    expect(onClose).not.toHaveBeenCalled();  // programmatic close must NOT re-fire onClose
    back.mockRestore();
  });

  it('keeps the lock until the last stacked modal closes (counter coordinator)', () => {
    const a = renderHook(
      ({ isOpen }) => useModalChrome({ isOpen, onClose: vi.fn() }),
      { initialProps: { isOpen: true } }
    );
    const b = renderHook(
      ({ isOpen }) => useModalChrome({ isOpen, onClose: vi.fn() }),
      { initialProps: { isOpen: true } }
    );
    expect(document.body.style.overflow).toBe('hidden');

    a.rerender({ isOpen: false }); // one of two closed
    expect(document.body.style.overflow).toBe('hidden'); // still locked
    expect(root.inert).toBe(true);

    b.rerender({ isOpen: false }); // last one closed
    expect(document.body.style.overflow).toBe('');
    expect(root.inert).toBe(false);
  });

  it('releases the lock when an open modal unmounts', () => {
    const { unmount } = renderHook(() => useModalChrome({ isOpen: true, onClose: vi.fn() }));
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
    expect(root.inert).toBe(false);
  });

  // Regression: the SidePanel → CreateHub hand-off. Closing one modal and
  // opening another in the SAME commit fires a synthetic popstate from the
  // first modal's programmatic back(). The one-shot swallower must consume it
  // so the incoming modal does NOT receive it as a user back-press and close
  // the instant it opens. (Previously the module-level selfPop flag was reset
  // by the incoming modal's setup before the popstate landed — the bug.)
  it('does not close the incoming modal when another closes in the same commit (hand-off)', () => {
    // Mock back() so jsdom doesn't also fire its own async popstate — we dispatch
    // the single synthetic popstate ourselves for a deterministic, isolated test.
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const panelClose  = vi.fn();
    const newHubClose = vi.fn();

    // SidePanel open; CreateHub closed.
    const panel = renderHook(
      ({ isOpen }) => useModalChrome({ isOpen, onClose: panelClose }),
      { initialProps: { isOpen: true } }
    );
    const newHub = renderHook(
      ({ isOpen }) => useModalChrome({ isOpen, onClose: newHubClose }),
      { initialProps: { isOpen: false } }
    );

    // The hand-off: SidePanel closes + CreateHub opens in one commit. React runs
    // all effect cleanups before all setups, so the panel's cleanup registers
    // the swallower (and calls back()) before the new hub's setup registers its
    // popstate listener.
    act(() => {
      panel.rerender({ isOpen: false });
      newHub.rerender({ isOpen: true });
    });
    expect(back).toHaveBeenCalledTimes(1); // panel's programmatic close popped its entry

    // The synthetic popstate the panel's back() would emit. Dispatched
    // synchronously; the swallower's stopImmediatePropagation must keep it from
    // reaching the new hub's onPop.
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });

    expect(newHubClose).not.toHaveBeenCalled();  // incoming modal must STAY OPEN
    expect(panelClose).not.toHaveBeenCalled();   // the swallowed pop must not re-close the panel either

    panel.unmount();
    newHub.unmount();
    back.mockRestore();
  });
});
