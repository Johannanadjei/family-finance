import { useState } from 'react';
import { useFinance } from './hooks/useFinance';
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
import { isGuestPortalUrl } from './lib/guest';
import { buildThemeCSS } from './lib/themes';

// Detect guest portal URL once on load — never changes during session
const IS_PORTAL = isGuestPortalUrl();

// UI states — family app flow only
const UI = { APP: 'app', GUEST_PREVIEW: 'guestPreview', GUEST: 'guest' };

export default function App() {
  const [tab,          setTab]          = useState('home');
  const [showModal,    setShowModal]    = useState(false);
  const [showWsPanel,  setShowWsPanel]  = useState(false);
  const [showWsCreate, setShowWsCreate] = useState(false);
  const [uiState,      setUiState]      = useState(UI.APP);
  const [guestUser,    setGuestUser]    = useState(null);

  const finance = useFinance();

  // ── Guest handlers ─────────────────────────────────────────────────────
  const handleGuestSuccess = (name) => {
    setGuestUser({ name });
    setUiState(UI.GUEST);
  };

  const handleGuestSignOut = () => {
    setGuestUser(null);
    // RULE: If on portal URL → stay on portal login screen (never go to dashboard)
    //       If previewing from settings → return to family dashboard
    if (!IS_PORTAL) setUiState(UI.APP);
  };

  const handleGuestTx = (tx) => finance.addTransaction(tx);

  // ── Workspace handlers ─────────────────────────────────────────────────
  const handleAddWorkspace = (opts) => {
    const ok = finance.addWorkspace(opts);
    if (ok) { setShowWsCreate(false); setTab('home'); }
  };

  // ── RULE: Guest portal URL — render guest flow only, never family dashboard ──
  if (IS_PORTAL) {
    if (uiState === UI.GUEST && guestUser) {
      return (
        <GuestView
          guestUser={guestUser}
          guestSettings={finance.guestSettings}
          onAddTransaction={handleGuestTx}
          onSignOut={handleGuestSignOut}
          isPortalUrl={true}
        />
      );
    }
    // Default for portal URL: straight to PIN screen, no back button
    return (
      <GuestPortalScreen onSuccess={handleGuestSuccess} />
    );
  }

  // ── Family app — preview guest flow from settings ──────────────────────
  if (uiState === UI.GUEST_PREVIEW) {
    return (
      <GuestLoginModal
        guestSettings={finance.guestSettings}
        onSuccess={handleGuestSuccess}
        onBack={() => setUiState(UI.APP)}
      />
    );
  }

  if (uiState === UI.GUEST && guestUser) {
    return (
      <GuestView
        guestUser={guestUser}
        guestSettings={finance.guestSettings}
        onAddTransaction={handleGuestTx}
        onSignOut={handleGuestSignOut}
        isPortalUrl={false}
      />
    );
  }

  // ── Main family dashboard ──────────────────────────────────────────────
  const themeCSS = buildThemeCSS(finance.theme.skinId, finance.theme.accentId);

  const VIEWS = {
    home: (
      <HomeView
        totalIncome={finance.totalIncome} totalSpent={finance.totalSpent}
        remaining={finance.remaining} healthPct={finance.healthPct}
        budgetStatus={finance.budgetStatus} txs={finance.txs}
        availableNow={finance.availableNow} nextUnpaid={finance.nextUnpaid}
        totalExpected={finance.totalExpected} totalReceived={finance.totalReceived}
        variableSpent={finance.variableSpent}
        surplusLeft={finance.surplusLeft}
        onGoPayday={() => setTab('payday')}
      />
    ),
    payday: (
      <PaydayView
        incomes={finance.incomes} txs={finance.txs}
        totalExpected={finance.totalExpected} totalReceived={finance.totalReceived}
        availableNow={finance.availableNow}
        onMarkReceived={finance.markReceived} onMarkPending={finance.markPending}
      />
    ),
    daily:    <DailyView txs={finance.txs} spendByDay={finance.spendByDay} />,
    budget:   <BudgetView catSpend={finance.catSpend} />,
    log:      <LogView txs={finance.txs} />,
    settings: (
      <SettingsView
        notifs={finance.notifs} setNotifs={finance.setNotifs}
        guestSettings={finance.guestSettings}
        setGuestSettings={finance.setGuestSettings}
        onPreviewGuest={() => setUiState(UI.GUEST_PREVIEW)}
        theme={finance.theme}
        setTheme={finance.setTheme}
        plan={finance.plan}
      />
    ),
  };

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", maxWidth: 440, margin: '0 auto', position: 'relative', minHeight: '100vh', background: 'var(--c-page, #f3f4f6)' }}>
      <style dangerouslySetInnerHTML={{ __html: themeCSS }} />
      <Header
        remaining={finance.remaining}
        activeWs={finance.activeWs}
        isExtraWs={finance.isExtraWs}
        workspaceCount={finance.allWorkspaces.length}
        onSettingsClick={() => setTab('settings')}
        onWorkspaceClick={() => setShowWsPanel(true)}
      />
      <div style={{ padding: '16px 16px 100px' }}>{VIEWS[tab]}</div>
      <FAB onClick={() => setShowModal(true)} />
      <BottomNav activeTab={tab} onTabChange={setTab} />
      {showModal    && <AddModal onSubmit={finance.addTransaction} onClose={() => setShowModal(false)} />}
      {showWsCreate && <WorkspaceCreateModal onConfirm={handleAddWorkspace} onClose={() => setShowWsCreate(false)} />}
      {showWsPanel  && (
        <WorkspacePanel
          allWorkspaces={finance.allWorkspaces}
          activeWsId={finance.activeWsId}
          plan={finance.plan}
          canAddWorkspace={finance.canAddWorkspace}
          onSwitch={finance.switchWorkspace}
          onAdd={() => { setShowWsPanel(false); setShowWsCreate(true); }}
          onClose={() => setShowWsPanel(false)}
        />
      )}
      <InstallPrompt />
    </div>
  );
}
