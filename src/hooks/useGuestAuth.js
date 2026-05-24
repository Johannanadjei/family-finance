/**
 * hooks/useGuestAuth.js
 *
 * Guest session management. Session lives in sessionStorage only —
 * never localStorage — so it clears automatically when the tab closes.
 *
 * Lockout and PIN comparison are handled server-side by the
 * authenticate_guest Postgres function. This hook just manages
 * local session state and delegates to the service layer.
 */

import { useState, useCallback } from 'react';
import { getCentreGuests, authenticateGuest } from '../services/guests.service';

const SESSION_KEY = 'ffc_guest_session';

const loadSession = () => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const saveSession  = (s) => sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
const clearSession = ()  => sessionStorage.removeItem(SESSION_KEY);

export function useGuestAuth(centreId) {
  const [session, setSession] = useState(() => {
    const s = loadSession();
    // Reject sessions from a different centre
    if (s && s.centreId === centreId) return s;
    return null;
  });
  const [guests,  setGuests]  = useState([]);
  const [loading, setLoading] = useState(true);  // true until first load completes
  const [error,   setError]   = useState(null);

  const loadGuests = useCallback(async () => {
    if (!centreId) return;
    setLoading(true);
    const { data, error: svcError } = await getCentreGuests(centreId);
    setLoading(false);
    if (svcError) { setError('Could not load guests. Please try again.'); return; }
    setGuests(data || []);
  }, [centreId]);

  const authenticate = useCallback(async (guestId, pin) => {
    setError(null);
    const { data, error: svcError } = await authenticateGuest(guestId, pin);
    if (svcError || !data) {
      setError('Something went wrong. Please try again.');
      return { ok: false };
    }
    if (data.status === 'locked') {
      setError('Too many failed attempts. Please wait 15 minutes before trying again.');
      return { ok: false, locked: true };
    }
    if (data.status === 'wrong_pin') {
      setError('Incorrect PIN. Please try again.');
      return { ok: false };
    }
    // status === 'ok'
    const newSession = {
      guestId:           data.id,
      guestName:         data.name,
      allowedCategories: data.allowed_categories || [],
      centreId:          data.budget_centre_id,
    };
    saveSession(newSession);
    setSession(newSession);
    setError(null);
    return { ok: true };
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setSession(null);
    setError(null);
  }, []);

  return { session, guests, loading, error, loadGuests, authenticate, signOut };
}
