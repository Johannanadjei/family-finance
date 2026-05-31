/**
 * views/PaydayView.test.jsx
 * Reads financeValues from FinanceContext — no props.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { MemoryRouter }             from 'react-router-dom';
import { PaydayView }               from './PaydayView';
import { mockCentre, mockFmt, mockIncomes } from '../test-utils/fixtures';

vi.mock('../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ centre: mockCentre, fmt: mockFmt, can: () => true }),
}));

// Base finance context — overridden per test via mockFinance
const mockFinance = {
  loading:        false,
  error:          null,
  incomes:        mockIncomes,
  txs:            [],
  totalReceived:  30000,
  totalExpected:  45000,
  totalPending:   15000,
  totalIncome:    0,
  activeMonth:    '2026-05',
  loadMonth:      vi.fn(),
  markReceived:   vi.fn().mockResolvedValue({ error: null }),
  markPending:    vi.fn().mockResolvedValue({ error: null }),
  updateExpectedAmount: vi.fn().mockResolvedValue({ error: null }),
};

vi.mock('../context/FinanceContext', () => ({
  useFinanceContext: () => mockFinance,
}));

const renderView = () => render(<MemoryRouter><PaydayView /></MemoryRouter>);

describe('PaydayView', () => {
  it('shows skeleton when loading', () => {
    mockFinance.loading = true;
    const { container } = renderView();
    expect(container.firstChild).toBeTruthy();
    mockFinance.loading = false;
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

  it('no longer shows the legacy historical-data warning on a past month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T00:00:00Z'));
    mockFinance.activeMonth = '2026-04';
    renderView();
    expect(screen.queryByText(/reflects current state/)).toBeNull();
    mockFinance.activeMonth = '2026-05';
    vi.useRealTimers();
  });

  it('derives the Received total from transactions on a past month (changes between months)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T00:00:00Z'));
    mockFinance.activeMonth  = '2026-04';
    mockFinance.totalIncome  = 12000; // April income, from txs
    mockFinance.txs          = [{ id: 'tx-i', type: 'income', amount: 12000, category_name: 'Adjei Salary' }];
    renderView();
    const received = screen.getByTestId('payday-total-received').textContent;
    expect(received).toBe('GHS 12,000');
    // proves month-awareness: NOT the current-month income_sources total (30,000)
    expect(received).not.toBe('GHS 30,000');
    // past-month read-only card renders from the transaction
    expect(screen.getByText('Adjei Salary')).toBeTruthy();
    // Pending half is omitted on past months
    expect(screen.queryByTestId('payday-total-pending')).toBeNull();
    mockFinance.activeMonth = '2026-05';
    mockFinance.totalIncome = 0;
    mockFinance.txs         = [];
    vi.useRealTimers();
  });

  it('shows empty state for a past month with no income transactions', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T00:00:00Z'));
    mockFinance.activeMonth = '2026-04';
    mockFinance.txs         = [];
    renderView();
    expect(screen.getByText(/No income recorded for/)).toBeTruthy();
    mockFinance.activeMonth = '2026-05';
    vi.useRealTimers();
  });

  it('shows empty state and no totals for a future month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T00:00:00Z'));
    mockFinance.activeMonth = '2026-06';
    renderView();
    expect(screen.getByText(/No payday data for/)).toBeTruthy();
    expect(screen.queryByTestId('payday-total-received')).toBeNull();
    expect(screen.queryByTestId('payday-total-pending')).toBeNull();
    mockFinance.activeMonth = '2026-05';
    vi.useRealTimers();
  });

  it('shows empty state when no income sources', () => {
    mockFinance.incomes = [];
    renderView();
    expect(screen.getByText(/No income tracked for/)).toBeTruthy();
    expect(screen.getByTestId('add-manually-btn')).toBeTruthy();
    mockFinance.incomes = mockIncomes;
  });

  it('shows error state when error is set', () => {
    mockFinance.error = 'Failed to load';
    renderView();
    expect(screen.getByText(/Failed to load/)).toBeTruthy();
    mockFinance.error = null;
  });

  it('shows previous month navigation button', () => {
    renderView();
    expect(screen.getByLabelText('Previous month')).toBeTruthy();
  });

  it('shows next month navigation button disabled when current month', () => {
    renderView();
    expect(screen.getByLabelText('Next month').disabled).toBe(true);
  });
});
