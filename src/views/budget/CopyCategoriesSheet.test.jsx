/**
 * views/budget/CopyCategoriesSheet.test.jsx
 *
 * Multi-select budget rollforward sheet: opens all-checked, count tracks
 * de-selection, copy calls back with selected ids, cancel writes nothing.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent }      from '@testing-library/react';
import { CopyCategoriesSheet }            from './CopyCategoriesSheet';
import { mockFmt, mockPrevMonthCategories } from '../../test-utils/fixtures';

const base = {
  isOpen:         true,
  onClose:        () => {},
  lastMonthLabel: 'May 2026',
  categories:     mockPrevMonthCategories,
  fmt:            mockFmt,
  onCopy:         () => {},
};

describe('CopyCategoriesSheet', () => {
  it('renders nothing when closed', () => {
    render(<CopyCategoriesSheet {...base} isOpen={false} />);
    expect(screen.queryByTestId('copy-categories-sheet')).toBeNull();
  });

  it('opens with every category checked → copy button reflects the full count', () => {
    render(<CopyCategoriesSheet {...base} />);
    expect(screen.getByText(/Copy from May 2026/)).toBeTruthy();
    expect(screen.getByTestId('copy-categories-selected-btn').textContent).toBe('Copy 3 selected');
  });

  it('lists each category with its formatted budget amount', () => {
    render(<CopyCategoriesSheet {...base} />);
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('Fun')).toBeTruthy();
    expect(screen.getByText('GHS 500')).toBeTruthy();
  });

  it('updates the count live when a category is de-selected', () => {
    render(<CopyCategoriesSheet {...base} />);
    fireEvent.click(screen.getByTestId('copy-category-pcat-3'));
    expect(screen.getByTestId('copy-categories-selected-btn').textContent).toBe('Copy 2 selected');
  });

  it('disables the copy button and prompts when nothing is selected', () => {
    render(<CopyCategoriesSheet {...base} />);
    fireEvent.click(screen.getByTestId('copy-category-pcat-1'));
    fireEvent.click(screen.getByTestId('copy-category-pcat-2'));
    fireEvent.click(screen.getByTestId('copy-category-pcat-3'));
    const btn = screen.getByTestId('copy-categories-selected-btn');
    expect(btn.textContent).toBe('Select at least one');
    expect(btn.disabled).toBe(true);
  });

  it('calls onCopy with only the selected ids', () => {
    const onCopy = vi.fn();
    render(<CopyCategoriesSheet {...base} onCopy={onCopy} />);
    fireEvent.click(screen.getByTestId('copy-category-pcat-3')); // de-select Fun
    fireEvent.click(screen.getByTestId('copy-categories-selected-btn'));
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onCopy).toHaveBeenCalledWith(['pcat-1', 'pcat-2']);
  });

  it('Cancel closes without calling onCopy', () => {
    const onClose = vi.fn(), onCopy = vi.fn();
    render(<CopyCategoriesSheet {...base} onClose={onClose} onCopy={onCopy} />);
    fireEvent.click(screen.getByTestId('copy-categories-cancel-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCopy).not.toHaveBeenCalled();
  });

  it('shows "Copying…" while a copy is in flight', () => {
    render(<CopyCategoriesSheet {...base} copying />);
    expect(screen.getByTestId('copy-categories-selected-btn').textContent).toBe('Copying…');
  });
});
