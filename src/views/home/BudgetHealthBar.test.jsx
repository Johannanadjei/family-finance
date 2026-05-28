/**
 * views/home/BudgetHealthBar.test.jsx
 * Written before fixing — TDD.
 */

import { describe, it, expect } from 'vitest';
import { render, screen }       from '@testing-library/react';
import { BudgetHealthBar }      from './BudgetHealthBar';

const onTrack = { label: 'On Track 🎯', color: '#059669' };

describe('BudgetHealthBar', () => {
  it('shows used percentage when spending and budget exist', () => {
    render(<BudgetHealthBar healthPct={75} budgetStatus={onTrack} totalSpent={5000} fixedTotal={10000} />);
    expect(screen.getByText('75% of monthly budget used')).toBeTruthy();
  });

  it('shows true percentage when over budget (>100)', () => {
    const overBudget = { label: 'Over Budget 🚨', color: '#dc2626' };
    render(<BudgetHealthBar healthPct={207} budgetStatus={overBudget} totalSpent={4301} fixedTotal={2080} />);
    expect(screen.getByText('207% of monthly budget used')).toBeTruthy();
  });

  it('shows status label', () => {
    render(<BudgetHealthBar healthPct={75} budgetStatus={onTrack} totalSpent={5000} fixedTotal={10000} />);
    expect(screen.getByText('On Track 🎯')).toBeTruthy();
  });

  it('shows neutral state when no spending', () => {
    render(<BudgetHealthBar healthPct={0} budgetStatus={onTrack} totalSpent={0} fixedTotal={10000} />);
    expect(screen.getByText('No spending recorded yet')).toBeTruthy();
  });

  it('does not show percentage when no spending', () => {
    render(<BudgetHealthBar healthPct={0} budgetStatus={onTrack} totalSpent={0} fixedTotal={10000} />);
    expect(screen.queryByText('0% of monthly budget used')).toBeNull();
  });

  it('shows no-categories message when fixedTotal is 0', () => {
    render(<BudgetHealthBar healthPct={0} budgetStatus={onTrack} totalSpent={5000} fixedTotal={0} />);
    expect(screen.getByText('No budget categories set up yet')).toBeTruthy();
  });

  it('does not show status label when fixedTotal is 0', () => {
    render(<BudgetHealthBar healthPct={0} budgetStatus={onTrack} totalSpent={5000} fixedTotal={0} />);
    expect(screen.queryByText('On Track 🎯')).toBeNull();
  });
});
