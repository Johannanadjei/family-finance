/**
 * views/budget/BudgetPeriodCreator.test.jsx
 *
 * The Phase B period-creation cluster: mounts the passive prompt + the creator sheet,
 * reads cycles/createPeriod from FinanceContext, and on a successful create closes the
 * sheet and (when asked) signals the parent to open its copy sheet.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BudgetPeriodCreator } from './BudgetPeriodCreator';

// The quick range is nextCalendarMonthRange(getToday()) — derived from the real
// clock, NOT from cycles. Pin today to mid-June 2026 so "next month" is
// deterministically July 2026 on any run date. (waitFor needs shouldAdvanceTime.)
const CYCLES = [{ id: 'jun', start_date: '2026-06-01', end_date: '2026-06-30', deleted_at: null }];
let mockFinance;
vi.mock('../../context/FinanceContext', () => ({ useFinanceContext: () => mockFinance }));
// useResetPeriod (mounted here) reads reloadCategories from BudgetCentreContext.
const mockReloadCategories = vi.fn().mockResolvedValue(undefined);
vi.mock('../../context/BudgetCentreContext', () => ({ useBudgetCentreContext: () => ({ reloadCategories: mockReloadCategories }) }));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-06-15T00:00:00Z'));
  mockFinance = {
    cycles: CYCLES,
    createPeriod: vi.fn().mockResolvedValue({ data: { id: 'new' }, error: null }),
    resetPeriod: vi.fn().mockResolvedValue({ data: { categories_reset: 0, transactions_reset: 0 }, error: null }),
  };
});

afterEach(() => {
  vi.useRealTimers();
});

const base = { isOpen: false, onOpenChange: vi.fn(), onCopyRequested: vi.fn(), resetCycle: null, onResetDone: vi.fn() };
const renderIt = (props = {}) => render(<BudgetPeriodCreator {...base} {...props} />);

describe('BudgetPeriodCreator', () => {
  it('renders the passive prompt when no live cycle covers today', () => {
    mockFinance.cycles = [{ id: 'old', start_date: '2000-01-01', end_date: '2000-12-31', deleted_at: null }];
    renderIt();
    expect(screen.getByTestId('no-current-period-prompt')).toBeTruthy();
  });

  it('mounts the creator sheet when open', () => {
    renderIt({ isOpen: true });
    expect(screen.getByTestId('create-period-sheet')).toBeTruthy();
  });

  it('on successful create it closes the sheet (no copy when toggle off)', async () => {
    const onOpenChange = vi.fn(), onCopyRequested = vi.fn();
    renderIt({ isOpen: true, onOpenChange, onCopyRequested });
    fireEvent.click(screen.getByTestId('quick-next-month-btn'));   // copyPrevious: false
    await waitFor(() => expect(mockFinance.createPeriod).toHaveBeenCalledWith({
      name: null, startDate: '2026-07-01', endDate: '2026-07-31',
    }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCopyRequested).not.toHaveBeenCalled();
  });

  it('requests the copy sheet after create when the custom toggle is on', async () => {
    const onOpenChange = vi.fn(), onCopyRequested = vi.fn();
    renderIt({ isOpen: true, onOpenChange, onCopyRequested });
    fireEvent.click(screen.getByTestId('custom-period-btn'));
    fireEvent.click(screen.getByTestId('copy-prev-toggle'));
    fireEvent.click(screen.getByTestId('period-save-btn'));
    await waitFor(() => expect(onCopyRequested).toHaveBeenCalledTimes(1));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not close or request copy when the create fails', async () => {
    mockFinance.createPeriod = vi.fn().mockResolvedValue({ data: null, error: { code: 'CYC01' } });
    const onOpenChange = vi.fn(), onCopyRequested = vi.fn();
    renderIt({ isOpen: true, onOpenChange, onCopyRequested });
    fireEvent.click(screen.getByTestId('quick-next-month-btn'));
    await waitFor(() => expect(mockFinance.createPeriod).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onCopyRequested).not.toHaveBeenCalled();
  });

  // ── Reset modal (hosted here, triggered by BudgetHeader's lifted resetCycle) ──
  it('does not show the reset confirm when resetCycle is null', () => {
    renderIt({ resetCycle: null });
    expect(screen.queryByText(/^Reset /)).toBeNull();
  });

  it('shows the reset confirm naming the cycle when resetCycle is set', () => {
    renderIt({ resetCycle: { id: 'jul', name: 'July 2026', start_date: '2026-07-01', end_date: '2026-07-31' } });
    expect(screen.getByText('Reset July 2026?')).toBeTruthy();
    expect(screen.getByText('Reset')).toBeTruthy();
  });

  it('confirming the reset calls resetPeriod with the cycle id and clears the target', async () => {
    const onResetDone = vi.fn();
    renderIt({ resetCycle: { id: 'jul', name: 'July 2026', start_date: '2026-07-01', end_date: '2026-07-31' }, onResetDone });
    fireEvent.click(screen.getByText('Reset'));
    expect(onResetDone).toHaveBeenCalledTimes(1);   // optimistic close
    await waitFor(() => expect(mockFinance.resetPeriod).toHaveBeenCalledWith('jul'));
  });
});
