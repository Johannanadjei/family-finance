/**
 * App.jsx
 *
 * Root component — auth gate + onboarding gate + dashboard.
 * Applies theme CSS variables on mount and when prefs or active centre change.
 * Provides routing via BrowserRouter.
 *
 * DashboardShell lives inside BrowserRouter so it has access to useNavigate.
 * All UI state (panel, sheet, toast) is owned by DashboardShell.
 *
 * MULTI-CENTRE:
 *   activeCentreId is stored in localStorage (ffc_active_centre_id).
 *   handleSwitchCentre updates state + storage, which re-drives useBudgetCentre.
 *   Theme applies centre.skin_id first, falling back to global pref.
 */

import { useState, useEffect, useCallback }      from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { useAuth }                               from './hooks/useAuth';
import { useBudgetCentre }                       from './hooks/useBudgetCentre';
import { useCentres }                            from './hooks/useCentres';
import { useFinance }                            from './hooks/useFinance';
import { BudgetCentreProvider }                  from './context/BudgetCentreContext';
import { FinanceProvider }                       from './context/FinanceContext';
import { useBudgetCentreContext }                from './context/BudgetCentreContext';
import { useFinanceContext }                     from './context/FinanceContext';
import { applyTheme }                                        from './lib/themes';
import { loadActiveCentreId, saveActiveCentreId, loadPrefs } from './lib/storage';

// Apply saved skin immediately so there's no flash of default theme on reload
applyTheme(loadPrefs().themeSkin);
import { AuthScreen }                            from './views/AuthScreen';
import { OnboardingFlow }                        from './features/onboarding/OnboardingFlow';
import { Header }                                from './components/layout/Header';
import { BottomNav }                             from './components/layout/BottomNav';
import { FAB }                                   from './components/layout/FAB';
import { SidePanel }                             from './components/layout/SidePanel';
import { CreateHubSheet }                        from './features/hubs/CreateHubSheet';
import { ErrorBoundary }                         from './components/ui/ErrorBoundary';
import { HomeView }                              from './views/HomeView';
import { PaydayView }                            from './views/PaydayView';
import { DailyView }                             from './views/DailyView';
import { BudgetView }                            from './views/BudgetView';
import { LogView }                               from './views/LogView';
import { AddTransactionSheet }                   from './views/daily/AddTransactionSheet';
import { SettingsView }                          from './views/SettingsView';
import { Toast }                                 from './components/ui/Toast';
import { isKnownCategory }                       from './lib/finance';

function LoadingScreen({ message }) {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(145deg, #064e3b, #0d7060)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 48 }}>🏠</div>
      <p style={{ fontSize: 16, fontWeight: 800, color: '#6ee7b7', margin: 0 }}>{message}</p>
    </div>
  );
}

function ErrorScreen({ message }) {
  return (
    <div style={{ minHeight: '100vh', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24 }}>
      <div style={{ fontSize: 48 }}>⚠️</div>
      <p style={{ fontSize: 16, fontWeight: 800, color: '#dc2626', margin: 0, textAlign: 'center' }}>{message}</p>
    </div>
  );
}

function DashboardShell({ centres, activeCentreId, userPlan, onSwitchCentre, onHubCreated }) {
  const navigate                           = useNavigate();
  const { categories }                     = useBudgetCentreContext();
  const { incomes, loading }               = useFinanceContext();
  const [panelOpen,       setPanelOpen]    = useState(false);
  const [addSheetOpen,    setAddSheetOpen] = useState(false);
  const [createHubOpen,   setCreateHubOpen] = useState(false);
  const handleOpenCreateHub  = useCallback(() => { setPanelOpen(false); setCreateHubOpen(true); }, []);
  const handleHubCreatedNav  = useCallback(async (id) => { await onHubCreated(id); navigate('/'); }, [onHubCreated, navigate]);
  const [toast,           setToast]        = useState(null);
  const [editTx,          setEditTx]       = useState(null);

  const handleSaved = (savedTx) => {
    if (!savedTx) return;
    if (savedTx.type === 'expense' && !isKnownCategory(savedTx.category_name, categories)) {
      setToast({ tx: savedTx, kind: 'expense' });
    } else if (
      savedTx.type === 'income' &&
      !loading &&
      !incomes.some(src => src.label?.toLowerCase() === savedTx.category_name?.toLowerCase())
    ) {
      setToast({ tx: savedTx, kind: 'income' });
    }
  };

  return (
    <div style={{
      maxWidth:   440,
      margin:     '0 auto',
      minHeight:  '100vh',
      background: 'var(--c-bg, #f3f4f6)',
      fontFamily: "'Nunito', sans-serif",
      position:   'relative',
    }}>
      <Header onOpenPanel={() => setPanelOpen(true)} />
      <ErrorBoundary>
        <main style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
          <Routes>
            <Route path="/"         element={<HomeView />} />
            <Route path="/payday"   element={<PaydayView />} />
            <Route path="/daily"    element={<DailyView />} />
            <Route path="/budget"   element={<BudgetView />} />
            <Route path="/log"      element={<LogView onEditTx={(tx) => { setEditTx(tx); setAddSheetOpen(true); }} />} />
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </main>
      </ErrorBoundary>
      <FAB onClick={() => setAddSheetOpen(true)} />
      <BottomNav />
      <AddTransactionSheet
        isOpen={addSheetOpen}
        onClose={() => { setAddSheetOpen(false); setEditTx(null); }}
        onSaved={handleSaved}
        editTx={editTx}
      />
      {toast?.kind === 'expense' && (
        <Toast
          message="This will come from your Spare Money"
          onEdit={() => { setEditTx(toast.tx); setAddSheetOpen(true); setToast(null); }}
          onDismiss={() => setToast(null)}
        />
      )}
      {toast?.kind === 'income' && (
        <Toast
          message="Set up your income sources in Settings for better tracking"
          actionLabel="Go to Settings"
          onEdit={() => { navigate('/settings'); setToast(null); }}
          onDismiss={() => setToast(null)}
        />
      )}
      <SidePanel
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        centres={centres}
        activeCentreId={activeCentreId}
        onSwitch={onSwitchCentre}
        onCreateHub={handleOpenCreateHub}
        userPlan={userPlan}
      />
      <CreateHubSheet
        isOpen={createHubOpen}
        onClose={() => setCreateHubOpen(false)}
        onComplete={handleHubCreatedNav}
      />
    </div>
  );
}

export default function App() {
  const { user, loading: authLoading }                    = useAuth();
  const [activeCentreId, setActiveCentreId]               = useState(() => loadActiveCentreId());
  const { centres, plan: userPlan, reload: reloadCentres } = useCentres(user);
  const { centre, categories, members, addCategory,
          updateCentre, updateCategory, deleteCategory,
          loading: centreLoading, needsOnboarding,
          error, onOnboardingComplete }                   = useBudgetCentre(user, activeCentreId);
  const financeValues                                     = useFinance({ centre, categories });

  // Persist the active centre ID once the first centre resolves
  useEffect(() => {
    if (centre?.id && !activeCentreId) {
      saveActiveCentreId(centre.id);
      setActiveCentreId(centre.id);
    }
  }, [centre?.id, activeCentreId]);

  // Apply theme — per-centre skin takes priority over global pref
  useEffect(() => {
    applyTheme(centre?.skin_id || financeValues.prefs?.themeSkin || 'family_warmth');
  }, [centre?.skin_id, financeValues.prefs?.themeSkin]);

  const handleSwitchCentre = useCallback((id) => {
    saveActiveCentreId(id);
    setActiveCentreId(id);
  }, []);

  const handleHubCreated = useCallback(async (id) => {
    await reloadCentres();
    handleSwitchCentre(id);
  }, [reloadCentres, handleSwitchCentre]);

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (authLoading)     return <LoadingScreen message="Loading..." />;
  if (!user)           return <AuthScreen />;

  // ── Centre gate ───────────────────────────────────────────────────────────
  if (centreLoading)   return <LoadingScreen message="Setting up your dashboard..." />;
  if (error)           return <ErrorScreen message={error} />;
  if (needsOnboarding) return (
    <OnboardingFlow
      onComplete={onOnboardingComplete}
      existingCentreId={centre?.id || null}
    />
  );

  // ── Dashboard ─────────────────────────────────────────────────────────────
  return (
    <BudgetCentreProvider
      centre={centre}
      categories={categories}
      members={members}
      addCategory={addCategory}
      updateCentre={updateCentre}
      updateCategory={updateCategory}
      deleteCategory={deleteCategory}
    >
      <FinanceProvider value={{ ...financeValues, userPlan }}>
        <BrowserRouter>
          <DashboardShell
            centres={centres}
            activeCentreId={centre?.id || null}
            userPlan={userPlan}
            onSwitchCentre={handleSwitchCentre}
            onHubCreated={handleHubCreated}
          />
        </BrowserRouter>
      </FinanceProvider>
    </BudgetCentreProvider>
  );
}
