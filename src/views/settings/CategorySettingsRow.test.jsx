/**
 * views/settings/CategorySettingsRow.test.jsx
 * Written before CategorySettingsRow.jsx — TDD.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { CategorySettingsRow }            from './CategorySettingsRow';
import { mockFmt, mockCategories }        from '../../test-utils/fixtures';

const cat = mockCategories[0]; // { id: 'cat-1', name: 'Groceries', icon: '🛒', budget_amount: 500 }

const renderRow = (props = {}) => render(
  <CategorySettingsRow
    cat={cat}
    fmt={mockFmt}
    onUpdate={vi.fn().mockResolvedValue({ error: null })}
    onDelete={vi.fn().mockResolvedValue({ error: null })}
    isLast={false}
    {...props}
  />
);

describe('CategorySettingsRow', () => {
  it('renders category name', () => {
    renderRow();
    expect(screen.getByTestId('cat-name-cat-1').textContent).toBe('Groceries');
  });

  it('renders formatted budget amount', () => {
    renderRow();
    expect(screen.getByTestId('cat-budget-cat-1').textContent).toBe('GHS 500');
  });

  it('shows edit inputs when edit button clicked', async () => {
    renderRow();
    await act(async () => { screen.getByTestId('cat-edit-cat-1').click(); });
    expect(screen.getByTestId('cat-name-input-cat-1')).toBeTruthy();
    expect(screen.getByTestId('cat-budget-input-cat-1')).toBeTruthy();
  });

  it('pre-fills inputs with current category values', async () => {
    renderRow();
    await act(async () => { screen.getByTestId('cat-edit-cat-1').click(); });
    expect(screen.getByTestId('cat-name-input-cat-1').value).toBe('Groceries');
    expect(screen.getByTestId('cat-budget-input-cat-1').value).toBe('500');
  });

  it('calls onUpdate with updated values when saved', async () => {
    const onUpdate = vi.fn().mockResolvedValue({ error: null });
    renderRow({ onUpdate });
    await act(async () => { screen.getByTestId('cat-edit-cat-1').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('cat-name-input-cat-1'), { target: { value: 'Food' } });
    });
    await act(async () => { screen.getByTestId('cat-save-cat-1').click(); });
    expect(onUpdate).toHaveBeenCalledWith('cat-1', expect.objectContaining({ name: 'Food' }));
  });

  it('closes edit form after successful save', async () => {
    renderRow();
    await act(async () => { screen.getByTestId('cat-edit-cat-1').click(); });
    await act(async () => { screen.getByTestId('cat-save-cat-1').click(); });
    expect(screen.queryByTestId('cat-name-input-cat-1')).toBeNull();
  });

  it('calls onDelete when delete button tapped', async () => {
    const onDelete = vi.fn().mockResolvedValue({ error: null });
    renderRow({ onDelete });
    await act(async () => { screen.getByTestId('cat-delete-cat-1').click(); });
    expect(onDelete).toHaveBeenCalledWith('cat-1');
  });

  it('disables delete button while deleting', () => {
    const onDelete = vi.fn().mockReturnValue(new Promise(() => {}));
    renderRow({ onDelete });
    act(() => { screen.getByTestId('cat-delete-cat-1').click(); });
    expect(screen.getByTestId('cat-delete-cat-1').disabled).toBe(true);
  });

  it('cancels edit without saving when Cancel clicked', async () => {
    const onUpdate = vi.fn();
    renderRow({ onUpdate });
    await act(async () => { screen.getByTestId('cat-edit-cat-1').click(); });
    await act(async () => { screen.getByText('Cancel').click(); });
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('cat-name-input-cat-1')).toBeNull();
  });
});
