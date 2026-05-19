import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { StepComplete }             from './StepComplete';

const mockFmt = (n) => `GHS ${Math.round(n || 0).toLocaleString()}`;

const base = {
  centreData:    { name: "The Adjei's", currency: 'GHS', icon: '🏠' },
  incomes:       [{ id: 'i1', label: 'Salary', expected_amount: 30000, icon: '💰' }],
  categories:    [
    { id: 'c1', name: 'Groceries', icon: '🛒', budget_amount: 500 },
    { id: 'c2', name: 'Transport', icon: '🚗', budget_amount: 0   },
  ],
  surplusTarget: 4500,
  totalIncome:   30000,
  totalBudgeted: 500,
  overBudget:    false,
  fmt:           mockFmt,
  loading:       false,
  error:         null,
  onConfirm:     vi.fn(),
  onBack:        vi.fn(),
};

const renderStep = (props = {}) =>
  render(<StepComplete {...base} {...props} />);

describe('StepComplete', () => {
  it('shows centre name and icon', () => {
    renderStep();
    expect(screen.getByText(/The Adjei's/)).toBeTruthy();
  });

  it('shows income stream label', () => {
    renderStep();
    expect(screen.getByText(/Salary/)).toBeTruthy();
  });

  it('shows category names', () => {
    renderStep();
    expect(screen.getByText(/Groceries/)).toBeTruthy();
  });

  it('shows over budget warning when overBudget is true', () => {
    renderStep({ overBudget: true, totalBudgeted: 40000 });
    expect(screen.getByText(/exceeds your expected income/)).toBeTruthy();
  });

  it('does not show over budget warning when within budget', () => {
    renderStep({ overBudget: false });
    expect(screen.queryByText(/exceeds your expected income/)).toBeNull();
  });

  it('shows zero budget warning when categories have no budget', () => {
    renderStep();
    expect(screen.getByText(/categories have no budget set/)).toBeTruthy();
  });

  it('does not show zero budget warning when all categories have budget', () => {
    const fullCategories = [
      { id: 'c1', name: 'Groceries', icon: '🛒', budget_amount: 500 },
      { id: 'c2', name: 'Transport', icon: '🚗', budget_amount: 200 },
    ];
    renderStep({ categories: fullCategories });
    expect(screen.queryByText(/categories have no budget set/)).toBeNull();
  });

  it('shows error message when error is set', () => {
    renderStep({ error: 'Something went wrong' });
    expect(screen.getByText(/Something went wrong/)).toBeTruthy();
  });

  it('shows loading state on confirm button', () => {
    renderStep({ loading: true });
    expect(screen.getByText('Creating...')).toBeTruthy();
  });

  it('calls onConfirm when button tapped', () => {
    const onConfirm = vi.fn();
    renderStep({ onConfirm });
    screen.getByText('Create Budget Centre 🎉').click();
    expect(onConfirm).toHaveBeenCalled();
  });

  it('calls onBack when back tapped', () => {
    const onBack = vi.fn();
    renderStep({ onBack });
    screen.getByText('← Back').click();
    expect(onBack).toHaveBeenCalled();
  });
});
