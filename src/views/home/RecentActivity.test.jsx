/**
 * views/home/RecentActivity.test.jsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { MemoryRouter }             from 'react-router-dom';
import { RecentActivity }           from './RecentActivity';
import { mockCentre, mockFmt, mockTxs } from '../../test-utils/fixtures';

vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ centre: mockCentre, fmt: mockFmt }),
}));

const renderActivity = (props = {}) =>
  render(
    <MemoryRouter>
      <RecentActivity txs={mockTxs} {...props} />
    </MemoryRouter>
  );

describe('RecentActivity', () => {
  it('shows Recent Activity heading', () => {
    renderActivity();
    expect(screen.getByText('Recent Activity')).toBeTruthy();
  });

  it('shows empty state when no transactions', () => {
    renderActivity({ txs: [] });
    expect(screen.getByText(/No transactions yet/)).toBeTruthy();
  });

  it('shows category name for each transaction', () => {
    renderActivity();
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('Adjei Salary')).toBeTruthy();
  });

  it('shows + prefix for income transactions', () => {
    renderActivity();
    expect(screen.getByText('+GHS 30,000')).toBeTruthy();
  });

  it('shows - prefix for expense transactions', () => {
    renderActivity();
    expect(screen.getByText('-GHS 200')).toBeTruthy();
  });

  it('limits to 5 transactions', () => {
    const manyTxs = Array.from({ length: 10 }, (_, i) => ({
      id: `tx-${i}`, type: 'expense', amount: 100,
      category_name: `Cat ${i}`, date: '2026-05-19', logged_by_name: 'Johannan',
    }));
    renderActivity({ txs: manyTxs });
    expect(screen.getAllByText(/Cat \d/).length).toBe(5);
  });

  it('shows see all link', () => {
    renderActivity();
    expect(screen.getByText('See all')).toBeTruthy();
  });

  it('hides income transactions when showIncome is false', () => {
    renderActivity({ showIncome: false });
    expect(screen.queryByText('Adjei Salary')).toBeNull();
    expect(screen.getByText('Groceries')).toBeTruthy();
  });

  it('shows empty state when all transactions are income and showIncome is false', () => {
    const incomeTxs = [{ id: 'tx-i', type: 'income', amount: 500, category_name: 'Salary', date: '2026-05-19', logged_by_name: 'Johannan' }];
    renderActivity({ txs: incomeTxs, showIncome: false });
    expect(screen.getByText(/No transactions yet/)).toBeTruthy();
  });
});
