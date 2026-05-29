/**
 * views/budget/CategoryBudgetRow.test.jsx
 * Written before CategoryBudgetRow.jsx — TDD.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { CategoryBudgetRow }        from './CategoryBudgetRow';
import { mockFmt }                  from '../../test-utils/fixtures';

const cat = { id: 'cat-1', name: 'Groceries', icon: '🛒', budget_amount: 500 };

const renderRow = (props = {}) =>
  render(
    <CategoryBudgetRow
      category={cat}
      spent={200}
      remaining={300}
      pctUsed={40}
      overBudget={false}
      fmt={mockFmt}
      {...props}
    />
  );

describe('CategoryBudgetRow', () => {
  it('shows category name', () => {
    renderRow();
    expect(screen.getByText('Groceries')).toBeTruthy();
  });

  it('shows category icon', () => {
    renderRow();
    expect(screen.getByText('🛒')).toBeTruthy();
  });

  it('shows spent amount', () => {
    renderRow();
    expect(screen.getByTestId('budget-spent-cat-1').textContent).toBe('GHS 200');
  });

  it('shows remaining amount when within budget', () => {
    renderRow();
    expect(screen.getByTestId('budget-remaining-cat-1').textContent).toContain('GHS 300');
  });

  it('shows over budget label when overspent', () => {
    renderRow({ spent: 600, remaining: -100, pctUsed: 100, overBudget: true });
    expect(screen.getByText(/Over budget/)).toBeTruthy();
  });

  it('shows progress bar', () => {
    renderRow();
    expect(screen.getByTestId('budget-bar-cat-1')).toBeTruthy();
  });

  it('progress bar width reflects pctUsed', () => {
    renderRow({ pctUsed: 40 });
    const bar = screen.getByTestId('budget-bar-cat-1');
    expect(bar.style.width).toBe('40%');
  });

  it('progress bar is green when under 70%', () => {
    renderRow({ pctUsed: 40 });
    const bar = screen.getByTestId('budget-bar-cat-1');
    expect(bar.style.background).toContain('--c-success');
  });

  it('progress bar is amber when 71-90%', () => {
    renderRow({ pctUsed: 80 });
    const bar = screen.getByTestId('budget-bar-cat-1');
    expect(bar.style.background).toContain('--c-warning');
  });

  it('progress bar is red when over 90%', () => {
    renderRow({ pctUsed: 95 });
    const bar = screen.getByTestId('budget-bar-cat-1');
    expect(bar.style.background).toContain('--c-danger');
  });

  it('shows zero spent when nothing spent', () => {
    renderRow({ spent: 0, remaining: 500, pctUsed: 0 });
    expect(screen.getByTestId('budget-spent-cat-1').textContent).toBe('GHS 0');
  });
});
