/**
 * components/layout/PeriodNav.test.jsx
 *
 * The shared period nav + its baked-in history-gate affordance. PeriodNav only
 * knows `historyLocked` (the view computes it from plan/cycles); these tests
 * cover the rendering contract: nav basics + the 3-case affordance matrix.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PeriodNav } from './PeriodNav';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

// PeriodNav reads isOwner from BudgetCentreContext to decide whether the history-cap
// modal offers a pay CTA or the "ask your hub owner" line.
let mockIsOwner = true;
vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ isOwner: mockIsOwner }),
}));

// PeriodNav reads viewedCycle from FinanceContext to render the date range beneath
// the period name — the line that tells two same-named periods apart.
let mockViewedCycle = { id: 'c1', name: 'May 2026', start_date: '2026-05-01', end_date: '2026-05-31' };
vi.mock('../../context/FinanceContext', () => ({
  useFinanceContext: () => ({ viewedCycle: mockViewedCycle }),
}));

beforeEach(() => {
  mockNavigate.mockClear();
  mockIsOwner = true;
  mockViewedCycle = { id: 'c1', name: 'May 2026', start_date: '2026-05-01', end_date: '2026-05-31' };
});

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

  it('renders the viewed cycle date range beneath the label', () => {
    render(<PeriodNav {...base} />);
    expect(screen.getByTestId('period-range').textContent).toBe('1 May – 31 May 2026');
  });

  // The bug this shipped for: two adjacent periods can legally share a name, so the
  // name alone cannot tell a user which one they are looking at. The range can.
  it('distinguishes two same-named periods by their ranges', () => {
    mockViewedCycle = { id: 'a', name: 'September 2026', start_date: '2026-09-01', end_date: '2026-09-17' };
    const first = render(<PeriodNav {...base} periodLabel="September 2026" />);
    expect(screen.getByTestId('period-range').textContent).toBe('1 Sep – 17 Sep 2026');
    first.unmount();

    mockViewedCycle = { id: 'b', name: 'September 2026', start_date: '2026-09-18', end_date: '2026-10-18' };
    render(<PeriodNav {...base} periodLabel="September 2026" />);
    expect(screen.getByTestId('period-range').textContent).toBe('18 Sep – 18 Oct 2026');
  });

  it('omits the range when no cycle is viewed (legacy month fallback)', () => {
    mockViewedCycle = null;
    render(<PeriodNav {...base} />);
    expect(screen.queryByTestId('period-range')).toBeNull();
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
    expect(onPrev).not.toHaveBeenCalled();                    // does NOT page-navigate cycles
    expect(screen.getByText(/history limit/)).toBeTruthy();   // opens the upgrade modal
  });

  it('locked: the modal CTA routes to /pricing and dismisses the modal', () => {
    render(<PeriodNav {...base} isOldest historyLocked />);
    fireEvent.click(screen.getByTestId('upgrade-history-affordance'));
    fireEvent.click(screen.getByText('Upgrade to Pro'));      // modal's primary CTA
    expect(mockNavigate).toHaveBeenCalledWith('/pricing');
    expect(screen.queryByText(/history limit/)).toBeNull();   // modal closed
  });

  // The history cap belongs to the hub, so a non-owner is genuinely blocked by it and
  // must see why — but buying Pro on their own account would not widen this hub's
  // window by a single period.
  it('locked, non-owner: the affordance and the explanation stay; the pay CTA does not', () => {
    mockIsOwner = false;
    render(<PeriodNav {...base} isOldest historyLocked />);

    const affordance = screen.getByTestId('upgrade-history-affordance');
    expect(affordance.disabled).toBe(false);
    fireEvent.click(affordance);

    expect(screen.getByText(/history limit/)).toBeTruthy();    // cap message intact
    expect(screen.getByTestId('ask-owner-note')).toBeTruthy();
    expect(screen.queryByText('Upgrade to Pro')).toBeNull();

    fireEvent.click(screen.getByText('Got it'));
    expect(mockNavigate).not.toHaveBeenCalled();               // no route to checkout
  });
});
