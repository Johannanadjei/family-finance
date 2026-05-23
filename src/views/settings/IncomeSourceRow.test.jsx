/**
 * views/settings/IncomeSourceRow.test.jsx
 * Written before IncomeSourceRow.jsx — TDD.
 */

import { describe, it, expect, vi }      from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { IncomeSourceRow }               from './IncomeSourceRow';
import { mockFmt, mockIncomes }          from '../../test-utils/fixtures';

// inc-1: { id: 'inc-1', label: 'Adjei Salary', expected_amount: 30000, pay_day: 31, pay_day_type: 'last_working_day' }
const source = mockIncomes[0];

const renderRow = (props = {}) => render(
  <IncomeSourceRow
    source={source}
    fmt={mockFmt}
    onDelete={vi.fn().mockResolvedValue({ error: null })}
    onUpdate={vi.fn().mockResolvedValue({ error: null })}
    isLast={false}
    {...props}
  />
);

describe('IncomeSourceRow', () => {
  it('renders income source label', () => {
    renderRow();
    expect(screen.getByTestId('income-label-inc-1').textContent).toBe('Adjei Salary');
  });

  it('renders formatted expected amount', () => {
    renderRow();
    expect(screen.getByTestId('income-amount-inc-1').textContent).toBe('GHS 30,000');
  });

  it('renders a delete button', () => {
    renderRow();
    expect(screen.getByTestId('income-delete-inc-1')).toBeTruthy();
  });

  it('renders an edit button', () => {
    renderRow();
    expect(screen.getByTestId('income-edit-inc-1')).toBeTruthy();
  });

  it('shows confirmation after delete button tapped', async () => {
    renderRow();
    await act(async () => { screen.getByTestId('income-delete-inc-1').click(); });
    expect(screen.getByText('Are you sure?')).toBeTruthy();
    expect(screen.getByTestId('income-delete-confirm-inc-1')).toBeTruthy();
    expect(screen.getByTestId('income-delete-cancel-inc-1')).toBeTruthy();
  });

  it('does not call onDelete on first tap — only shows confirmation', async () => {
    const onDelete = vi.fn().mockResolvedValue({ error: null });
    renderRow({ onDelete });
    await act(async () => { screen.getByTestId('income-delete-inc-1').click(); });
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('calls onDelete after confirm delete tapped', async () => {
    const onDelete = vi.fn().mockResolvedValue({ error: null });
    renderRow({ onDelete });
    await act(async () => { screen.getByTestId('income-delete-inc-1').click(); });
    await act(async () => { screen.getByTestId('income-delete-confirm-inc-1').click(); });
    expect(onDelete).toHaveBeenCalledWith('inc-1');
  });

  it('returns to normal state when cancel confirmation tapped', async () => {
    renderRow();
    await act(async () => { screen.getByTestId('income-delete-inc-1').click(); });
    await act(async () => { screen.getByTestId('income-delete-cancel-inc-1').click(); });
    expect(screen.queryByText('Are you sure?')).toBeNull();
    expect(screen.getByTestId('income-delete-inc-1')).toBeTruthy();
  });

  it('does not call onDelete when cancel confirmation tapped', async () => {
    const onDelete = vi.fn();
    renderRow({ onDelete });
    await act(async () => { screen.getByTestId('income-delete-inc-1').click(); });
    await act(async () => { screen.getByTestId('income-delete-cancel-inc-1').click(); });
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('shows edit form when edit button tapped', async () => {
    renderRow();
    await act(async () => { screen.getByTestId('income-edit-inc-1').click(); });
    expect(screen.getByTestId('income-edit-label-inc-1')).toBeTruthy();
  });

  it('pre-fills label input with source label', async () => {
    renderRow();
    await act(async () => { screen.getByTestId('income-edit-inc-1').click(); });
    expect(screen.getByTestId('income-edit-label-inc-1').value).toBe('Adjei Salary');
  });

  it('pre-fills amount input with source expected_amount', async () => {
    renderRow();
    await act(async () => { screen.getByTestId('income-edit-inc-1').click(); });
    expect(screen.getByTestId('income-edit-amount-inc-1').value).toBe('30000');
  });

  it('pre-fills pay_day_type select with source pay_day_type', async () => {
    renderRow();
    await act(async () => { screen.getByTestId('income-edit-inc-1').click(); });
    expect(screen.getByTestId('income-edit-pay-day-type-inc-1').value).toBe('last_working_day');
  });

  it('hides pay_day input when pay_day_type is last_working_day', async () => {
    renderRow();
    await act(async () => { screen.getByTestId('income-edit-inc-1').click(); });
    expect(screen.queryByTestId('income-edit-pay-day-inc-1')).toBeNull();
  });

  it('shows pay_day input when pay_day_type changed to fixed_date', async () => {
    renderRow();
    await act(async () => { screen.getByTestId('income-edit-inc-1').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('income-edit-pay-day-type-inc-1'), { target: { value: 'fixed_date' } });
    });
    expect(screen.getByTestId('income-edit-pay-day-inc-1')).toBeTruthy();
  });

  it('calls onUpdate with correct args on save', async () => {
    const onUpdate = vi.fn().mockResolvedValue({ error: null });
    renderRow({ onUpdate });
    await act(async () => { screen.getByTestId('income-edit-inc-1').click(); });
    await act(async () => { screen.getByLabelText('Save income source').click(); });
    expect(onUpdate).toHaveBeenCalledWith('inc-1', {
      label:           'Adjei Salary',
      expected_amount: 30000,
      pay_day_type:    'last_working_day',
      pay_day:         null,
    });
  });

  it('does not call onUpdate when cancel tapped', async () => {
    const onUpdate = vi.fn();
    renderRow({ onUpdate });
    await act(async () => { screen.getByTestId('income-edit-inc-1').click(); });
    await act(async () => { screen.getByLabelText('Cancel edit').click(); });
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('shows error and does not save when label is empty', async () => {
    const onUpdate = vi.fn();
    renderRow({ onUpdate });
    await act(async () => { screen.getByTestId('income-edit-inc-1').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('income-edit-label-inc-1'), { target: { value: '' } });
    });
    await act(async () => { screen.getByLabelText('Save income source').click(); });
    expect(screen.getByText('Please enter a name')).toBeTruthy();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('shows error when fixed_date pay day is out of range on save', async () => {
    renderRow();
    await act(async () => { screen.getByTestId('income-edit-inc-1').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('income-edit-pay-day-type-inc-1'), { target: { value: 'fixed_date' } });
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('income-edit-pay-day-inc-1'), { target: { value: '50' } });
    });
    await act(async () => { screen.getByLabelText('Save income source').click(); });
    expect(screen.getByText('Please enter a day between 1 and 31')).toBeTruthy();
  });
});
