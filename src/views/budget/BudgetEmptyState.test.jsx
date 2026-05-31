/**
 * views/budget/BudgetEmptyState.test.jsx
 *
 * Three-state budget rollforward empty state (Phase 2C):
 *   State 1 — no previous-month categories → "+ Add manually" only.
 *   State 2 — exactly one  → "Yes, copy 1 category".
 *   State 3 — two or more  → "Yes, copy N categories".
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BudgetEmptyState }          from './BudgetEmptyState';

const base = {
  monthLabel:        'June 2026',
  lastMonthLabel:    'May 2026',
  prevCategoryCount: 0,
  onCopyAll:         () => {},
  onChooseWhich:     () => {},
  onAddManually:     () => {},
};

describe('BudgetEmptyState — three-state rollforward', () => {
  it('State 1 (no prev categories): shows "+ Add manually" only, no copy CTAs', () => {
    render(<BudgetEmptyState {...base} prevCategoryCount={0} />);
    expect(screen.getByText(/No budget set for June 2026 yet/)).toBeTruthy();
    expect(screen.getByTestId('add-category-manually-btn')).toBeTruthy();
    expect(screen.queryByTestId('copy-all-categories-btn')).toBeNull();
    expect(screen.queryByTestId('choose-which-categories-btn')).toBeNull();
  });

  it('State 2 (1 prev category): singular "Yes, copy 1 category" with the question heading', () => {
    render(<BudgetEmptyState {...base} prevCategoryCount={1} />);
    expect(screen.getByText(/Budget same as May 2026\?/)).toBeTruthy();
    expect(screen.getByTestId('copy-all-categories-btn').textContent).toBe('Yes, copy 1 category');
    expect(screen.getByTestId('choose-which-categories-btn')).toBeTruthy();
    expect(screen.getByTestId('add-category-manually-btn')).toBeTruthy();
  });

  it('State 3 (3 prev categories): pluralises to "Yes, copy 3 categories"', () => {
    render(<BudgetEmptyState {...base} prevCategoryCount={3} />);
    expect(screen.getByTestId('copy-all-categories-btn').textContent).toBe('Yes, copy 3 categories');
  });

  it('calls onCopyAll / onChooseWhich / onAddManually on their respective buttons', () => {
    const onCopyAll = vi.fn(), onChooseWhich = vi.fn(), onAddManually = vi.fn();
    render(<BudgetEmptyState {...base} prevCategoryCount={2}
      onCopyAll={onCopyAll} onChooseWhich={onChooseWhich} onAddManually={onAddManually} />);
    fireEvent.click(screen.getByTestId('copy-all-categories-btn'));
    fireEvent.click(screen.getByTestId('choose-which-categories-btn'));
    fireEvent.click(screen.getByTestId('add-category-manually-btn'));
    expect(onCopyAll).toHaveBeenCalledTimes(1);
    expect(onChooseWhich).toHaveBeenCalledTimes(1);
    expect(onAddManually).toHaveBeenCalledTimes(1);
  });

  it('shows "Copying…" and disables the CTA while copying', () => {
    render(<BudgetEmptyState {...base} prevCategoryCount={2} copying />);
    const btn = screen.getByTestId('copy-all-categories-btn');
    expect(btn.textContent).toBe('Copying…');
    expect(btn.disabled).toBe(true);
  });

  it('renders an inline error when copyError is set', () => {
    render(<BudgetEmptyState {...base} prevCategoryCount={2} copyError="Couldn't copy. Try again." />);
    expect(screen.getByText(/Couldn't copy\. Try again\./)).toBeTruthy();
  });
});
