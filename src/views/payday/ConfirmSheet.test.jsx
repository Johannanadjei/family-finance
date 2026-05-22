/**
 * views/payday/ConfirmSheet.test.jsx
 * Written before ConfirmSheet.jsx — TDD.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ConfirmSheet }             from './ConfirmSheet';

const mockFmt = (n) => `GHS ${Math.round(n || 0).toLocaleString()}`;

const income = {
  id:              'inc-1',
  label:           'Adjei Salary',
  icon:            '💰',
  expected_amount: 30000,
  currency:        'GHS',
};

const renderSheet = (props = {}) =>
  render(
    <ConfirmSheet
      income={income}
      isOpen={true}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
      loading={false}
      error={null}
      fmt={mockFmt}
      {...props}
    />
  );

describe('ConfirmSheet', () => {
  it('does not render when closed', () => {
    renderSheet({ isOpen: false });
    expect(screen.queryByTestId('confirm-amount-input')).toBeNull();
  });

  it('renders amount input pre-filled with expected amount', () => {
    renderSheet();
    expect(screen.getByTestId('confirm-amount-input').value).toBe('30000');
  });

  it('renders date input pre-filled with today', () => {
    renderSheet();
    const today = new Date().toISOString().split('T')[0];
    expect(screen.getByTestId('confirm-date-input').value).toBe(today);
  });

  it('shows income label in heading', () => {
    renderSheet();
    expect(screen.getByText(/Adjei Salary/)).toBeTruthy();
  });

  it('shows confirm button', () => {
    renderSheet();
    expect(screen.getByText('Confirm Receipt')).toBeTruthy();
  });

  it('calls onClose when cancel tapped', () => {
    const onClose = vi.fn();
    renderSheet({ onClose });
    screen.getByText('Cancel').click();
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onConfirm with sourceId, amount and date', async () => {
    const onConfirm = vi.fn();
    renderSheet({ onConfirm });
    await act(async () => { screen.getByText('Confirm Receipt').click(); });
    expect(onConfirm).toHaveBeenCalledWith('inc-1', 30000, expect.any(String));
  });

  it('allows confirming zero amount', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ error: null });
    renderSheet({ onConfirm });
    await act(async () => {
      fireEvent.change(screen.getByTestId('confirm-amount-input'), { target: { value: '0' } });
    });
    await act(async () => { screen.getByText('Confirm Receipt').click(); });
    expect(onConfirm).toHaveBeenCalledWith('inc-1', 0, expect.any(String));
  });

  it('shows loading state on confirm button', () => {
    renderSheet({ loading: true });
    expect(screen.getByText('Confirming...')).toBeTruthy();
  });

  it('shows error when error prop is set', () => {
    renderSheet({ error: 'Something went wrong' });
    expect(screen.getByText(/Something went wrong/)).toBeTruthy();
  });

  it('disables confirm button when loading', () => {
    renderSheet({ loading: true });
    expect(screen.getByText('Confirming...').closest('button').disabled).toBe(true);
  });
});
