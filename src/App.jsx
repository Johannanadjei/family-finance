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
import { usePin }                                from './hooks/usePin';
import { useBudgetCentre }                       from './hooks/useBudgetCentre';
import { useCentres }                            from './hooks/useCentres';
import { useFinance }                            from './hooks/useFinance';
import { BudgetCentreProvider }                  from './context/BudgetCentreContext';
import { FinanceProvider }                       from './context/FinanceContext';
import { PinProvider }                           from './context/PinContext';
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
import { HomeView }                              from './views/HomeView';
import { PaydayView }                            from './views/PaydayView';
import { DailyView }                             from './views/DailyView';
import { BudgetView }                            from './views/BudgetView';
import { LogView }                               from './views/LogView';
import { AddTransactionSheet }                   from './views/daily/AddTransactionSheet';
import { SettingsView }                          from './views/SettingsView';
import { Toast }                                 from './components/ui/Toast';
import { InstallPrompt }                         from './components/ui/InstallPrompt';
import { JoinView }                              from './views/JoinView';

function LoadingScreen({ message }) {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(145deg, var(--c-header-from, #064e3b), var(--c-header-to, #0d7060))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <img src="/icons/bos-icon-v2-white-512.png" alt="" style={{ width: 140, height: 140, objectFit: 'contain' }} />
      <h1 style={{ fontFamily: "'Nunito', sans-serif", fontSize: 32, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.1, margin: '14px 0 6px' }}>
        Money B.O.S
      </h1>
      <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--c-success-light, #6ee7b7)', margin: 0 }}>{message}</p>
    </div>
  );
}

function ErrorScreen({ message }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-danger-bg, #fef2f2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24 }}>
      <div style={{ fontSize: 48 }}>⚠️</div>
      <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--c-danger, #dc2626)', margin: 0, textAlign: 'center' }}>{message}</p>
    </div>
  );
}

function RemovedScreen({ otherCentres, onSwitchHub, onSignOut }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg, #f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24, textAlign: 'center', fontFamily: "'Nunito', sans-serif" }}>
      <p style={{ fontSize: 32, margin: 0 }}>🔒</p>
      <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: 0 }}>Removed from hub</p>
      <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: 0, lineHeight: 1.5, maxWidth: 280 }}>
        You have been removed from this hub. Contact the hub owner if you think this is a mistake.
      </p>
      {otherCentres.length > 0 && (
        <button onClick={() => onSwitchHub(otherCentres[0].id)}
          style={{ padding: '12px 24px', borderRadius: 12, border: 'none', background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>
          Switch to {otherCentres[0].name}
        </button>
      )}
      <button onClick={onSignOut}
        style={{ padding: '12px 24px', borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'transparent', color: 'var(--c-muted, #6b7280)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>
        Sign out
      </button>
    </div>
  );
}

function DashboardShell({ centres, archivedCentres, activeCentreId, userPlan, onSwitchCentre, onHubCreated, onRestoreHub }) {
  const navigate                           = useNavigate();
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
          </Routes>
        </main>
      </ErrorBoundary>
      {can('log') && <FAB onClick={() => setAddSheetOpen(true)} />}
      <BottomNav />
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
  const { centres, archivedCentres, plan: userPlan, reload: reloadCentres } = useCentres(user);
  const { centre, categories, members, currentMemberRole,
          addCategory, updateCentre, updateCategory, deleteCategory, updateIncomeSource,
          archiveCentre, permanentDeleteCentre, restoreHub,
          inviteMember, removeMember, updateMemberRole, getInvites, cancelInvite,
          loading: centreLoading, needsOnboarding, removedFromHub,
          error, onOnboardingComplete }                   = useBudgetCentre(user, activeCentreId);
  const financeValues                                     = useFinance({ centre, categories });

  // Persist the active centre ID once the first centre resolves
  useEffect(() => {
    if (centre?.id && !activeCentreId) {
      saveActiveCentreId(centre.id);
      setActiveCentreId(centre.id);
    }
  }, [centre?.id, activeCentreId]);

  // Apply theme — delegates role/skin resolution to the pure resolveSkin function in lib/themes.
  useEffect(() => {
    applyTheme(resolveSkin(currentMemberRole, centre?.skin_id, financeValues?.prefs?.themeSkin));
  }, [centre?.skin_id, financeValues?.prefs?.themeSkin, currentMemberRole]);

  const handleSwitchCentre = useCallback((id) => {
    saveActiveCentreId(id);
    setActiveCentreId(id);
  }, []);

  const handleHubCreated = useCallback(async (id) => {
    await reloadCentres();
    handleSwitchCentre(id);
  }, [reloadCentres, handleSwitchCentre]);

  // Onboarding handoff: refresh the hub LIST (SidePanel source) before clearing
  // the onboarding gate, so the freshly-created first hub is present the moment
  // the dashboard renders. onOnboardingComplete still fires even if the list
  // refetch fails — the hub was created; only the list fetch is a separate
  // problem and must not trap the user in onboarding.
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
  return (
    <PinProvider value={{ hasPinSetup, pinLoading, pinUnlocked, attempts, lockedUntil, verifyPin, setupPin, removePin }}>
    <BudgetCentreProvider
      centre={centre}
      categories={categories}
      members={members}
      currentMemberRole={currentMemberRole}
      currentUserId={user?.id || null}
      addCategory={addCategory}
      updateCentre={updateCentre}
      updateCategory={updateCategory}
      deleteCategory={deleteCategory}
      updateIncomeSource={updateIncomeSource}
      archiveCentre={handleArchiveHub}
      permanentDeleteCentre={handlePermanentDeleteHub}
      restoreHub={handleRestoreHub}
      inviteMember={inviteMember}
      removeMember={removeMember}
      updateMemberRole={updateMemberRole}
      getInvites={getInvites}
      cancelInvite={cancelInvite}
      centreCount={centres.length}
    >
      <FinanceProvider value={{ ...financeValues, userPlan }}>
        <BrowserRouter>
          <DashboardShell
            centres={centres}
            archivedCentres={archivedCentres}
            activeCentreId={centre?.id || null}
            userPlan={userPlan}
            onSwitchCentre={handleSwitchCentre}
            onHubCreated={handleHubCreated}
            onRestoreHub={handleRestoreHub}
          />
        </BrowserRouter>
      </FinanceProvider>
    </BudgetCentreProvider>
    </PinProvider>
  );
}
