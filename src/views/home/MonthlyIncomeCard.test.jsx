/**
 * views/home/MonthlyIncomeCard.test.jsx
 * Written before fixing — TDD.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { MemoryRouter }             from 'react-router-dom';
import { MonthlyIncomeCard }        from './MonthlyIncomeCard';
import { mockCentre, mockFmt }      from '../../test-utils/fixtures';

vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ centre: mockCentre, fmt: mockFmt }),
}));

const renderCard = (props = {}) =>
  render(
    <MemoryRouter>
      <MonthlyIncomeCard
        allIncome={48000}
        totalReceived={30000}
        monthlyIncome={45000}
        totalSpent={5000}
        remaining={40000}
        spareMoney={4500}
        {...props}
      />
    </MemoryRouter>
  );

describe('MonthlyIncomeCard', () => {
  it('shows allIncome as hero number', () => {
    renderCard();
    expect(screen.getByTestId('income-received-amount').textContent).toBe('GHS 48,000');
  });

  it('shows expected income context when income exists', () => {
    renderCard();
    expect(screen.getByText('of GHS 45,000 expected')).toBeTruthy();
  });

  it('shows confirm message when no income at all', () => {
    renderCard({ allIncome: 0, totalReceived: 0 });
    expect(screen.getByText('Log income in Payday or via + button')).toBeTruthy();
  });

  it('shows spent amount', () => {
    renderCard();
    expect(screen.getByText('GHS 5,000')).toBeTruthy();
  });

  it('shows remaining amount', () => {
    renderCard();
    expect(screen.getByText('GHS 40,000')).toBeTruthy();
  });

  it('shows spareMoney as Spare — not monthlyIncome minus totalSpent', () => {
    renderCard();
    expect(screen.getByText('GHS 4,500')).toBeTruthy();
    expect(screen.queryByText('GHS 40,000', { selector: '[data-label="Spare"]' })).toBeNull();
  });
});
