/**
 * views/guest/GuestPinScreen.jsx
 *
 * Shows the list of active guests for a centre so the user can select
 * their name, then enter their 4-digit PIN to authenticate.
 * Lockout state is surfaced via the error prop (set by useGuestAuth).
 */

import { useState, useEffect } from 'react';

const btnBase = {
  width: '100%', padding: '15px', borderRadius: 12, border: 'none',
  background: 'linear-gradient(135deg, var(--c-primary, #064e3b), var(--c-primary-2, #0d7060))',
  color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer',
  fontFamily: "'Nunito', sans-serif",
};

export function GuestPinScreen({ guests, loading, error, onAuthenticate }) {
  const [selectedId, setSelectedId] = useState(null);
  const [pin,        setPin]        = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);

  useEffect(() => { setPin(''); setLocalError(null); }, [selectedId]);

  const selectedGuest = guests.find(g => g.id === selectedId) || null;

  const handleSubmit = async () => {
    if (!selectedId)        { setLocalError('Please select your name'); return; }
    if (pin.length !== 4)   { setLocalError('PIN must be 4 digits'); return; }
    setSubmitting(true);
    setLocalError(null);
    const result = await onAuthenticate(selectedId, pin);
    setSubmitting(false);
    if (!result?.ok) setPin('');
  };

  const displayError = localError || error;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--c-bg, #f3f4f6)' }}>
        <p style={{ color: 'var(--c-muted, #6b7280)', fontWeight: 700, margin: 0 }}>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(145deg, var(--c-header-from, #064e3b), var(--c-header-to, #0d7060))' }}>
      <div style={{ padding: '52px 20px 28px', textAlign: 'center' }}>
        <p style={{ fontSize: 36, margin: '0 0 10px' }}>🏠</p>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 4px' }}>Guest Access</p>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', margin: 0 }}>Select your name and enter your PIN</p>
      </div>

      <div style={{
        background: 'var(--c-bg, #f3f4f6)', borderRadius: '24px 24px 0 0',
        minHeight: 'calc(100vh - 172px)', padding: '24px 20px',
      }}>
        {guests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 20px', background: 'var(--c-card, #fff)', borderRadius: 16, boxShadow: 'var(--c-shadow)' }}>
            <p style={{ fontSize: 32, margin: '0 0 10px' }}>🚫</p>
            <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text, #1c1917)', margin: '0 0 6px' }}>No guests set up</p>
            <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: 0 }}>
              Ask your household admin to add you as a guest in Settings.
            </p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 12, fontWeight: 900, color: 'var(--c-muted, #6b7280)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Who are you?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {guests.map(g => (
                <button
                  key={g.id}
                  data-testid={`guest-btn-${g.id}`}
                  onClick={() => setSelectedId(g.id === selectedId ? null : g.id)}
                  style={{
                    padding: '14px 16px', borderRadius: 12,
                    border: `2px solid ${g.id === selectedId ? 'var(--c-primary, #064e3b)' : 'var(--c-border, #e5e7eb)'}`,
                    background: g.id === selectedId ? 'var(--c-accent-light, #f0fdf4)' : 'var(--c-card, #fff)',
                    fontSize: 15, fontWeight: 800, textAlign: 'left', cursor: 'pointer',
                    color: g.id === selectedId ? 'var(--c-primary, #064e3b)' : 'var(--c-text, #1c1917)',
                    fontFamily: "'Nunito', sans-serif",
                  }}
                >
                  {g.name}
                </button>
              ))}
            </div>

            {selectedGuest && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 900, color: 'var(--c-muted, #6b7280)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  PIN for {selectedGuest.name}
                </p>
                <input
                  data-testid="guest-pin-input"
                  type="password"
                  inputMode="numeric"
                  placeholder="••••"
                  maxLength={4}
                  value={pin}
                  onChange={e => {
                    setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                    setLocalError(null);
                  }}
                  style={{
                    width: '100%', padding: '16px', borderRadius: 12,
                    border: '1.5px solid var(--c-border, #e5e7eb)',
                    fontSize: 28, fontWeight: 700, textAlign: 'center', letterSpacing: 10,
                    background: 'var(--c-input-bg, #f9fafb)', boxSizing: 'border-box',
                    fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)', outline: 'none',
                  }}
                />
              </div>
            )}
          </>
        )}

        {displayError && (
          <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
            <p data-testid="guest-pin-error" style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>
              {displayError}
            </p>
          </div>
        )}

        {guests.length > 0 && (
          <button
            data-testid="guest-enter-btn"
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              ...btnBase,
              opacity: (submitting || !selectedId || pin.length !== 4) ? 0.5 : 1,
              cursor:  (submitting || !selectedId || pin.length !== 4) ? 'default' : 'pointer',
            }}
          >
            {submitting ? 'Checking…' : 'Enter'}
          </button>
        )}
      </div>
    </div>
  );
}
