/**
 * views/PinSetupFlow.jsx
 *
 * Two-step PIN creation shown to a newly authenticated user who has no PIN.
 * Step 1: enter PIN.  Step 2: confirm PIN.
 * On mismatch: shake and reset to step 1.
 * "Skip for now" defers setup — user will see this flow again next login.
 */

import { useState, useCallback } from 'react';
import { PinPad }                from './pin/PinPad';

export function PinSetupFlow({ setupPin, onSkip }) {
  const [step,      setStep]      = useState('enter');  // 'enter' | 'confirm'
  const [first,     setFirst]     = useState('');
  const [mismatch,  setMismatch]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState(null);

  const handleEnter = useCallback((pin) => {
    setFirst(pin);
    setStep('confirm');
    setMismatch(false);
  }, []);

  const handleConfirm = useCallback(async (pin) => {
    if (pin !== first) {
      setMismatch(true);
      // Reset to step 1 after shake animation completes
      setTimeout(() => { setFirst(''); setStep('enter'); setMismatch(false); }, 700);
      return;
    }
    setSaving(true);
    const { error } = await setupPin(pin);
    setSaving(false);
    if (error) setSaveError('Could not save PIN. Please try again.');
    // On success: usePin sets pinUnlocked → App gate re-renders automatically
  }, [first, setupPin]);

  const heading = step === 'enter' ? 'Set a PIN' : 'Confirm your PIN';
  const subtext = step === 'enter'
    ? 'Protect your family finance app with a 4-digit PIN.'
    : 'Enter the same PIN again to confirm.';

  return (
    <div data-testid="pin-setup-flow" style={{
      minHeight: '100dvh',
      background: 'linear-gradient(145deg, var(--c-header-from, #064e3b), var(--c-header-to, #0d7060))',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '32px 24px calc(32px + env(safe-area-inset-bottom, 20px))',
      fontFamily: "'Nunito', sans-serif",
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🔐</div>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>{heading}</p>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', margin: 0, maxWidth: 260, lineHeight: 1.5 }}>
          {subtext}
        </p>
      </div>

      {/* Mismatch / save error message */}
      <div style={{ minHeight: 36, marginBottom: 20, textAlign: 'center' }}>
        {mismatch && (
          <p data-testid="pin-mismatch-msg" style={{ fontSize: 14, color: '#fca5a5', fontWeight: 700, margin: 0 }}>
            PINs didn't match. Try again.
          </p>
        )}
        {saveError && (
          <p style={{ fontSize: 14, color: '#fca5a5', fontWeight: 700, margin: 0 }}>{saveError}</p>
        )}
      </div>

      {/* PIN pad — re-mount on step change so dots reset cleanly */}
      {step === 'enter' ? (
        <PinPad key="enter" onComplete={handleEnter} error={false} disabled={saving} />
      ) : (
        <PinPad key="confirm" onComplete={handleConfirm} error={mismatch} disabled={saving} />
      )}

      {/* Skip */}
      <button
        data-testid="pin-setup-skip"
        onClick={onSkip}
        style={{
          marginTop: 40, background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 700,
          fontFamily: "'Nunito', sans-serif",
        }}
      >
        Skip for now
      </button>
    </div>
  );
}
