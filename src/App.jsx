/**
 * App.jsx
 *
 * Root component — auth gate + onboarding gate + dashboard.
 * Applies theme CSS variables on mount and when prefs or active centre change.
 * Provides routing via BrowserRouter.
 *
 * DashboardShell (components/layout/DashboardShell.jsx) lives inside BrowserRouter
 * so it has access to useNavigate, and owns all dashboard UI state (panel, sheet,
 * toast) plus the <Routes> block. It was extracted from this file to stay under
 * the 400-line cap — this file is gates + providers + routing only.
 *
 * MULTI-CENTRE:
 *   activeCentreId is stored in localStorage (ffc_active_centre_id).
 *   handleSwitchCentre updates state + storage, which re-drives useBudgetCentre.
 *   Theme applies centre.skin_id first, falling back to global pref.
 */

import { useState, useEffect, useCallback }      from 'react';
import { BrowserRouter }                        from 'react-router-dom';
import { useAuth }                               from './hooks/useAuth';
import { usePin }                                from './hooks/usePin';
import { useBudgetCentre }                       from './hooks/useBudgetCentre';
import { useCentres }                            from './hooks/useCentres';
import { useFinance }                            from './hooks/useFinance';
import { useSubscription }                       from './hooks/useSubscription';
import { useHubTier }                            from './hooks/useHubTier';
import { DashboardProviders }                    from './components/providers/DashboardProviders';
import { DashboardShell }                        from './components/layout/DashboardShell';
import { applyTheme, resolveSkin }                            from './lib/themes';
import { loadActiveCentreId, saveActiveCentreId, loadPrefs } from './lib/storage';
import { resetPasswordForEmail }                             from './services/auth.service';

// Apply saved skin immediately so there's no flash of default theme on reload
applyTheme(loadPrefs().themeSkin);

import { AuthScreen }                            from './views/AuthScreen';
import { PinScreen }                             from './views/PinScreen';
import { PinSetupFlow }                          from './views/PinSetupFlow';
import { OnboardingFlow }                        from './features/onboarding/OnboardingFlow';
import { LoadingScreen, ErrorScreen, RemovedScreen } from './components/ui/StateScreens';
import { JoinView }                              from './views/JoinView';
import { LegalView, resolveLegalSlug }           from './views/LegalView';
import { ResetPasswordScreen, isResetPasswordPath } from './views/ResetPasswordScreen';

export default function App() {
  const { user, loading: authLoading, signOut, isRecovery } = useAuth();
  // Latches once the reset screen hands back, so App stops re-rendering it and falls
  // through to the normal gates (the pathname check below is not reactive on its own).
  const [recoveryHandled, setRecoveryHandled]              = useState(false);
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
  // Tier for a hub you are about to CREATE — both doors (onboarding, CreateHubSheet).
  // Caller's own tier, null while unresolved/failed. See OnboardingFlow's JSDoc.
  const newHubPlan = subscription.isLoading || subscription.error ? null : userPlan;
  const { centre, allCategories, reloadCategories, members, currentMemberRole,
          addCategory, updateCentre, updateCentreSkin, updateCategory, deleteCategory,
          prevMonthCategories, loadPrevMonthCategories, copyCategoriesToMonth,
          archiveCentre, permanentDeleteCentre, restoreHub,
          inviteMember, removeMember, updateMemberRole, getInvites, cancelInvite,
          loading: centreLoading, needsOnboarding, removedFromHub,
          error, onOnboardingComplete }                   = useBudgetCentre(user, activeCentreId);
  // The ACTIVE HUB's tier = its OWNER's tier, which is what create_category /
  // create_invite / update_centre_skin enforce against. Distinct from userPlan (the
  // viewer's own account tier): they differ for every non-owner member, and gating
  // the client on userPlan is what produced both the false-cap and the
  // pay-for-nothing bugs. null until resolved → no cap renders. See useHubTier.
  const { tier: hubPlan }                                 = useHubTier(centre, user?.id, subscription.tier, subscription.isLoading);
  // useFinance owns the current-cycle `categories` slice (Commit 11.5) — it has the
  // cycle state useBudgetCentre lacks. The Provider's categories prop sources from here.
  // hubPlan (not userPlan) drives the history window — history is a property of the
  // hub, so a member of a Pro hub must see all of it.
  const financeValues                                     = useFinance({ centre, allCategories, hubPlan, memberRole: currentMemberRole, reloadCategories });

  // Persist the active centre ID once the first centre resolves
  useEffect(() => {
    if (centre?.id && !activeCentreId) {
      saveActiveCentreId(centre.id);
      setActiveCentreId(centre.id);
    }
  }, [centre?.id, activeCentreId]);

  // Apply theme — delegates role/skin resolution to the pure resolveSkin function in lib/themes.
  // hubPlan drives the downgrade clamp (Pro→Free renders family_warmth, non-destructive).
  // The hub's skin belongs to the hub, so it clamps on the OWNER's tier — matching
  // update_centre_skin's SKN01 gate, and resolveSkin's own JSDoc ("owner tier").
  // Hold while hubPlan is null: clamping on an unresolved tier would flash
  // family_warmth over a Pro hub's real skin before snapping back.
  useEffect(() => {
    if (hubPlan == null) return;
    applyTheme(resolveSkin(currentMemberRole, centre?.skin_id, financeValues?.prefs?.themeSkin, hubPlan));
  }, [centre?.skin_id, financeValues?.prefs?.themeSkin, currentMemberRole, hubPlan]);

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

  // Reset done — drop the recovery URL (and its consumed hash) and fall through to
  // the normal gates with the session still live. The PIN gate deliberately still
  // applies: a PIN is a device-level lock, and a password reset is not proof of
  // device possession.
  const handleRecoveryComplete = useCallback(() => {
    window.history.replaceState({}, '', '/');
    setRecoveryHandled(true);
  }, []);

  const handleForgotPin = useCallback(async () => {
    const { error } = await resetPasswordForEmail(user?.email || '');
    if (error) console.error('[App] resetPasswordForEmail error:', error.message);
    await removePin();
    signOut();
  }, [user?.email, removePin, signOut]);

  // ── Password recovery — bypass all gates ─────────────────────────────────
  // MUST come before the auth AND pin gates: a recovery link establishes a real
  // session, so `user` is non-null and the PIN gate would otherwise demand a PIN
  // from someone who arrived here unable to get in. Path is the primary trigger
  // (survives a reload); isRecovery is the backstop for links that land elsewhere.
  if (!recoveryHandled && (isResetPasswordPath(window.location.pathname) || isRecovery)) {
    return <ResetPasswordScreen onComplete={handleRecoveryComplete} />;
  }

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
    <OnboardingFlow onComplete={handleOnboardingComplete} existingCentreId={centre?.id || null} plan={newHubPlan} />
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
      finance={{ ...financeValues, userPlan, hubPlan }}
    >
      <BrowserRouter>
        <DashboardShell
          centres={centres}
          archivedCentres={archivedCentres}
          activeCentreId={centre?.id || null}
          userPlan={userPlan} newHubPlan={newHubPlan}
          hubCount={centres.filter(c => c.owner_id === user?.id).length}
          onSwitchCentre={handleSwitchCentre}
          onHubCreated={handleHubCreated}
          onRestoreHub={handleRestoreHub}
        />
      </BrowserRouter>
    </DashboardProviders>
  );
}
