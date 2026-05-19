import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { MemoryRouter }             from 'react-router-dom';
import { PaydaySummaryCard }        from './PaydaySummaryCard';
import { mockCentre, mockFmt }      from '../../test-utils/fixtures';

vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ centre: mockCentre, fmt: mockFmt }),
}));

const renderCard = (props = {}) =>
  render(
    <MemoryRouter>
      <PaydaySummaryCard
        nextUnpaid={{ id: 'inc-2', label: 'Dita Salary', expected_amount: 15000, daysUntil: 7 }}
        totalReceived={30000}
        totalExpected={45000}
        {...props}
      />
    </MemoryRouter>
  );

describe('PaydaySummaryCard', () => {
  it('shows next unpaid income label', () => {
    renderCard();
    expect(screen.getByText(/Dita Salary/)).toBeTruthy();
  });

  it('shows days away when daysUntil > 0', () => {
    renderCard();
    expect(screen.getByText(/7 days away/)).toBeTruthy();
  });

  it('shows due today when daysUntil is 0', () => {
    renderCard({ nextUnpaid: { id: 'inc-2', label: 'Dita Salary', expected_amount: 15000, daysUntil: 0 } });
    expect(screen.getByText(/Due today/)).toBeTruthy();
  });

  it('shows flexible when daysUntil is null', () => {
    renderCard({ nextUnpaid: { id: 'inc-2', label: 'Dita Salary', expected_amount: 15000, daysUntil: null } });
    expect(screen.getByText(/Flexible/)).toBeTruthy();
  });

  it('shows all received state when all income confirmed', () => {
    renderCard({ totalReceived: 45000, totalExpected: 45000, nextUnpaid: null });
    expect(screen.getByText('All income received ✓')).toBeTruthy();
  });

  it('shows no upcoming income when nextUnpaid is null and not all received', () => {
    renderCard({ totalReceived: 0, totalExpected: 45000, nextUnpaid: null });
    expect(screen.getByText('No upcoming income')).toBeTruthy();
  });

  it('shows received vs expected summary', () => {
    renderCard();
    expect(screen.getByText(/GHS 30,000/)).toBeTruthy();
    expect(screen.getByText(/GHS 45,000/)).toBeTruthy();
  });

  it('shows view link', () => {
    renderCard();
    expect(screen.getByText('View →')).toBeTruthy();
  });
});
