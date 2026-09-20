/**
 * components/layout/DashboardShell.test.jsx
 *
 * DashboardShell is the chrome, not a view — App.dashboard.test.jsx already smoke-
 * tests that the whole shell EVALUATES (see its header for the white-screen
 * post-mortem that file exists for). What belongs here is the behaviour this file
 * owns on its own: the single pull-to-refresh mount and where it is armed.
 *
 * The views are stubbed out. Rendering the real ones would make this a second,
 * brittle copy of five view suites, and none of them is what is under test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { makeBudgetCentreMock, makeFinanceMock } from '../../test-utils/contextMocks';
import { THRESHOLD } from '../ui/PullToRefresh';

// vi.mock factories are hoisted above the file body, so the spy must be too.
const { reloadHub } = vi.hoisted(() => ({ reloadHub: vi.fn().mockResolvedValue(undefined) }));

vi.mock('../../context/BudgetCentreContext', () => makeBudgetCentreMock());
vi.mock('../../context/FinanceContext', () => makeFinanceMock({ reloadHub }));

// Chrome and views stubbed — this file tests the shell's own wiring only.
vi.mock('./Header',      () => ({ Header:     () => <div>header</div> }));
vi.mock('./BottomNav',   () => ({ BottomNav:  () => <div>nav</div> }));
vi.mock('./FAB',         () => ({ FAB:        () => <div>fab</div> }));
vi.mock('./SidePanel',   () => ({ SidePanel:  () => <div>panel</div> }));
vi.mock('../PeriodSetupPrompt', () => ({ PeriodSetupPrompt: () => null }));
vi.mock('../ui/InstallPrompt',  () => ({ InstallPrompt: () => null }));
vi.mock('../../features/hubs/CreateHubSheet', () => ({ CreateHubSheet: () => null }));
vi.mock('../../views/daily/AddTransactionSheet', () => ({ AddTransactionSheet: () => null }));
vi.mock('../../views/HomeView',     () => ({ HomeView:     () => <div>home view</div> }));
vi.mock('../../views/PaydayView',   () => ({ PaydayView:   () => null }));
vi.mock('../../views/DailyView',    () => ({ DailyView:    () => null }));
vi.mock('../../views/BudgetView',   () => ({ BudgetView:   () => null }));
vi.mock('../../views/LogView',      () => ({ LogView:      () => null }));
vi.mock('../../views/SettingsView', () => ({ SettingsView: () => null }));
vi.mock('../../views/PricingView',  () => ({ PricingView:  () => <div>pricing view</div> }));

import { DashboardShell } from './DashboardShell';

const props = {
  centres: [], archivedCentres: [], activeCentreId: 'c1',
  userPlan: 'free', newHubPlan: 'free', hubCount: 1,
  onSwitchCentre: vi.fn(), onHubCreated: vi.fn(), onRestoreHub: vi.fn(),
};

const mount = (route = '/') => {
  const { container } = render(
    <MemoryRouter initialEntries={[route]}><DashboardShell {...props} /></MemoryRouter>,
  );
  return container;
};

// Mirrors PullToRefresh.test.jsx: jsdom has no TouchEvent, and RESISTANCE is 0.5.
const pullToRefresh = async (container) => {
  const host = container.querySelector('main').parentElement;
  const ev = (type, y) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    e.touches = y == null ? [] : [{ clientY: y }];
    return e;
  };
  act(() => { host.dispatchEvent(ev('touchstart', 0)); });
  act(() => { host.dispatchEvent(ev('touchmove', (THRESHOLD + 20) * 2)); });
  await act(async () => { host.dispatchEvent(ev('touchend')); });
};

describe('DashboardShell — pull to refresh', () => {
  beforeEach(() => {
    reloadHub.mockClear();
    document.documentElement.scrollTop = 0;
  });

  it('wraps the routed main in a single pull-to-refresh', () => {
    const container = mount();
    expect(screen.getByText('home view')).toBeTruthy();
    expect(container.querySelectorAll('main')).toHaveLength(1);
  });

  it('pulling past the threshold reloads the whole hub', async () => {
    const container = mount();
    await pullToRefresh(container);
    expect(reloadHub).toHaveBeenCalledTimes(1);
  });

  it('is disabled on the chrome-less /pricing route', async () => {
    const container = mount('/pricing');
    expect(screen.getByText('pricing view')).toBeTruthy();
    await pullToRefresh(container);
    expect(reloadHub).not.toHaveBeenCalled();
  });
});

describe('DashboardShell — pull to refresh while loading', () => {
  it('is disabled behind the skeleton — there is nothing to refresh yet', async () => {
    vi.resetModules();
    vi.doMock('../../context/FinanceContext', () => makeFinanceMock({ reloadHub, loading: true }));
    const { DashboardShell: Shell } = await import('./DashboardShell');
    reloadHub.mockClear();

    const { container } = render(
      <MemoryRouter initialEntries={['/']}><Shell {...props} /></MemoryRouter>,
    );
    await pullToRefresh(container);
    expect(reloadHub).not.toHaveBeenCalled();
  });
});
