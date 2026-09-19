/**
 * components/ui/UpdateToast.test.jsx
 *
 * The pwaUpdateReady → banner path (CLAUDE.md §13).
 * Path-independent by design: one mount in main.jsx serves both the owner app
 * and the guest portal, so there is nothing route-specific to cover here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act }                  from '@testing-library/react';
import { UpdateToast }                          from './UpdateToast';

const MESSAGE = 'A new version of Money B.O.S is ready';

let reload;

const fireUpdateReady = () =>
  act(() => { window.dispatchEvent(new CustomEvent('pwaUpdateReady')); });

beforeEach(() => {
  reload = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true, writable: true,
    value: { ...window.location, reload },
  });
});

describe('UpdateToast', () => {
  it('renders nothing until an update is ready', () => {
    const { container } = render(<UpdateToast />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the banner when pwaUpdateReady fires', () => {
    render(<UpdateToast />);
    fireUpdateReady();
    expect(screen.getByText(MESSAGE)).toBeTruthy();
    expect(screen.getByText('Reload')).toBeTruthy();
  });

  it('reloads when Reload is tapped', () => {
    render(<UpdateToast />);
    fireUpdateReady();
    act(() => { screen.getByText('Reload').click(); });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('hides on dismiss without reloading', () => {
    render(<UpdateToast />);
    fireUpdateReady();
    act(() => { screen.getByLabelText('Dismiss').click(); });
    expect(screen.queryByText(MESSAGE)).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it('persists — the user picks the moment, so it never auto-dismisses', async () => {
    vi.useFakeTimers();
    render(<UpdateToast />);
    fireUpdateReady();
    await act(async () => { vi.advanceTimersByTime(60000); });
    expect(screen.getByText(MESSAGE)).toBeTruthy();
    vi.useRealTimers();
  });

  it('removes its listener on unmount', () => {
    const { unmount } = render(<UpdateToast />);
    unmount();
    expect(() => fireUpdateReady()).not.toThrow();
    expect(screen.queryByText(MESSAGE)).toBeNull();
  });
});
