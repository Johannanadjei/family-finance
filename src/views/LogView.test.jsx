/**
 * views/LogView.test.jsx
 * Written before LogView.jsx — TDD.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { MemoryRouter }             from 'react-router-dom';
import { LogView }                  from './LogView';
import { mockCentre, mockFmt, mockTxs } from '../test-utils/fixtures';

let mockCan = () => true;
vi.mock('../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ centre: mockCentre, fmt: mockFmt, can: (p) => mockCan(p), currentUserId: 'user-1' }),
}));

const mockFinance = {
  loading:           false,
  error:             null,
  txs:               mockTxs,
  activeMonth:       '2026-05',
  loadMonth:         vi.fn(),
  deleteTransaction: vi.fn().mockResolvedValue({ error: null }),
  updateTransaction: vi.fn().mockResolvedValue({ error: null }),
};

vi.mock('../context/FinanceContext', () => ({
  useFinanceContext: () => mockFinance,
}));

const renderView = (props = {}) =>
  render(<MemoryRouter><LogView onEditTx={vi.fn()} {...props} /></MemoryRouter>);

// standard role: can log expenses but cannot view income or all txs
const standardCan = (p) => p === 'log';

describe('LogView', () => {
  beforeEach(() => { mockCan = () => true; });
  it('shows skeleton when loading', () => {
    mockFinance.loading = true;
    const { container } = renderView();
    expect(container.firstChild).toBeTruthy();
    mockFinance.loading = false;
  });

  it('shows month label', () => {
    renderView();
    expect(screen.getByTestId('log-month-label').textContent).toContain('2026');
  });

  it('shows filter bar', () => {
    renderView();
    expect(screen.getByTestId('log-filter-all')).toBeTruthy();
  });

  it('shows search input', () => {
    renderView();
    expect(screen.getByTestId('log-search-input')).toBeTruthy();
  });

  it('shows all transactions by default for owner/full_access', () => {
    renderView();
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('Adjei Salary')).toBeTruthy();
  });

  it('standard member sees only expense transactions', () => {
    mockCan = standardCan;
    renderView();
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.queryByText('Adjei Salary')).toBeNull();
  });

  it('shows empty state when no transactions', () => {
    mockFinance.txs = [];
    renderView();
    expect(screen.getByText(/Nothing logged yet/)).toBeTruthy();
    mockFinance.txs = mockTxs;
  });

  it('shows error state when error set', () => {
    mockFinance.error = 'Failed to load';
    renderView();
    expect(screen.getByText(/Failed to load/)).toBeTruthy();
    mockFinance.error = null;
  });

  it('shows previous month button', () => {
    renderView();
    expect(screen.getByLabelText('Previous month')).toBeTruthy();
  });

  it('next month button disabled on current month', () => {
    renderView();
    expect(screen.getByLabelText('Next month').disabled).toBe(true);
  });
});
