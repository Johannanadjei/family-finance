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

// Origins allowed to receive a password-recovery link. This list MIRRORS the
// Redirect URLs configured in Supabase Auth — an origin absent there is rejected
// by GoTrue and silently swapped for the project Site URL, so keeping the two in
// sync is what makes the link land where we intend.
// Exact-origin matching (not hostname): an unexpected port or host cannot smuggle
// a redirect through. `www.moneybos.com` is deliberately ABSENT — Supabase wildcards
// cover paths, not subdomains, so `moneybos.com/**` does not match it; a reset begun
// on www therefore falls back to the apex URL, which is always allow-listed.
const ALLOWED_RESET_ORIGINS  = ['https://moneybos.com', 'http://localhost:5173'];
const DEFAULT_RESET_REDIRECT = 'https://moneybos.com/reset-password';

/**
 * Resolve the password-recovery redirect for the current origin.
 * Pure — no window access — so it is directly unit-testable.
 * @param {string} origin — window.location.origin of the sending page
 * @returns {string} an allow-listed absolute /reset-password URL
 */
export const resolveResetRedirect = (origin) =>
  ALLOWED_RESET_ORIGINS.includes(origin) ? `${origin}/reset-password` : DEFAULT_RESET_REDIRECT;

export const resetPasswordForEmail = async (email, redirectTo) => {
  const target = redirectTo || resolveResetRedirect(typeof window === 'undefined' ? '' : window.location.origin);
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: target });
  if (error) console.error('[auth.service] resetPasswordForEmail error:', error.message);
  return { error };
};

export const updateUserName = async (userId, name, email) => {
  const { error } = await supabase.from('users').upsert({ id: userId, name, email }, { onConflict: 'id' });
  if (error) console.error('[auth.service] updateUserName error:', error.message);
  return { error };
};

// Canonical session-readiness gate now lives in lib/auth.js (freshness-aware:
// it also refreshes an expired-but-present token). Re-exported here so existing
// callers (e.g. JoinView) keep importing it from the service layer.
export { waitForSession } from '../lib/auth';
