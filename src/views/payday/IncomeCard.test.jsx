/**
 * views/payday/IncomeCard.test.jsx
 * Written before IncomeCard.jsx — TDD.
 */

import { describe, it, expect, vi }      from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { IncomeCard }                    from './IncomeCard';
import { mockFmt, mockIncomes }          from '../../test-utils/fixtures';

const pendingIncome = mockIncomes[1]; // Dita Salary, not received
const receivedIncome = mockIncomes[0]; // Adjei Salary, received

const renderCard = (props = {}) =>
  render(
    <IncomeCard
      income={pendingIncome}
      fmt={mockFmt}
      onConfirm={vi.fn()}
      onMarkPending={vi.fn()}
      onUpdateExpected={vi.fn().mockResolvedValue({ error: null })}
      disabled={false}
      {...props}
    />
  );

describe('IncomeCard', () => {
  it('shows income label', () => {
    renderCard();
    expect(screen.getByText('Dita Salary')).toBeTruthy();
  });

  it('shows expected amount', () => {
    renderCard();
    expect(screen.getByTestId('income-expected-inc-2').textContent).toBe('GHS 15,000');
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
    expect(screen.getByTestId('income-received-inc-1').textContent).toBe('GHS 30,000');
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
    const flexIncome = { ...pendingIncome, pay_day: null, pay_day_type: 'flexible' };
    renderCard({ income: flexIncome });
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
    expect(screen.getByText('Confirming…').disabled).toBe(true);
  });

  it('shows edit pencil button on expected amount', () => {
    renderCard();
    expect(screen.getByLabelText('Edit expected amount')).toBeTruthy();
  });

  it('shows inline input when edit pencil tapped', async () => {
    renderCard();
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    expect(screen.getByTestId('edit-expected-input-inc-2')).toBeTruthy();
  });

  it('calls onUpdateExpected with sourceId, amount and extras when saved', async () => {
    const onUpdateExpected = vi.fn().mockResolvedValue({ error: null });
    renderCard({ onUpdateExpected });
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    fireEvent.change(screen.getByTestId('edit-expected-input-inc-2'), { target: { value: '20000' } });
    await act(async () => { screen.getByLabelText('Save expected amount').click(); });
    expect(onUpdateExpected).toHaveBeenCalledWith('inc-2', 20000, { pay_day_type: 'fixed_date', pay_day: 25 });
  });

  it('allows saving zero as expected amount', async () => {
    const onUpdateExpected = vi.fn().mockResolvedValue({ error: null });
    renderCard({ onUpdateExpected });
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    fireEvent.change(screen.getByTestId('edit-expected-input-inc-2'), { target: { value: '0' } });
    await act(async () => { screen.getByLabelText('Save expected amount').click(); });
    expect(onUpdateExpected).toHaveBeenCalledWith('inc-2', 0, { pay_day_type: 'fixed_date', pay_day: 25 });
  });

  it('shows pay day type select when editing', async () => {
    renderCard();
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    expect(screen.getByTestId('edit-pay-day-type-inc-2')).toBeTruthy();
  });

  it('pre-fills pay day type select with income pay_day_type', async () => {
    renderCard();
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    expect(screen.getByTestId('edit-pay-day-type-inc-2').value).toBe('fixed_date');
  });

  it('shows pay day input when pay_day_type is fixed_date', async () => {
    renderCard();
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    expect(screen.getByTestId('edit-pay-day-inc-2')).toBeTruthy();
  });

  it('hides pay day input when pay_day_type changed to flexible', async () => {
    renderCard();
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('edit-pay-day-type-inc-2'), { target: { value: 'flexible' } });
    });
    expect(screen.queryByTestId('edit-pay-day-inc-2')).toBeNull();
  });

  it('pre-fills pay day input with income pay_day', async () => {
    renderCard();
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    expect(screen.getByTestId('edit-pay-day-inc-2').value).toBe('25');
  });
});
