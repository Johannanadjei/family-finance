/**
 * views/budget/BudgetPeriodCreator.test.jsx
 *
 * The Phase B period-creation cluster: mounts the passive prompt + the creator sheet,
 * reads cycles/createPeriod from FinanceContext, and on a successful create closes the
 * sheet and (when asked) signals the parent to open its copy sheet.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BudgetPeriodCreator } from './BudgetPeriodCreator';

// Latest live cycle ends 2026-06-30 → quick "next month" = July 2026 (deterministic),
// and it does NOT cover today, so the passive prompt shows.
const CYCLES = [{ id: 'jun', start_date: '2026-06-01', end_date: '2026-06-30', deleted_at: null }];
let mockFinance;
vi.mock('../../context/FinanceContext', () => ({ useFinanceContext: () => mockFinance }));

beforeEach(() => {
  mockFinance = { cycles: CYCLES, createPeriod: vi.fn().mockResolvedValue({ data: { id: 'new' }, error: null }) };
});

const base = { isOpen: false, onOpenChange: vi.fn(), onCopyRequested: vi.fn() };
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
});
