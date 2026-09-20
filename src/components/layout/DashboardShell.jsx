/**
 * components/layout/DashboardShell.jsx
 *
 * The signed-in dashboard's chrome and routes, extracted from App.jsx to keep that
 * file within its 400-line cap — the same cut DashboardProviders documents
 * ("extract, don't compress"). App.jsx still owns the three-gate startup logic and
 * renders <BrowserRouter><DashboardShell/></BrowserRouter>; this file owns the
 * header, nav, FAB, sheets, toasts and the <Routes> block.
 *
 * It lives inside BrowserRouter so it can use useNavigate / useLocation, and inside
 * both context providers so it can read useBudgetCentreContext / useFinanceContext.
 *
 * PULL-TO-REFRESH mounts here, ONCE, around the routed <main>. The app scrolls the
 * document — no view has its own overflow container — so there is exactly one
 * scroller, and wrapping it here gives Home / Payday / Daily / Budget / Log the
 * same gesture without five copies of it. It is disabled on /pricing, which is the
 * chrome-less full-screen route, and while the finance state is still loading
 * (there is nothing to refresh behind a skeleton).
 */

import { useState, useEffect, useCallback }      from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useBudgetCentreContext }                from '../../context/BudgetCentreContext';
import { useFinanceContext }                     from '../../context/FinanceContext';
import { Header }                                from './Header';
import { BottomNav }                             from './BottomNav';
import { FAB }                                   from './FAB';
import { SidePanel }                             from './SidePanel';
import { CreateHubSheet }                        from '../../features/hubs/CreateHubSheet';
import { PeriodSetupPrompt }                     from '../PeriodSetupPrompt';
import { ErrorBoundary }                         from '../ui/ErrorBoundary';
import { PullToRefresh }                         from '../ui/PullToRefresh';
import { HomeView }                              from '../../views/HomeView';
import { PaydayView }                            from '../../views/PaydayView';
import { DailyView }                             from '../../views/DailyView';
import { BudgetView }                            from '../../views/BudgetView';
import { LogView }                               from '../../views/LogView';
import { PricingView }                           from '../../views/PricingView';
import { AddTransactionSheet }                   from '../../views/daily/AddTransactionSheet';
import { SettingsView }                          from '../../views/SettingsView';
import { Toast }                                 from '../ui/Toast';
import { InstallPrompt }                         from '../ui/InstallPrompt';

export function DashboardShell({ centres, archivedCentres, activeCentreId, userPlan, newHubPlan, hubCount, onSwitchCentre, onHubCreated, onRestoreHub }) {
  const navigate                           = useNavigate();
  const isPricing                          = useLocation().pathname === '/pricing';  // chrome-less full-screen route
  const { can }                            = useBudgetCentreContext();
  const { incomes, loading, error, reload, reloadHub } = useFinanceContext();
  const [panelOpen,       setPanelOpen]    = useState(false);
  const [addSheetOpen,    setAddSheetOpen] = useState(false);
  const [createHubOpen,   setCreateHubOpen] = useState(false);
  const handleOpenCreateHub  = useCallback(() => { setPanelOpen(false); setCreateHubOpen(true); }, []);
  const handleHubCreatedNav  = useCallback(async (id) => { await onHubCreated(id); navigate('/'); }, [onHubCreated, navigate]);
  const [toast,           setToast]        = useState(null);
  const [editTx,          setEditTx]       = useState(null);
  const [errorDismissed,  setErrorDismissed] = useState(false);

  // Surface a failed finance fetch as a retryable banner — never let it render as
  // a silent empty dashboard (the data-loss-on-refresh class). Reset on each new error.
  useEffect(() => { if (error) setErrorDismissed(false); }, [error]);

  const handleSaved = (savedTx) => {
    if (!savedTx) return;
    if (
      savedTx.type === 'income' &&
      !loading &&
      !incomes.some(src => src.label?.toLowerCase() === savedTx.category_name?.toLowerCase())
    ) {
      setToast({ tx: savedTx, kind: 'income' });
    }
  };

  return (
    <div id="app-shell" style={{
      maxWidth:   440,
      margin:     '0 auto',
      minHeight:  '100vh',
      background: 'var(--c-bg, #f3f4f6)',
      fontFamily: "'Nunito', sans-serif",
      position:   'relative',
    }}>
      <Header onOpenPanel={() => setPanelOpen(true)} />
      <ErrorBoundary>
        <PullToRefresh onRefresh={reloadHub} disabled={isPricing || loading}>
        <main style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
          {!isPricing && <PeriodSetupPrompt />}{/* ONE mount for the whole dashboard — self-hiding, self-routing */}
          <Routes>
            <Route path="/"         element={<HomeView />} />
            <Route path="/payday"   element={<PaydayView />} />
            <Route path="/daily"    element={<DailyView />} />
            <Route path="/budget"   element={<BudgetView />} />
            <Route path="/log"      element={<LogView onEditTx={(tx) => { setEditTx(tx); setAddSheetOpen(true); }} />} />
            <Route path="/settings" element={<SettingsView />} />
            <Route path="/pricing"  element={<PricingView />} />
          </Routes>
        </main>
        </PullToRefresh>
      </ErrorBoundary>
      {!isPricing && can('log') && <FAB onClick={() => setAddSheetOpen(true)} />}
      {!isPricing && <BottomNav />}
      <AddTransactionSheet
        isOpen={addSheetOpen}
        onClose={() => { setAddSheetOpen(false); setEditTx(null); }}
        onSaved={handleSaved}
        editTx={editTx}
      />
      {toast?.kind === 'income' && (
        <Toast
          message="Set up your income sources in Settings for better tracking"
          actionLabel="Go to Settings"
          onEdit={() => { navigate('/settings'); setToast(null); }}
          onDismiss={() => setToast(null)}
        />
      )}
      {error && !errorDismissed && (
        <Toast
          message="Couldn't load your latest data."
          actionLabel="Retry"
          onEdit={() => reload()}
          onDismiss={() => setErrorDismissed(true)}
          autoDismissMs={null}
        />
      )}
      {!panelOpen && <InstallPrompt />}
      <SidePanel
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        centres={centres}
        archivedCentres={archivedCentres}
        activeCentreId={activeCentreId}
        onSwitch={onSwitchCentre}
        onCreateHub={handleOpenCreateHub}
        onRestore={onRestoreHub}
        userPlan={userPlan}
        hubCount={hubCount}
      />
      <CreateHubSheet
        isOpen={createHubOpen} plan={newHubPlan}
        onClose={() => setCreateHubOpen(false)}
        onComplete={handleHubCreatedNav}
      />
    </div>
  );
}
