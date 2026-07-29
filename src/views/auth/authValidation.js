/**
 * views/auth/authValidation.js
 *
 * Pure sign-in/sign-up form helpers, extracted from AuthScreen so that view stays
 * under the 200-line budget. No React, no side effects — safe to unit test directly.
 *
 * NOTE these validate the AUTH FORM, not money. Financial calculations belong in
 * lib/finance.js; nothing here touches a currency value.
 */

export const validateForm = (email, password, name, mode) => {
  if (!email.trim())                  return 'Email is required';
  if (!/\S+@\S+\.\S+/.test(email))   return 'Please enter a valid email address';
  if (!password)                      return 'Password is required';
  if (password.length < 6)           return 'Password must be at least 6 characters';
  if (mode === 'signup' && !name.trim()) return 'Please enter your name';
  return null;
};

export const mapAuthError = (message) => {
  if (!message) return 'Something went wrong. Please try again.';
  const m = message.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'Incorrect email or password';
  if (m.includes('already registered') || m.includes('already exists'))  return 'An account with this email already exists';
  if (m.includes('network') || m.includes('fetch'))                      return 'Connection failed. Please try again.';
  if (m.includes('popup'))                                                return 'Please allow popups for Google sign in';
  return message;
};
