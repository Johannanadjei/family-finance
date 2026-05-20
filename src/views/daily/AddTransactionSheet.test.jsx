/**
 * views/daily/AddTransactionSheet.test.jsx
 * Written before AddTransactionSheet.jsx — TDD.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent }     from '@testing-library/react';
import { AddTransactionSheet }               from './AddTransactionSheet';
import { mockCentre, mockFmt, mockCategories } from '../../test-utils/fixtures';

vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({
    centre:     mockCentre,
    fmt:        mockFmt,
    categories: mockCategories,
    getCatIcon: (name) => name === 'Groceries' ? '🛒' : '💸',
  }),
}));

const mockAddTransaction = vi.fn().mockResolvedValue({ error: null });

vi.mock('../../context/FinanceContext', () => ({
  useFinanceContext: () => ({
    addTransaction: mockAddTransaction,
  }),
}));

const renderSheet = (props = {}) =>
  render(
    <AddTransactionSheet
      isOpen={true}
      onClose={vi.fn()}
      {...props}
    />
  );

describe('AddTransactionSheet', () => {
  beforeEach(() => { mockAddTransaction.mockClear(); });

  it('does not render when closed', () => {
    renderSheet({ isOpen: false });
    expect(screen.queryByTestId('add-amount-input')).toBeNull();
  });

  it('renders amount input', () => {
    renderSheet();
    expect(screen.getByTestId('add-amount-input')).toBeTruthy();
  });

  it('renders date input pre-filled with today', () => {
    renderSheet();
    const today = new Date().toISOString().split('T')[0];
    expect(screen.getByTestId('add-date-input').value).toBe(today);
  });

  it('shows expense and income type toggle', () => {
    renderSheet();
    expect(screen.getByText('Expense')).toBeTruthy();
    expect(screen.getByText('Income')).toBeTruthy();
  });

  it('shows category chips when type is expense', () => {
    renderSheet();
    expect(screen.getByText(/Groceries/)).toBeTruthy();
    expect(screen.getByText(/Transport/)).toBeTruthy();
  });

  it('hides category chips when type is income', async () => {
    renderSheet();
    await act(async () => { screen.getByText('Income').click(); });
    expect(screen.queryByText('Groceries')).toBeNull();
  });

  it('shows source label when type is income', async () => {
    renderSheet();
    await act(async () => { screen.getByText('Income').click(); });
    expect(screen.getByText(/Source/)).toBeTruthy();
  });

  it('selects category when chip tapped', async () => {
    renderSheet();
    await act(async () => { screen.getByText(/Groceries/).click(); });
    expect(screen.getByTestId('add-category-input').value).toBe('Groceries');
  });

  it('shows validation error when amount is empty', async () => {
    renderSheet();
    await act(async () => { screen.getByText('Save').click(); });
    expect(screen.getByText(/Amount must be greater than zero/)).toBeTruthy();
  });

  it('shows validation error when category is empty', async () => {
    renderSheet();
    await act(async () => {
      fireEvent.change(screen.getByTestId('add-amount-input'), { target: { value: '100' } });
    });
    await act(async () => { screen.getByText('Save').click(); });
    expect(screen.getByText(/Please select or enter a category/)).toBeTruthy();
  });

  it('calls addTransaction and closes on valid submit', async () => {
    const onClose = vi.fn();
    renderSheet({ onClose });
    await act(async () => {
      fireEvent.change(screen.getByTestId('add-amount-input'), { target: { value: '200' } });
    });
    await act(async () => { screen.getByText(/Groceries/).click(); });
    await act(async () => { screen.getByText('Save').click(); });
    expect(mockAddTransaction).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onSaved with transaction when save succeeds', async () => {
    const onSaved = vi.fn();
    renderSheet({ onSaved });
    await act(async () => {
      fireEvent.change(screen.getByTestId('add-amount-input'), { target: { value: '200' } });
    });
    await act(async () => { screen.getByText(/Groceries/).click(); });
    await act(async () => { screen.getByText('Save').click(); });
    expect(onSaved).toHaveBeenCalled();
  });

  it('calls onClose when cancel tapped', () => {
    const onClose = vi.fn();
    renderSheet({ onClose });
    screen.getByText('Cancel').click();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows Edit Transaction title when editTx provided', () => {
    const editTx = { id:'tx-1', type:'expense', amount:200, category_name:'Other', category_id:null, description:'test', date:'2026-05-20' };
    renderSheet({ editTx });
    expect(screen.getByText('Edit Transaction')).toBeTruthy();
  });

  it('pre-fills amount when editTx provided', () => {
    const editTx = { id:'tx-1', type:'expense', amount:200, category_name:'Other', category_id:null, description:'test', date:'2026-05-20' };
    renderSheet({ editTx });
    expect(screen.getByTestId('add-amount-input').value).toBe('200');
  });

  it('shows Save Changes button when editing', () => {
    const editTx = { id:'tx-1', type:'expense', amount:200, category_name:'Other', category_id:null, description:'test', date:'2026-05-20' };
    renderSheet({ editTx });
    expect(screen.getByText('Save Changes')).toBeTruthy();
  });
});
