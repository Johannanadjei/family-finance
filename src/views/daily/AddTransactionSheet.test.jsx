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
    can:        () => true,
  }),
}));

const mockAddTransaction    = vi.fn().mockResolvedValue({ error: null });
const mockUpdateTransaction = vi.fn().mockResolvedValue({ error: null });
let mockSpareMoney          = 5000;

vi.mock('../../context/FinanceContext', () => ({
  useFinanceContext: () => ({
    addTransaction:    mockAddTransaction,
    updateTransaction: mockUpdateTransaction,
    spareMoney:        mockSpareMoney,
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
  beforeEach(() => {
    mockAddTransaction.mockClear();
    mockUpdateTransaction.mockClear();
    mockSpareMoney = 5000;
  });

  it('does not render when closed', () => {
    renderSheet({ isOpen: false });
    expect(screen.queryByTestId('add-amount-input')).toBeNull();
  });

  it('renders amount input', () => {
    renderSheet();
    expect(screen.getByTestId('add-amount-input')).toBeTruthy();
  });

  it('renders date inputs pre-filled with today', () => {
    const today = new Date();
    renderSheet();
    expect(screen.getByTestId('add-date-input').value).toBe(String(today.getDate()));
    expect(screen.getByTestId('add-month-input').value).toBe(String(today.getMonth() + 1));
    expect(screen.getByTestId('add-year-input').value).toBe(String(today.getFullYear()));
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

  it('saves as Other when no category selected for expense', async () => {
    renderSheet();
    await act(async () => {
      fireEvent.change(screen.getByTestId('add-amount-input'), { target: { value: '100' } });
    });
    await act(async () => { screen.getByText('Save').click(); });
    expect(mockAddTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ category_name: 'Other' })
    );
  });

  it('saves as Other when no source selected for income', async () => {
    renderSheet();
    await act(async () => { screen.getByText('Income').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('add-amount-input'), { target: { value: '500' } });
    });
    await act(async () => { screen.getByText('Save').click(); });
    expect(mockAddTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'income', category_name: 'Other' })
    );
  });

  it('calls addTransaction and closes on valid submit', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    renderSheet({ onClose });
    await act(async () => {
      fireEvent.change(screen.getByTestId('add-amount-input'), { target: { value: '200' } });
    });
    await act(async () => { screen.getByText(/Groceries/).click(); });
    await act(async () => { screen.getByText('Save').click(); });
    expect(mockAddTransaction).toHaveBeenCalled();
    await act(async () => { vi.runAllTimers(); });
    expect(onClose).toHaveBeenCalled();
    vi.useRealTimers();
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

  // ── Date field validation ───────────────────────────────────────────────────

  it('shows error for day > 31 on submit', async () => {
    renderSheet();
    await act(async () => { fireEvent.change(screen.getByTestId('add-amount-input'), { target: { value: '100' } }); });
    await act(async () => { fireEvent.change(screen.getByTestId('add-date-input'), { target: { value: '50' } }); });
    await act(async () => { screen.getByText('Save').click(); });
    expect(screen.getByText('Please enter a valid day (1-31)')).toBeTruthy();
  });

  it('shows error for month > 12 on submit', async () => {
    renderSheet();
    await act(async () => { fireEvent.change(screen.getByTestId('add-amount-input'), { target: { value: '100' } }); });
    await act(async () => { fireEvent.change(screen.getByTestId('add-month-input'), { target: { value: '15' } }); });
    await act(async () => { screen.getByText('Save').click(); });
    expect(screen.getByText('Please enter a valid month (1-12)')).toBeTruthy();
  });

  it('shows error for year out of range on submit', async () => {
    renderSheet();
    await act(async () => { fireEvent.change(screen.getByTestId('add-amount-input'), { target: { value: '100' } }); });
    await act(async () => { fireEvent.change(screen.getByTestId('add-year-input'), { target: { value: '2035' } }); });
    await act(async () => { screen.getByText('Save').click(); });
    expect(screen.getByText('Please enter a valid year (2020-2030)')).toBeTruthy();
  });

  it('shows error for empty day on submit', async () => {
    renderSheet();
    await act(async () => { fireEvent.change(screen.getByTestId('add-amount-input'), { target: { value: '100' } }); });
    await act(async () => { fireEvent.change(screen.getByTestId('add-date-input'), { target: { value: '' } }); });
    await act(async () => { screen.getByText('Save').click(); });
    expect(screen.getByText('Please enter a valid day (1-31)')).toBeTruthy();
  });

  it('shows error for empty month on submit', async () => {
    renderSheet();
    await act(async () => { fireEvent.change(screen.getByTestId('add-amount-input'), { target: { value: '100' } }); });
    await act(async () => { fireEvent.change(screen.getByTestId('add-month-input'), { target: { value: '' } }); });
    await act(async () => { screen.getByText('Save').click(); });
    expect(screen.getByText('Please enter a valid month (1-12)')).toBeTruthy();
  });

  it('shows error for invalid date combination on submit', async () => {
    renderSheet();
    await act(async () => { fireEvent.change(screen.getByTestId('add-amount-input'), { target: { value: '100' } }); });
    await act(async () => { fireEvent.change(screen.getByTestId('add-date-input'),  { target: { value: '31' } }); });
    await act(async () => { fireEvent.change(screen.getByTestId('add-month-input'), { target: { value: '2' } }); });
    await act(async () => { fireEvent.change(screen.getByTestId('add-year-input'),  { target: { value: '2026' } }); });
    await act(async () => { screen.getByText('Save').click(); });
    expect(screen.getByText('Please enter a valid date')).toBeTruthy();
  });

  // ── from_spare toggle ──────────────────────────────────────────────────────

  it('renders from-spare toggle on expense when spareMoney > 0', () => {
    mockSpareMoney = 5000;
    renderSheet();
    expect(screen.getByTestId('from-spare-toggle')).toBeTruthy();
  });

  it('hides from-spare toggle when spareMoney <= 0', () => {
    mockSpareMoney = 0;
    renderSheet();
    expect(screen.queryByTestId('from-spare-toggle')).toBeNull();
  });

  it('hides from-spare toggle on income type even when spareMoney > 0', async () => {
    mockSpareMoney = 5000;
    renderSheet();
    await act(async () => { screen.getByText('Income').click(); });
    expect(screen.queryByTestId('from-spare-toggle')).toBeNull();
  });

  it('toggle defaults to off (aria-pressed=false) on fresh add', () => {
    renderSheet();
    expect(screen.getByTestId('from-spare-toggle').getAttribute('aria-pressed')).toBe('false');
  });

  it('threads from_spare:true to addTransaction when toggled on', async () => {
    renderSheet();
    await act(async () => { fireEvent.change(screen.getByTestId('add-amount-input'), { target: { value: '100' } }); });
    await act(async () => { screen.getByTestId('from-spare-toggle').click(); });
    await act(async () => { screen.getByText('Save').click(); });
    expect(mockAddTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ from_spare: true })
    );
  });

  it('threads from_spare:false to addTransaction when toggle untouched', async () => {
    renderSheet();
    await act(async () => { fireEvent.change(screen.getByTestId('add-amount-input'), { target: { value: '100' } }); });
    await act(async () => { screen.getByText('Save').click(); });
    expect(mockAddTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ from_spare: false })
    );
  });

  it('pre-fills toggle from editTx.from_spare', () => {
    const editTx = { id:'tx-1', type:'expense', amount:200, category_name:'Groceries', category_id:'cat-1', description:'', date:'2026-05-20', from_spare:true };
    renderSheet({ editTx });
    expect(screen.getByTestId('from-spare-toggle').getAttribute('aria-pressed')).toBe('true');
  });

  it('threads from_spare to updateTransaction on edit save', async () => {
    const editTx = { id:'tx-1', type:'expense', amount:200, category_name:'Groceries', category_id:'cat-1', description:'', date:'2026-05-20', from_spare:false };
    renderSheet({ editTx });
    await act(async () => { screen.getByTestId('from-spare-toggle').click(); });
    await act(async () => { screen.getByText('Save Changes').click(); });
    expect(mockUpdateTransaction).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ from_spare: true })
    );
  });

  it('edit-mode exception: shows toggle even when spareMoney <= 0 if editTx.from_spare is true', () => {
    mockSpareMoney = 0;
    const editTx = { id:'tx-1', type:'expense', amount:200, category_name:'Groceries', category_id:'cat-1', description:'', date:'2026-05-20', from_spare:true };
    renderSheet({ editTx });
    expect(screen.getByTestId('from-spare-toggle')).toBeTruthy();
  });

  it('edit-mode exception: toggle stays visible after flipping off, within the session', async () => {
    mockSpareMoney = 0;
    const editTx = { id:'tx-1', type:'expense', amount:200, category_name:'Groceries', category_id:'cat-1', description:'', date:'2026-05-20', from_spare:true };
    renderSheet({ editTx });
    await act(async () => { screen.getByTestId('from-spare-toggle').click(); });
    expect(screen.getByTestId('from-spare-toggle')).toBeTruthy();
    expect(screen.getByTestId('from-spare-toggle').getAttribute('aria-pressed')).toBe('false');
  });
});
