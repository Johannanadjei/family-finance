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
  const [user,       setUser]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  // True between a PASSWORD_RECOVERY event and App handing off out of the reset screen.
  // The hook only reports the fact — App owns routing (a hook must not navigate).
  const [isRecovery, setIsRecovery] = useState(false);

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
      (event, session) => {
        // A recovery link authenticates the user, so without this branch they would
        // land straight on the dashboard with no way to actually set a password.
        // NOTE this event is a BACKSTOP, not the primary route: supabase-js emits it
        // from _initialize() behind a setTimeout(0), and NOT at all once the URL hash
        // has been consumed (a reload restores from storage and emits INITIAL_SESSION).
        // The /reset-password path check in App.jsx is what reliably lands the user.
        if (event === 'PASSWORD_RECOVERY')                     setIsRecovery(true);
        else if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setIsRecovery(false);
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

  return { user, loading, signOut, isRecovery };
}
