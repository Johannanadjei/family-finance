/**
 * components/layout/SidePanel.test.jsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, act }      from '@testing-library/react';
import { MemoryRouter }             from 'react-router-dom';
import { SidePanel }                from './SidePanel';

const mockCentres = [
  { id: 'c-1', name: "The Adjei's", currency: 'GHS', icon: '🏠' },
  { id: 'c-2', name: 'London Airbnb', currency: 'GBP', icon: '✈️' },
];

const mockArchived = [
  { id: 'a-1', name: 'Old Flat', currency: 'GHS', icon: '🏚️' },
  { id: 'a-2', name: 'Accra Spare', currency: 'GHS', icon: '🏙️' },
];

const renderPanel = (props = {}) =>
  render(
    <MemoryRouter>
      <SidePanel
        isOpen={true}
        onClose={vi.fn()}
        centres={mockCentres}
        archivedCentres={[]}
        activeCentreId="c-1"
        onSwitch={vi.fn()}
        onCreateHub={vi.fn()}
        onRestore={vi.fn()}
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

// ── Archived section ──────────────────────────────────────────────────────────

describe('SidePanel — archived section', () => {
  it('does not render archived toggle when archivedCentres is empty', () => {
    renderPanel({ archivedCentres: [] });
    expect(screen.queryByTestId('archived-section-toggle')).toBeNull();
  });

  it('renders archived toggle when archivedCentres has items', () => {
    renderPanel({ archivedCentres: mockArchived });
    expect(screen.getByTestId('archived-section-toggle')).toBeTruthy();
  });

  it('archived hubs are not visible by default (collapsed)', () => {
    renderPanel({ archivedCentres: mockArchived });
    expect(screen.queryByText('Old Flat')).toBeNull();
    expect(screen.queryByText('Accra Spare')).toBeNull();
  });

  it('shows archived hub names after toggle is clicked', async () => {
    renderPanel({ archivedCentres: mockArchived });
    await act(async () => { screen.getByTestId('archived-section-toggle').click(); });
    expect(screen.getByText('Old Flat')).toBeTruthy();
    expect(screen.getByText('Accra Spare')).toBeTruthy();
  });

  it('collapses archived list when toggle is clicked again', async () => {
    renderPanel({ archivedCentres: mockArchived });
    await act(async () => { screen.getByTestId('archived-section-toggle').click(); });
    expect(screen.getByText('Old Flat')).toBeTruthy();
    await act(async () => { screen.getByTestId('archived-section-toggle').click(); });
    expect(screen.queryByText('Old Flat')).toBeNull();
  });

  it('renders a Restore button for each archived hub when expanded', async () => {
    renderPanel({ archivedCentres: mockArchived });
    await act(async () => { screen.getByTestId('archived-section-toggle').click(); });
    expect(screen.getByTestId('restore-hub-a-1')).toBeTruthy();
    expect(screen.getByTestId('restore-hub-a-2')).toBeTruthy();
  });

  it('calls onRestore with the correct centreId when Restore tapped', async () => {
    const onRestore = vi.fn();
    renderPanel({ archivedCentres: mockArchived, onRestore });
    await act(async () => { screen.getByTestId('archived-section-toggle').click(); });
    screen.getByTestId('restore-hub-a-1').click();
    expect(onRestore).toHaveBeenCalledWith('a-1');
  });

  it('does not call onSwitch when an archived row area is rendered (no switch button)', async () => {
    const onSwitch = vi.fn();
    renderPanel({ archivedCentres: mockArchived, onSwitch });
    await act(async () => { screen.getByTestId('archived-section-toggle').click(); });
    // Archived rows have no aria-label "Switch to ..." — verify switch never fires on restore
    screen.getByTestId('restore-hub-a-1').click();
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('toggle has aria-expanded false when collapsed', () => {
    renderPanel({ archivedCentres: mockArchived });
    expect(screen.getByTestId('archived-section-toggle').getAttribute('aria-expanded')).toBe('false');
  });

  it('toggle has aria-expanded true when expanded', async () => {
    renderPanel({ archivedCentres: mockArchived });
    await act(async () => { screen.getByTestId('archived-section-toggle').click(); });
    expect(screen.getByTestId('archived-section-toggle').getAttribute('aria-expanded')).toBe('true');
  });
});
