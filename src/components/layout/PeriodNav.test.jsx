/**
 * components/layout/PeriodNav.test.jsx
 *
 * The shared period nav + its baked-in history-gate affordance. PeriodNav only
 * knows `historyLocked` (the view computes it from plan/cycles); these tests
 * cover the rendering contract: nav basics + the 3-case affordance matrix.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PeriodNav } from './PeriodNav';

const base = {
  periodLabel: 'May 2026',
  isOldest: false,
  isLatest: false,
  onPrev: () => {},
  onNext: () => {},
  labelTestId: 'test-period-label',
};

describe('PeriodNav', () => {
  it('renders the period label under the given labelTestId', () => {
    render(<PeriodNav {...base} />);
    expect(screen.getByTestId('test-period-label').textContent).toBe('May 2026');
  });

  it('isLatest disables Next; otherwise Next fires onNext', () => {
    const onNext = vi.fn();
    const { rerender } = render(<PeriodNav {...base} onNext={onNext} isLatest />);
    expect(screen.getByLabelText('Next period').disabled).toBe(true);

    rerender(<PeriodNav {...base} onNext={onNext} isLatest={false} />);
    fireEvent.click(screen.getByLabelText('Next period'));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  // ── History gate (D6/D8) — 3-case affordance matrix ──

  it('not locked, not oldest: prev is enabled, fires onPrev, no affordance', () => {
    const onPrev = vi.fn();
    render(<PeriodNav {...base} onPrev={onPrev} isOldest={false} historyLocked={false} />);
    expect(screen.queryByTestId('upgrade-history-affordance')).toBeNull();
    const prev = screen.getByLabelText('Previous period');
    expect(prev.disabled).toBe(false);
    fireEvent.click(prev);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('not locked, oldest: prev is plainly disabled, no affordance, no modal', () => {
    render(<PeriodNav {...base} isOldest historyLocked={false} />);
    expect(screen.queryByTestId('upgrade-history-affordance')).toBeNull();
    expect(screen.getByLabelText('Previous period').disabled).toBe(true);
    expect(screen.queryByText(/history limit/)).toBeNull();
  });

  it('locked: prev is a tappable affordance that opens the HISTORY_CAP_BODY modal', () => {
    const onPrev = vi.fn();
    render(<PeriodNav {...base} onPrev={onPrev} isOldest historyLocked />);
    const affordance = screen.getByTestId('upgrade-history-affordance');
    expect(affordance.disabled).toBe(false);                 // tappable despite isOldest
    expect(screen.queryByText(/history limit/)).toBeNull();   // modal closed initially
    fireEvent.click(affordance);
    expect(onPrev).not.toHaveBeenCalled();                    // does NOT navigate
    expect(screen.getByText(/history limit/)).toBeTruthy();   // opens the upgrade modal
  });
});
