/**
 * views/PaydayView.test.jsx
 * Reads financeValues from FinanceContext — no props.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { MemoryRouter }             from 'react-router-dom';
import { PaydayView }               from './PaydayView';
import { mockCentre, mockFmt, mockIncomes } from '../test-utils/fixtures';

vi.mock('../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ centre: mockCentre, fmt: mockFmt }),
}));

// Base finance context — overridden per test via mockFinance
const mockFinance = {
  loading:        false,
  error:          null,
  incomes:        mockIncomes,
  totalReceived:  30000,
  totalExpected:  45000,
  totalPending:   15000,
  activeMonth:    '2026-05',
  loadMonth:      vi.fn(),
  markReceived:   vi.fn().mockResolvedValue({ error: null }),
  markPending:    vi.fn().mockResolvedValue({ error: null }),
  updateExpectedAmount: vi.fn().mockResolvedValue({ error: null }),
};

vi.mock('../context/FinanceContext', () => ({
  useFinanceContext: () => mockFinance,
}));

const renderView = () => render(<MemoryRouter><PaydayView /></MemoryRouter>);

describe('PaydayView', () => {
  it('shows skeleton when loading', () => {
    mockFinance.loading = true;
    const { container } = renderView();
    expect(container.firstChild).toBeTruthy();
    mockFinance.loading = false;
  });

  it('shows month label', () => {
    renderView();
    expect(screen.getByTestId('payday-month-label').textContent).toContain('2026');
  });

  it('shows total received', () => {
    renderView();
    expect(screen.getByTestId('payday-total-received').textContent).toBe('GHS 30,000');
  });

  it('shows total pending', () => {
    renderView();
    expect(screen.getByTestId('payday-total-pending').textContent).toBe('GHS 15,000');
  });

  it('shows all income streams', () => {
    renderView();
    expect(screen.getByText('Adjei Salary')).toBeTruthy();
    expect(screen.getByText('Dita Salary')).toBeTruthy();
  });

  it('shows past month warning when not current month', () => {
    mockFinance.activeMonth = '2026-04';
    renderView();
    expect(screen.getByText(/Income status shown reflects current state/)).toBeTruthy();
    mockFinance.activeMonth = '2026-05';
  });

  it('shows empty state when no income sources', () => {
    mockFinance.incomes = [];
    renderView();
    expect(screen.getByText(/No income sources/)).toBeTruthy();
    mockFinance.incomes = mockIncomes;
  });

  it('shows error state when error is set', () => {
    mockFinance.error = 'Failed to load';
    renderView();
    expect(screen.getByText(/Failed to load/)).toBeTruthy();
    mockFinance.error = null;
  });

  it('shows previous month navigation button', () => {
    renderView();
    expect(screen.getByLabelText('Previous month')).toBeTruthy();
  });

  it('shows next month navigation button disabled when current month', () => {
    renderView();
    expect(screen.getByLabelText('Next month').disabled).toBe(true);
  });
});
