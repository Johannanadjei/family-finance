/**
 * views/settings/SecuritySection.jsx
 *
 * PIN management in Settings: set up, change, or remove PIN.
 * Reads/writes via PinContext (single usePin instance from App.jsx).
 */

import { useState, useCallback } from 'react';
import { usePinContext }          from '../../context/PinContext';
import { PinPad }                from '../pin/PinPad';

const card         = { background: 'var(--c-card, #fff)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--c-shadow)', marginBottom: 16 };
const sectionLabel = { fontSize: 13, fontWeight: 900, color: 'var(--c-muted, #6b7280)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 0.8 };

function PinModal({ title, subtitle, onCancel, testId, children }) {
  return (
    <div data-testid={testId} style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'linear-gradient(145deg, var(--c-header-from, #064e3b), var(--c-header-to, #0d7060))',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '32px 24px', fontFamily: "'Nunito', sans-serif",
    }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <p style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: '0 0 6px' }}>{title}</p>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: 0 }}>{subtitle}</p>
      </div>
      {children}
      <button onClick={onCancel} style={{
        marginTop: 32, background: 'none', border: 'none', cursor: 'pointer',
        color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 700,
        fontFamily: "'Nunito', sans-serif",
      }}>
        Cancel
      </button>
    </div>
  );
}

export function SecuritySection() {
  const { hasPinSetup, verifyPin, setupPin, removePin } = usePinContext();

  const [mode,      setMode]      = useState(null);  // null | 'setup' | 'change-verify' | 'change-new' | 'change-confirm' | 'remove-verify'
  const [newFirst,  setNewFirst]  = useState('');
  const [error,     setError]     = useState(false);
  const [errMsg,    setErrMsg]    = useState('');
  const [saving,    setSaving]    = useState(false);
  const [done,      setDone]      = useState('');

  const close = useCallback(() => {
    setMode(null); setNewFirst(''); setError(false); setErrMsg(''); setSaving(false);
  }, []);

  // ── Setup (no existing PIN) ────────────────────────────────────────────────
  const handleSetupEnter = useCallback((pin) => {
    setNewFirst(pin); setMode('change-confirm');
  }, []);

  // ── Change: step 1 — verify current ───────────────────────────────────────
  const handleChangeVerify = useCallback(async (pin) => {
    const result = await verifyPin(pin);
    if (!result.success) { setError(true); return; }
    setError(false); setMode('change-new');
  }, [verifyPin]);

  // ── Change: step 2 — enter new ────────────────────────────────────────────
  const handleChangeNew = useCallback((pin) => {
    setNewFirst(pin); setMode('change-confirm');
  }, []);

  // ── Change/Setup: step 3 — confirm new ────────────────────────────────────
  const handleConfirm = useCallback(async (pin) => {
    if (pin !== newFirst) {
      setError(true); setErrMsg("PINs didn't match. Try again.");
      setTimeout(() => { setError(false); setErrMsg(''); setNewFirst(''); setMode(hasPinSetup ? 'change-new' : 'setup'); }, 700);
      return;
    }
    setSaving(true);
    const { error: err } = await setupPin(pin);
    setSaving(false);
    if (err) { setErrMsg('Could not save PIN. Please try again.'); return; }
    setDone(hasPinSetup ? 'PIN changed successfully.' : 'PIN set up successfully.');
    close();
  }, [newFirst, hasPinSetup, setupPin, close]);

  // ── Remove: verify then clear ─────────────────────────────────────────────
  const handleRemoveVerify = useCallback(async (pin) => {
    const result = await verifyPin(pin);
    if (!result.success) { setError(true); return; }
    setSaving(true);
    const { error: err } = await removePin();
    setSaving(false);
    if (err) { setErrMsg('Could not remove PIN. Please try again.'); return; }
    setDone('PIN removed.');
    close();
  }, [verifyPin, removePin, close]);

  return (
    <>
      <div style={card} data-testid="security-section">
        <p style={sectionLabel}>Security</p>

        {done && (
          <p style={{ fontSize: 13, color: 'var(--c-success, #059669)', fontWeight: 700, margin: '0 0 10px' }}>
            {done}
          </p>
        )}

        {!hasPinSetup ? (
          <button
            data-testid="setup-pin-btn"
            onClick={() => { setDone(''); setMode('setup'); }}
            style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: 'var(--c-primary, #064e3b)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}
          >
            Set up PIN
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              data-testid="change-pin-btn"
              onClick={() => { setDone(''); setMode('change-verify'); }}
              style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'var(--c-card, #fff)', color: 'var(--c-text, #1c1917)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}
            >
              Change PIN
            </button>
            <button
              data-testid="remove-pin-btn"
              onClick={() => { setDone(''); setMode('remove-verify'); }}
              style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1.5px solid var(--c-danger-light, #fca5a5)', background: 'var(--c-danger-bg, #fef2f2)', color: 'var(--c-danger, #dc2626)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}
            >
              Remove PIN
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {mode === 'setup' && (
        <PinModal title="Set a PIN" subtitle="Enter a 4-digit PIN to protect this app." onCancel={close}>
          <PinPad key="setup" onComplete={handleSetupEnter} error={false} disabled={saving} />
          {errMsg && <p style={{ color: '#fca5a5', fontSize: 13, fontWeight: 700, marginTop: 16 }}>{errMsg}</p>}
        </PinModal>
      )}

      {mode === 'change-verify' && (
        <PinModal title="Change PIN" subtitle="Enter your current PIN to continue." onCancel={close} testId="change-pin-modal">
          <PinPad key="change-verify" onComplete={handleChangeVerify} error={error} disabled={saving} />
          {error && <p style={{ color: '#fca5a5', fontSize: 13, fontWeight: 700, marginTop: 16 }}>Incorrect PIN.</p>}
        </PinModal>
      )}

      {mode === 'change-new' && (
        <PinModal title="New PIN" subtitle="Enter your new 4-digit PIN." onCancel={close}>
          <PinPad key="change-new" onComplete={handleChangeNew} error={false} disabled={saving} />
        </PinModal>
      )}

      {mode === 'change-confirm' && (
        <PinModal title="Confirm PIN" subtitle="Enter the same PIN again." onCancel={close}>
          <PinPad key="confirm" onComplete={handleConfirm} error={error} disabled={saving} />
          {errMsg && <p style={{ color: '#fca5a5', fontSize: 13, fontWeight: 700, marginTop: 16 }}>{errMsg}</p>}
        </PinModal>
      )}

      {mode === 'remove-verify' && (
        <PinModal title="Remove PIN" subtitle="Enter your current PIN to confirm." onCancel={close} testId="remove-pin-modal">
          <PinPad key="remove-verify" onComplete={handleRemoveVerify} error={error} disabled={saving} />
          {error && <p style={{ color: '#fca5a5', fontSize: 13, fontWeight: 700, marginTop: 16 }}>Incorrect PIN.</p>}
          {errMsg && <p style={{ color: '#fca5a5', fontSize: 13, fontWeight: 700, marginTop: 8 }}>{errMsg}</p>}
        </PinModal>
      )}
    </>
  );
}
