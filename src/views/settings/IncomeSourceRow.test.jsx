/**
 * views/settings/IncomeSourceRow.test.jsx
 * Written before IncomeSourceRow.jsx — TDD.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, act }      from '@testing-library/react';
import { IncomeSourceRow }          from './IncomeSourceRow';
import { mockFmt, mockIncomes }     from '../../test-utils/fixtures';

const source = mockIncomes[0]; // { id: 'inc-1', label: 'Adjei Salary', expected_amount: 30000 }

const renderRow = (props = {}) => render(
  <IncomeSourceRow
    source={source}
    fmt={mockFmt}
    onDelete={vi.fn().mockResolvedValue({ error: null })}
    isLast={false}
    {...props}
  />
);

describe('IncomeSourceRow', () => {
  it('renders income source label', () => {
    renderRow();
    expect(screen.getByTestId('income-label-inc-1').textContent).toBe('Adjei Salary');
  });

  it('renders formatted expected amount', () => {
    renderRow();
    expect(screen.getByTestId('income-amount-inc-1').textContent).toBe('GHS 30,000');
  });

  it('renders a delete button', () => {
    renderRow();
    expect(screen.getByTestId('income-delete-inc-1')).toBeTruthy();
  });

  it('calls onDelete with source id when delete tapped', async () => {
    const onDelete = vi.fn().mockResolvedValue({ error: null });
    renderRow({ onDelete });
    await act(async () => { screen.getByTestId('income-delete-inc-1').click(); });
    expect(onDelete).toHaveBeenCalledWith('inc-1');
  });

  it('disables delete button while deleting', () => {
    const onDelete = vi.fn().mockReturnValue(new Promise(() => {}));
    renderRow({ onDelete });
    act(() => { screen.getByTestId('income-delete-inc-1').click(); });
    expect(screen.getByTestId('income-delete-inc-1').disabled).toBe(true);
  });
});
