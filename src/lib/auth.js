import { supabase } from './supabase';

export const signInWithGoogle = () =>
  supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });

export const signInWithEmail = (email, password) =>
  supabase.auth.signInWithPassword({ email, password });

export const signUpWithEmail = (email, password) =>
  supabase.auth.signUp({ email, password });

export const resetPassword = (email) =>
  supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });

export const signOut = () => supabase.auth.signOut();
