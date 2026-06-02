/**
 * views/budget/AddCategorySheet.test.jsx
 * Written before AddCategorySheet.jsx — TDD.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AddCategorySheet }              from './AddCategorySheet';
import { getCurrentMonth }              from '../../lib/finance';
import { mockFmt }                       from '../../test-utils/fixtures';

vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({
    fmt:    mockFmt,
    centre: { id: 'c1', currency: 'GHS' },
  }),
}));

const mockAddCategory = vi.fn().mockResolvedValue({ error: null });

vi.mock('../../context/FinanceContext', () => ({
  useFinanceContext: () => ({}),
}));

const renderSheet = (props = {}) =>
  render(
    <AddCategorySheet
      isOpen={true}
      onClose={vi.fn()}
      onAdd={mockAddCategory}
      {...props}
    />
  );

describe('AddCategorySheet', () => {
  it('renders when open', () => {
    renderSheet();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('does not render when closed', () => {
    renderSheet({ isOpen: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows category name input', () => {
    renderSheet();
    expect(screen.getByTestId('add-cat-name-input')).toBeTruthy();
  });

  it('shows budget amount input', () => {
    renderSheet();
    expect(screen.getByTestId('add-cat-amount-input')).toBeTruthy();
  });

  it('shows validation error when name is empty', async () => {
    renderSheet();
    fireEvent.change(screen.getByTestId('add-cat-amount-input'), { target: { value: '500' } });
    await act(async () => { screen.getByText('Save').click(); });
    expect(screen.getByText(/name/i)).toBeTruthy();
  });

  it('calls onAdd with correct data when saved', async () => {
    renderSheet();
    fireEvent.change(screen.getByTestId('add-cat-name-input'), { target: { value: 'Groceries' } });
    fireEvent.change(screen.getByTestId('add-cat-amount-input'), { target: { value: '500' } });
    await act(async () => { screen.getByText('Save').click(); });
    expect(mockAddCategory).toHaveBeenCalledWith(expect.objectContaining({ name: 'Groceries', budget_amount: 500 }));
  });

  it('calls onClose when cancel tapped', () => {
    const onClose = vi.fn();
    renderSheet({ onClose });
    screen.getByText('Cancel').click();
    expect(onClose).toHaveBeenCalled();
  });

  it('defaults month to the current clock month when no targetMonth prop', async () => {
    renderSheet();
    fireEvent.change(screen.getByTestId('add-cat-name-input'), { target: { value: 'Groceries' } });
    fireEvent.change(screen.getByTestId('add-cat-amount-input'), { target: { value: '500' } });
    await act(async () => { screen.getByText('Save').click(); });
    expect(mockAddCategory).toHaveBeenCalledWith(expect.objectContaining({ month: getCurrentMonth() }));
  });

  it('adds to the supplied targetMonth (cycle-aware) when passed', async () => {
    mockAddCategory.mockClear();
    renderSheet({ targetMonth: '2026-04' });
    fireEvent.change(screen.getByTestId('add-cat-name-input'), { target: { value: 'Groceries' } });
    fireEvent.change(screen.getByTestId('add-cat-amount-input'), { target: { value: '500' } });
    await act(async () => { screen.getByText('Save').click(); });
    expect(mockAddCategory).toHaveBeenCalledWith(expect.objectContaining({ month: '2026-04' }));
  });
});
