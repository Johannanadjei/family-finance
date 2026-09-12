/**
 * views/settings/IncomeSourcesSection.test.jsx
 *
 * Income sources group by BUDGET PERIOD (cycle_id), never by month. The
 * two-same-month cases below are the point of the whole rework: under the old
 * month grouping they merged into one section and one period's income became
 * unreachable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent }       from '@testing-library/react';
import { IncomeSourcesSection }                 from './IncomeSourcesSection';
import {
  mockCentre, mockFmt, mockIncomes, mockCycles,
  mockSplitMonthCycles, mockSplitMonthIncomes, mockOrphanIncome,
} from '../../test-utils/fixtures';

const mockAddIncomeSource    = vi.fn().mockResolvedValue({ error: null });
const mockMoveIncomeSource   = vi.fn().mockResolvedValue({ error: null });
const mockDeleteIncomeSource = vi.fn().mockResolvedValue({ error: null });
const mockUpdateIncomeSource = vi.fn().mockResolvedValue({ error: null });

let financeValue;

vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ fmt: mockFmt, centre: mockCentre }),
}));

vi.mock('../../context/FinanceContext', () => ({
  useFinanceContext: () => financeValue,
}));

const THIS_CYCLE = mockCycles[0].id;   // 'cyc-this' — contains today
const LAST_CYCLE = mockCycles[1].id;   // 'cyc-last'

beforeEach(() => {
  mockAddIncomeSource.mockClear();
  mockMoveIncomeSource.mockClear().mockResolvedValue({ error: null });
  financeValue = {
    allIncomes:         mockIncomes,            // both fixtures sit in cyc-this
    cycles:             mockCycles,
    activeCycleId:      THIS_CYCLE,
    loading:            false,
    addIncomeSource:    mockAddIncomeSource,
    deleteIncomeSource: mockDeleteIncomeSource,
    updateIncomeSource: mockUpdateIncomeSource,
    moveIncomeSourceToCycle: mockMoveIncomeSource,
  };
});

describe('IncomeSourcesSection', () => {
  it('groups sources under a period header, the active period expanded by default', () => {
    render(<IncomeSourcesSection />);
    expect(screen.getByTestId(`income-period-header-${THIS_CYCLE}`)).toBeTruthy();
    expect(screen.getByTestId('income-label-inc-1')).toBeTruthy();
  });

  it('labels the group with the period name and its date range', () => {
    render(<IncomeSourcesSection />);
    const header = screen.getByTestId(`income-period-header-${THIS_CYCLE}`);
    expect(header.textContent).toContain(mockCycles[0].name);
    expect(header.textContent).toContain('This period');
  });

  it('shows the empty state when there are no sources', () => {
    financeValue.allIncomes = [];
    render(<IncomeSourcesSection />);
    expect(screen.getByText('No income sources yet')).toBeTruthy();
  });

  it('omits periods that have no income sources', () => {
    render(<IncomeSourcesSection />);
    expect(screen.queryByTestId(`income-period-header-${LAST_CYCLE}`)).toBeNull();
  });

  it('renders a separate collapsed section per period, hiding non-active rows', () => {
    financeValue.allIncomes = [
      ...mockIncomes,
      { ...mockIncomes[0], id: 'old-1', label: 'Old Salary', cycle_id: LAST_CYCLE },
    ];
    render(<IncomeSourcesSection />);
    expect(screen.getByTestId(`income-period-header-${THIS_CYCLE}`)).toBeTruthy();
    expect(screen.getByTestId(`income-period-header-${LAST_CYCLE}`)).toBeTruthy();
    expect(screen.queryByTestId('income-label-old-1')).toBeNull();   // non-active collapsed
  });

  it('expands a collapsed period on tap', () => {
    financeValue.allIncomes = [
      ...mockIncomes,
      { ...mockIncomes[0], id: 'old-1', label: 'Old Salary', cycle_id: LAST_CYCLE },
    ];
    render(<IncomeSourcesSection />);
    fireEvent.click(screen.getByTestId(`income-period-header-${LAST_CYCLE}`));
    expect(screen.getByTestId('income-label-old-1')).toBeTruthy();
  });

  // ── The regression this whole workstream exists to prevent ─────────────────
  describe('two periods starting in the SAME month', () => {
    beforeEach(() => {
      financeValue.cycles        = mockSplitMonthCycles;
      financeValue.allIncomes    = mockSplitMonthIncomes;
      financeValue.activeCycleId = 'cyc-sep-a';
    });

    it('renders them as TWO separate groups, not one merged month', () => {
      render(<IncomeSourcesSection />);
      expect(screen.getByTestId('income-period-group-cyc-sep-a')).toBeTruthy();
      expect(screen.getByTestId('income-period-group-cyc-sep-b')).toBeTruthy();
    });

    it('gives each group its own distinct period name', () => {
      render(<IncomeSourcesSection />);
      const a = screen.getByTestId('income-period-header-cyc-sep-a').textContent;
      const b = screen.getByTestId('income-period-header-cyc-sep-b').textContent;
      expect(a).toContain(mockSplitMonthCycles[0].name);
      expect(b).toContain(mockSplitMonthCycles[1].name);
      expect(a).not.toBe(b);
    });

    it('files each source under its OWN period — neither one disappears', () => {
      render(<IncomeSourcesSection />);
      // The active period is expanded; open the other one too.
      fireEvent.click(screen.getByTestId('income-period-header-cyc-sep-b'));
      expect(screen.getByTestId('income-label-sp-1')).toBeTruthy();
      expect(screen.getByTestId('income-label-sp-2')).toBeTruthy();
    });
  });

  // ── Unallocated group — rows pointing at no live period ────────────────────
  describe('sources with no live period', () => {
    beforeEach(() => {
      financeValue.allIncomes = [...mockIncomes, mockOrphanIncome];
    });

    it('collects them under a "Not in any period" group, expanded by default', () => {
      render(<IncomeSourcesSection />);
      const header = screen.getByTestId('income-period-header-__unallocated__');
      expect(header.textContent).toContain('Not in any period');
      expect(screen.getByTestId('income-label-orph-1')).toBeTruthy();   // visible without a tap
    });

    it('explains why they are invisible in Payday', () => {
      render(<IncomeSourcesSection />);
      expect(screen.getByText(/don't show up in Payday/)).toBeTruthy();
    });

    it('offers a move action on each orphaned row — not a dead-end heading', () => {
      render(<IncomeSourcesSection />);
      expect(screen.getByTestId('income-move-orph-1')).toBeTruthy();
    });

    it('does NOT offer the move action on rows that already have a period', () => {
      render(<IncomeSourcesSection />);
      expect(screen.queryByTestId('income-move-inc-1')).toBeNull();
    });

    it('opens the period picker when the move action is tapped', () => {
      render(<IncomeSourcesSection />);
      fireEvent.click(screen.getByTestId('income-move-orph-1'));
      expect(screen.getByTestId('move-cycle-sheet')).toBeTruthy();
    });

    it('dispatches the move with the chosen period id', async () => {
      render(<IncomeSourcesSection />);
      fireEvent.click(screen.getByTestId('income-move-orph-1'));
      fireEvent.click(screen.getByTestId(`move-cycle-option-${THIS_CYCLE}`));
      await act(async () => { screen.getByTestId('move-confirm-btn').click(); });

      expect(mockMoveIncomeSource).toHaveBeenCalledWith('orph-1', THIS_CYCLE);
      expect(screen.queryByTestId('income-move-error')).toBeNull();
    });

    // A received source cannot move (its income transaction is date-keyed), so the
    // view must name the fix rather than showing a generic failure.
    it('tells the user to un-confirm first when the move is refused as RECEIVED_SOURCE', async () => {
      mockMoveIncomeSource.mockResolvedValue({ error: new Error('RECEIVED_SOURCE') });
      render(<IncomeSourcesSection />);
      fireEvent.click(screen.getByTestId('income-move-orph-1'));
      fireEvent.click(screen.getByTestId(`move-cycle-option-${THIS_CYCLE}`));
      await act(async () => { screen.getByTestId('move-confirm-btn').click(); });

      expect(screen.getByTestId('income-move-error').textContent)
        .toMatch(/Un-confirm this income first/);
    });

    it('shows the generic error for any other move failure', async () => {
      mockMoveIncomeSource.mockResolvedValue({ error: new Error('RLS denied') });
      render(<IncomeSourcesSection />);
      fireEvent.click(screen.getByTestId('income-move-orph-1'));
      fireEvent.click(screen.getByTestId(`move-cycle-option-${THIS_CYCLE}`));
      await act(async () => { screen.getByTestId('move-confirm-btn').click(); });

      expect(screen.getByTestId('income-move-error').textContent)
        .toMatch(/Couldn't move this income source/);
    });
  });

  // ── Add form dispatch (the form's own behaviour is covered in its test) ────
  it('saves a new source against the active period, with no month in the payload', async () => {
    render(<IncomeSourcesSection />);
    await act(async () => { screen.getByTestId('add-income-source-btn').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('new-source-label'), { target: { value: 'Freelance' } });
    });
    expect(screen.getByTestId('new-source-period').value).toBe(THIS_CYCLE);
    await act(async () => { screen.getByTestId('save-income-source-btn').click(); });

    expect(mockAddIncomeSource).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Freelance' }),
      THIS_CYCLE,
    );
    // month is DERIVED by the mutation from the period — the view never sends one.
    const [payload] = mockAddIncomeSource.mock.calls[0];
    expect('month' in payload).toBe(false);
  });

  it('lets the user pick a different period to add to', async () => {
    render(<IncomeSourcesSection />);
    await act(async () => { screen.getByTestId('add-income-source-btn').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('new-source-label'),  { target: { value: 'Bonus' } });
      fireEvent.change(screen.getByTestId('new-source-period'), { target: { value: LAST_CYCLE } });
    });
    await act(async () => { screen.getByTestId('save-income-source-btn').click(); });

    expect(mockAddIncomeSource).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Bonus' }),
      LAST_CYCLE,
    );
  });

  it('shows a validation error when the label is empty', async () => {
    render(<IncomeSourcesSection />);
    await act(async () => { screen.getByTestId('add-income-source-btn').click(); });
    await act(async () => { screen.getByTestId('save-income-source-btn').click(); });
    expect(screen.getByText(/Please enter a source name/)).toBeTruthy();
    expect(mockAddIncomeSource).not.toHaveBeenCalled();
  });
});
