/**
 * views/daily/TransactionRow.test.jsx
 * Written before TransactionRow.jsx — TDD.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { TransactionRow }           from './TransactionRow';
import { mockFmt, mockTxs }        from '../../test-utils/fixtures';

const expenseTx = mockTxs[0]; // Groceries, expense, 200
const incomeTx  = mockTxs[1]; // Adjei Salary, income, 30000

const renderRow = (props = {}) =>
  render(
    <TransactionRow
      tx={expenseTx}
      fmt={mockFmt}
      onDelete={vi.fn()}
      disabled={false}
      {...props}
    />
  );

describe('TransactionRow', () => {
  it('shows category name', () => {
    renderRow();
    expect(screen.getByText('Groceries')).toBeTruthy();
  });

  it('shows description when set', () => {
    renderRow();
    expect(screen.getByText('Weekly shop')).toBeTruthy();
  });

  it('shows logged by name', () => {
    renderRow();
    expect(screen.getByText(/Johannan/)).toBeTruthy();
  });

  it('shows expense amount with minus prefix', () => {
    renderRow();
    expect(screen.getByTestId('tx-amount-tx-1').textContent).toBe('-GHS 200');
  });

  it('shows income amount with plus prefix', () => {
    renderRow({ tx: incomeTx });
    expect(screen.getByTestId('tx-amount-tx-2').textContent).toBe('+GHS 30,000');
  });

  it('shows delete button', () => {
    renderRow();
    expect(screen.getByTestId('tx-delete-tx-1')).toBeTruthy();
  });

  it('calls onDelete with tx id when delete tapped', () => {
    const onDelete = vi.fn();
    renderRow({ onDelete });
    screen.getByTestId('tx-delete-tx-1').click();
    expect(onDelete).toHaveBeenCalledWith('tx-1');
  });

  it('disables delete button when disabled prop is true', () => {
    renderRow({ disabled: true });
    expect(screen.getByTestId('tx-delete-tx-1').disabled).toBe(true);
  });

  it('disables delete button when transaction is optimistic', () => {
    renderRow({ tx: { ...expenseTx, _optimistic: true } });
    expect(screen.getByTestId('tx-delete-tx-1').disabled).toBe(true);
  });

  it('does not show description when empty', () => {
    renderRow({ tx: { ...expenseTx, description: '' } });
    expect(screen.queryByText('Weekly shop')).toBeNull();
  });
});
