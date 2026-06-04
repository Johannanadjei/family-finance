/**
 * views/budget/BudgetCategoryList.test.jsx
 *
 * The Budget category body: rows (sorted by % used) + add button, or the empty
 * rollforward state. Pure display — actions arrive as already-guarded callbacks.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BudgetCategoryList } from './BudgetCategoryList';
import { mockFmt, mockCategories, mockCategorySpend } from '../../test-utils/fixtures';

const base = {
  categories: mockCategories,
  categorySpend: mockCategorySpend,
  fmt: mockFmt,
  periodLabel: 'May 2026',
  prevPeriodLabel: 'April 2026',
  prevCategoryCount: 0,
  copying: false,
  copyError: null,
  onCopyAll: vi.fn(),
  onChooseWhich: vi.fn(),
  onAddManually: vi.fn(),
  onAddCategory: vi.fn(),
};

const renderList = (props = {}) => render(<BudgetCategoryList {...base} {...props} />);

describe('BudgetCategoryList', () => {
  it('renders a row per category with the add-category footer button', () => {
    renderList();
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('Transport')).toBeTruthy();
    expect(screen.getByText('+ Add budget category')).toBeTruthy();
  });

  it('sorts rows by % used descending — most urgent first', () => {
    renderList();
    const names = screen.getAllByText(/Groceries|Transport/);
    expect(names[0].textContent).toContain('Groceries');   // 200/500=40% > Transport 0%
  });

  it('calls onAddCategory when the footer button is tapped', () => {
    const onAddCategory = vi.fn();
    renderList({ onAddCategory });
    fireEvent.click(screen.getByText('+ Add budget category'));
    expect(onAddCategory).toHaveBeenCalledTimes(1);
  });

  it('renders the empty state (no footer button) when there are no categories', () => {
    renderList({ categories: [] });
    expect(screen.getByText(/No budget set for May 2026 yet/)).toBeTruthy();
    expect(screen.queryByText('+ Add budget category')).toBeNull();
  });

  it('empty state with a previous period offers the copy CTA', () => {
    renderList({ categories: [], prevCategoryCount: 3 });
    expect(screen.getByText(/Budget same as April 2026/)).toBeTruthy();
    expect(screen.getByTestId('copy-all-categories-btn')).toBeTruthy();
  });

  it('empty-state CTAs fire their guarded callbacks', () => {
    const onAddManually = vi.fn();
    renderList({ categories: [], onAddManually });
    fireEvent.click(screen.getByTestId('add-category-manually-btn'));
    expect(onAddManually).toHaveBeenCalledTimes(1);
  });
});
