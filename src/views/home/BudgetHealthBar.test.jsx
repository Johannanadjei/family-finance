/**
 * views/home/BudgetHealthBar.test.jsx
 * Written before fixing — TDD.
 */

import { describe, it, expect } from 'vitest';
import { render, screen }       from '@testing-library/react';
import { BudgetHealthBar }      from './BudgetHealthBar';

const onTrack = { label: 'On Track 🎯', color: '#059669' };

describe('BudgetHealthBar', () => {
  it('shows health percentage when spending exists', () => {
    render(<BudgetHealthBar healthPct={75} budgetStatus={onTrack} totalSpent={5000} />);
    expect(screen.getByText('75% of monthly budget remaining')).toBeTruthy();
  });

  it('shows status label', () => {
    render(<BudgetHealthBar healthPct={75} budgetStatus={onTrack} totalSpent={5000} />);
    expect(screen.getByText('On Track 🎯')).toBeTruthy();
  });

  it('shows neutral state when no spending', () => {
    render(<BudgetHealthBar healthPct={100} budgetStatus={onTrack} totalSpent={0} />);
    expect(screen.getByText('No spending recorded yet')).toBeTruthy();
  });

  it('does not show percentage when no spending', () => {
    render(<BudgetHealthBar healthPct={100} budgetStatus={onTrack} totalSpent={0} />);
    expect(screen.queryByText('100% of monthly budget remaining')).toBeNull();
  });
});
