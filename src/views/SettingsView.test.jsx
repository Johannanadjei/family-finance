/**
 * views/SettingsView.test.jsx
 * Written before SettingsView.jsx — TDD.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent }        from '@testing-library/react';
import { MemoryRouter }                          from 'react-router-dom';
import { SettingsView }                          from './SettingsView';
import { mockCentre, mockFmt, mockCategories, mockIncomes } from '../test-utils/fixtures';
import { getCurrentMonth } from '../lib/dates';

const mockUpdateCentre       = vi.fn().mockResolvedValue({ error: null });
const mockUpdateCategory     = vi.fn().mockResolvedValue({ error: null });
const mockDeleteCategory     = vi.fn().mockResolvedValue({ error: null });
const mockAddCategory        = vi.fn().mockResolvedValue({ error: null });
const mockAddIncomeSource    = vi.fn().mockResolvedValue({ error: null });
const mockDeleteIncomeSource = vi.fn().mockResolvedValue({ error: null });
const mockUpdateIncomeSource = vi.fn().mockResolvedValue({ error: null });
const mockSignOut            = vi.fn().mockResolvedValue(undefined);
const mockGetInvites         = vi.fn().mockResolvedValue({ data: [], error: null });
const mockInviteMember       = vi.fn().mockResolvedValue({ data: { token: 'tok' }, error: null });
const mockRemoveMember       = vi.fn().mockResolvedValue({ error: null });
const mockCancelInvite       = vi.fn().mockResolvedValue({ error: null });
const mockCan                = vi.fn().mockReturnValue(true);

// Mutable so cap tests can swap in a 10-category slice / Pro plan.
let mockCats = mockCategories;
let mockPlan = 'free';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: null, loading: false, signOut: mockSignOut }),
}));

// PlanSection (slotted after CentreSettingsSection) reads SubscriptionContext.
vi.mock('../context/SubscriptionContext', () => ({
  useSubscriptionContext: () => ({ isPro: false }),
}));

vi.mock('../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({
    centre:            mockCentre,
    fmt:               mockFmt,
    categories:        mockCats,
    addCategory:       mockAddCategory,
    updateCentre:      mockUpdateCentre,
    updateCategory:    mockUpdateCategory,
    deleteCategory:    mockDeleteCategory,
    members:           [],
    currentMemberRole: 'owner',
    can:               mockCan,
    inviteMember:      mockInviteMember,
    removeMember:      mockRemoveMember,
    getInvites:        mockGetInvites,
    cancelInvite:      mockCancelInvite,
  }),
}));

vi.mock('../context/FinanceContext', () => ({
  useFinanceContext: () => ({
    incomes:             mockIncomes,
    allIncomes:          mockIncomes,
    viewedCycleId:       'cyc-this',
    loading:             false,
    prefs:               { themeSkin: 'family_warmth' },
    saveThemeSkin:       vi.fn(),
    addIncomeSource:     mockAddIncomeSource,
    deleteIncomeSource:  mockDeleteIncomeSource,
    updateIncomeSource:  mockUpdateIncomeSource,
    get userPlan()       { return mockPlan; },
  }),
}));

vi.mock('../lib/themes', () => ({ applyTheme: vi.fn() }));

vi.mock('../lib/pwa', () => ({
  getInstallPrompt:   vi.fn(() => null),
  triggerInstall:     vi.fn(async () => ({ outcome: 'dismissed' })),
  clearInstallPrompt: vi.fn(),
}));

// InstallAppSection uses window.matchMedia at module level
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockReturnValue({ matches: false, media: '', onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }),
});

vi.mock('../context/PinContext', () => ({
  usePinContext: () => ({
    hasPinSetup:  false,
    pinUnlocked:  true,
    verifyPin:    vi.fn(),
    setupPin:     vi.fn(),
    removePin:    vi.fn(),
  }),
}));

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
    mockAddCategory.mockClear();
    mockCats = mockCategories;
    mockPlan = 'free';
  });

  it('renders Settings heading', () => {
    renderSettings();
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('renders BOS Hub section', () => {
    renderSettings();
    expect(screen.getByTestId('centre-name-display')).toBeTruthy();
  });

  it('renders the Legal footer section', () => {
    renderSettings();
    expect(screen.getByTestId('settings-legal-section')).toBeTruthy();
    expect(screen.getByTestId('settings-legal-link-privacy')).toBeTruthy();
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

  // T4 (Phase 2A) — income sources are grouped under a month section header,
  // and the current month is expanded by default. Collapsing hides its rows.
  it('groups income sources under a month section, expanded by default', () => {
    renderSettings();
    expect(screen.getByTestId(`income-month-header-${getCurrentMonth()}`)).toBeTruthy();
    expect(screen.getByTestId('income-label-inc-1')).toBeTruthy();   // visible while expanded
  });

  it('collapsing a month section hides its income rows', () => {
    renderSettings();
    fireEvent.click(screen.getByTestId(`income-month-header-${getCurrentMonth()}`));
    expect(screen.queryByTestId('income-label-inc-1')).toBeNull();
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

  // Commit 14a — adding a category from Settings threads the viewed cycle id
  // (from FinanceContext) to addCategory as the second arg, so the DB write
  // stamps cycle_id explicitly rather than relying on the trigger.
  it('passes viewedCycleId to addCategory when a category is added', async () => {
    renderSettings();
    await act(async () => { screen.getByTestId('add-category-btn').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('add-cat-name-input'),   { target: { value: 'School Fees' } });
      fireEvent.change(screen.getByTestId('add-cat-amount-input'), { target: { value: '300' } });
    });
    await act(async () => { screen.getByText('Save').click(); });
    expect(mockAddCategory).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'School Fees' }),
      'cyc-this',
    );
  });

  // ── Category cap (CAT01) ──────────────────────────────────────────────────
  it('free under cap: shows "N of 10" and the + Add button', () => {
    renderSettings();
    expect(screen.getByTestId('category-count').textContent).toBe('2 of 10');
    expect(screen.getByTestId('add-category-btn')).toBeTruthy();
    expect(screen.queryByTestId('upgrade-categories-btn')).toBeNull();
  });

  it('free at cap (10 categories): shows Upgrade to Pro and opens the modal', async () => {
    mockCats = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`, name: `Cat ${i}`, icon: '🛒', budget_amount: 10, is_fixed: true, sort_order: i, month: getCurrentMonth(), cycle_id: 'cyc-this',
    }));
    renderSettings();
    expect(screen.getByTestId('category-count').textContent).toBe('10 of 10');
    expect(screen.queryByTestId('add-category-btn')).toBeNull();
    await act(async () => { screen.getByTestId('upgrade-categories-btn').click(); });
    expect(screen.getByText(/category limit for this period/)).toBeTruthy();
  });

  it('pro: shows "N categories" and the + Add button (never gated)', () => {
    mockPlan = 'pro';
    renderSettings();
    expect(screen.getByTestId('category-count').textContent).toBe('2 categories');
    expect(screen.getByTestId('add-category-btn')).toBeTruthy();
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
