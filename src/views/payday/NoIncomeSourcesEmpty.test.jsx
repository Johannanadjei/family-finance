/**
 * views/payday/NoIncomeSourcesEmpty.test.jsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NoIncomeSourcesEmpty }      from './NoIncomeSourcesEmpty';

const props = {
  monthLabel:     'June 2026',
  lastMonthLabel: 'May 2026',
  onCopyFromLast: () => {},
  onAddManually:  () => {},
};

describe('NoIncomeSourcesEmpty', () => {
  it('renders the month-scoped empty-state copy', () => {
    render(<NoIncomeSourcesEmpty {...props} />);
    expect(screen.getByText(/No income tracked for June 2026 yet/)).toBeTruthy();
  });

  it('shows a copy-from-last-month button labelled with the previous month', () => {
    render(<NoIncomeSourcesEmpty {...props} />);
    expect(screen.getByTestId('copy-from-last-btn').textContent).toContain('May 2026');
  });

  it('calls onCopyFromLast when the copy button is clicked', () => {
    const onCopyFromLast = vi.fn();
    render(<NoIncomeSourcesEmpty {...props} onCopyFromLast={onCopyFromLast} />);
    fireEvent.click(screen.getByTestId('copy-from-last-btn'));
    expect(onCopyFromLast).toHaveBeenCalledTimes(1);
  });

  it('calls onAddManually when the add button is clicked', () => {
    const onAddManually = vi.fn();
    render(<NoIncomeSourcesEmpty {...props} onAddManually={onAddManually} />);
    fireEvent.click(screen.getByTestId('add-manually-btn'));
    expect(onAddManually).toHaveBeenCalledTimes(1);
  });
});
