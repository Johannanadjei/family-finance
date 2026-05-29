import { describe, it, expect, vi }       from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { StepCategories }                 from './StepCategories';

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

  // ── icon picker ──────────────────────────────────────────────────────────
  it('does not show the icon grid until a row icon is tapped', () => {
    renderStep();
    expect(screen.queryByRole('group', { name: 'Category icons' })).toBeNull();
  });

  it('opens the icon grid for a row when its icon is tapped', () => {
    renderStep();
    fireEvent.click(screen.getAllByLabelText('Choose icon')[0]);
    expect(screen.getByRole('group', { name: 'Category icons' })).toBeTruthy();
  });

  it('toggles the grid closed when the same row icon is tapped again', () => {
    renderStep();
    const btn = screen.getAllByLabelText('Choose icon')[0];
    fireEvent.click(btn);
    expect(screen.getByRole('group', { name: 'Category icons' })).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByRole('group', { name: 'Category icons' })).toBeNull();
  });

  it('updates the row icon and closes the grid when an icon is selected', () => {
    renderStep();
    const iconButtons = screen.getAllByLabelText('Choose icon');
    expect(iconButtons[0].textContent).toBe('🛒'); // Groceries default
    fireEvent.click(iconButtons[0]);
    fireEvent.click(screen.getByLabelText('Use icon 🎓'));
    expect(screen.queryByRole('group', { name: 'Category icons' })).toBeNull();
    expect(screen.getAllByLabelText('Choose icon')[0].textContent).toBe('🎓');
  });

  it('keeps only one row grid open at a time', () => {
    renderStep();
    const iconButtons = screen.getAllByLabelText('Choose icon');
    fireEvent.click(iconButtons[0]);
    expect(screen.getAllByRole('group', { name: 'Category icons' })).toHaveLength(1);
    fireEvent.click(iconButtons[1]); // open a different row
    expect(screen.getAllByRole('group', { name: 'Category icons' })).toHaveLength(1);
  });
});
