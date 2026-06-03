/**
 * features/onboarding/steps/StepCentre.jsx
 *
 * Step 1 — Budget centre name, currency, and icon.
 * Manages its own field state internally.
 * Calls onNext(centreData) only when validation passes.
 *
 * @param {{ name, currency, icon }} data  — initial values from OnboardingFlow
 * @param {function} onNext               — (centreData) => void
 */

import { useState } from 'react';
import { selectStyle }    from '../../../lib/selectStyle';
import { validateCentreStep } from '../onboarding.validation';
import { CURRENCIES, CENTRE_ICONS, CYCLE_ANCHOR_OPTIONS } from '../onboarding.constants';

const inputStyle = {
  width: '100%', padding: '14px 16px', borderRadius: 12,
  border: '1.5px solid #e5e7eb', fontSize: 15, fontWeight: 600,
  outline: 'none', background: '#f9fafb', boxSizing: 'border-box',
  fontFamily: "'Nunito', sans-serif", color: '#1c1917',
};

export function StepCentre({ data, onNext }) {
  const [name,       setName]       = useState(data.name);
  const [currency,   setCurrency]   = useState(data.currency);
  const [icon,       setIcon]       = useState(data.icon);
  const [error,      setError]      = useState(null);
  // Budget-cycle anchor (Commit 14b). Most hubs use the calendar month; the
  // "Configure" path is an optional advanced disclosure (decision 5).
  const [showCycle,  setShowCycle]  = useState(false);
  const [anchorType, setAnchorType] = useState(data.cycle_anchor_type || 'calendar');
  const [anchorDay,  setAnchorDay]  = useState(data.cycle_anchor_day || 1);

  const handleNext = () => {
    const err = validateCentreStep({ name, currency });
    if (err) { setError(err); return; }
    setError(null);
    onNext({
      name: name.trim(), currency, icon,
      cycle_anchor_type: anchorType,
      cycle_anchor_day:  anchorType === 'fixed_day' ? Number(anchorDay) || 1 : null,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#064e3b', margin: '0 0 6px' }}>
          Name your BOS Hub
        </p>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
          This is your financial command centre. Call it anything — "The Adjei's", "Airbnb", "UK Residence".
        </p>
      </div>

      {/* Icon picker */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 800, color: '#6b7280', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>
          Choose an icon
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CENTRE_ICONS.map(i => (
            <button
              key={i}
              onClick={() => setIcon(i)}
              style={{
                width: 44, height: 44, borderRadius: 12, border: 'none',
                fontSize: 20, cursor: 'pointer',
                background: icon === i ? '#064e3b' : '#f3f4f6',
                transform:  icon === i ? 'scale(1.1)' : 'scale(1)',
                transition: 'all .2s',
              }}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      {/* Name */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 800, color: '#6b7280', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>
          Centre name
        </p>
        <input
          type="text"
          placeholder="e.g. The Adjei's"
          value={name}
          onChange={e => { setName(e.target.value); setError(null); }}
          style={inputStyle}
          maxLength={50}
          autoFocus
        />
      </div>

      {/* Currency */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 800, color: '#6b7280', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>
          Currency
        </p>
        <select
          value={currency}
          onChange={e => { setCurrency(e.target.value); setError(null); }}
          style={{ ...inputStyle, ...selectStyle }}
        >
          {CURRENCIES.map(c => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Budget cycle — optional advanced configuration */}
      <div>
        <button
          type="button"
          data-testid="configure-cycle-toggle"
          onClick={() => setShowCycle(s => !s)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0d7060', fontSize: 13, fontWeight: 800, padding: 0, fontFamily: "'Nunito', sans-serif" }}
        >
          {showCycle ? 'Use calendar month ▴' : 'Configure budget cycle ▾'}
        </button>
        {showCycle && (
          <div style={{ marginTop: 10 }}>
            <select
              data-testid="cycle-anchor-select"
              value={anchorType}
              onChange={e => setAnchorType(e.target.value)}
              style={{ ...inputStyle, ...selectStyle }}
            >
              {CYCLE_ANCHOR_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {anchorType === 'fixed_day' && (
              <input
                data-testid="cycle-anchor-day"
                type="number" min={1} max={31}
                value={anchorDay}
                onChange={e => setAnchorDay(e.target.value)}
                placeholder="Day of month (1–31)"
                style={{ ...inputStyle, marginTop: 8 }}
              />
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#fef2f2', borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Next */}
      <button
        onClick={handleNext}
        style={{
          width: '100%', padding: '15px', borderRadius: 12, border: 'none',
          background: 'linear-gradient(135deg, #064e3b, #0d7060)',
          color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer',
          fontFamily: "'Nunito', sans-serif",
        }}
      >
        Continue →
      </button>
    </div>
  );
}
