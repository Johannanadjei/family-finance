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
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
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
