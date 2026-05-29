/**
 * components/layout/Header.test.jsx
 * Reads centre from BudgetCentreContext.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen }                        from '@testing-library/react';
import { MemoryRouter }                          from 'react-router-dom';
import { Header }                                from './Header';
import { mockCentre }                            from '../../test-utils/fixtures';

let mockCentreName = mockCentre.name;

vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ centre: { ...mockCentre, name: mockCentreName } }),
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

  it('calls onOpenPanel when centre name tapped', () => {
    const onOpenPanel = vi.fn();
    renderHeader({ onOpenPanel });
    screen.getByLabelText('Open BOS Hubs panel').click();
    expect(onOpenPanel).toHaveBeenCalledOnce();
  });

  it('renders a chevron inside the panel button', () => {
    renderHeader();
    expect(screen.getByLabelText('Open BOS Hubs panel').querySelector('svg')).toBeTruthy();
  });

  it('truncates centre name longer than 20 chars with ellipsis', () => {
    mockCentreName = 'The Adjei Family Household';
    renderHeader();
    expect(screen.getByText('The Adjei Family Hou…')).toBeTruthy();
  });
});
