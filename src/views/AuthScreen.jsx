import { useState } from 'react';
import { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } from '../lib/auth';

const VIEWS = { LOGIN: 'login', SIGNUP: 'signup', RESET: 'reset', CHECK_EMAIL: 'checkEmail' };

function GoogleButton({ onClick, loading }) {
  return (
    <button onClick={onClick} disabled={loading} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '14px', borderRadius: 14, border: '1.5px solid #e5e7eb', background: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 600, color: '#1c1917', boxShadow: '0 4px 4px rgba(0,0,0,.08)' }}>
      <svg width="20" height="20" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z"/></svg>
      {loading ? 'Redirecting...' : 'Continue with Google'}
    </button>
  );
}

function Divider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', margin: '16px 0' }}>
      <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
      <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 700 }}>or</span>
      <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
    </div>
  );
}

const inputStyle = { width: '100%', padding: '13px 16px', borderRadius: 12, border: '1.5px solid #e5e7eb', fontSize: 15, fontWeight: 600, outline: 'none', background: '#f9fafb', boxSizing: 'border-box', fontFamily: 'Nunito, sans-serif' };

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
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
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
        <div style={{ background: '#fff', borderRadius: 24, padding: '40px 28px', width: '100%', maxWidth: 400, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📧</div>
          <p style={{ fontWeight: 800, fontSize: 20 }}>Check your email</p>
          <p style={{ color: '#6b7280', margin: '8px 0 24px' }}>We sent a password reset link to <strong>{email}</strong></p>
          <button onClick={() => setView(VIEWS.LOGIN)} style={{ color: '#064e3b', background: 'none', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Back to sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(145deg,#064e3b,#0d7060)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: '#fff', borderRadius: 24, padding: '40px 28px', width: '100%', maxWidth: 400, boxShadow: '0 30px 60px rgba(0,0,0,.2)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🏡</div>
          <p style={{ fontWeight: 800, fontSize: 22, margin: 0 }}>Family Finance</p>
          <p style={{ color: '#6b7280', fontSize: 14, margin: '4px 0 0' }}>{view === VIEWS.SIGNUP ? 'Create your household account' : view === VIEWS.RESET ? 'Reset your password' : 'Sign in'}</p>
        </div>

        {error && <div style={{ background: '#fef2f2', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}><p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>{error}</p></div>}
        {info  && <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}><p style={{ fontSize: 13, color: '#16a34a', margin: 0 }}>{info}</p></div>}

        {view !== VIEWS.RESET && <GoogleButton onClick={handleGoogle} loading={loading} />}
        {view !== VIEWS.RESET && <Divider />}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input style={inputStyle} type="email"    placeholder="Email"    value={email}    onChange={e => setEmail(e.target.value)}    />
          {view !== VIEWS.RESET && <input style={inputStyle} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />}
        </div>

        <button onClick={view === VIEWS.RESET ? handleReset : handleEmailAuth} disabled={loading} style={{ width: '100%', marginTop: 16, padding: '14px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#064e3b,#0d7060)', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
          {loading ? '...' : view === VIEWS.LOGIN ? 'Sign in' : view === VIEWS.SIGNUP ? 'Create account' : 'Send reset link'}
        </button>

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: '#6b7280' }}>
          {view === VIEWS.LOGIN  && <><span>No account? </span><button onClick={() => { setView(VIEWS.SIGNUP); clear(); }} style={{ color: '#064e3b', background: 'none', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Sign up</button><span> · </span><button onClick={() => { setView(VIEWS.RESET); clear(); }} style={{ color: '#064e3b', background: 'none', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Forgot password</button></>}
          {view === VIEWS.SIGNUP && <><span>Have an account? </span><button onClick={() => { setView(VIEWS.LOGIN); clear(); }} style={{ color: '#064e3b', background: 'none', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Sign in</button></>}
          {view === VIEWS.RESET  && <><span>Back to </span><button onClick={() => { setView(VIEWS.LOGIN); clear(); }} style={{ color: '#064e3b', background: 'none', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Sign in</button></>}
        </div>
      </div>
    </div>
  );
}
