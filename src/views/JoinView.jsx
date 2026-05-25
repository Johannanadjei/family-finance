import { useState, useEffect }  from 'react';
import { useNavigate }          from 'react-router-dom';
import { saveActiveCentreId }   from '../lib/storage';
import { getUserSession, signUpUser, signInUser, signOutUser } from '../services/auth.service';
import { getInviteByToken, acceptInvite } from '../services/invites.service';
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from '../lib/roles';

function JoinCard({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(145deg, var(--c-header-from, #064e3b), var(--c-header-to, #0d7060))', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400, background: 'var(--c-card, #fff)', borderRadius: 20, padding: 28, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', fontFamily: "'Nunito', sans-serif" }}>
        {children}
      </div>
    </div>
  );
}

const inputStyle = { width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)', fontSize: 15, fontWeight: 700, marginBottom: 10, boxSizing: 'border-box', background: 'var(--c-input-bg, #f9fafb)', fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)' };
const primaryBtn = { width: '100%', padding: 14, borderRadius: 12, border: 'none', background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif", marginBottom: 8 };

export function JoinView() {
  const navigate = useNavigate();
  const token    = new URLSearchParams(window.location.search).get('token');

  const [phase,     setPhase]     = useState('loading'); // loading | invalid | confirm | auth | joining | done | error
  const [invite,    setInvite]    = useState(null);
  const [user,      setUser]      = useState(null);
  const [authMode,  setAuthMode]  = useState('signin'); // signin | signup
  const [name,      setName]      = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [authError, setAuthError] = useState(null);
  const [authBusy,  setAuthBusy]  = useState(false);
  const [joinError, setJoinError] = useState(null);

  useEffect(() => {
    if (!token) { setPhase('invalid'); return; }

    const init = async () => {
      const { data: inv, error } = await getInviteByToken(token);
      if (error || !inv) { setPhase('invalid'); return; }
      if (new Date(inv.expires_at) < new Date()) { setPhase('invalid'); return; }

      setInvite(inv);

      // "Auth session missing" is expected for unauthenticated invitees — treat any
      // auth error as no session, not as an invite problem.
      const { data: authData } = await getUserSession();
      const currentUser = authData?.user ?? null;
      if (currentUser) {
        if (currentUser.email?.toLowerCase() !== inv.invited_email?.toLowerCase()) {
          setUser(currentUser);
          setPhase('wrongEmail');
          return;
        }
        setUser(currentUser);
        setPhase('confirm');
      } else {
        setEmail(inv.invited_email);
        setPhase('auth');
      }
    };

    init();
  }, [token]);

  const handleAuth = async () => {
    if (authMode === 'signup' && !name.trim()) {
      setAuthError('Please enter your name');
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    const result = authMode === 'signup'
      ? await signUpUser(email, password, name.trim())
      : await signInUser(email, password);
    setAuthBusy(false);
    if (result.error) { setAuthError(result.error.message); return; }
    setUser(result.data.user);
    setPhase('confirm');
  };

  const handleSignOut = async () => {
    const { error: signOutErr } = await signOutUser();
    if (signOutErr) console.error('[JoinView] signOut error:', signOutErr.message);
    setUser(null);
    setPhase('auth');
  };

  const handleJoin = async () => {
    setPhase('joining');
    const { data, error } = await acceptInvite({ token });
    if (error && !data) { setJoinError(error.message); setPhase('error'); return; }
    saveActiveCentreId(data?.centreId);
    navigate('/');
  };

  if (phase === 'loading') return (
    <JoinCard><p style={{ textAlign: 'center', color: 'var(--c-muted, #6b7280)', fontWeight: 700 }}>Checking invite…</p></JoinCard>
  );

  if (phase === 'invalid') {
    return (
      <JoinCard>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 32, margin: '0 0 12px' }}>🔗</p>
          <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 8px' }}>Invalid or expired invite</p>
          <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: 0, lineHeight: 1.5 }}>
            This invite link is invalid, has already been used, or has expired. Ask your hub owner to send a new one.
          </p>
        </div>
      </JoinCard>
    );
  }

  if (phase === 'wrongEmail') {
    return (
      <JoinCard>
        <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 8px' }}>Wrong account</p>
        <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: '0 0 16px', lineHeight: 1.5 }}>
          This invite was sent to <strong>{invite?.invited_email}</strong>. You are signed in as <strong>{user?.email}</strong>. Sign in with the correct account to accept this invite.
        </p>
        <button onClick={handleSignOut} style={primaryBtn}>
          Sign out and switch account
        </button>
      </JoinCard>
    );
  }

  if (phase === 'auth') {
    return (
      <JoinCard>
        <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--c-muted, #6b7280)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 4px' }}>You're invited to join</p>
        <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 4px' }}>
          {invite?.budget_centres?.icon} {invite?.budget_centres?.name}
        </p>
        <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: '0 0 20px' }}>
          as <strong>{ROLE_LABELS[invite?.role]}</strong> — {ROLE_DESCRIPTIONS[invite?.role]}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16 }}>
          {['signin', 'signup'].map(m => (
            <button key={m} onClick={() => setAuthMode(m)}
              style={{ padding: '9px', borderRadius: 10, border: 'none', fontFamily: "'Nunito', sans-serif", fontSize: 13, fontWeight: 800, cursor: 'pointer', background: authMode === m ? 'var(--c-primary, #064e3b)' : 'var(--c-bg, #f3f4f6)', color: authMode === m ? 'var(--c-btn-text, #ffffff)' : 'var(--c-muted, #6b7280)' }}>
              {m === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        {authMode === 'signup' && (
          <input type="text" value={name} onChange={e => { setName(e.target.value); setAuthError(null); }} placeholder="Your full name" style={inputStyle} autoComplete="name" />
        )}
        <input type="email" value={email} onChange={e => { setEmail(e.target.value); setAuthError(null); }} placeholder="Email" style={inputStyle} />
        <input type="password" value={password} onChange={e => { setPassword(e.target.value); setAuthError(null); }} placeholder="Password" style={inputStyle} />
        {authError && <p style={{ fontSize: 12, color: 'var(--c-danger, #dc2626)', margin: '0 0 8px', fontWeight: 700 }}>{authError}</p>}
        <button onClick={handleAuth} disabled={authBusy} style={{ ...primaryBtn, cursor: authBusy ? 'not-allowed' : 'pointer' }}>
          {authBusy ? 'Please wait…' : authMode === 'signup' ? 'Create account & join' : 'Sign in & join'}
        </button>
      </JoinCard>
    );
  }

  if (phase === 'confirm') {
    return (
      <JoinCard>
        <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--c-muted, #6b7280)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 4px' }}>You're invited to join</p>
        <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 4px' }}>
          {invite?.budget_centres?.icon} {invite?.budget_centres?.name}
        </p>
        <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: '0 0 24px', lineHeight: 1.5 }}>
          You'll join as <strong>{ROLE_LABELS[invite?.role]}</strong> — {ROLE_DESCRIPTIONS[invite?.role]}
        </p>
        <button data-testid="confirm-join-btn" onClick={handleJoin} style={primaryBtn}>
          Join hub
        </button>
      </JoinCard>
    );
  }

  if (phase === 'joining') {
    return (
      <JoinCard>
        <p style={{ textAlign: 'center', color: 'var(--c-muted, #6b7280)', fontWeight: 700 }}>Joining hub…</p>
      </JoinCard>
    );
  }

  if (phase === 'error') {
    return (
      <JoinCard>
        <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--c-danger, #dc2626)', margin: '0 0 8px' }}>Could not join hub</p>
        <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: 0 }}>{joinError || 'Something went wrong. Please try again or contact your hub owner.'}</p>
      </JoinCard>
    );
  }

  return null;
}
