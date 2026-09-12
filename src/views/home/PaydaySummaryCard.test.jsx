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

describe('PaydaySummaryCard — the last-working-day null no longer kills the summary', () => {
  // pickNextUnpaid resolves the date against the period, so this arrives with a real
  // daysUntil. Before, pay_day was null for last_working_day → daysUntil null → the
  // household's main salary was announced on Home as "Flexible".
  it('shows the countdown for a last-working-day salary', () => {
    renderCard({ nextUnpaid: { id: 'inc-1', label: 'Adjei Salary', expected_amount: 30000, daysUntil: 3, payDate: '2026-10-30' } });
    expect(screen.getByTestId('next-unpaid-when').textContent).toContain('3 days away');
    expect(screen.getByTestId('next-unpaid-when').textContent).not.toContain('Flexible');
  });

  it('reserves Flexible for a source that genuinely has no date', () => {
    renderCard({ nextUnpaid: { id: 'inc-3', label: 'Side gig', expected_amount: 500, daysUntil: null, payDate: null } });
    expect(screen.getByTestId('next-unpaid-when').textContent).toContain('Flexible');
  });

  it('says Overdue once the date has passed unreceived', () => {
    renderCard({ nextUnpaid: { id: 'inc-2', label: 'Dita Salary', expected_amount: 15000, daysUntil: -2, payDate: '2026-10-25' } });
    expect(screen.getByTestId('next-unpaid-when').textContent).toContain('Overdue');
  });
});

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
