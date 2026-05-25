/**
 * services/auth.service.js
 *
 * All Supabase Auth calls — wrapped so no view, hook, or component
 * ever imports supabase directly.
 * Never throws — always returns { data, error }.
 */

import { supabase } from '../lib/supabase';

export const getUserSession = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error) console.error('[auth.service] getUser error:', error.message);
  return { data, error };
};

export const signUpUser = async (email, password) => {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) console.error('[auth.service] signUp error:', error.message);
  return { data, error };
};

export const signInUser = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) console.error('[auth.service] signIn error:', error.message);
  return { data, error };
};

export const signOutUser = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) console.error('[auth.service] signOut error:', error.message);
  return { error };
};

export const resetPasswordForEmail = async (email) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) console.error('[auth.service] resetPasswordForEmail error:', error.message);
  return { error };
};
