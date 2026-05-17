import { useState } from 'react';
import { validatePin, readPortalSettings } from '../../lib/guest';

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

/** Step 1 — guest enters their name */
function NameStep({ onNext }) {
  const [name, setName] = useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: 0 }}>What is your name?</p>
      <input
        autoFocus placeholder="e.g. Ama"
        value={name} onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && name.trim() && onNext(name.trim())}
        style={{ padding: '14px 16px', borderRadius: 14, border: 'none', fontSize: 16, fontWeight: 600, outline: 'none', background: 'rgba(255,255,255,.15)', color: '#fff', width: '100%', boxSizing: 'border-box' }}
      />
      <button onClick={() => name.trim() && onNext(name.trim())} disabled={!name.trim()}
        style={{ padding: '14px', borderRadius: 14, border: 'none', fontSize: 15, fontWeight: 900, cursor: name.trim() ? 'pointer' : 'not-allowed', background: name.trim() ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'rgba(255,255,255,.2)', color: '#fff' }}>
        Continue →
      </button>
    </div>
  );
}

/** Step 2 — guest enters the PIN */
function PinStep({ guestName, storedPin, onSuccess, onBack }) {
  const [pin,   setPin]   = useState('');
  const [error, setError] = useState(false);

  const handleKey = (k) => {
    if (k === '⌫') { setPin(p => p.slice(0, -1)); setError(false); return; }
    if (k === '' || pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    setError(false);
    if (next.length === 4) {
      setTimeout(() => {
        if (validatePin(next, storedPin)) {
          onSuccess(guestName);
        } else {
          setError(true);
          setTimeout(() => { setPin(''); setError(false); }, 800);
        }
      }, 150);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>Hi {guestName}!</p>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', margin: 0 }}>Enter the guest PIN to continue</p>
      </div>
      {/* PIN dots */}
      <div style={{ display: 'flex', gap: 16 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ width: 18, height: 18, borderRadius: '50%', transition: 'background .15s', background: i < pin.length ? (error ? '#ef4444' : '#f59e0b') : 'rgba(255,255,255,.3)' }} />
        ))}
      </div>
      {error && <p style={{ color: '#fca5a5', fontSize: 13, fontWeight: 700, margin: '-12px 0 0' }}>Incorrect PIN — try again</p>}
      {/* Keypad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, width: '100%', maxWidth: 280 }}>
        {KEYS.map((k, i) => (
          <button key={i} onClick={() => handleKey(k)}
            style={{ height: 60, borderRadius: 16, border: 'none', fontSize: k === '⌫' ? 20 : 22, fontWeight: 800, cursor: k === '' ? 'default' : 'pointer', background: k === '' ? 'transparent' : 'rgba(255,255,255,.15)', color: '#fff' }}>
            {k}
          </button>
        ))}
      </div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.6)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
        ← Change name
      </button>
    </div>
  );
}

/**
 * GuestLoginModal — used when the FAMILY member taps the guest link in Settings
 * to preview/test the guest flow. Has a back button to return to the dashboard.
 */
export function GuestLoginModal({ guestSettings, onSuccess, onBack }) {
  const [step,      setStep]      = useState('name');
  const [guestName, setGuestName] = useState('');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'linear-gradient(160deg,#1e3a5f,#2563eb)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      {/* Back to dashboard — only for family preview */}
      <button onClick={onBack} style={{ position: 'absolute', top: 48, left: 20, background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 10, padding: '8px 14px', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
        ← Back to dashboard
      </button>
      <div style={{ marginBottom: 36, textAlign: 'center' }}>
        <span style={{ fontSize: 52 }}>🔑</span>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '10px 0 4px' }}>Guest Access</p>
        <p style={{ fontSize: 13, color: '#93c5fd', margin: 0 }}>{guestSettings.label}</p>
      </div>
      <div style={{ width: '100%', maxWidth: 340 }}>
        {step === 'name'
          ? <NameStep onNext={name => { setGuestName(name); setStep('pin'); }} />
          : <PinStep guestName={guestName} storedPin={guestSettings.pin} onSuccess={onSuccess} onBack={() => setStep('name')} />
        }
      </div>
    </div>
  );
}

/**
 * GuestPortalScreen — rendered when URL contains ?portal=guest.
 *
 * RULE: No back button. Guest cannot navigate to family dashboard.
 * RULE: Reads settings from URL params + localStorage (cross-device MVP).
 *
 * SECURITY NOTE: MVP only. Production should use server-side token validation.
 */
export function GuestPortalScreen({ onSuccess }) {
  const [step,      setStep]      = useState('name');
  const [guestName, setGuestName] = useState('');

  // Read portal settings from URL + localStorage — works cross-device
  const portalSettings = readPortalSettings();

  console.debug('[GuestPortalScreen] enabled:', portalSettings.enabled, '| label:', portalSettings.label);

  // Guest portal disabled
  if (!portalSettings.enabled) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#1e3a5f,#2563eb)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
        <span style={{ fontSize: 52 }}>🔒</span>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '16px 0 8px' }}>Guest Access Unavailable</p>
        <p style={{ fontSize: 14, color: '#93c5fd', margin: 0, maxWidth: 280, lineHeight: 1.6 }}>
          The household staff portal is not currently active. Please contact your household administrator.
        </p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#1e3a5f,#2563eb)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ marginBottom: 36, textAlign: 'center' }}>
        <span style={{ fontSize: 52 }}>🔑</span>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '10px 0 4px' }}>Staff Portal</p>
        <p style={{ fontSize: 13, color: '#93c5fd', margin: 0 }}>{portalSettings.label}</p>
      </div>
      <div style={{ width: '100%', maxWidth: 340 }}>
        {step === 'name'
          ? <NameStep onNext={name => { setGuestName(name); setStep('pin'); }} />
          : <PinStep
              guestName={guestName}
              storedPin={portalSettings.pin}
              onSuccess={onSuccess}
              onBack={() => setStep('name')}
            />
        }
      </div>
      <p style={{ position: 'absolute', bottom: 24, fontSize: 11, color: 'rgba(255,255,255,.4)', textAlign: 'center' }}>
        Household Staff Portal · Expenses only
      </p>
    </div>
  );
}
