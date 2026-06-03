import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { BudgetCycleSection } from './BudgetCycleSection';

// Mutable context state — set per test before render.
let centre, incomes, cycles;
const mockUpdateCentre = vi.fn().mockResolvedValue({ error: null });

vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ centre, updateCentre: mockUpdateCentre }),
}));
vi.mock('../../context/FinanceContext', () => ({
  useFinanceContext: () => ({ incomes, cycles }),
}));

beforeEach(() => {
  centre  = { id: 'c1', cycle_anchor_type: 'calendar', cycle_anchor_day: null };
  incomes = [];
  cycles  = [];
  mockUpdateCentre.mockClear().mockResolvedValue({ error: null });
});

const openEdit = () => act(() => { screen.getByTestId('budget-cycle-edit-btn').click(); });

describe('BudgetCycleSection', () => {
  it('renders the saved anchor type label', () => {
    render(<BudgetCycleSection />);
    expect(screen.getByTestId('budget-cycle-type-display').textContent).toMatch(/Calendar month/);
  });

  it('renders a fixed_day anchor with its day', () => {
    centre = { id: 'c1', cycle_anchor_type: 'fixed_day', cycle_anchor_day: 25 };
    render(<BudgetCycleSection />);
    expect(screen.getByTestId('budget-cycle-type-display').textContent).toMatch(/Fixed day of month \(day 25\)/);
  });

  it('reveals the day input only when fixed_day is selected', () => {
    render(<BudgetCycleSection />);
    openEdit();
    expect(screen.queryByTestId('budget-cycle-day-input')).toBeNull();
    act(() => { fireEvent.change(screen.getByTestId('budget-cycle-anchor-select'), { target: { value: 'fixed_day' } }); });
    expect(screen.getByTestId('budget-cycle-day-input')).toBeTruthy();
  });

  it('hides "Suggest from income" when the hub has no income sources', () => {
    render(<BudgetCycleSection />);
    openEdit();
    expect(screen.queryByText('Suggest from income')).toBeNull();
  });

  it('shows a suggest button per income source when income exists', () => {
    incomes = [
      { id: 'i1', label: 'Adjei Salary', pay_day: 25, pay_day_type: 'fixed_date' },
      { id: 'i2', label: 'Dita Salary',  pay_day: 31, pay_day_type: 'last_working_day' },
    ];
    render(<BudgetCycleSection />);
    openEdit();
    expect(screen.getByText('Suggest from income')).toBeTruthy();
    expect(screen.getByTestId('budget-cycle-suggest-i1')).toBeTruthy();
    expect(screen.getByTestId('budget-cycle-suggest-i2')).toBeTruthy();
  });

  it('applies a fixed_date income suggestion as fixed_day + its pay_day', async () => {
    incomes = [{ id: 'i1', label: 'Adjei Salary', pay_day: 25, pay_day_type: 'fixed_date' }];
    render(<BudgetCycleSection />);
    openEdit();
    act(() => { screen.getByTestId('budget-cycle-suggest-i1').click(); });
    expect(screen.getByTestId('budget-cycle-anchor-select').value).toBe('fixed_day');
    expect(screen.getByTestId('budget-cycle-day-input').value).toBe('25');
  });

  it('applies a last_working_day income suggestion as the last_working_day anchor', () => {
    incomes = [{ id: 'i2', label: 'Dita Salary', pay_day: 31, pay_day_type: 'last_working_day' }];
    render(<BudgetCycleSection />);
    openEdit();
    act(() => { screen.getByTestId('budget-cycle-suggest-i2').click(); });
    expect(screen.getByTestId('budget-cycle-anchor-select').value).toBe('last_working_day');
    expect(screen.queryByTestId('budget-cycle-day-input')).toBeNull();
  });

  it('saves the selected anchor via updateCentre with mapped params', async () => {
    render(<BudgetCycleSection />);
    openEdit();
    act(() => { fireEvent.change(screen.getByTestId('budget-cycle-anchor-select'), { target: { value: 'fixed_day' } }); });
    act(() => { fireEvent.change(screen.getByTestId('budget-cycle-day-input'), { target: { value: '15' } }); });
    await act(async () => { screen.getByTestId('budget-cycle-save-btn').click(); });
    expect(mockUpdateCentre).toHaveBeenCalledWith({ cycle_anchor_type: 'fixed_day', cycle_anchor_day: 15 });
  });

  it('nulls anchor_day on save for a non-fixed_day anchor', async () => {
    render(<BudgetCycleSection />);
    openEdit();
    act(() => { fireEvent.change(screen.getByTestId('budget-cycle-anchor-select'), { target: { value: 'last_day_of_month' } }); });
    await act(async () => { screen.getByTestId('budget-cycle-save-btn').click(); });
    expect(mockUpdateCentre).toHaveBeenCalledWith({ cycle_anchor_type: 'last_day_of_month', cycle_anchor_day: null });
  });

  it('shows an error and stays in edit mode when the save fails', async () => {
    mockUpdateCentre.mockResolvedValueOnce({ error: { message: 'boom' } });
    render(<BudgetCycleSection />);
    openEdit();
    await act(async () => { screen.getByTestId('budget-cycle-save-btn').click(); });
    expect(screen.getByText(/Could not save/)).toBeTruthy();
    expect(screen.getByTestId('budget-cycle-save-btn')).toBeTruthy();   // still editing
  });

  it('renders a next-cycle preview reflecting the pending selection', () => {
    render(<BudgetCycleSection />);
    openEdit();
    expect(screen.getByTestId('budget-cycle-preview').textContent).toMatch(/Next cycle:/);
  });
});
