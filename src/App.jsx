import { useState } from 'react';
import { isGuestPortalUrl } from './lib/guest';
import { buildThemeCSS } from './lib/themes';
import { useFinance } from './hooks/useFinance';
import { useAuth } from './hooks/useAuth';
import { useHousehold } from './hooks/useHousehold';
import { HouseholdProvider } from './context/HouseholdContext';
import { OnboardingFlow } from './features/onboarding/OnboardingFlow';
import { AuthScreen } from './views/AuthScreen';
import { Header } from './components/layout/Header';
import { BottomNav } from './components/layout/BottomNav';
import { FAB } from './components/layout/FAB';
import { InstallPrompt } from './components/layout/InstallPrompt';
import { WorkspacePanel } from './components/layout/WorkspacePanel';
import { AddModal } from './components/modals/AddModal';
import { GuestLoginModal, GuestPortalScreen } from './components/modals/GuestLoginModal';
import { WorkspaceCreateModal } from './components/modals/WorkspaceCreateModal';
import { HomeView } from './views/HomeView';
import { PaydayView } from './views/PaydayView';
import { DailyView } from './views/DailyView';
import { BudgetView } from './views/BudgetView';
import { LogView } from './views/LogView';
import { SettingsView } from './views/SettingsView';
import { GuestView } from './views/GuestView';

const IS_PORTAL = isGuestPortalUrl();
const UI = { APP: 'app', GUEST_PREVIEW: 'guestPreview', GUEST: 'guest' };

function LoadingScreen({ message }) {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(145deg,#064e3b,#0d7060)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#fff' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏡</div>
        <p style={{ fontSize: 16, fontWeight: 800, color: '#6ee7b7' }}>{message}</p>
      </div>
    </div>
  );
}

/**
 * Dashboard — rendered only after household is confirmed loaded.
 * Wrapped in HouseholdProvider so all child components can access
 * household config, categories, fmt, and getCatIcon via context.
 */
function Dashboard({ household, categories }) {
  const [tab,          setTab]          = useState('home');
  const [showModal,    setShowModal]    = useState(false);
  const [showWsPanel,  setShowWsPanel]  = useState(false);
  const [showWsCreate, setShowWsCreate] = useState(false);
  const [uiState,      setUiState]      = useState(UI.APP);
  const [guestUser,    setGuestUser]    = useState(null);

  const finance = useFinance(household, categories);

  const handleGuestSuccess = (name) => { setGuestUser({ name }); setUiState(UI.GUEST); };
  const handleGuestSignOut = () => { setGuestUser(null); setUiState(UI.APP); };
  const handleGuestTx      = (tx) => finance.addTransaction(tx);
  const handleAddWorkspace = (opts) => {
    const ok = finance.addWorkspace(opts);
    if (ok) { setShowWsCreate(false); setTab('home'); }
  };

  if (uiState === UI.GUEST_PREVIEW)
    return <GuestLoginModal guestSettings={finance.guestSettings} onSuccess={handleGuestSuccess} onBack={() => setUiState(UI.APP)} />;

  if (uiState === UI.GUEST && guestUser)
    return <GuestView guestUser={guestUser} guestSettings={finance.guestSettings} categories={categories} onAddTransaction={handleGuestTx} onSignOut={handleGuestSignOut} isPortalUrl={false} />;

  const themeCSS = buildThemeCSS(finance.theme.skinId, finance.theme.accentId);

  const VIEWS = {
    home:     <HomeView totalIncome={finance.totalIncome} totalSpent={finance.totalSpent} remaining={finance.remaining} healthPct={finance.healthPct} budgetStatus={finance.budgetStatus} txs={finance.txs} availableNow={finance.availableNow} nextUnpaid={finance.nextUnpaid} totalExpected={finance.totalExpected} totalReceived={finance.totalReceived} variableSpent={finance.variableSpent} surplusLeft={finance.surplusLeft} onGoPayday={() => setTab('payday')} />,
    payday:   <PaydayView incomes={finance.incomes} txs={finance.txs} totalExpected={finance.totalExpected} totalReceived={finance.totalReceived} availableNow={finance.availableNow} onMarkReceived={finance.markReceived} onMarkPending={finance.markPending} onUpdateExpected={finance.updateExpectedAmount} />,
    daily:    <DailyView txs={finance.txs} spendByDay={finance.spendByDay} />,
    budget:   <BudgetView catSpend={finance.catSpend} />,
    log:      <LogView txs={finance.txs} remaining={finance.remaining} />,
    settings: <SettingsView notifs={finance.notifs} setNotifs={finance.setNotifs} guestSettings={finance.guestSettings} setGuestSettings={finance.setGuestSettings} onPreviewGuest={() => setUiState(UI.GUEST_PREVIEW)} theme={finance.theme} setTheme={finance.setTheme} plan={finance.plan} />,
  };

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", maxWidth: 440, margin: '0 auto', position: 'relative', minHeight: '100vh', background: 'var(--c-page, #f3f4f6)' }}>
      <style dangerouslySetInnerHTML={{ __html: themeCSS }} />
      <Header remaining={finance.remaining} activeWs={finance.activeWs} isExtraWs={finance.isExtraWs} workspaceCount={finance.allWorkspaces.length} onSettingsClick={() => setTab('settings')} onWorkspaceClick={() => setShowWsPanel(true)} />
      <div style={{ padding: '16px 16px 100px' }}>{VIEWS[tab]}</div>
      <FAB onClick={() => setShowModal(true)} />
      <BottomNav activeTab={tab} onTabChange={setTab} />
      {showModal    && <AddModal onSubmit={finance.addTransaction} onClose={() => setShowModal(false)} />}
      {showWsCreate && <WorkspaceCreateModal onConfirm={handleAddWorkspace} onClose={() => setShowWsCreate(false)} />}
      {showWsPanel  && <WorkspacePanel allWorkspaces={finance.allWorkspaces} activeWsId={finance.activeWsId} plan={finance.plan} canAddWorkspace={finance.canAddWorkspace} onSwitch={finance.switchWorkspace} onAdd={() => { setShowWsPanel(false); setShowWsCreate(true); }} onClose={() => setShowWsPanel(false)} />}
      <InstallPrompt />
    </div>
  );
}

/**
 * GuestPortal — standalone flow, no household required.
 * Renders PIN screen → GuestView. Completely isolated from Dashboard.
 */
function GuestPortal() {
  const [guestUser, setGuestUser] = useState(null);
  const finance = useFinance(null, []);

  if (guestUser)
    return <GuestView guestUser={guestUser} guestSettings={finance.guestSettings} categories={[]} onAddTransaction={(tx) => finance.addTransaction(tx)} onSignOut={() => setGuestUser(null)} isPortalUrl={true} />;

  return <GuestPortalScreen onSuccess={(name) => setGuestUser({ name })} />;
}

export default function App() {
  const { user, loading: authLoading }                               = useAuth();
  const { household, categories, loading: householdLoading,
          needsOnboarding, onOnboardingComplete }                     = useHousehold(user);

  // Guest portal — completely isolated, no auth required
  if (IS_PORTAL) return <GuestPortal />;

  // Auth gate
  if (authLoading)      return <LoadingScreen message="Loading your family dashboard..." />;
  if (!user)            return <AuthScreen />;
  if (householdLoading) return <LoadingScreen message="Setting up your household..." />;
  if (needsOnboarding)  return <OnboardingFlow onComplete={onOnboardingComplete} />;

  // Household confirmed — wrap in context, render dashboard
  return (
    <HouseholdProvider household={household} categories={categories}>
      <Dashboard household={household} categories={categories} />
    </HouseholdProvider>
  );
}
