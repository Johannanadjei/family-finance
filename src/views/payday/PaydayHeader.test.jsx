/**
 * views/payday/PaydayHeader.test.jsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PaydayHeader }              from './PaydayHeader';
import { mockFmt }                   from '../../test-utils/fixtures';

const base = {
  monthLabel: 'May 2026',
  isCurrentMonth: true,
  isFutureMonth: false,
  totalReceived: 30000,
  totalPending: 15000,
  totalIncome: 0,
  fmt: mockFmt,
  onPrev: () => {},
  onNext: () => {},
};

describe('PaydayHeader', () => {
  it('shows the month label', () => {
    render(<PaydayHeader {...base} />);
    expect(screen.getByTestId('payday-month-label').textContent).toBe('May 2026');
  });

  it('current month: shows Received + Pending and disables Next', () => {
    render(<PaydayHeader {...base} />);
    expect(screen.getByTestId('payday-total-received').textContent).toBe('GHS 30,000');
    expect(screen.getByTestId('payday-total-pending').textContent).toBe('GHS 15,000');
    expect(screen.getByLabelText('Next month').disabled).toBe(true);
  });

  it('past month: shows tx-derived income as Received, no Pending, Next enabled', () => {
    render(<PaydayHeader {...base} isCurrentMonth={false} totalIncome={12000} />);
    expect(screen.getByTestId('payday-total-received').textContent).toBe('GHS 12,000');
    expect(screen.queryByTestId('payday-total-pending')).toBeNull();
    expect(screen.getByLabelText('Next month').disabled).toBe(false);
  });

  it('future month: hides the summary card entirely', () => {
    render(<PaydayHeader {...base} isCurrentMonth={false} isFutureMonth />);
    expect(screen.queryByTestId('payday-total-received')).toBeNull();
    expect(screen.queryByTestId('payday-total-pending')).toBeNull();
  });

  it('calls onPrev / onNext when the arrows are clicked', () => {
    const onPrev = vi.fn(), onNext = vi.fn();
    render(<PaydayHeader {...base} isCurrentMonth={false} onPrev={onPrev} onNext={onNext} />);
    fireEvent.click(screen.getByLabelText('Previous month'));
    fireEvent.click(screen.getByLabelText('Next month'));
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
