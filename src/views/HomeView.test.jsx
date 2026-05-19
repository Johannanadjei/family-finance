/**
 * views/HomeView.test.jsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { MemoryRouter }             from 'react-router-dom';
import { HomeView }                 from './HomeView';
import { mockCentre, mockFmt }      from '../test-utils/fixtures';

vi.mock('../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ centre: mockCentre, fmt: mockFmt }),
}));

const baseValues = {
  loading:       false,
  totalReceived: 30000,
  monthlyIncome: 45000,
  totalSpent:    5000,
  remaining:     40000,
  healthPct:     89,
  budgetStatus:  { label: 'On Track 🎯', color: '#059669' },
  nextUnpaid:    { id: 'inc-2', label: 'Dita Salary', expected_amount: 15000, daysUntil: 7 },
  totalExpected: 45000,
  fixedTotal:    28000,
  variableSpent: 977,
  surplusLeft:   2253,
  txs: [
    { id: 'tx-1', type: 'expense', amount: 200,   category_name: 'Groceries',    date: '2026-05-19', logged_by_name: 'Johannan' },
    { id: 'tx-2', type: 'income',  amount: 30000, category_name: 'Adjei Salary', date: '2026-05-19', logged_by_name: 'Johannan' },
  ],
};

const renderHome = (values = {}) =>
  render(
    <MemoryRouter>
      <HomeView financeValues={{ ...baseValues, ...values }} />
    </MemoryRouter>
  );

describe('HomeView', () => {
  it('renders skeleton when loading', () => {
    const { container } = renderHome({ loading: true });
    expect(container.firstChild).toBeTruthy();
  });

  it('renders income received amount in income card', () => {
    renderHome();
    expect(screen.getByTestId('income-received-amount').textContent).toBe('GHS 30,000');
  });

  it('shows confirm income message when nothing received', () => {
    renderHome({ totalReceived: 0 });
    expect(screen.getByText('Confirm income in Payday screen')).toBeTruthy();
  });

  it('renders budget health bar', () => {
    renderHome();
    expect(screen.getByText('Budget Health')).toBeTruthy();
    expect(screen.getByText('On Track 🎯')).toBeTruthy();
  });

  it('renders payday summary', () => {
    renderHome();
    expect(screen.getByText('💜 Payday Tracker')).toBeTruthy();
  });

  it('shows all received when all income confirmed', () => {
    renderHome({ totalReceived: 45000, totalExpected: 45000, nextUnpaid: null });
    expect(screen.getByText('All income received ✓')).toBeTruthy();
  });

  it('renders all 4 stat card labels', () => {
    renderHome();
    expect(screen.getByText('Fixed Budget')).toBeTruthy();
    expect(screen.getByText('Income In')).toBeTruthy();
    expect(screen.getByText('Variable Spent')).toBeTruthy();
    expect(screen.getByText('Surplus Left')).toBeTruthy();
  });

  it('renders recent activity', () => {
    renderHome();
    expect(screen.getByText('Recent Activity')).toBeTruthy();
    expect(screen.getByText('Groceries')).toBeTruthy();
  });

  it('shows empty state when no transactions', () => {
    renderHome({ txs: [] });
    expect(screen.getByText(/No transactions yet/)).toBeTruthy();
  });
});
