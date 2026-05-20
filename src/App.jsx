/**
 * App.jsx
 *
 * Root component — auth gate + onboarding gate + dashboard.
 * Applies theme CSS variables on mount and when prefs change.
 * Provides routing via BrowserRouter.
 * Passes financial values as props to layout components.
 *
 * Sessions:
 *   5  — AuthScreen
 *   6  — OnboardingFlow
 *   7  — Dashboard shell + routing (this session)
 *   8+ — Views filled in one at a time
 */

import { useState, useEffect }        from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuth }                    from './hooks/useAuth';
import { useBudgetCentre }            from './hooks/useBudgetCentre';
import { useCentres }                 from './hooks/useCentres';
import { useFinance }                 from './hooks/useFinance';
import { BudgetCentreProvider }       from './context/BudgetCentreContext';
import { applyTheme }                 from './lib/themes';
import { AuthScreen }                 from './views/AuthScreen';
import { OnboardingFlow }             from './features/onboarding/OnboardingFlow';
import { Header }                     from './components/layout/Header';
import { BottomNav }                  from './components/layout/BottomNav';
import { FAB }                        from './components/layout/FAB';
import { SidePanel }                  from './components/layout/SidePanel';
import { ErrorBoundary }              from './components/ui/ErrorBoundary';
import { HomeView }                   from './views/HomeView';
import { PaydayView }                 from './views/PaydayView';
import { DailyView }                  from './views/DailyView';
import { BudgetView }                 from './views/BudgetView';
import { LogView }                    from './views/LogView';

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

export default function App() {
  const { user, loading: authLoading }          = useAuth();
  const { centre, categories, members,
          loading: centreLoading, needsOnboarding,
          error, onOnboardingComplete }          = useBudgetCentre(user);
  const { centres }                             = useCentres(user);
  const financeValues                           = useFinance({ centre, categories });
  const [panelOpen, setPanelOpen]               = useState(false);

  // Apply theme whenever skin preference changes
  useEffect(() => {
    applyTheme(financeValues.prefs?.themeSkin || 'family_warmth');
  }, [financeValues.prefs?.themeSkin]);

  // ── Auth gate ─────────────────────────────────────────────────────────
  if (authLoading)     return <LoadingScreen message="Loading..." />;
  if (!user)           return <AuthScreen />;

  // ── Centre gate ───────────────────────────────────────────────────────
  if (centreLoading)   return <LoadingScreen message="Setting up your dashboard..." />;
  if (error)           return <ErrorScreen message={error} />;
  if (needsOnboarding) return (
    <OnboardingFlow
      onComplete={onOnboardingComplete}
      existingCentreId={centre?.id || null}
    />
  );

  // ── Dashboard ─────────────────────────────────────────────────────────
  return (
    <BudgetCentreProvider centre={centre} categories={categories} members={members}>
      <BrowserRouter>
        <div style={{
          maxWidth:   440,
          margin:     '0 auto',
          minHeight:  '100vh',
          background: 'var(--c-bg, #f3f4f6)',
          fontFamily: "'Nunito', sans-serif",
          position:   'relative',
        }}>
          <Header
            availableNow={financeValues.availableNow}
            totalReceived={financeValues.totalReceived}
            onOpenPanel={() => setPanelOpen(true)}
          />
          <ErrorBoundary>
            <main style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
              <Routes>
                <Route path="/"        element={<HomeView financeValues={financeValues} />} />
                <Route path="/payday"  element={<PaydayView financeValues={financeValues} />} />
                <Route path="/daily"   element={<DailyView />} />
                <Route path="/budget"  element={<BudgetView />} />
                <Route path="/log"     element={<LogView />} />
              </Routes>
            </main>
          </ErrorBoundary>
          <FAB onClick={() => {}} />
          <BottomNav />
          <SidePanel
            isOpen={panelOpen}
            onClose={() => setPanelOpen(false)}
            centres={centres}
            activeCentreId={centre?.id || null}
          />
        </div>
      </BrowserRouter>
    </BudgetCentreProvider>
  );
}
