/**
 * views/HomeView.test.jsx
 * Reads financeValues from FinanceContext — no props.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { MemoryRouter }             from 'react-router-dom';
import { HomeView }                 from './HomeView';
import { mockCentre, mockFmt }      from '../test-utils/fixtures';

vi.mock('../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ centre: mockCentre, fmt: mockFmt }),
}));

const mockFinance = {
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
  surplusTarget: 4500,
  txs: [
    { id: 'tx-1', type: 'expense', amount: 200,   category_name: 'Groceries',    date: '2026-05-19', logged_by_name: 'Johannan' },
    { id: 'tx-2', type: 'income',  amount: 30000, category_name: 'Adjei Salary', date: '2026-05-19', logged_by_name: 'Johannan' },
  ],
};

vi.mock('../context/FinanceContext', () => ({
  useFinanceContext: () => mockFinance,
}));

const renderHome = () => render(<MemoryRouter><HomeView /></MemoryRouter>);

describe('HomeView', () => {
  it('renders skeleton when loading', () => {
    mockFinance.loading = true;
    const { container } = renderHome();
    expect(container.firstChild).toBeTruthy();
    mockFinance.loading = false;
  });

  it('renders income received amount in income card', () => {
    renderHome();
    expect(screen.getByTestId('income-received-amount').textContent).toBe('GHS 30,000');
  });

  it('shows confirm income message when nothing received', () => {
    mockFinance.totalReceived = 0;
    renderHome();
    expect(screen.getByText('Confirm income in Payday screen')).toBeTruthy();
    mockFinance.totalReceived = 30000;
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
    mockFinance.totalReceived = 45000;
    mockFinance.totalExpected = 45000;
    mockFinance.nextUnpaid    = null;
    renderHome();
    expect(screen.getByText('All income received ✓')).toBeTruthy();
    mockFinance.totalReceived = 30000;
    mockFinance.totalExpected = 45000;
    mockFinance.nextUnpaid    = { id: 'inc-2', label: 'Dita Salary', expected_amount: 15000, daysUntil: 7 };
  });

  it('renders all 4 stat card labels', () => {
    renderHome();
    expect(screen.getByText('Fixed Budget')).toBeTruthy();
    expect(screen.getByText('Income In')).toBeTruthy();
    expect(screen.getByText('Variable Spent')).toBeTruthy();
    expect(screen.getByText('Surplus Left')).toBeTruthy();
  });

  it('stat cards show formatted values', () => {
    renderHome();
    expect(screen.getByText('GHS 28,000')).toBeTruthy();
    expect(screen.getByText('GHS 977')).toBeTruthy();
  });

  it('surplus shows dash and subtitle when no income received', () => {
    mockFinance.totalReceived = 0;
    mockFinance.surplusLeft   = 19600;
    renderHome();
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('Confirm income first')).toBeTruthy();
    mockFinance.totalReceived = 30000;
    mockFinance.surplusLeft   = 2253;
  });

  it('surplus shows formatted value when income received', () => {
    mockFinance.totalReceived = 30000;
    mockFinance.surplusLeft   = 2253;
    renderHome();
    expect(screen.getByText('GHS 2,253')).toBeTruthy();
  });

  it('renders recent activity', () => {
    renderHome();
    expect(screen.getByText('Recent Activity')).toBeTruthy();
    expect(screen.getByText('Groceries')).toBeTruthy();
  });

  it('shows empty state when no transactions', () => {
    mockFinance.txs = [];
    renderHome();
    expect(screen.getByText(/No transactions yet/)).toBeTruthy();
    mockFinance.txs = [
      { id: 'tx-1', type: 'expense', amount: 200, category_name: 'Groceries', date: '2026-05-19', logged_by_name: 'Johannan' },
    ];
  });
});
