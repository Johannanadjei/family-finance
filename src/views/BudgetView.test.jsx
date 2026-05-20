/**
 * views/BudgetView.test.jsx
 * Written before BudgetView.jsx — TDD.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { MemoryRouter }             from 'react-router-dom';
import { BudgetView }               from './BudgetView';
import { mockCentre, mockFmt, mockCategories, mockCategorySpend } from '../test-utils/fixtures';

vi.mock('../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({
    centre:     mockCentre,
    fmt:        mockFmt,
    categories: mockCategories,
    getCatIcon: (name) => name === 'Groceries' ? '🛒' : '🚗',
  }),
}));

const mockFinance = {
  loading:       false,
  error:         null,
  categorySpend: mockCategorySpend,
  fixedTotal:    700,
  fixedSpent:    200,
};

vi.mock('../context/FinanceContext', () => ({
  useFinanceContext: () => mockFinance,
}));

const renderView = () => render(<MemoryRouter><BudgetView /></MemoryRouter>);

describe('BudgetView', () => {
  it('shows skeleton when loading', () => {
    mockFinance.loading = true;
    const { container } = renderView();
    expect(container.firstChild).toBeTruthy();
    mockFinance.loading = false;
  });

  it('shows total planned budget', () => {
    renderView();
    expect(screen.getByTestId('budget-total-planned').textContent).toBe('GHS 700');
  });

  it('shows total fixed spent', () => {
    renderView();
    expect(screen.getByTestId('budget-total-spent').textContent).toBe('GHS 200');
  });

  it('shows all category names', () => {
    renderView();
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('Transport')).toBeTruthy();
  });

  it('shows error state when error set', () => {
    mockFinance.error = 'Failed to load';
    renderView();
    expect(screen.getByText(/Failed to load/)).toBeTruthy();
    mockFinance.error = null;
  });

  it('sorts categories by pctUsed descending — most urgent first', () => {
    renderView();
    const rows = screen.getAllByText(/Groceries|Transport/);
    expect(rows[0].textContent).toContain('Groceries');
  });
});
