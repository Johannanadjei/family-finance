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
const mockAddIncomeSource    = vi.fn().mockResolvedValue({ error: null });
const mockDeleteIncomeSource = vi.fn().mockResolvedValue({ error: null });

vi.mock('../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({
    centre:         mockCentre,
    fmt:            mockFmt,
    categories:     mockCategories,
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
  }),
}));

vi.mock('../lib/themes', () => ({ applyTheme: vi.fn() }));

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
});
