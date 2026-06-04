/**
 * views/budget/BudgetHeader.test.jsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BudgetHeader }              from './BudgetHeader';
import { mockFmt }                   from '../../test-utils/fixtures';

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
});
