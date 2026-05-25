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

export const signUpUser = async (email, password, name = '') => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name.trim() } },
  });
  if (error) {
    console.error('[auth.service] signUp error:', error.message);
    return { data, error };
  }
  // Belt-and-suspenders: upsert name into public.users so it is always saved
  // correctly even if the on_auth_user_created trigger is absent or broken.
  if (data?.user?.id) {
    const { error: upsertErr } = await supabase
      .from('users')
      .upsert({ id: data.user.id, name: name.trim(), email: email.trim() }, { onConflict: 'id' });
    if (upsertErr) console.error('[auth.service] user upsert error:', upsertErr.message);
  }
  return { data, error: null };
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

// Polls getSession up to maxAttempts times with 500 ms gaps.
// Supabase sessions can take a render cycle to propagate after signIn/signUp,
// so an immediate RPC call using auth.uid() server-side may see null.
export const waitForSession = async (maxAttempts = 3) => {
  for (let i = 0; i < maxAttempts; i++) {
    const { data, error } = await supabase.auth.getSession();
    if (data?.session) return { data: data.session, error: null };
    if (error)         return { data: null, error };
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return { data: null, error: new Error('Session not established') };
};
