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

vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ centre: { ...mockCentre, name: mockCentreName }, fmt: mockFmt }),
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
  beforeEach(() => { mockCentreName = mockCentre.name; });

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
});
