/**
 * views/payday/PaydayHeader.test.jsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PaydayHeader }              from './PaydayHeader';
import { mockFmt }                   from '../../test-utils/fixtures';

// PaydayHeader renders <PeriodNav>, which calls useNavigate for its /pricing upgrade CTA.
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }));

const base = {
  periodLabel: 'May 2026',
  isCurrent: true,
  isFuture: false,
  isLatest: true,    // today's cycle is normally the newest → Next disabled
  isOldest: false,
  totalReceived: 30000,
  totalPending: 15000,
  totalIncome: 0,
  fmt: mockFmt,
  onPrev: () => {},
  onNext: () => {},
};

describe('PaydayHeader', () => {
  it('shows the period label', () => {
    render(<PaydayHeader {...base} />);
    expect(screen.getByTestId('payday-period-label').textContent).toBe('May 2026');
  });

  it('current + latest: shows Received + Pending and disables Next', () => {
    render(<PaydayHeader {...base} />);
    expect(screen.getByTestId('payday-total-received').textContent).toBe('GHS 30,000');
    expect(screen.getByTestId('payday-total-pending').textContent).toBe('GHS 15,000');
    expect(screen.getByLabelText('Next period').disabled).toBe(true);
  });

  it('past period: shows tx-derived income as Received, no Pending, Next enabled', () => {
    render(<PaydayHeader {...base} isCurrent={false} isLatest={false} totalIncome={12000} />);
    expect(screen.getByTestId('payday-total-received').textContent).toBe('GHS 12,000');
    expect(screen.queryByTestId('payday-total-pending')).toBeNull();
    expect(screen.getByLabelText('Next period').disabled).toBe(false);
  });

  it('future period: hides the summary card entirely', () => {
    render(<PaydayHeader {...base} isCurrent={false} isFuture />);
    expect(screen.queryByTestId('payday-total-received')).toBeNull();
    expect(screen.queryByTestId('payday-total-pending')).toBeNull();
  });

  it('disables Prev on the oldest cycle', () => {
    render(<PaydayHeader {...base} isOldest />);
    expect(screen.getByLabelText('Previous period').disabled).toBe(true);
  });

  it('calls onPrev / onNext when the arrows are clicked', () => {
    const onPrev = vi.fn(), onNext = vi.fn();
    render(<PaydayHeader {...base} isLatest={false} isOldest={false} onPrev={onPrev} onNext={onNext} />);
    fireEvent.click(screen.getByLabelText('Previous period'));
    fireEvent.click(screen.getByLabelText('Next period'));
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
