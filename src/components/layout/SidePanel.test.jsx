/**
 * components/layout/SidePanel.test.jsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act }                  from '@testing-library/react';
import { MemoryRouter }                         from 'react-router-dom';
import { SidePanel }                            from './SidePanel';

const mockSignOut = vi.fn();
let mockCan       = () => true;

vi.mock('../../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ can: (p) => mockCan(p) }),
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => mockNavigate,
}));

const mockDismissForNavigation = vi.fn();
vi.mock('../../hooks/useModalChrome', () => ({
  useModalChrome: () => ({ dismissForNavigation: mockDismissForNavigation }),
}));

// Footer behaviour (cap states + upgrade modal) is covered by HubFooter.test.jsx. Here the
// mock is a clickable stub so we can drive its onUpgradeNavigate and test SidePanel's handler.
vi.mock('./HubFooter', () => ({
  HubFooter: ({ onUpgradeNavigate }) => (
    <button data-testid="hub-footer" onClick={onUpgradeNavigate}>hub-footer</button>
  ),
}));

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
  beforeEach(() => { mockCan = () => true; vi.clearAllMocks(); });

  it('renders all centre names', () => {
    renderPanel();
    expect(screen.getByText("The Adjei's")).toBeTruthy();
    expect(screen.getByText('London Airbnb')).toBeTruthy();
  });

  it('shows correct plural count in header', () => {
    renderPanel();
    expect(screen.getByText('2 BOS Hubs')).toBeTruthy();
  });

  it('shows singular count when one centre', () => {
    renderPanel({ centres: [mockCentres[0]] });
    expect(screen.getByText('1 BOS Hub')).toBeTruthy();
  });

  it('shows label without count when centres array is empty', () => {
    renderPanel({ centres: [] });
    expect(screen.getByText('BOS Hubs')).toBeTruthy();
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

  it('renders the hub footer when the member can manage settings', () => {
    renderPanel();
    expect(screen.getByTestId('hub-footer')).toBeTruthy();
  });

  it('does not render the hub footer for a standard member (no settings permission)', () => {
    mockCan = () => false;
    renderPanel();
    expect(screen.queryByTestId('hub-footer')).toBeNull();
  });

  it('hub-cap upgrade: dismisses its chrome, closes the drawer, THEN navigates to /pricing', () => {
    const order = [];
    mockDismissForNavigation.mockImplementation(() => order.push('dismiss'));
    mockNavigate.mockImplementation(() => order.push('navigate'));
    const onClose = vi.fn(() => order.push('close'));
    renderPanel({ onClose });

    screen.getByTestId('hub-footer').click();   // the mock invokes onUpgradeNavigate

    expect(mockDismissForNavigation).toHaveBeenCalledTimes(1);  // skip SidePanel's close-time history.back()
    expect(onClose).toHaveBeenCalledTimes(1);                   // close the drawer
    expect(mockNavigate).toHaveBeenCalledWith('/pricing');
    expect(order).toEqual(['dismiss', 'close', 'navigate']);    // chrome dismissed BEFORE the route push
  });

  it('shows Sign out button', () => {
    renderPanel();
    expect(screen.getByTestId('side-panel-sign-out')).toBeTruthy();
  });

  it('calls signOut when Sign out is clicked', () => {
    renderPanel();
    screen.getByTestId('side-panel-sign-out').click();
    expect(mockSignOut).toHaveBeenCalledOnce();
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
