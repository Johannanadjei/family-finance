/**
 * views/auth/ForgotPasswordPanel.jsx
 *
 * "Forgot password?" reveal on the AuthScreen sign-in tab. Mirrors the forgot-PIN
 * pattern in PinScreen: a link that expands into an email field + send button.
 *
 * Self-contained — AuthScreen renders it only in sign-in mode, so switching tabs
 * unmounts it and resets the reveal for free.
 *
 * The redirect target for the emailed link is owned by auth.service
 * (resolveResetRedirect), NOT by this component.
 */

import { useState }               from 'react';
import { resetPasswordForEmail }  from '../../services/auth.service';

const inputStyle = {
  width: '100%', padding: '14px 16px', borderRadius: 12, fontSize: 15, fontWeight: 600, outline: 'none',
  border: '1.5px solid var(--c-input-border, #e5e7eb)', background: 'var(--c-input-bg, #f9fafb)',
  boxSizing: 'border-box', fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)',
};

export function ForgotPasswordPanel() {
  const [open,    setOpen]    = useState(false);
  const [email,   setEmail]   = useState('');
  const [error,   setError]   = useState(null);
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);

  // Account-enumeration safety: the confirmation is IDENTICAL whether or not the
  // address has an account, and regardless of the service error. That also swallows
  // rate-limit messages — the accepted cost of not leaking account existence.
  const handleSend = async () => {
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }
    setSending(true);
    setError(null);
    await resetPasswordForEmail(email.trim());
    setSending(false);
    setSent(true);
  };

  return (
    <div style={{ marginTop: 4, textAlign: 'center' }}>
      {!open ? (
        <button
          data-testid="forgot-password-btn"
          onClick={() => setOpen(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-muted, #6b7280)', fontSize: 13, fontWeight: 700, fontFamily: "'Nunito', sans-serif", padding: 4 }}
        >
          Forgot password?
        </button>
      ) : sent ? (
        <p data-testid="forgot-password-sent" style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-success, #059669)', margin: 0, lineHeight: 1.55 }}>
          Check your email — if an account exists for that address, a reset link is on its way.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: 0, lineHeight: 1.5 }}>
            Enter your email and we'll send you a reset link.
          </p>
          <input
            data-testid="forgot-email-input" type="email"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={inputStyle}
            autoComplete="email"
          />
          {error && (
            <p data-testid="forgot-password-error" style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{error}</p>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setOpen(false)}
              style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: 'var(--c-card, #ffffff)', color: 'var(--c-text, #1c1917)', boxShadow: '0 0 0 1.5px var(--c-border, #e5e7eb)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}
            >
              Cancel
            </button>
            <button
              data-testid="forgot-password-send-btn"
              onClick={handleSend}
              disabled={sending}
              style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)', fontSize: 14, fontWeight: 800, cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.7 : 1, fontFamily: "'Nunito', sans-serif" }}
            >
              {sending ? 'Sending…' : 'Send reset link'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
