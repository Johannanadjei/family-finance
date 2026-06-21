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
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useAuth }                               from './hooks/useAuth';
import { usePin }                                from './hooks/usePin';
import { useBudgetCentre }                       from './hooks/useBudgetCentre';
import { useCentres }                            from './hooks/useCentres';
import { useFinance }                            from './hooks/useFinance';
import { useSubscription }                       from './hooks/useSubscription';
import { DashboardProviders }                    from './components/providers/DashboardProviders';
import { useBudgetCentreContext }                from './context/BudgetCentreContext';
import { useFinanceContext }                     from './context/FinanceContext';
import { applyTheme, resolveSkin }                            from './lib/themes';
import { loadActiveCentreId, saveActiveCentreId, loadPrefs } from './lib/storage';
import { resetPasswordForEmail }                             from './services/auth.service';

// Apply saved skin immediately so there's no flash of default theme on reload
applyTheme(loadPrefs().themeSkin);
import { AuthScreen }                            from './views/AuthScreen';
import { PinScreen }                             from './views/PinScreen';
import { PinSetupFlow }                          from './views/PinSetupFlow';
import { OnboardingFlow }                        from './features/onboarding/OnboardingFlow';
import { Header }                                from './components/layout/Header';
import { BottomNav }                             from './components/layout/BottomNav';
import { FAB }                                   from './components/layout/FAB';
import { SidePanel }                             from './components/layout/SidePanel';
import { CreateHubSheet }                        from './features/hubs/CreateHubSheet';
import { ErrorBoundary }                         from './components/ui/ErrorBoundary';
import { LoadingScreen, ErrorScreen, RemovedScreen } from './components/ui/StateScreens';
import { HomeView }                              from './views/HomeView';
import { PaydayView }                            from './views/PaydayView';
import { DailyView }                             from './views/DailyView';
import { BudgetView }                            from './views/BudgetView';
import { LogView }                               from './views/LogView';
import { PricingView }                           from './views/PricingView';
import { AddTransactionSheet }                   from './views/daily/AddTransactionSheet';
import { SettingsView }                          from './views/SettingsView';
import { Toast }                                 from './components/ui/Toast';
import { InstallPrompt }                         from './components/ui/InstallPrompt';
import { JoinView }                              from './views/JoinView';
import { LegalView, resolveLegalSlug }           from './views/LegalView';

function DashboardShell({ centres, archivedCentres, activeCentreId, userPlan, hubCount, onSwitchCentre, onHubCreated, onRestoreHub }) {
  const navigate                           = useNavigate();
  const isPricing                          = useLocation().pathname === '/pricing';  // chrome-less full-screen route
  const { can }                            = useBudgetCentreContext();
  const { incomes, loading, error, reload } = useFinanceContext();
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
        <main style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
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
        isOpen={createHubOpen}
        onClose={() => setCreateHubOpen(false)}
        onComplete={handleHubCreatedNav}
      />
    </div>
  );
}

export default function App() {
  const { user, loading: authLoading, signOut }           = useAuth();
  const { hasPinSetup, pinLoading, pinUnlocked,
          attempts, lockedUntil,
          verifyPin, setupPin, removePin }                 = usePin(user);
  const [pinSkipped, setPinSkipped]                        = useState(false);
  const [activeCentreId, setActiveCentreId]               = useState(() => loadActiveCentreId());
  const { centres, archivedCentres, reload: reloadCentres } = useCentres(user);
  // Plan tier sourced from the subscriptions table (replaces the old users.plan read).
  // Spread into FinanceContext below as `userPlan`; consumers migrate to useIsPro() in gate work.
  const subscription                                       = useSubscription(user);
  const userPlan                                           = subscription.tier;
  const { centre, allCategories, reloadCategories, members, currentMemberRole,
          addCategory, updateCentre, updateCentreSkin, updateCategory, deleteCategory,
          prevMonthCategories, loadPrevMonthCategories, copyCategoriesToMonth,
          archiveCentre, permanentDeleteCentre, restoreHub,
          inviteMember, removeMember, updateMemberRole, getInvites, cancelInvite,
          loading: centreLoading, needsOnboarding, removedFromHub,
          error, onOnboardingComplete }                   = useBudgetCentre(user, activeCentreId);
  // useFinance owns the current-cycle `categories` slice (Commit 11.5) — it has the
  // cycle state useBudgetCentre lacks. The Provider's categories prop sources from here.
  const financeValues                                     = useFinance({ centre, allCategories, userPlan });

  // Persist the active centre ID once the first centre resolves
  useEffect(() => {
    if (centre?.id && !activeCentreId) {
      saveActiveCentreId(centre.id);
      setActiveCentreId(centre.id);
    }
  }, [centre?.id, activeCentreId]);

  // Apply theme — delegates role/skin resolution to the pure resolveSkin function in lib/themes.
  // userPlan drives the downgrade clamp (Pro→Free renders family_warmth, non-destructive).
  useEffect(() => {
    applyTheme(resolveSkin(currentMemberRole, centre?.skin_id, financeValues?.prefs?.themeSkin, userPlan));
  }, [centre?.skin_id, financeValues?.prefs?.themeSkin, currentMemberRole, userPlan]);

  const handleSwitchCentre = useCallback((id) => {
    saveActiveCentreId(id);
    setActiveCentreId(id);
  }, []);

  const handleHubCreated = useCallback(async (id) => {
    await reloadCentres();
    handleSwitchCentre(id);
  }, [reloadCentres, handleSwitchCentre]);

  // Onboarding handoff: refresh the hub LIST (SidePanel source) before clearing the
  // onboarding gate, so the freshly-created first hub is present when the dashboard
  // renders. onOnboardingComplete still fires even if the list refetch fails — the hub
  // was created; only the list fetch is a separate problem and must not trap the user.
  const handleOnboardingComplete = useCallback(async () => {
    try {
      await reloadCentres();
    } finally {
      onOnboardingComplete();
    }
  }, [reloadCentres, onOnboardingComplete]);

  const handleArchiveHub = useCallback(async () => {
    const nextHub = centres.find(c => c.id !== centre?.id);
    const { error: err } = await archiveCentre(centre?.id);
    if (err) return { error: err };
    await reloadCentres();
    if (nextHub) {
      handleSwitchCentre(nextHub.id);
    } else {
      saveActiveCentreId(null);
      setActiveCentreId(null);
    }
    return { error: null };
  }, [centre?.id, centres, archiveCentre, reloadCentres, handleSwitchCentre]);

  const handlePermanentDeleteHub = useCallback(async () => {
    const nextHub = centres.find(c => c.id !== centre?.id);
    const { error: err } = await permanentDeleteCentre(centre?.id);
    if (err) return { error: err };
    await reloadCentres();
    if (nextHub) {
      handleSwitchCentre(nextHub.id);
    } else {
      saveActiveCentreId(null);
      setActiveCentreId(null);
    }
    return { error: null };
  }, [centre?.id, centres, permanentDeleteCentre, reloadCentres, handleSwitchCentre]);

  const handleRestoreHub = useCallback(async (centreId) => {
    const { error: err } = await restoreHub(centreId);
    if (err) return { error: err };
    await reloadCentres();
    handleSwitchCentre(centreId);
    return { error: null };
  }, [restoreHub, reloadCentres, handleSwitchCentre]);

  const handleForgotPin = useCallback(async () => {
    const { error } = await resetPasswordForEmail(user?.email || '');
    if (error) console.error('[App] resetPasswordForEmail error:', error.message);
    await removePin();
    signOut();
  }, [user?.email, removePin, signOut]);

  // ── Invite join — bypass all gates so unauthenticated invitees can reach it
  if (window.location.pathname.replace(/\/$/, '') === '/join') return <BrowserRouter><JoinView /></BrowserRouter>;

  // ── Legal pages — public, bypass all gates (regulators, app-store reviewers, logged-out users)
  const legalSlug = resolveLegalSlug(window.location.pathname);
  if (legalSlug) return <BrowserRouter><LegalView slug={legalSlug} /></BrowserRouter>;

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (authLoading)     return <LoadingScreen message="Loading..." />;
  if (!user)           return <AuthScreen />;

  // ── PIN gate ──────────────────────────────────────────────────────────────
  if (pinLoading)                      return <LoadingScreen message="Loading..." />;
  if (!hasPinSetup && !pinSkipped)     return (
    <PinSetupFlow
      setupPin={async (pin) => {
        const result = await setupPin(pin);
        if (!result.error) window.history.replaceState({}, '', '/');
        return result;
      }}
      onSkip={() => setPinSkipped(true)}
    />
  );
  if (hasPinSetup && !pinUnlocked)     return (
    <PinScreen
      user={user}
      verifyPin={async (pin) => {
        const result = await verifyPin(pin);
        if (result.success) window.history.replaceState({}, '', '/');
        return result;
      }}
      lockedUntil={lockedUntil}
      attempts={attempts}
      onForgotPin={handleForgotPin}
    />
  );

  // ── Centre gate ───────────────────────────────────────────────────────────
  if (centreLoading)   return <LoadingScreen message="Setting up your dashboard..." />;
  if (error)           return <ErrorScreen message={error} />;
  if (needsOnboarding) return (
    <OnboardingFlow
      onComplete={handleOnboardingComplete}
      existingCentreId={centre?.id || null}
    />
  );
  if (removedFromHub) return (
    <RemovedScreen
      otherCentres={centres.filter(c => c.id !== centre?.id)}
      onSwitchHub={handleSwitchCentre}
      onSignOut={signOut}
    />
  );

  // ── Dashboard ─────────────────────────────────────────────────────────────
  const budgetCentreValue = {
    centre,
    categories: financeValues.categories,
    allCategories,
    reloadCategories,
    members,
    currentMemberRole,
    currentUserId: user?.id || null,
    addCategory,
    updateCentre,
    updateCentreSkin,
    updateCategory,
    deleteCategory,
    prevMonthCategories,
    loadPrevMonthCategories,
    copyCategoriesToMonth,
    archiveCentre: handleArchiveHub,
    permanentDeleteCentre: handlePermanentDeleteHub,
    restoreHub: handleRestoreHub,
    inviteMember,
    removeMember,
    updateMemberRole,
    getInvites,
    cancelInvite,
    centreCount: centres.length,
  };

  return (
    <DashboardProviders
      pin={{ hasPinSetup, pinLoading, pinUnlocked, attempts, lockedUntil, verifyPin, setupPin, removePin }}
      subscription={subscription}
      budgetCentre={budgetCentreValue}
      finance={{ ...financeValues, userPlan }}
    >
      <BrowserRouter>
        <DashboardShell
          centres={centres}
          archivedCentres={archivedCentres}
          activeCentreId={centre?.id || null}
          userPlan={userPlan}
          hubCount={centres.filter(c => c.owner_id === user?.id).length}
          onSwitchCentre={handleSwitchCentre}
          onHubCreated={handleHubCreated}
          onRestoreHub={handleRestoreHub}
        />
      </BrowserRouter>
    </DashboardProviders>
  );
}
