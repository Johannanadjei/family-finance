/**
 * views/settings/IncomeSourcesSection.test.jsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent }       from '@testing-library/react';
import { IncomeSourcesSection }                 from './IncomeSourcesSection';
import { mockCentre, mockFmt, mockIncomes }     from '../../test-utils/fixtures';
import { getCurrentMonth }                      from '../../lib/dates';
import { offsetMonth }                          from '../../lib/finance';

const mockAddIncomeSource    = vi.fn().mockResolvedValue({ error: null });
const mockDeleteIncomeSource = vi.fn().mockResolvedValue({ error: null });
const mockUpdateIncomeSource = vi.fn().mockResolvedValue({ error: null });

let financeValue;

vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ fmt: mockFmt, centre: mockCentre }),
}));

vi.mock('../../context/FinanceContext', () => ({
  useFinanceContext: () => financeValue,
}));

const M    = getCurrentMonth();
const PAST = '2020-01';

beforeEach(() => {
  mockAddIncomeSource.mockClear();
  financeValue = {
    allIncomes:         mockIncomes,            // both fixtures carry the current month
    loading:            false,
    addIncomeSource:    mockAddIncomeSource,
    deleteIncomeSource: mockDeleteIncomeSource,
    updateIncomeSource: mockUpdateIncomeSource,
  };
});

describe('IncomeSourcesSection', () => {
  it('groups sources under a month header, current month expanded by default', () => {
    render(<IncomeSourcesSection />);
    expect(screen.getByTestId(`income-month-header-${M}`)).toBeTruthy();
    expect(screen.getByTestId('income-label-inc-1')).toBeTruthy();
  });

  it('shows the empty state when there are no sources', () => {
    financeValue.allIncomes = [];
    render(<IncomeSourcesSection />);
    expect(screen.getByText('No income sources yet')).toBeTruthy();
  });

  it('renders a separate collapsed section per month, hiding past-month rows', () => {
    financeValue.allIncomes = [
      ...mockIncomes,
      { id: 'old-1', label: 'Old Salary', expected_amount: 9000, received: true, received_amount: 9000, currency: 'GHS', pay_day: 25, pay_day_type: 'fixed_date', month: PAST },
    ];
    render(<IncomeSourcesSection />);
    expect(screen.getByTestId(`income-month-header-${M}`)).toBeTruthy();
    expect(screen.getByTestId(`income-month-header-${PAST}`)).toBeTruthy();
    expect(screen.queryByTestId('income-label-old-1')).toBeNull();   // past month collapsed
  });

  it('expands a collapsed past month on tap', () => {
    financeValue.allIncomes = [
      ...mockIncomes,
      { id: 'old-1', label: 'Old Salary', expected_amount: 9000, received: true, received_amount: 9000, currency: 'GHS', pay_day: 25, pay_day_type: 'fixed_date', month: PAST },
    ];
    render(<IncomeSourcesSection />);
    fireEvent.click(screen.getByTestId(`income-month-header-${PAST}`));
    expect(screen.getByTestId('income-label-old-1')).toBeTruthy();
  });

  it('add form defaults the month to the current month and saves with it', async () => {
    render(<IncomeSourcesSection />);
    await act(async () => { screen.getByTestId('add-income-source-btn').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('new-source-label'), { target: { value: 'Freelance' } });
    });
    expect(screen.getByTestId('new-source-month').value).toBe(M);
    await act(async () => { screen.getByTestId('save-income-source-btn').click(); });
    expect(mockAddIncomeSource).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Freelance', month: M })
    );
  });

  it('lets the user pick a different month to add to', async () => {
    const lastMonth = offsetMonth(M, -1);   // within the current ±3 option range
    render(<IncomeSourcesSection />);
    await act(async () => { screen.getByTestId('add-income-source-btn').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('new-source-label'), { target: { value: 'Bonus' } });
      fireEvent.change(screen.getByTestId('new-source-month'), { target: { value: lastMonth } });
    });
    await act(async () => { screen.getByTestId('save-income-source-btn').click(); });
    expect(mockAddIncomeSource).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Bonus', month: lastMonth })
    );
  });

  it('shows a validation error when the label is empty', async () => {
    render(<IncomeSourcesSection />);
    await act(async () => { screen.getByTestId('add-income-source-btn').click(); });
    await act(async () => { screen.getByTestId('save-income-source-btn').click(); });
    expect(screen.getByText(/Please enter a source name/)).toBeTruthy();
    expect(mockAddIncomeSource).not.toHaveBeenCalled();
  });
});
