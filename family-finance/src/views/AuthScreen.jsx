import { useState } from 'react';
import { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } from '../lib/auth';

const VIEWS = { LOGIN: 'login', SIGNUP: 'signup', RESET: 'reset', CHECK_EMAIL: 'checkEmail' };

/** Google sign-in button */
function GoogleButton({ onClick, loading }) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '14px', borderRadius: 14, border: '1.5px solid #e5e7eb', background: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 800, color: '#1c1917', boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
      <svg width="20" height="20" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      {loading ? 'Redirecting...' : 'Continue with Google'}
    </button>
  );
}

/** Divider between Google and email */
function Divider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
      <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
      <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 700 }}>or</span>
      <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
    </div>
  );
}

const inputStyle = { width: '100%', padding: '13px 14px', borderRadius: 12, border: '1.5px solid #e5e7eb', fontSize: 15, fontWeight: 600, outline: 'none', background: '#f9fafb', boxSizing: 'border-box', fontFamily: "'Nunito', sans-serif" };

/** Main auth screen */
export function AuthScreen() {
  const [view,     setView]     = useState(VIEWS.LOGIN);
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [info,     setInfo]     = useState('');

  const clear = () => { setError(''); setInfo(''); };

  const handleGoogle = async () => {
    setLoading(true); clear();
    try { await signInWithGoogle(); }
    catch (e) { setError(e.message); setLoading(false); }
  };

  const handleEmailAuth = async () => {
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setLoading(true); clear();
    try {
      if (view === VIEWS.LOGIN) {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
        setInfo('Check your email to confirm your account, then sign in.');
        setView(VIEWS.LOGIN);
      }
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  const handleReset = async () => {
    if (!email) { setError('Enter your email address first.'); return; }
    setLoading(true); clear();
    try {
      await resetPassword(email);
      setView(VIEWS.CHECK_EMAIL);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (view === VIEWS.CHECK_EMAIL) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(145deg,#064e3b,#0d7060)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ background: '#fff', borderRadius: 24, padding: '36px 28px', width: '100%', maxWidth: 400, textAlign: 'center' }}>
          <span style={{ fontSize: 48 }}>📧</span>
          <p style={{ fontSize: 20, fontWeight: 900, color: '#1c1917', margin: '16px 0 8px' }}>Check your email</p>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px', lineHeight: 1.6 }}>
            We've sent a password reset link to <strong>{email}</strong>
          </p>
          <button onClick={() => setView(VIEWS.LOGIN)} style={{ color: '#064e3b', fontWeight: 800, fontSize: 14, background: 'none', border: 'none', cursor: 'pointer' }}>
            ← Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(145deg,#064e3b,#0d7060)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: '#fff', borderRadius: 24, padding: '36px 28px', width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: 'linear-gradient(145deg,#064e3b,#0d7060)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 14px' }}>🏡</div>
          <p style={{ fontSize: 22, fontWeight: 900, color: '#1c1917', margin: '0 0 4px' }}>Family Finance</p>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>
            {view === VIEWS.LOGIN  ? 'Sign in to your household account' : ''}
            {view === VIEWS.SIGNUP ? 'Create your household account'     : ''}
            {view === VIEWS.RESET  ? 'Reset your password'               : ''}
          </p>
        </div>

        {/* Error / info banners */}
        {error && (
          <div style={{ background: '#fee2e2', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: '#dc2626', fontWeight: 700, margin: 0 }}>⚠️ {error}</p>
          </div>
        )}
        {info && (
          <div style={{ background: '#d1fae5', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: '#059669', fontWeight: 700, margin: 0 }}>✓ {info}</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Google button — not on reset screen */}
          {view !== VIEWS.RESET && (
            <>
              <GoogleButton onClick={handleGoogle} loading={loading} />
              <Divider />
            </>
          )}

          {/* Email */}
          <input type="email" placeholder="Email address" value={email}
            onChange={e => { setEmail(e.target.value); clear(); }}
            onKeyDown={e => e.key === 'Enter' && (view === VIEWS.RESET ? handleReset() : handleEmailAuth())}
            style={inputStyle} />

          {/* Password — not on reset screen */}
          {view !== VIEWS.RESET && (
            <input type="password" placeholder="Password" value={password}
              onChange={e => { setPassword(e.target.value); clear(); }}
              onKeyDown={e => e.key === 'Enter' && handleEmailAuth()}
              style={inputStyle} />
          )}

          {/* Primary action */}
          {view === VIEWS.LOGIN && (
            <button onClick={handleEmailAuth} disabled={loading}
              style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#064e3b,#0d7060)', color: '#fff', fontSize: 15, fontWeight: 900, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          )}
          {view === VIEWS.SIGNUP && (
            <button onClick={handleEmailAuth} disabled={loading}
              style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#064e3b,#0d7060)', color: '#fff', fontSize: 15, fontWeight: 900, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          )}
          {view === VIEWS.RESET && (
            <button onClick={handleReset} disabled={loading}
              style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#064e3b,#0d7060)', color: '#fff', fontSize: 15, fontWeight: 900, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          )}

          {/* Secondary links */}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
            {view === VIEWS.LOGIN && (
              <>
                <button onClick={() => { setView(VIEWS.RESET); clear(); }} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Forgot password?
                </button>
                <button onClick={() => { setView(VIEWS.SIGNUP); clear(); }} style={{ background: 'none', border: 'none', color: '#064e3b', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                  Create account →
                </button>
              </>
            )}
            {view === VIEWS.SIGNUP && (
              <button onClick={() => { setView(VIEWS.LOGIN); clear(); }} style={{ background: 'none', border: 'none', color: '#064e3b', fontSize: 12, fontWeight: 800, cursor: 'pointer', margin: '0 auto' }}>
                ← Already have an account? Sign in
              </button>
            )}
            {view === VIEWS.RESET && (
              <button onClick={() => { setView(VIEWS.LOGIN); clear(); }} style={{ background: 'none', border: 'none', color: '#064e3b', fontSize: 12, fontWeight: 800, cursor: 'pointer', margin: '0 auto' }}>
                ← Back to sign in
              </button>
            )}
          </div>
        </div>

        <p style={{ fontSize: 11, color: '#d1d5db', textAlign: 'center', marginTop: 24 }}>
          Family Finance Command Centre · Your data is private and secure
        </p>
      </div>
    </div>
  );
}
