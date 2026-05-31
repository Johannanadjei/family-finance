/**
 * views/payday/CopyIncomeSheet.test.jsx
 *
 * Multi-select rollforward sheet: opens all-checked, count tracks de-selection,
 * copy calls back with the selected ids, cancel writes nothing.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CopyIncomeSheet }           from './CopyIncomeSheet';
import { mockFmt }                   from '../../test-utils/fixtures';

const SOURCES = [
  { id: 'inc-1', label: 'Adjei Salary', icon: '💰', expected_amount: 30000, currency: 'GHS', pay_day_type: 'last_working_day', pay_day: 31, month: '2026-05' },
  { id: 'inc-2', label: 'Dita Salary',  icon: '💼', expected_amount: 15000, currency: 'GHS', pay_day_type: 'fixed_date',       pay_day: 25, month: '2026-05' },
];

const base = {
  isOpen:         true,
  onClose:        () => {},
  lastMonthLabel: 'May 2026',
  sources:        SOURCES,
  fmt:            mockFmt,
  onCopy:         () => {},
};

describe('CopyIncomeSheet', () => {
  it('renders nothing when closed', () => {
    render(<CopyIncomeSheet {...base} isOpen={false} />);
    expect(screen.queryByTestId('copy-income-sheet')).toBeNull();
  });

  it('opens with every source checked → copy button reflects the full count', () => {
    render(<CopyIncomeSheet {...base} />);
    expect(screen.getByText(/Copy from May 2026/)).toBeTruthy();
    expect(screen.getByTestId('copy-selected-btn').textContent).toBe('Copy 2 selected');
  });

  it('lists each source with its formatted amount', () => {
    render(<CopyIncomeSheet {...base} />);
    expect(screen.getByText('Adjei Salary')).toBeTruthy();
    expect(screen.getByText('Dita Salary')).toBeTruthy();
    expect(screen.getByText('GHS 30,000')).toBeTruthy();
  });

  it('updates the count live when a source is de-selected', () => {
    render(<CopyIncomeSheet {...base} />);
    fireEvent.click(screen.getByTestId('copy-source-inc-2'));
    expect(screen.getByTestId('copy-selected-btn').textContent).toBe('Copy 1 selected');
  });

  it('disables the copy button and prompts when nothing is selected', () => {
    render(<CopyIncomeSheet {...base} />);
    fireEvent.click(screen.getByTestId('copy-source-inc-1'));
    fireEvent.click(screen.getByTestId('copy-source-inc-2'));
    const btn = screen.getByTestId('copy-selected-btn');
    expect(btn.textContent).toBe('Select at least one');
    expect(btn.disabled).toBe(true);
  });

  it('calls onCopy with only the selected ids', () => {
    const onCopy = vi.fn();
    render(<CopyIncomeSheet {...base} onCopy={onCopy} />);
    fireEvent.click(screen.getByTestId('copy-source-inc-1')); // de-select inc-1
    fireEvent.click(screen.getByTestId('copy-selected-btn'));
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onCopy).toHaveBeenCalledWith(['inc-2']);
  });

  it('Cancel closes without calling onCopy', () => {
    const onClose = vi.fn();
    const onCopy  = vi.fn();
    render(<CopyIncomeSheet {...base} onClose={onClose} onCopy={onCopy} />);
    fireEvent.click(screen.getByTestId('copy-cancel-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCopy).not.toHaveBeenCalled();
  });

  it('shows "Copying…" while a copy is in flight', () => {
    render(<CopyIncomeSheet {...base} copying />);
    expect(screen.getByTestId('copy-selected-btn').textContent).toBe('Copying…');
  });
});
