/**
 * useAuth — manages authentication state.
 * Listens to Supabase auth events and exposes user + loading state.
 */
import { useState, useEffect } from 'react';
import { getSession, onAuthStateChange, signOut as authSignOut } from '../lib/auth';

export function useAuth() {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true); // true while checking session

  useEffect(() => {
    // Check existing session on mount
    getSession().then(session => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth state changes (login, logout, token refresh)
    const subscription = onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await authSignOut();
    setUser(null);
  };

  return { user, loading, signOut };
}
