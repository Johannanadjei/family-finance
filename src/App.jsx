/**
 * App.jsx
 *
 * Root component — auth gate + onboarding gate + BudgetCentreProvider.
 * Built in stages:
 *   Session 5  — this skeleton
 *   Session 6  — AuthScreen added
 *   Session 7  — OnboardingFlow added
 *   Session 8+ — views added one at a time
 *
 * ARCHITECTURE:
 *   useAuth()          → auth state
 *   useBudgetCentre()  → centre + categories + members
 *   BudgetCentreProvider → wraps dashboard, provides context to all views
 */

import { useAuth } from './hooks/useAuth';
import { useBudgetCentre } from './hooks/useBudgetCentre';
import { BudgetCentreProvider } from './context/BudgetCentreContext';

function LoadingScreen({ message }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #064e3b, #0d7060)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 16,
    }}>
      <div style={{ fontSize: 48 }}>🏠</div>
      <p style={{ fontSize: 16, fontWeight: 800, color: '#6ee7b7', margin: 0 }}>
        {message}
      </p>
    </div>
  );
}

function ErrorScreen({ message }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#fef2f2',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 16,
      padding: 24,
    }}>
      <div style={{ fontSize: 48 }}>⚠️</div>
      <p style={{ fontSize: 16, fontWeight: 800, color: '#dc2626', margin: 0, textAlign: 'center' }}>
        {message}
      </p>
    </div>
  );
}

export default function App() {
  const { user, loading: authLoading }                          = useAuth();
  const { centre, categories, members, loading: centreLoading,
          needsOnboarding, error, onOnboardingComplete }        = useBudgetCentre(user);

  // ── Auth gate ─────────────────────────────────────────────────────────
  if (authLoading)    return <LoadingScreen message="Loading..." />;
  if (!user)          return <LoadingScreen message="Please sign in" />;

  // ── Household gate ────────────────────────────────────────────────────
  if (centreLoading)   return <LoadingScreen message="Setting up your dashboard..." />;
  if (error)           return <ErrorScreen message={error} />;
  if (needsOnboarding) return <LoadingScreen message="Welcome! Let's set up your budget centre." />;

  // ── Dashboard ─────────────────────────────────────────────────────────
  return (
    <BudgetCentreProvider centre={centre} categories={categories} members={members}>
      <div style={{ fontFamily: "'Nunito', sans-serif", maxWidth: 440, margin: '0 auto', minHeight: '100vh' }}>
        <p style={{ padding: 24, fontWeight: 800, color: '#064e3b' }}>
          Dashboard coming in Session 8 — {centre?.name}
        </p>
      </div>
    </BudgetCentreProvider>
  );
}
