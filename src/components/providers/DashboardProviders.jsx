/**
 * components/providers/DashboardProviders.jsx
 *
 * Composes the dashboard's context providers in one place, extracted from App.jsx
 * (kept under its 400-line cap; "extract, don't compress" — cf. PaydaySheets,
 * BudgetSheets). App calls all the hooks and passes their results in as values;
 * this component only nests the providers.
 *
 * Nesting order (outermost → innermost):
 *   PinProvider          — independent of the others
 *   SubscriptionProvider — independent; above Centre/Finance so gates can read it
 *   BudgetCentreProvider — static centre config (named props, explicit provider)
 *   FinanceProvider      — live financial state; innermost, reads from BudgetCentre
 *
 * children is <BrowserRouter><DashboardShell/></BrowserRouter> — routing stays in
 * App.jsx (a routes concern, not a provider concern).
 *
 * @param {object}   pin          — value for PinProvider
 * @param {object}   subscription — value for SubscriptionProvider (useSubscription return)
 * @param {object}   budgetCentre — named props spread into BudgetCentreProvider
 * @param {object}   finance      — value for FinanceProvider (useFinance return + userPlan)
 * @param {React.ReactNode} children
 */

import { PinProvider }          from '../../context/PinContext';
import { SubscriptionProvider } from '../../context/SubscriptionContext';
import { BudgetCentreProvider } from '../../context/BudgetCentreContext';
import { FinanceProvider }      from '../../context/FinanceContext';

export function DashboardProviders({ pin, subscription, budgetCentre, finance, children }) {
  return (
    <PinProvider value={pin}>
      <SubscriptionProvider value={subscription}>
        <BudgetCentreProvider {...budgetCentre}>
          <FinanceProvider value={finance}>
            {children}
          </FinanceProvider>
        </BudgetCentreProvider>
      </SubscriptionProvider>
    </PinProvider>
  );
}
