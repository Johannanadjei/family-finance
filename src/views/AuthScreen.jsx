/**
 * views/AuthScreen.jsx
 *
 * Handles sign in, sign up, and Google OAuth.
 * Calls supabase.auth directly — auth is not a financial data operation.
 * Never redirects manually — App.jsx detects session change via useAuth.
 * Never stores password or tokens — Supabase handles session persistence.
 * on_auth_user_created trigger creates public.users and user_preferences rows.
 */

import { useState } from 'react';
import { supabase } from '../lib/supabase';

const validateForm = (email, password, name, mode) => {
  if (!email.trim())                  return 'Email is required';
  if (!/\S+@\S+\.\S+/.test(email))   return 'Please enter a valid email address';
  if (!password)                      return 'Password is required';
  if (password.length < 6)           return 'Password must be at least 6 characters';
  if (mode === 'signup' && !name.trim()) return 'Please enter your name';
  return null;
};

const mapAuthError = (message) => {
  if (!message) return 'Something went wrong. Please try again.';
  const m = message.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'Incorrect email or password';
  if (m.includes('already registered') || m.includes('already exists'))  return 'An account with this email already exists';
  if (m.includes('network') || m.includes('fetch'))                      return 'Connection failed. Please try again.';
  if (m.includes('popup'))                                                return 'Please allow popups for Google sign in';
  return message;
};

export function AuthScreen() {
  const [mode,     setMode]     = useState('signin');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [name,     setName]     = useState('');
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(false);

  const switchMode = (newMode) => {
    setMode(newMode);
    setError(null);
  };

  const handleSubmit = async () => {
    const validationError = validateForm(email, password, name, mode);
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    setError(null);

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(mapAuthError(error.message));
    } else {
      const { error } = await supabase.auth.signUp({
        email:    email.trim(),
        password,
        options:  { data: { full_name: name.trim() } },
      });
      if (error) setError(mapAuthError(error.message));
    }

    setLoading(false);
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options:  { redirectTo: window.location.origin },
    });
    if (error) {
      setError(mapAuthError(error.message));
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '14px 16px', borderRadius: 12,
    border: '1.5px solid #e5e7eb', fontSize: 15, fontWeight: 600,
    outline: 'none', background: '#f9fafb', boxSizing: 'border-box',
    fontFamily: "'Nunito', sans-serif", color: '#1c1917',
  };

  const btnStyle = (primary) => ({
    width: '100%', padding: '15px', borderRadius: 12, border: 'none',
    fontSize: 15, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.7 : 1,
    background: primary ? 'linear-gradient(135deg, #064e3b, #0d7060)' : '#fff',
    color: primary ? '#fff' : '#1c1917',
    boxShadow: primary ? 'none' : '0 0 0 1.5px #e5e7eb',
  });

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(145deg, #064e3b, #0d7060)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px',
    }}>
      <div style={{
        background: '#fff', borderRadius: 24, padding: '36px 28px',
        width: '100%', maxWidth: 400, boxShadow: '0 24px 64px rgba(0,0,0,.18)',
      }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>🏠</div>
          <p style={{ fontSize: 22, fontWeight: 900, color: '#064e3b', margin: '0 0 4px' }}>
            Family Finance
          </p>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </p>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 24, background: '#f3f4f6', borderRadius: 12, padding: 4 }}>
          {['signin', 'signup'].map(m => (
            <button key={m} onClick={() => switchMode(m)} style={{
              padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontWeight: 800, fontSize: 13, fontFamily: "'Nunito', sans-serif",
              background: mode === m ? '#fff' : 'transparent',
              color: mode === m ? '#064e3b' : '#6b7280',
              boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
              transition: 'all .2s',
            }}>
              {m === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Name — signup only */}
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="Your full name"
              value={name}
              onChange={e => setName(e.target.value)}
              style={inputStyle}
              autoComplete="name"
            />
          )}

          {/* Email */}
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={inputStyle}
            autoComplete="email"
          />

          {/* Password */}
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={inputStyle}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />

          {/* Error */}
          {error && (
            <div style={{ background: '#fef2f2', borderRadius: 10, padding: '12px 14px' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', margin: 0 }}>{error}</p>
            </div>
          )}

          {/* Submit */}
          <button onClick={handleSubmit} disabled={loading} style={btnStyle(true)}>
            {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
            <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
            <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, fontWeight: 700 }}>or</p>
            <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          </div>

          {/* Google */}
          <button onClick={handleGoogle} disabled={loading} style={btnStyle(false)}>
            <span style={{ marginRight: 8 }}>🔵</span>
            Continue with Google
          </button>

        </div>
      </div>
    </div>
  );
}
