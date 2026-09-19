/**
 * views/payday/UnassignedIncomeRow.test.jsx
 */

import { describe, it, expect } from 'vitest';
import { render, screen }       from '@testing-library/react';
import { UnassignedIncomeRow }  from './UnassignedIncomeRow';

describe('UnassignedIncomeRow', () => {
  it('renders the pre-formatted amount and its explanation', () => {
    render(<UnassignedIncomeRow amount="GHS 27,942" />);
    expect(screen.getByTestId('payday-unassigned-amount').textContent).toBe('GHS 27,942');
    expect(screen.getByText(/not linked to a source/)).toBeTruthy();
  });

  // The row must vanish entirely when there is none — an empty "Unassigned income"
  // line on every hub would be noise, and most hubs have none.
  it('renders nothing when there is no unassigned income', () => {
    const { container } = render(<UnassignedIncomeRow amount="" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no amount is passed at all', () => {
    const { container } = render(<UnassignedIncomeRow />);
    expect(container.firstChild).toBeNull();
  });
});
