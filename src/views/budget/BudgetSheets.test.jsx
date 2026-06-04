/**
 * views/budget/BudgetSheets.test.jsx
 *
 * Pure modal host: mounts the add-category sheet, the copy-categories sheet, and the
 * "copied N" success toast based on its open flags. fmt comes from context.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BudgetSheets }   from './BudgetSheets';
import { mockFmt, mockPrevMonthCategories } from '../../test-utils/fixtures';

vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ fmt: mockFmt }),
}));

const base = {
  addOpen: false, onCloseAdd: vi.fn(), onAdd: vi.fn(), targetMonth: '2026-06',
  copyOpen: false, onCloseCopy: vi.fn(), prevPeriodLabel: 'May 2026',
  prevCategories: mockPrevMonthCategories, onCopy: vi.fn(), copying: false,
  copiedCount: 0, periodLabel: 'June 2026', onDismissToast: vi.fn(),
};

const renderHost = (props = {}) => render(<BudgetSheets {...base} {...props} />);

describe('BudgetSheets', () => {
  it('mounts nothing visible when all flags are closed and no toast', () => {
    renderHost();
    expect(screen.queryByTestId('copy-categories-sheet')).toBeNull();
    expect(screen.queryByText(/Copied/)).toBeNull();
  });

  it('shows the add-category sheet when addOpen', () => {
    renderHost({ addOpen: true });
    expect(screen.getByText('Add Budget Category')).toBeTruthy();
  });

  it('shows the copy-categories sheet when copyOpen', () => {
    renderHost({ copyOpen: true });
    expect(screen.getByTestId('copy-categories-sheet')).toBeTruthy();
    expect(screen.getByText(/Copy from May 2026/)).toBeTruthy();
  });

  it('shows the success toast when copiedCount > 0, naming the period', () => {
    renderHost({ copiedCount: 3 });
    expect(screen.getByText('Copied 3 budget categories to June 2026')).toBeTruthy();
  });

  it('singularises the toast for a single copied category', () => {
    renderHost({ copiedCount: 1 });
    expect(screen.getByText('Copied 1 budget category to June 2026')).toBeTruthy();
  });
});
