/**
 * views/SettingsView.test.jsx
 * Written before SettingsView.jsx — TDD.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent }        from '@testing-library/react';
import { MemoryRouter }                          from 'react-router-dom';
import { SettingsView }                          from './SettingsView';
import { mockCentre, mockFmt, mockCategories, mockIncomes } from '../test-utils/fixtures';

const mockUpdateCentre       = vi.fn().mockResolvedValue({ error: null });
const mockUpdateCategory     = vi.fn().mockResolvedValue({ error: null });
const mockDeleteCategory     = vi.fn().mockResolvedValue({ error: null });
const mockAddCategory        = vi.fn().mockResolvedValue({ error: null });
const mockAddIncomeSource    = vi.fn().mockResolvedValue({ error: null });
const mockDeleteIncomeSource = vi.fn().mockResolvedValue({ error: null });
const mockSignOut            = vi.fn().mockResolvedValue(undefined);

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: null, loading: false, signOut: mockSignOut }),
}));

vi.mock('../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({
    centre:         mockCentre,
    fmt:            mockFmt,
    categories:     mockCategories,
    addCategory:    mockAddCategory,
    updateCentre:   mockUpdateCentre,
    updateCategory: mockUpdateCategory,
    deleteCategory: mockDeleteCategory,
  }),
}));

vi.mock('../context/FinanceContext', () => ({
  useFinanceContext: () => ({
    incomes:             mockIncomes,
    loading:             false,
    prefs:               { themeSkin: 'family_warmth' },
    saveThemeSkin:       vi.fn(),
    addIncomeSource:     mockAddIncomeSource,
    deleteIncomeSource:  mockDeleteIncomeSource,
    userPlan:            'free',
  }),
}));

vi.mock('../lib/themes', () => ({ applyTheme: vi.fn() }));

vi.mock('../services/guests.service', () => ({
  getGuestUsers:   vi.fn().mockResolvedValue({ data: [], error: null }),
  createGuestUser: vi.fn().mockResolvedValue({ data: null, error: null }),
  updateGuestUser: vi.fn().mockResolvedValue({ data: null, error: null }),
  setGuestActive:  vi.fn().mockResolvedValue({ data: null, error: null }),
  deleteGuestUser: vi.fn().mockResolvedValue({ error: null }),
}));

const renderSettings = () =>
  render(<MemoryRouter><SettingsView /></MemoryRouter>);

describe('SettingsView', () => {
  beforeEach(() => {
    mockAddIncomeSource.mockClear();
    mockDeleteIncomeSource.mockClear();
  });

  it('renders Settings heading', () => {
    renderSettings();
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('renders Budget Centre section', () => {
    renderSettings();
    expect(screen.getByTestId('centre-name-display')).toBeTruthy();
  });

  it('renders all categories', () => {
    renderSettings();
    expect(screen.getByTestId('cat-name-cat-1')).toBeTruthy();
    expect(screen.getByTestId('cat-name-cat-2')).toBeTruthy();
  });

  it('renders all income sources', () => {
    renderSettings();
    expect(screen.getByTestId('income-label-inc-1')).toBeTruthy();
    expect(screen.getByTestId('income-label-inc-2')).toBeTruthy();
  });

  it('renders theme section', () => {
    renderSettings();
    expect(screen.getByTestId('theme-family_warmth')).toBeTruthy();
  });

  it('shows add income source form when Add tapped', async () => {
    renderSettings();
    await act(async () => { screen.getByTestId('add-income-source-btn').click(); });
    expect(screen.getByTestId('new-source-label')).toBeTruthy();
    expect(screen.getByTestId('new-source-amount')).toBeTruthy();
    expect(screen.getByTestId('new-source-pay-day-type')).toBeTruthy();
  });

  it('shows pay day input only when fixed_date selected', async () => {
    renderSettings();
    await act(async () => { screen.getByTestId('add-income-source-btn').click(); });
    expect(screen.queryByTestId('new-source-pay-day')).toBeNull();
    await act(async () => {
      fireEvent.change(screen.getByTestId('new-source-pay-day-type'), { target: { value: 'fixed_date' } });
    });
    expect(screen.getByTestId('new-source-pay-day')).toBeTruthy();
  });

  it('calls addIncomeSource with pay_day_type on save', async () => {
    renderSettings();
    await act(async () => { screen.getByTestId('add-income-source-btn').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('new-source-label'), { target: { value: 'Salary' } });
      fireEvent.change(screen.getByTestId('new-source-pay-day-type'), { target: { value: 'last_working_day' } });
    });
    await act(async () => { screen.getByTestId('save-income-source-btn').click(); });
    expect(mockAddIncomeSource).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Salary', pay_day_type: 'last_working_day', pay_day: null })
    );
  });

  it('calls addIncomeSource with label when new source saved', async () => {
    renderSettings();
    await act(async () => { screen.getByTestId('add-income-source-btn').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('new-source-label'), { target: { value: 'Freelance' } });
    });
    await act(async () => { screen.getByTestId('save-income-source-btn').click(); });
    expect(mockAddIncomeSource).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Freelance' })
    );
  });

  it('shows validation error if source label is empty on save', async () => {
    renderSettings();
    await act(async () => { screen.getByTestId('add-income-source-btn').click(); });
    await act(async () => { screen.getByTestId('save-income-source-btn').click(); });
    expect(screen.getByText(/Please enter a source name/)).toBeTruthy();
  });

  it('hides add form after successful source save', async () => {
    renderSettings();
    await act(async () => { screen.getByTestId('add-income-source-btn').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('new-source-label'), { target: { value: 'Freelance' } });
    });
    await act(async () => { screen.getByTestId('save-income-source-btn').click(); });
    expect(screen.queryByTestId('new-source-label')).toBeNull();
  });

  it('shows error when fixed_date pay day is out of range', async () => {
    renderSettings();
    await act(async () => { screen.getByTestId('add-income-source-btn').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('new-source-label'), { target: { value: 'Salary' } });
      fireEvent.change(screen.getByTestId('new-source-pay-day-type'), { target: { value: 'fixed_date' } });
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('new-source-pay-day'), { target: { value: '50' } });
    });
    await act(async () => { screen.getByTestId('save-income-source-btn').click(); });
    expect(screen.getByText('Please enter a day between 1 and 31')).toBeTruthy();
    expect(mockAddIncomeSource).not.toHaveBeenCalled();
  });
});
