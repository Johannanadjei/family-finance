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

beforeEach(() => {
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
});
