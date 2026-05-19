import { describe, it, expect, vi } from 'vitest';
import { render, screen, act }      from '@testing-library/react';
import { StepCategories }           from './StepCategories';

const mockFmt = (n) => `GHS ${Math.round(n || 0).toLocaleString()}`;

const defaultCats = [
  { id: 'c1', name: 'Groceries',  icon: '🛒', budget_amount: 500,  is_fixed: true,  sort_order: 0 },
  { id: 'c2', name: 'Transport',  icon: '🚗', budget_amount: 200,  is_fixed: true,  sort_order: 1 },
  { id: 'c3', name: 'Eating Out', icon: '🍽️', budget_amount: 300,  is_fixed: false, sort_order: 2 },
];

const renderStep = (props = {}) =>
  render(
    <StepCategories
      data={defaultCats}
      fmt={mockFmt}
      onNext={vi.fn()}
      onBack={vi.fn()}
      {...props}
    />
  );

describe('StepCategories', () => {
  it('renders step title', () => {
    renderStep();
    expect(screen.getByText('Set your budget categories')).toBeTruthy();
  });

  it('shows all category names', () => {
    renderStep();
    expect(screen.getByDisplayValue('Groceries')).toBeTruthy();
    expect(screen.getByDisplayValue('Transport')).toBeTruthy();
    expect(screen.getByDisplayValue('Eating Out')).toBeTruthy();
  });

  it('shows total budgeted amount', () => {
    renderStep();
    expect(screen.getByText(/GHS 1,000/)).toBeTruthy();
  });

  it('shows add category button', () => {
    renderStep();
    expect(screen.getByText('+ Add category')).toBeTruthy();
  });

  it('shows validation error when no categories', async () => {
    renderStep({ data: [] });
    await act(async () => { screen.getByText('Continue →').click(); });
    expect(screen.getByText(/Please add at least one budget category/)).toBeTruthy();
  });

  it('calls onNext with categories when valid', async () => {
    const onNext = vi.fn();
    renderStep({ onNext });
    await act(async () => { screen.getByText('Continue →').click(); });
    expect(onNext).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ name: 'Groceries' }),
    ]));
  });

  it('calls onBack when back tapped', () => {
    const onBack = vi.fn();
    renderStep({ onBack });
    screen.getByText('← Back').click();
    expect(onBack).toHaveBeenCalled();
  });
});
