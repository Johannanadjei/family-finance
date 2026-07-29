/**
 * views/ResetPasswordScreen.jsx
 *
 * Full-screen destination for a Supabase password-recovery link
 * (redirectTo → https://<allow-listed origin>/reset-password).
 *
 * Rendered by App.jsx as a PRE-GATE bypass, alongside /join and the legal pages —
 * never as a route inside DashboardShell. A recovery link establishes a real session,
 * so the user would otherwise fall through to the PIN gate and be asked for a PIN they
 * came here precisely because they could not get past. See docs/engineering-decisions.md.
 *
 * The recovery link already authenticates the user, so this screen only sets the new
 * password (supabase.auth.updateUser) and hands back to App, which re-enters the normal
 * gates with the session live. It never signs the user out and never re-asks for a login.
 *
 * Calls supabase.auth directly — auth is not a financial data operation (same rule as
 * AuthScreen). The PIN gate still applies afterwards: a PIN is a device-level lock and
 * a password reset is not proof of device possession.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase }                         from '../lib/supabase';
import { ResetPasswordForm }                from './auth/ResetPasswordForm';

/** Resolve a URL path to "is this the reset screen?". Mirrors resolveLegalSlug's placement. */
export const isResetPasswordPath = (pathname) => pathname.replace(/\/$/, '') === '/reset-password';

/**
 * Mask an email for display: alice@example.com → a***@***.com
 * Confirms WHICH account is being reset without reprinting the address to a
 * shoulder-surfer or anyone the link was forwarded to.
 */
export function maskEmail(email) {
  if (!email || !email.includes('@')) return '';
  const [local, domain] = email.split('@');
  const dot = domain.lastIndexOf('.');
  return `${local.slice(0, 1)}***@***${dot === -1 ? '' : domain.slice(dot)}`;
}

const MIN_PASSWORD = 6;   // matches AuthScreen + Supabase's default policy

const validate = (password, confirm) => {
  if (!password)                    return 'Please enter a new password';
  if (password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters`;
  if (!confirm)                     return 'Please confirm your new password';
  if (password !== confirm)         return 'Passwords do not match';
  return null;
};

// A consumed / timed-out link surfaces as a missing-session error from updateUser.
// Treat it as an invalid link so the user gets the retry affordance, not a dead form.
const isSessionGone = (message = '') =>
  /session|jwt|token|expired|not authenticated/i.test(message);

const mapUpdateError = (message) => {
  if (!message) return 'Something went wrong. Please try again.';
  const m = message.toLowerCase();
  if (m.includes('should be different')) return 'Please choose a password different from your current one';
  if (m.includes('weak') || m.includes('short')) return `Password must be at least ${MIN_PASSWORD} characters`;
  if (m.includes('network') || m.includes('fetch')) return 'Connection failed. Please try again.';
  return message;
};

const CONTINUE_DELAY_MS = 1200;   // long enough to read the ✓, short enough not to feel stuck

export function ResetPasswordScreen({ onComplete }) {
  // 'checking' → reading the recovery session | 'ready' → form | 'invalid' → dead link | 'done' → ✓
  const [status,     setStatus]     = useState('checking');
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [confirm,    setConfirm]    = useState('');
  const [error,      setError]      = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Read the session established by the recovery link. getSession() awaits the GoTrue
  // init lock, so the URL hash has already been consumed into a session by the time
  // this resolves (see lib/auth.js).
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data, error: sessionErr }) => {
      if (cancelled) return;
      const sessionEmail = data?.session?.user?.email;
      if (sessionErr || !sessionEmail) { setStatus('invalid'); return; }
      setEmail(sessionEmail);
      setStatus('ready');
    });
    return () => { cancelled = true; };
  }, []);

  // Auto-continue into the app once the ✓ has been shown.
  useEffect(() => {
    if (status !== 'done') return;
    const id = setTimeout(() => onComplete(), CONTINUE_DELAY_MS);
    return () => clearTimeout(id);
  }, [status, onComplete]);

  const handleSubmit = useCallback(async () => {
    const validationError = validate(password, confirm);
    if (validationError) { setError(validationError); return; }

    setSubmitting(true);
    setError(null);

    const { error: updateErr } = await supabase.auth.updateUser({ password });

    if (updateErr) {
      setSubmitting(false);
      if (isSessionGone(updateErr.message)) { setStatus('invalid'); return; }
      setError(mapUpdateError(updateErr.message));
      return;
    }

    setSubmitting(false);
    setStatus('done');
  }, [password, confirm]);

  return (
    <div data-testid="reset-password-screen" style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #064e3b, #0d7060)',  // fixed — skin never overrides pre-sign-in
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '32px 16px', gap: 28,
      fontFamily: "'Nunito', sans-serif",
    }}>
      <div style={{ textAlign: 'center' }}>
        <img src="/icons/bos-icon-v2-white-512.png" alt="Money B.O.S logo" style={{ width: 96, height: 96, marginBottom: 12, objectFit: 'contain' }} />
        <h1 style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.1 }}>
          Set a new password
        </h1>
      </div>

      <div style={{
        background: 'var(--c-card, #ffffff)', borderRadius: 24, padding: '32px 28px',
        width: '100%', maxWidth: 400,
        boxShadow: '0 24px 64px rgba(0,0,0,.18)',
        border: '1px solid var(--c-border, transparent)',
      }}>
        {status === 'checking' && (
          <p data-testid="reset-checking" style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-muted, #6b7280)', margin: 0, textAlign: 'center' }}>
            Checking your reset link…
          </p>
        )}

        {status === 'invalid' && (
          <div data-testid="reset-invalid" style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 32, margin: '0 0 12px' }}>⏳</p>
            <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 8px' }}>
              This link has expired
            </p>
            <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: '0 0 20px', lineHeight: 1.55 }}>
              Password reset links can only be used once, and expire after a short while.
              Request a new one and we'll email it straight over.
            </p>
            {/* Full page load (not client nav) — clears the consumed recovery hash from the URL */}
            <a
              data-testid="reset-request-new-link"
              href="/"
              style={{
                display: 'block', width: '100%', padding: '15px', borderRadius: 12, boxSizing: 'border-box',
                background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)',
                fontSize: 15, fontWeight: 800, textDecoration: 'none', fontFamily: "'Nunito', sans-serif",
              }}
            >
              Request a new reset link
            </a>
          </div>
        )}

        {status === 'done' && (
          <div data-testid="reset-success" style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--c-success, #059669)', margin: '0 0 8px' }}>
              Password updated ✓
            </p>
            <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: 0, lineHeight: 1.55 }}>
              Taking you into Money B.O.S…
            </p>
          </div>
        )}

        {status === 'ready' && (
          <ResetPasswordForm
            maskedEmail={maskEmail(email)}
            password={password}
            confirm={confirm}
            error={error}
            submitting={submitting}
            onPasswordChange={setPassword}
            onConfirmChange={setConfirm}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  );
}
