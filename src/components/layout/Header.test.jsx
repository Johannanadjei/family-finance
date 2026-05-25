/**
 * components/layout/Header.test.jsx
 * Reads availableNow from FinanceContext.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen }                        from '@testing-library/react';
import { MemoryRouter }                          from 'react-router-dom';
import { Header }                                from './Header';
import { mockCentre, mockFmt }                   from '../../test-utils/fixtures';

let mockCentreName = mockCentre.name;
let mockCan        = () => true;

vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ centre: { ...mockCentre, name: mockCentreName }, fmt: mockFmt, can: (p) => mockCan(p) }),
}));

const mockFinance = {
  availableNow: 1000,
};

vi.mock('../../context/FinanceContext', () => ({
  useFinanceContext: () => mockFinance,
}));

const renderHeader = (props = {}) =>
  render(
    <MemoryRouter>
      <Header onOpenPanel={vi.fn()} {...props} />
    </MemoryRouter>
  );

describe('Header', () => {
  beforeEach(() => { mockCentreName = mockCentre.name; mockCan = () => true; });

  it('renders centre name', () => {
    renderHeader();
    expect(screen.getByText("The Adjei's")).toBeTruthy();
  });

  it('renders available amount', () => {
    renderHeader();
    expect(screen.getByText('GHS 1,000')).toBeTruthy();
  });

  it('calls onOpenPanel when centre name tapped', () => {
    const onOpenPanel = vi.fn();
    renderHeader({ onOpenPanel });
    screen.getByLabelText('Open budget centres panel').click();
    expect(onOpenPanel).toHaveBeenCalledOnce();
  });

  it('truncates centre name longer than 20 chars with ellipsis', () => {
    mockCentreName = 'The Adjei Family Household';
    renderHeader();
    expect(screen.getByText('The Adjei Family Hou…')).toBeTruthy();
  });

  it('standard member does not see Available balance', () => {
    mockCan = () => false;
    renderHeader();
    expect(screen.queryByText('Available')).toBeNull();
  });
});
