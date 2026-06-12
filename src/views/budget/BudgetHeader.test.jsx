/**
 * views/budget/BudgetHeader.test.jsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BudgetHeader }              from './BudgetHeader';
import { mockFmt }                   from '../../test-utils/fixtures';

// BudgetHeader renders <PeriodNav>, which calls useNavigate for its /pricing upgrade CTA.
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }));

const base = {
  periodLabel: 'May 2026',
  fmt:         mockFmt,
  fixedTotal:  700,
  fixedSpent:  200,
  isLatest:    true,
  isOldest:    false,
  onPrev:      () => {},
  onNext:      () => {},
  onNewPeriod: () => {},
  canManage:   true,        // owner/full_access by default; standard-member tests flip this
  isFuture:    false,
  onReset:     () => {},
};

describe('BudgetHeader', () => {
  it('shows the period label and planned/spent totals', () => {
    render(<BudgetHeader {...base} />);
    expect(screen.getByTestId('budget-period-label').textContent).toBe('May 2026');
    expect(screen.getByTestId('budget-total-planned').textContent).toBe('GHS 700');
    expect(screen.getByTestId('budget-total-spent').textContent).toBe('GHS 200');
  });

  it('disables Next on the latest period and Prev on the oldest', () => {
    render(<BudgetHeader {...base} isLatest isOldest />);
    expect(screen.getByLabelText('Next period').disabled).toBe(true);
    expect(screen.getByLabelText('Previous period').disabled).toBe(true);
  });

  it('fires onPrev / onNext when the arrows are tapped (and enabled)', () => {
    const onPrev = vi.fn(), onNext = vi.fn();
    render(<BudgetHeader {...base} isLatest={false} isOldest={false} onPrev={onPrev} onNext={onNext} />);
    fireEvent.click(screen.getByLabelText('Previous period'));
    fireEvent.click(screen.getByLabelText('Next period'));
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('always shows the New budget period button and fires onNewPeriod', () => {
    const onNewPeriod = vi.fn();
    render(<BudgetHeader {...base} onNewPeriod={onNewPeriod} />);
    fireEvent.click(screen.getByTestId('new-period-btn'));
    expect(onNewPeriod).toHaveBeenCalledTimes(1);
  });

  // ── RBAC gate: standard members see both controls but disabled ────────────────
  it('disables the New budget period button when canManage is false', () => {
    const onNewPeriod = vi.fn();
    render(<BudgetHeader {...base} canManage={false} onNewPeriod={onNewPeriod} />);
    const btn = screen.getByTestId('new-period-btn');
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onNewPeriod).not.toHaveBeenCalled();
  });

  // ── Reset kebab (future periods only) ─────────────────────────────────────────
  it('hides the period-actions kebab for non-future periods', () => {
    render(<BudgetHeader {...base} isFuture={false} />);
    expect(screen.queryByTestId('period-actions-btn')).toBeNull();
  });

  it('shows the kebab for future periods; opening reveals Reset which fires onReset', () => {
    const onReset = vi.fn();
    render(<BudgetHeader {...base} isFuture onReset={onReset} />);
    fireEvent.click(screen.getByTestId('period-actions-btn'));
    const resetItem = screen.getByTestId('reset-period-btn');
    expect(resetItem).toBeTruthy();
    fireEvent.click(resetItem);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('disables the Reset item when canManage is false', () => {
    const onReset = vi.fn();
    render(<BudgetHeader {...base} isFuture canManage={false} onReset={onReset} />);
    fireEvent.click(screen.getByTestId('period-actions-btn'));
    const resetItem = screen.getByTestId('reset-period-btn');
    expect(resetItem.disabled).toBe(true);
    fireEvent.click(resetItem);
    expect(onReset).not.toHaveBeenCalled();
  });
});
