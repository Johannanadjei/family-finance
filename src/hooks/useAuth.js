/**
 * useAuth.js
 *
 * Manages Supabase auth state.
 * Returns the current user and loading state.
 * Handles sign out.
 *
 * The public.users row is created automatically by the
 * on_auth_user_created trigger — never manually here.
 */

import { useState, useEffect } from 'react';
import { supabase }            from '../lib/supabase';
import { clearPrefs }          from '../lib/storage';

export function useAuth() {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Stabilise the user reference: Supabase fires a fresh `session.user` object on
    // every auth event (TOKEN_REFRESHED, the SIGNED_IN re-fired on tab focus/visibility,
    // etc.). Returning the previous ref when the identity is unchanged keeps the object
    // stable, so consumer hooks keyed on `[user]` stop refetching on every refresh.
    // See docs/engineering-decisions.md (auth-refresh refetch storm).
    const applySession = (session) =>
      setUser(prev => (prev?.id === (session?.user?.id ?? null) ? prev : (session?.user ?? null)));

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        applySession(session);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    clearPrefs();
    await supabase.auth.signOut();
  };

  return { user, loading, signOut };
}
