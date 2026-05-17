/**
 * Auth service — all authentication operations.
 * Pure async functions, no React, no side effects beyond Supabase calls.
 */
import { supabase } from './supabase';

/** Sign in with Google (OAuth redirect flow) */
export const signInWithGoogle = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
};

/** Sign in with email + password */
export const signInWithEmail = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
};

/** Sign up with email + password */
export const signUpWithEmail = async (email, password) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
  return data.user;
};

/** Send a password reset email */
export const resetPassword = async (email) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '?reset=true',
  });
  if (error) throw error;
};

/** Sign out */
export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

/** Get the current session (null if not logged in) */
export const getSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};

/** Subscribe to auth state changes */
export const onAuthStateChange = (callback) => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => callback(event, session)
  );
  return subscription;
};
