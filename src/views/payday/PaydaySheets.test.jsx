/**
 * views/payday/PaydaySheets.test.jsx
 *
 * Pure modal host: mounts the confirm-income sheet, the copy-income sheet, and the
 * "copied N" success toast based on its open flags. fmt comes from context.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PaydaySheets }   from './PaydaySheets';
import { mockFmt }        from '../../test-utils/fixtures';

vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ fmt: mockFmt }),
}));

const base = {
  income: { id: 'inc-1', label: 'Adjei Salary', expected_amount: 30000 },
  confirmOpen: false, onCloseConfirm: vi.fn(), onConfirm: vi.fn(), mutating: false, mutateError: null,
  copyOpen: false, onCloseCopy: vi.fn(), prevPeriodLabel: 'May 2026',
  prevSources: [{ id: 's1', label: 'Salary', expected_amount: 1000, received: false }],
  onCopy: vi.fn(), copying: false,
  copiedCount: 0, periodLabel: 'June 2026', onDismissToast: vi.fn(),
};

const renderHost = (props = {}) => render(<PaydaySheets {...base} {...props} />);

describe('PaydaySheets', () => {
  it('mounts nothing visible when all flags are closed and no toast', () => {
    renderHost();
    expect(screen.queryByTestId('confirm-amount-input')).toBeNull();
    expect(screen.queryByTestId('copy-income-sheet')).toBeNull();
    expect(screen.queryByText(/Copied/)).toBeNull();
  });

  it('shows the confirm-income sheet when confirmOpen', () => {
    renderHost({ confirmOpen: true });
    expect(screen.getByTestId('confirm-amount-input')).toBeTruthy();
  });

  it('shows the copy-income sheet when copyOpen, naming the previous period', () => {
    renderHost({ copyOpen: true });
    expect(screen.getByTestId('copy-income-sheet')).toBeTruthy();
    expect(screen.getByText(/Copy from May 2026/)).toBeTruthy();
  });

  it('shows the success toast when copiedCount > 0, naming the period', () => {
    renderHost({ copiedCount: 2 });
    expect(screen.getByText('Copied 2 income sources to June 2026')).toBeTruthy();
  });

  it('singularises the toast for a single copied source', () => {
    renderHost({ copiedCount: 1 });
    expect(screen.getByText('Copied 1 income source to June 2026')).toBeTruthy();
  });
});
