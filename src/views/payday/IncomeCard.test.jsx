/**
 * views/payday/IncomeCard.test.jsx
 * Written before IncomeCard.jsx — TDD.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { IncomeCard }               from './IncomeCard';

const mockFmt = (n) => `GHS ${Math.round(n || 0).toLocaleString()}`;

const pendingIncome = {
  id:              'inc-1',
  label:           'Adjei Salary',
  icon:            '💰',
  expected_amount: 30000,
  received:        false,
  received_amount: 0,
  pay_day:         31,
  pay_day_type:    'last_working_day',
  currency:        'GHS',
};

const receivedIncome = {
  ...pendingIncome,
  received:        true,
  received_amount: 29500,
  actual_pay_date: '2026-05-30',
};

const flexibleIncome = {
  ...pendingIncome,
  id:           'inc-2',
  label:        'Freelance',
  pay_day:      null,
  pay_day_type: 'flexible',
};

const renderCard = (props = {}) =>
  render(
    <IncomeCard
      income={pendingIncome}
      fmt={mockFmt}
      onConfirm={vi.fn()}
      onMarkPending={vi.fn()}
      disabled={false}
      {...props}
    />
  );

describe('IncomeCard', () => {
  it('shows income label', () => {
    renderCard();
    expect(screen.getByText('Adjei Salary')).toBeTruthy();
  });

  it('shows expected amount', () => {
    renderCard();
    expect(screen.getByTestId('income-expected-inc-1').textContent).toBe('GHS 30,000');
  });

  it('shows confirm received button when pending', () => {
    renderCard();
    expect(screen.getByText('Confirm Received')).toBeTruthy();
  });

  it('does not show mark pending button when pending', () => {
    renderCard();
    expect(screen.queryByText('Mark as Pending')).toBeNull();
  });

  it('shows received amount when received', () => {
    renderCard({ income: receivedIncome });
    expect(screen.getByTestId('income-received-inc-1').textContent).toBe('GHS 29,500');
  });

  it('shows mark as pending button when received', () => {
    renderCard({ income: receivedIncome });
    expect(screen.getByText('Mark as Pending')).toBeTruthy();
  });

  it('does not show confirm button when received', () => {
    renderCard({ income: receivedIncome });
    expect(screen.queryByText('Confirm Received')).toBeNull();
  });

  it('shows flexible label for flexible income', () => {
    renderCard({ income: flexibleIncome });
    expect(screen.getAllByText(/Flexible/).length).toBeGreaterThan(0);
  });

  it('calls onConfirm with income when confirm tapped', () => {
    const onConfirm = vi.fn();
    renderCard({ onConfirm });
    screen.getByText('Confirm Received').click();
    expect(onConfirm).toHaveBeenCalledWith(pendingIncome);
  });

  it('calls onMarkPending with sourceId when mark pending tapped', () => {
    const onMarkPending = vi.fn();
    renderCard({ income: receivedIncome, onMarkPending });
    screen.getByText('Mark as Pending').click();
    expect(onMarkPending).toHaveBeenCalledWith('inc-1');
  });

  it('disables buttons when disabled prop is true', () => {
    renderCard({ disabled: true });
    const btn = screen.getByText('Confirm Received');
    expect(btn.disabled).toBe(true);
  });
});
