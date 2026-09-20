import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { PullToRefresh, THRESHOLD } from './PullToRefresh';

// jsdom has no Touch/TouchEvent constructor, and React is not the listener here
// (PullToRefresh registers its own, so it can go non-passive). Dispatch plain
// Events carrying the `touches` the handlers read.
const touch = (el, type, clientY) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  e.touches = clientY == null ? [] : [{ clientY }];
  act(() => { el.dispatchEvent(e); });
};

// jsdom leaves document.scrollingElement undefined; the component falls back to
// documentElement, which is what the app's document scroller resolves to anyway.
const setScrollTop = (px) => { document.documentElement.scrollTop = px; };

// RESISTANCE is 0.5, so a finger travel of 2× is needed to reach a given pull.
const fingerFor = (pullPx) => pullPx * 2;

const drag = async (el, { from = 0, to, release = true }) => {
  touch(el, 'touchstart', from);
  touch(el, 'touchmove', to);
  if (release) await act(async () => { el.dispatchEvent(new Event('touchend', { bubbles: true })); });
};

describe('PullToRefresh', () => {
  let onRefresh;

  beforeEach(() => {
    onRefresh = vi.fn().mockResolvedValue(undefined);
    setScrollTop(0);
  });

  const mount = (props = {}) => {
    const { container } = render(
      <PullToRefresh onRefresh={onRefresh} {...props}>
        <p>dashboard content</p>
      </PullToRefresh>,
    );
    return container.firstChild;
  };

  it('renders its children', () => {
    mount();
    expect(screen.getByText('dashboard content')).toBeTruthy();
  });

  describe('threshold', () => {
    it('refreshes when released at or past the threshold', async () => {
      const host = mount();
      await drag(host, { to: fingerFor(THRESHOLD) });
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('refreshes on a long pull', async () => {
      const host = mount();
      await drag(host, { to: fingerFor(THRESHOLD + 60) });
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('does not refresh when released short of the threshold', async () => {
      const host = mount();
      await drag(host, { to: fingerFor(THRESHOLD - 10) });
      expect(onRefresh).not.toHaveBeenCalled();
    });
  });

  describe('arming', () => {
    it('does not trigger when the page is already scrolled', async () => {
      const host = mount();
      setScrollTop(300);
      await drag(host, { to: fingerFor(THRESHOLD + 40) });
      expect(onRefresh).not.toHaveBeenCalled();
    });

    it('disarms if the page scrolls away from the top mid-gesture', async () => {
      const host = mount();
      touch(host, 'touchstart', 0);
      setScrollTop(120);
      touch(host, 'touchmove', fingerFor(THRESHOLD + 40));
      await act(async () => { host.dispatchEvent(new Event('touchend', { bubbles: true })); });
      expect(onRefresh).not.toHaveBeenCalled();
    });

    it('ignores an upward drag', async () => {
      const host = mount();
      touch(host, 'touchstart', 400);
      touch(host, 'touchmove', 200);
      await act(async () => { host.dispatchEvent(new Event('touchend', { bubbles: true })); });
      expect(onRefresh).not.toHaveBeenCalled();
    });

    it('ignores a multi-touch gesture', async () => {
      const host = mount();
      const start = new Event('touchstart', { bubbles: true, cancelable: true });
      start.touches = [{ clientY: 0 }, { clientY: 10 }];
      act(() => { host.dispatchEvent(start); });
      touch(host, 'touchmove', fingerFor(THRESHOLD + 40));
      await act(async () => { host.dispatchEvent(new Event('touchend', { bubbles: true })); });
      expect(onRefresh).not.toHaveBeenCalled();
    });

    it('does nothing when disabled', async () => {
      const host = mount({ disabled: true });
      await drag(host, { to: fingerFor(THRESHOLD + 40) });
      expect(onRefresh).not.toHaveBeenCalled();
    });

    it('drops a second pull while a refresh is still running', async () => {
      let release;
      onRefresh.mockImplementation(() => new Promise(r => { release = r; }));
      const host = mount();

      await drag(host, { to: fingerFor(THRESHOLD + 10) });
      expect(onRefresh).toHaveBeenCalledTimes(1);

      await drag(host, { to: fingerFor(THRESHOLD + 10) });
      expect(onRefresh).toHaveBeenCalledTimes(1);

      await act(async () => { release(); });
    });
  });

  describe('indicator', () => {
    it('is absent until the pull starts', () => {
      mount();
      expect(screen.queryByTestId('ptr-indicator')).toBeNull();
    });

    it('appears during a pull and announces its state', () => {
      const host = mount();
      touch(host, 'touchstart', 0);
      touch(host, 'touchmove', fingerFor(20));
      expect(screen.getByTestId('ptr-indicator')).toBeTruthy();
      expect(screen.getByText('Pull to refresh')).toBeTruthy();

      touch(host, 'touchmove', fingerFor(THRESHOLD + 5));
      expect(screen.getByText('Release to refresh')).toBeTruthy();
    });

    it('announces the refresh, then clears once it settles', async () => {
      let release;
      onRefresh.mockImplementation(() => new Promise(r => { release = r; }));
      const host = mount();

      await drag(host, { to: fingerFor(THRESHOLD + 10) });
      expect(screen.getByText('Refreshing')).toBeTruthy();

      await act(async () => { release(); });
      expect(screen.queryByTestId('ptr-indicator')).toBeNull();
    });

    it('snaps back without refreshing after a short pull', async () => {
      const host = mount();
      await drag(host, { to: fingerFor(THRESHOLD - 20) });
      expect(screen.queryByTestId('ptr-indicator')).toBeNull();
      expect(onRefresh).not.toHaveBeenCalled();
    });

    it('clears on touchcancel', () => {
      const host = mount();
      touch(host, 'touchstart', 0);
      touch(host, 'touchmove', fingerFor(THRESHOLD + 10));
      expect(screen.getByTestId('ptr-indicator')).toBeTruthy();
      act(() => { host.dispatchEvent(new Event('touchcancel', { bubbles: true })); });
      expect(screen.queryByTestId('ptr-indicator')).toBeNull();
    });
  });

  it('survives an onRefresh that rejects', async () => {
    onRefresh.mockRejectedValue(new Error('network'));
    const host = mount();
    touch(host, 'touchstart', 0);
    touch(host, 'touchmove', fingerFor(THRESHOLD + 10));
    await act(async () => {
      host.dispatchEvent(new Event('touchend', { bubbles: true }));
      await Promise.resolve();
    });
    // The indicator must not be left spinning forever.
    await act(async () => {});
    expect(screen.queryByTestId('ptr-indicator')).toBeNull();
  });
});
