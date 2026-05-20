/**
 * components/layout/Header.test.jsx
 * Reads availableNow and totalReceived from FinanceContext.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { MemoryRouter }             from 'react-router-dom';
import { Header }                   from './Header';
import { mockCentre, mockFmt }      from '../../test-utils/fixtures';

vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ centre: mockCentre, fmt: mockFmt }),
}));

const mockFinance = {
  availableNow:  1000,
  totalReceived: 5000,
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
  it('renders centre name', () => {
    renderHeader();
    expect(screen.getByText("The Adjei's")).toBeTruthy();
  });

  it('renders available amount', () => {
    renderHeader();
    expect(screen.getByText('GHS 1,000')).toBeTruthy();
  });

  it('shows info icon when no income received', () => {
    mockFinance.totalReceived = 0;
    mockFinance.availableNow  = -500;
    renderHeader();
    expect(screen.getByLabelText('No income confirmed yet')).toBeTruthy();
    mockFinance.totalReceived = 5000;
    mockFinance.availableNow  = 1000;
  });

  it('hides info icon when income received', () => {
    mockFinance.totalReceived = 5000;
    renderHeader();
    expect(screen.queryByLabelText('No income confirmed yet')).toBeNull();
  });

  it('calls onOpenPanel when centre name tapped', () => {
    const onOpenPanel = vi.fn();
    renderHeader({ onOpenPanel });
    screen.getByLabelText('Open budget centres panel').click();
    expect(onOpenPanel).toHaveBeenCalledOnce();
  });
});
