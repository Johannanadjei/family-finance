/**
 * views/DailyView.test.jsx
 * Written before DailyView.jsx — TDD.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { MemoryRouter }             from 'react-router-dom';
import { DailyView }                from './DailyView';
import { mockCentre, mockFmt, mockTxs, mockWeeklyData } from '../test-utils/fixtures';

vi.mock('../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ centre: mockCentre, fmt: mockFmt }),
}));

const mockFinance = {
  loading:           false,
  error:             null,
  txs:               mockTxs,
  totalSpent:        200,
  weeklyData:        mockWeeklyData,
  activeMonth:       '2026-05',
  loadMonth:         vi.fn(),
  deleteTransaction: vi.fn().mockResolvedValue({ error: null }),
};

vi.mock('../context/FinanceContext', () => ({
  useFinanceContext: () => mockFinance,
}));

const renderView = () => render(<MemoryRouter><DailyView /></MemoryRouter>);

describe('DailyView', () => {
  it('shows skeleton when loading', () => {
    mockFinance.loading = true;
    const { container } = renderView();
    expect(container.firstChild).toBeTruthy();
    mockFinance.loading = false;
  });

  it('shows month label', () => {
    renderView();
    expect(screen.getByTestId('daily-month-label').textContent).toContain('2026');
  });

  it('shows total spent for the month', () => {
    renderView();
    expect(screen.getByTestId('daily-total-spent').textContent).toBe('GHS 200');
  });

  it('shows weekly summary bar', () => {
    renderView();
    expect(screen.getByTestId('week-tab-Week 1')).toBeTruthy();
  });

  it('shows transactions grouped by date', () => {
    renderView();
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('Adjei Salary')).toBeTruthy();
  });

  it('shows empty state when no transactions', () => {
    mockFinance.txs = [];
    renderView();
    expect(screen.getByText(/No transactions yet/)).toBeTruthy();
    mockFinance.txs = mockTxs;
  });

  it('shows error state when error is set', () => {
    mockFinance.error = 'Failed to load';
    renderView();
    expect(screen.getByText(/Failed to load/)).toBeTruthy();
    mockFinance.error = null;
  });

  it('shows past month warning when not current month', () => {
    mockFinance.activeMonth = '2026-04';
    renderView();
    expect(screen.getByText(/Viewing a past month/)).toBeTruthy();
    mockFinance.activeMonth = '2026-05';
  });

  it('shows previous month navigation button', () => {
    renderView();
    expect(screen.getByLabelText('Previous month')).toBeTruthy();
  });

  it('shows next month button disabled on current month', () => {
    renderView();
    expect(screen.getByLabelText('Next month').disabled).toBe(true);
  });
});
