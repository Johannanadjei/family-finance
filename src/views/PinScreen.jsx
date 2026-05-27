/**
 * views/PinScreen.jsx
 *
 * Full-screen PIN login gate. Shown when a PIN is set but the session is not yet unlocked.
 * Handles lockout countdown and "Forgot PIN?" reset flow.
 */

import { useState, useEffect, useCallback } from 'react';
import { PinPad }                           from './pin/PinPad';

function formatCountdown(ms) {
  const total = Math.ceil(ms / 1000);
  const m     = Math.floor(total / 60);
  const s     = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function PinScreen({ user, verifyPin, lockedUntil, attempts, onForgotPin }) {
  const [error,        setError]        = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [remaining,    setRemaining]    = useState(0);
  const [showForgot,   setShowForgot]   = useState(false);
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotDone,   setForgotDone]   = useState(false);

  const isLocked = lockedUntil && Date.now() < lockedUntil;

  // Countdown ticker
  useEffect(() => {
    if (!isLocked) { setRemaining(0); return; }
    const tick = () => setRemaining(Math.max(0, lockedUntil - Date.now()));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [isLocked, lockedUntil]);

  const handleComplete = useCallback(async (pin) => {
    if (submitting || isLocked) return;
    setSubmitting(true);
    setError(false);
    const result = await verifyPin(pin);
    setSubmitting(false);
    if (!result.success) setError(true);
    // On success, usePin sets pinUnlocked → App gate re-renders automatically
  }, [submitting, isLocked, verifyPin]);

  const handleForgot = useCallback(async () => {
    setForgotSending(true);
    await onForgotPin();
    setForgotSending(false);
    setForgotDone(true);
  }, [onForgotPin]);

  return (
    <div data-testid="pin-screen" style={{
      minHeight: '100dvh',
      background: 'linear-gradient(145deg, var(--c-header-from, #064e3b), var(--c-header-to, #0d7060))',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '32px 24px calc(32px + env(safe-area-inset-bottom, 20px))',
      fontFamily: "'Nunito', sans-serif",
    }}>
      {/* App icon + identity */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <img src="/icons/icon-192.png" alt="" style={{ width: 56, height: 56, marginBottom: 12, objectFit: 'contain' }} />
        <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 4px' }}>Welcome back</p>
        {user?.email && (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', margin: 0, fontWeight: 600 }}>
            {user.email}
          </p>
        )}
      </div>

      {/* Status message */}
      <div style={{ marginBottom: 28, minHeight: 40, textAlign: 'center' }}>
        {isLocked ? (
          <p data-testid="lockout-message" style={{ fontSize: 14, color: '#fca5a5', fontWeight: 700, margin: 0 }}>
            Too many attempts. Try again in {formatCountdown(remaining)}
          </p>
        ) : error ? (
          <p data-testid="pin-error-message" style={{ fontSize: 14, color: '#fca5a5', fontWeight: 700, margin: 0 }}>
            {attempts >= 4
              ? `Incorrect PIN — 1 attempt left before lockout`
              : 'Incorrect PIN. Please try again.'}
          </p>
        ) : (
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: 600, margin: 0 }}>
            Enter your PIN to continue
          </p>
        )}
      </div>

      {/* PIN pad */}
      <PinPad
        onComplete={handleComplete}
        error={error}
        disabled={!!isLocked || submitting}
      />

      {/* Forgot PIN */}
      <div style={{ marginTop: 40 }}>
        {!showForgot ? (
          <button
            data-testid="forgot-pin-btn"
            onClick={() => setShowForgot(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 700, fontFamily: "'Nunito', sans-serif" }}
          >
            Forgot PIN?
          </button>
        ) : forgotDone ? (
          <p style={{ fontSize: 13, color: '#6ee7b7', fontWeight: 700, textAlign: 'center', margin: 0 }}>
            Check your email for a reset link. You have been signed out.
          </p>
        ) : (
          <div style={{ textAlign: 'center', maxWidth: 260 }}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', margin: '0 0 12px', lineHeight: 1.5 }}>
              We'll send a reset link to <strong style={{ color: '#fff' }}>{user?.email}</strong> and sign you out.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => setShowForgot(false)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid rgba(255,255,255,0.3)', background: 'none', color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}
              >
                Cancel
              </button>
              <button
                data-testid="forgot-pin-confirm-btn"
                onClick={handleForgot}
                disabled={forgotSending}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: forgotSending ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif" }}
              >
                {forgotSending ? 'Sending…' : 'Send Reset Link'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
