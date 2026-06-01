/**
 * views/BudgetView.test.jsx
 * Written before BudgetView.jsx — TDD.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter }             from 'react-router-dom';
import { BudgetView }               from './BudgetView';
import { getCurrentMonth, offsetMonth } from '../lib/finance';
import { mockCentre, mockFmt, mockCategories, mockPrevMonthCategories, mockCategorySpend } from '../test-utils/fixtures';

// Mutable so tests can flip `categories` empty to exercise the rollforward state.
const mockBudgetCentre = {
  centre:                  mockCentre,
  fmt:                     mockFmt,
  categories:              mockCategories,
  getCatIcon:              (name) => name === 'Groceries' ? '🛒' : '🚗',
  prevMonthCategories:     [],
  loadPrevMonthCategories: vi.fn().mockResolvedValue({ data: [], error: null }),
  copyCategoriesToMonth:   vi.fn().mockResolvedValue({ data: [], error: null }),
};

vi.mock('../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => mockBudgetCentre,
}));

const mockFinance = {
  loading:       false,
  error:         null,
  categorySpend: mockCategorySpend,
  fixedTotal:    700,
  fixedSpent:    200,
  activeMonth:   getCurrentMonth(),   // matches clock → mount-reset effect is a no-op
  loadMonth:     vi.fn(),             // Commit 0: BudgetView resets activeMonth on mount
};

vi.mock('../context/FinanceContext', () => ({
  useFinanceContext: () => mockFinance,
}));

const renderView = () => render(<MemoryRouter><BudgetView /></MemoryRouter>);

const resetCats = () => { mockBudgetCentre.categories = mockCategories; mockBudgetCentre.prevMonthCategories = []; };

describe('BudgetView', () => {
  it('shows skeleton when loading', () => {
    mockFinance.loading = true;
    const { container } = renderView();
    expect(container.firstChild).toBeTruthy();
    mockFinance.loading = false;
  });

  it('shows the current month label at the top of the view', () => {
    renderView();
    const expected = new Date(getCurrentMonth() + '-01')
      .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    expect(screen.getByTestId('budget-month-label').textContent).toContain(expected);
  });

  it('shows total planned budget', () => {
    renderView();
    expect(screen.getByTestId('budget-total-planned').textContent).toBe('GHS 700');
  });

  it('shows total fixed spent', () => {
    renderView();
    expect(screen.getByTestId('budget-total-spent').textContent).toBe('GHS 200');
  });

  it('shows all category names', () => {
    renderView();
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('Transport')).toBeTruthy();
  });

  it('shows error state when error set', () => {
    mockFinance.error = 'Failed to load';
    renderView();
    expect(screen.getByText(/Failed to load/)).toBeTruthy();
    mockFinance.error = null;
  });

  it('sorts categories by pctUsed descending — most urgent first', () => {
    renderView();
    const rows = screen.getAllByText(/Groceries|Transport/);
    expect(rows[0].textContent).toContain('Groceries');
  });

  // ── Phase 2C budget rollforward empty-state ───────────────────────────────
  it('rollforward State 3: shows "Yes, copy N categories" when the previous month had categories', () => {
    mockBudgetCentre.categories          = [];
    mockBudgetCentre.prevMonthCategories = mockPrevMonthCategories;   // 3 categories
    renderView();
    expect(screen.getByText(/Budget same as/)).toBeTruthy();
    expect(screen.getByTestId('copy-all-categories-btn').textContent).toBe('Yes, copy 3 categories');
    expect(screen.getByTestId('choose-which-categories-btn')).toBeTruthy();
    resetCats();
  });

  it('rollforward State 1: an empty previous month shows add-only (no copy CTA)', () => {
    mockBudgetCentre.categories          = [];
    mockBudgetCentre.prevMonthCategories = [];
    renderView();
    expect(screen.getByText(/No budget set for/)).toBeTruthy();
    expect(screen.queryByTestId('copy-all-categories-btn')).toBeNull();
    expect(screen.getByTestId('add-category-manually-btn')).toBeTruthy();
    resetCats();
  });

  it('loads the previous month\'s categories when the current budget is empty', async () => {
    const loadFn = vi.fn().mockResolvedValue({ data: mockPrevMonthCategories, error: null });
    mockBudgetCentre.categories              = [];
    mockBudgetCentre.prevMonthCategories     = mockPrevMonthCategories;
    mockBudgetCentre.loadPrevMonthCategories = loadFn;
    renderView();
    const prevMonth = offsetMonth(getCurrentMonth(), -1);
    await waitFor(() => expect(loadFn).toHaveBeenCalledWith(prevMonth));
    mockBudgetCentre.loadPrevMonthCategories = vi.fn().mockResolvedValue({ data: [], error: null });
    resetCats();
  });

  it('tapping "Yes, copy N" calls copyCategoriesToMonth(prevMonth, currentMonth) with no subset', async () => {
    const copyFn = vi.fn().mockResolvedValue({ data: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }], error: null });
    mockBudgetCentre.categories            = [];
    mockBudgetCentre.prevMonthCategories   = mockPrevMonthCategories;
    mockBudgetCentre.copyCategoriesToMonth = copyFn;
    renderView();
    fireEvent.click(screen.getByTestId('copy-all-categories-btn'));
    const currentMonth = getCurrentMonth();
    const prevMonth    = offsetMonth(currentMonth, -1);
    await waitFor(() => expect(copyFn).toHaveBeenCalledWith(prevMonth, currentMonth, undefined));
    mockBudgetCentre.copyCategoriesToMonth = vi.fn().mockResolvedValue({ data: [], error: null });
    resetCats();
  });

  it('tapping "Choose which to copy" opens the multi-select sheet', () => {
    mockBudgetCentre.categories          = [];
    mockBudgetCentre.prevMonthCategories = mockPrevMonthCategories;
    renderView();
    fireEvent.click(screen.getByTestId('choose-which-categories-btn'));
    expect(screen.getByTestId('copy-categories-sheet')).toBeTruthy();
    resetCats();
  });

  // ── Commit 0: activeMonth reset on mount (throwaway band-aid; removed when cycles ship) ──
  it('resets activeMonth to the current month on mount when they disagree', () => {
    mockFinance.activeMonth = offsetMonth(getCurrentMonth(), -1);   // stale, regardless of run date
    mockFinance.loadMonth   = vi.fn();
    renderView();
    expect(mockFinance.loadMonth).toHaveBeenCalledWith(getCurrentMonth());
    mockFinance.activeMonth = getCurrentMonth();                    // restore shared mock
  });

  it('does not reload when activeMonth already matches the current month', () => {
    mockFinance.activeMonth = getCurrentMonth();
    mockFinance.loadMonth   = vi.fn();
    renderView();
    expect(mockFinance.loadMonth).not.toHaveBeenCalled();
  });
});
