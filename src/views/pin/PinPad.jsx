/**
 * views/pin/PinPad.jsx
 *
 * Reusable 4-digit PIN entry: dot progress display + custom number pad.
 * Auto-submits on 4th digit. Shake animation on error (pass error={true}).
 * No native keyboard — avoids autofill / password-manager interference.
 */

import { useState, useEffect } from 'react';

const PAD_KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

export function PinPad({ onComplete, error, disabled }) {
  const [digits, setDigits] = useState('');
  const [shake,  setShake]  = useState(false);

  // Trigger shake + clear when parent signals an error
  useEffect(() => {
    if (!error) return;
    setShake(true);
    const t = setTimeout(() => { setShake(false); setDigits(''); }, 600);
    return () => clearTimeout(t);
  }, [error]);

  const handleKey = (key) => {
    if (disabled) return;
    if (key === '⌫') { setDigits(d => d.slice(0, -1)); return; }
    if (key === '')   return;
    if (digits.length >= 4) return;
    const next = digits + key;
    setDigits(next);
    if (next.length === 4) {
      // Allow the dot to render before calling onComplete
      setTimeout(() => { onComplete(next); setDigits(''); }, 80);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}>
      {/* Dot progress */}
      <div
        data-testid="pin-dots"
        style={{
          display: 'flex', gap: 18,
          animation: shake ? 'pinShake .5s ease' : 'none',
        }}
      >
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            width: 16, height: 16, borderRadius: '50%',
            background: i < digits.length
              ? 'var(--c-primary, #064e3b)'
              : 'rgba(255,255,255,0.25)',
            border: '2px solid rgba(255,255,255,0.5)',
            transition: 'background .15s',
          }} />
        ))}
      </div>

      {/* Number pad */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 72px)',
        gap: 14,
      }}>
        {PAD_KEYS.map((key, idx) => (
          key === '' ? (
            <div key={idx} />
          ) : (
            <button
              key={idx}
              data-testid={key === '⌫' ? 'pin-backspace' : `pin-key-${key}`}
              onClick={() => handleKey(key)}
              disabled={disabled}
              aria-label={key === '⌫' ? 'Backspace' : key}
              style={{
                width: 72, height: 72, borderRadius: '50%',
                border: '1.5px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                fontSize: key === '⌫' ? 22 : 24,
                fontWeight: 800,
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontFamily: "'Nunito', sans-serif",
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                WebkitTapHighlightColor: 'transparent',
                opacity: disabled ? 0.4 : 1,
                transition: 'background .1s',
              }}
            >
              {key}
            </button>
          )
        ))}
      </div>
    </div>
  );
}
