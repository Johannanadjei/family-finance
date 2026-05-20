/**
 * views/PaydayView.test.jsx
 * Written before PaydayView.jsx — TDD.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { MemoryRouter }             from 'react-router-dom';
import { PaydayView }               from './PaydayView';
import { mockCentre, mockFmt, mockIncomes } from '../test-utils/fixtures';

vi.mock('../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ centre: mockCentre, fmt: mockFmt }),
}));

const baseValues = {
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

const renderView = (values = {}) =>
  render(
    <MemoryRouter>
      <PaydayView financeValues={{ ...baseValues, ...values }} />
    </MemoryRouter>
  );

describe('PaydayView', () => {
  it('shows skeleton when loading', () => {
    const { container } = renderView({ loading: true });
    expect(container.firstChild).toBeTruthy();
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
    renderView({ activeMonth: '2026-04' });
    expect(screen.getByText(/Income status shown reflects current state/)).toBeTruthy();
  });

  it('does not show past month warning for current month', () => {
    renderView({ activeMonth: '2026-05' });
    expect(screen.queryByText(/Income status shown reflects current state/)).toBeNull();
  });

  it('shows empty state when no income sources', () => {
    renderView({ incomes: [] });
    expect(screen.getByText(/No income sources/)).toBeTruthy();
  });

  it('shows error state when error is set', () => {
    renderView({ error: 'Failed to load' });
    expect(screen.getByText(/Failed to load/)).toBeTruthy();
  });

  it('shows previous month navigation button', () => {
    renderView();
    expect(screen.getByLabelText('Previous month')).toBeTruthy();
  });

  it('shows next month navigation button disabled when current month', () => {
    renderView({ activeMonth: '2026-05' });
    expect(screen.getByLabelText('Next month').disabled).toBe(true);
  });
});
