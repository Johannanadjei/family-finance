/**
 * components/providers/DashboardProviders.test.jsx
 *
 * Verifies the provider composition wires each context through to children, so a
 * consumer can read Pin / Subscription / BudgetCentre / Finance values, and that
 * children render.
 */

import { describe, it, expect }       from 'vitest';
import { render, screen }             from '@testing-library/react';
import { DashboardProviders }         from './DashboardProviders';
import { useSubscriptionContext }     from '../../context/SubscriptionContext';
import { useFinanceContext }          from '../../context/FinanceContext';
import { useBudgetCentreContext }     from '../../context/BudgetCentreContext';
import { usePinContext }              from '../../context/PinContext';

function Probe() {
  const { tier }      = useSubscriptionContext();
  const { activeMonth } = useFinanceContext();
  const { centre }    = useBudgetCentreContext();
  const { hasPinSetup } = usePinContext();
  return (
    <div>
      <span data-testid="tier">{tier}</span>
      <span data-testid="month">{activeMonth}</span>
      <span data-testid="centre">{centre?.name}</span>
      <span data-testid="pin">{String(hasPinSetup)}</span>
    </div>
  );
}

describe('DashboardProviders', () => {
  const renderProviders = () => render(
    <DashboardProviders
      pin={{ hasPinSetup: true }}
      subscription={{ tier: 'pro', isPro: true }}
      budgetCentre={{ centre: { name: 'The Adjeis' } }}
      finance={{ activeMonth: '2026-06', userPlan: 'pro' }}
    >
      <Probe />
    </DashboardProviders>
  );

  it('renders children', () => {
    renderProviders();
    expect(screen.getByTestId('tier')).toBeTruthy();
  });

  it('wires every context value through to a consumer', () => {
    renderProviders();
    expect(screen.getByTestId('tier').textContent).toBe('pro');
    expect(screen.getByTestId('month').textContent).toBe('2026-06');
    expect(screen.getByTestId('centre').textContent).toBe('The Adjeis');
    expect(screen.getByTestId('pin').textContent).toBe('true');
  });
});
