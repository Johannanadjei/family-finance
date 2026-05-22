/**
 * components/layout/SidePanel.test.jsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { MemoryRouter }             from 'react-router-dom';
import { SidePanel }                from './SidePanel';

const mockCentres = [
  { id: 'c-1', name: "The Adjei's", currency: 'GHS', icon: '🏠' },
  { id: 'c-2', name: 'London Airbnb', currency: 'GBP', icon: '✈️' },
];

const renderPanel = (props = {}) =>
  render(
    <MemoryRouter>
      <SidePanel
        isOpen={true}
        onClose={vi.fn()}
        centres={mockCentres}
        activeCentreId="c-1"
        onSwitch={vi.fn()}
        onCreateHub={vi.fn()}
        userPlan="free"
        {...props}
      />
    </MemoryRouter>
  );

describe('SidePanel', () => {
  it('renders all centre names', () => {
    renderPanel();
    expect(screen.getByText("The Adjei's")).toBeTruthy();
    expect(screen.getByText('London Airbnb')).toBeTruthy();
  });

  it('shows correct plural count in header', () => {
    renderPanel();
    expect(screen.getByText('2 Control Centres')).toBeTruthy();
  });

  it('shows singular count when one centre', () => {
    renderPanel({ centres: [mockCentres[0]] });
    expect(screen.getByText('1 Control Centre')).toBeTruthy();
  });

  it('shows label without count when centres array is empty', () => {
    renderPanel({ centres: [] });
    expect(screen.getByText('Control Centres')).toBeTruthy();
  });

  it('marks the active centre with Active badge', () => {
    renderPanel();
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('calls onSwitch with correct id when non-active centre tapped', () => {
    const onSwitch = vi.fn();
    const onClose  = vi.fn();
    renderPanel({ onSwitch, onClose });
    screen.getByLabelText('Switch to London Airbnb').click();
    expect(onSwitch).toHaveBeenCalledWith('c-2');
    expect(onClose).toHaveBeenCalled();
  });

  it('does not call onSwitch when the active centre is tapped', () => {
    const onSwitch = vi.fn();
    const onClose  = vi.fn();
    renderPanel({ onSwitch, onClose });
    screen.getByLabelText("Switch to The Adjei's").click();
    expect(onSwitch).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when close button tapped', () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    screen.getByLabelText('Close panel').click();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows upgrade message for free plan users', () => {
    renderPanel({ userPlan: 'free' });
    expect(screen.getByText('Upgrade to add more hubs')).toBeTruthy();
  });

  it('upgrade button is disabled for free plan', () => {
    renderPanel({ userPlan: 'free' });
    expect(screen.getByText('Upgrade to add more hubs').disabled).toBe(true);
  });

  it('shows create button for pro users below limit', () => {
    renderPanel({ userPlan: 'pro' });
    expect(screen.getByText('+ New Control Centre')).toBeTruthy();
  });

  it('calls onCreateHub when create button tapped by pro user', () => {
    const onCreateHub = vi.fn();
    renderPanel({ userPlan: 'pro', onCreateHub });
    screen.getByText('+ New Control Centre').click();
    expect(onCreateHub).toHaveBeenCalledOnce();
  });

  it('shows limit message for pro users at 10 centres', () => {
    const tenCentres = Array.from({ length: 10 }, (_, i) => ({
      id: `c-${i}`, name: `Hub ${i}`, currency: 'GHS', icon: '🏠',
    }));
    renderPanel({ userPlan: 'pro', centres: tenCentres });
    expect(screen.getByText('Maximum 10 hubs reached')).toBeTruthy();
  });
});
