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
    expect(screen.getByTestId('stat-spent').textContent).toBe('GHS 5,000');
  });

  it('shows spareMoney as Spare', () => {
    renderCard();
    expect(screen.getByTestId('stat-spare').textContent).toBe('GHS 4,500');
  });

  it('does not render Money Left mini-stat', () => {
    renderCard();
    expect(screen.queryByTestId('stat-money-left')).toBeNull();
  });

  it('Spare mini-stat uses danger colour when spareMoney is negative', () => {
    renderCard({ spareMoney: -200 });
    const spare = screen.getByTestId('stat-spare');
    expect(spare.style.color).toMatch(/fca5a5|c-danger-light/);
  });

  it('renders an icon in each mini-card', () => {
    renderCard();
    expect(screen.getByTestId('stat-spent-card').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('stat-spare-card').querySelector('svg')).toBeTruthy();
  });

  it('Spare mini-card flips to a red background tint when spareMoney is negative', () => {
    renderCard({ spareMoney: -200 });
    expect(screen.getByTestId('stat-spare-card').style.background).toMatch(/248, ?113, ?113/);
  });

  it('Spare mini-card stays neutral (no red tint) when spareMoney is positive', () => {
    renderCard({ spareMoney: 4500 });
    expect(screen.getByTestId('stat-spare-card').style.background).not.toMatch(/248, ?113, ?113/);
  });
});
