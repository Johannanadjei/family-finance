/**
 * components/layout/Header.test.jsx
 * Component rendering tests for Header.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { MemoryRouter }             from 'react-router-dom';
import { Header }                   from './Header';
import { mockCentre, mockFmt }      from '../../test-utils/fixtures';

vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({
    centre: mockCentre,
    fmt:    mockFmt,
  }),
}));

const renderHeader = (props = {}) =>
  render(
    <MemoryRouter>
      <Header availableNow={1000} totalReceived={5000} onOpenPanel={vi.fn()} {...props} />
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
    renderHeader({ totalReceived: 0, availableNow: -500 });
    expect(screen.getByLabelText('No income confirmed yet')).toBeTruthy();
  });

  it('hides info icon when income received', () => {
    renderHeader({ totalReceived: 5000, availableNow: 1000 });
    expect(screen.queryByLabelText('No income confirmed yet')).toBeNull();
  });

  it('calls onOpenPanel when centre name tapped', () => {
    const onOpenPanel = vi.fn();
    renderHeader({ onOpenPanel });
    screen.getByLabelText('Open budget centres panel').click();
    expect(onOpenPanel).toHaveBeenCalledOnce();
  });
});
