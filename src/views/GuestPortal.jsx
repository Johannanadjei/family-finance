/**
 * views/GuestPortal.jsx
 *
 * Top-level guest shell. Rendered instead of App when the URL contains
 * ?guest=1&c={centreId}. No Supabase Auth required — guest auth is PIN-only.
 *
 * Shows GuestPinScreen until the guest authenticates, then GuestTransactionForm.
 * Session lives in sessionStorage and auto-clears on tab close.
 *
 * ── FRESHNESS: foreground refetch only, NO realtime (deliberate) ─────────────
 * Two reasons, and either alone is sufficient:
 *
 *   1. A guest has no Supabase Auth session — guest auth is PIN-only, validated
 *      server-side by authenticate_guest. Realtime authorizes each subscriber's
 *      postgres_changes stream against RLS using that subscriber's JWT; a guest
 *      presents the bare anon key, so there is no identity to authorize and no
 *      hub membership to match. Subscribing would either receive nothing or, if
 *      the channel were opened up to make it work, hand hub data to an
 *      unauthenticated client. Neither is acceptable.
 *
 *   2. There is nothing live to stream. Post-auth the portal renders NO hub data:
 *      GuestTransactionForm is write-only, and its category list comes from
 *      session.allowedCategories — a snapshot frozen into sessionStorage when the
 *      PIN was accepted. Refreshing it would mean re-running authenticate, i.e.
 *      asking for the PIN again.
 *
 * So the one surface that can go stale is the PRE-AUTH guest list (the owner adds
 * or removes a guest while the PIN screen sits open). useHubFreshness is armed for
 * exactly that window — `enabled: !session` — and stands down once a guest is in.
 */

import { useEffect } from 'react';
import { useGuestAuth } from '../hooks/useGuestAuth';
import { useHubFreshness } from '../hooks/useHubFreshness';
import { GuestPinScreen } from './guest/GuestPinScreen';
import { GuestTransactionForm } from './guest/GuestTransactionForm';
import { applyTheme } from '../lib/themes';

export function GuestPortal({ centreId, currency }) {
  const { session, guests, loading, error, loadGuests, lastLoadedAt, authenticate, signOut } = useGuestAuth(centreId);

  useEffect(() => {
    applyTheme('family_warmth');
    if (!session) loadGuests();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Hooks stay ABOVE the conditional returns below (hooks-order rule).
  useHubFreshness({ centreId, reloadHub: loadGuests, lastLoadedAt, enabled: !session });

  if (!centreId) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--c-danger-bg, #fef2f2)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
        gap: 12, padding: 24, fontFamily: "'Nunito', sans-serif",
      }}>
        <p style={{ fontSize: 40, margin: 0 }}>⚠️</p>
        <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--c-danger, #dc2626)', margin: 0, textAlign: 'center' }}>
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
      onRetry={loadGuests}
    />
  );
}
