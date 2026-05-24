/**
 * views/GuestPortal.jsx
 *
 * Top-level guest shell. Rendered instead of App when the URL contains
 * ?guest=1&c={centreId}. No Supabase Auth required — guest auth is PIN-only.
 *
 * Shows GuestPinScreen until the guest authenticates, then GuestTransactionForm.
 * Session lives in sessionStorage and auto-clears on tab close.
 */

import { useEffect } from 'react';
import { useGuestAuth } from '../hooks/useGuestAuth';
import { GuestPinScreen } from './guest/GuestPinScreen';
import { GuestTransactionForm } from './guest/GuestTransactionForm';
import { applyTheme } from '../lib/themes';

export function GuestPortal({ centreId, currency }) {
  const { session, guests, loading, error, loadGuests, authenticate, signOut } = useGuestAuth(centreId);

  useEffect(() => {
    applyTheme('family_warmth');
    if (!session) loadGuests();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!centreId) {
    return (
      <div style={{
        minHeight: '100vh', background: '#fef2f2', display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
        gap: 12, padding: 24, fontFamily: "'Nunito', sans-serif",
      }}>
        <p style={{ fontSize: 40, margin: 0 }}>⚠️</p>
        <p style={{ fontSize: 16, fontWeight: 800, color: '#dc2626', margin: 0, textAlign: 'center' }}>
          Invalid guest link. Please ask your household admin to share the correct link.
        </p>
      </div>
    );
  }

  if (session) {
    return (
      <GuestTransactionForm
        session={session}
        currency={currency}
        onSignOut={signOut}
      />
    );
  }

  return (
    <GuestPinScreen
      guests={guests}
      loading={loading}
      error={error}
      onAuthenticate={authenticate}
    />
  );
}
