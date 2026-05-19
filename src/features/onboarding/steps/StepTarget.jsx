/**
 * features/onboarding/steps/StepTarget.jsx
 *
 * Step 4 — Monthly surplus target.
 * Shows total expected income for reference.
 * Suggests 10% of income as a starting target.
 *
 * @param {number} data         — current surplusTarget
 * @param {number} totalIncome  — sum of income stream expected amounts
 * @param {function} fmt        — currency formatter
 * @param {function} onNext     — (surplusTarget: number) => void
 * @param {function} onBack     — () => void
 */

import { useState } from 'react';
import { validateTargetStep } from '../onboarding.validation';

export function StepTarget({ data, totalIncome, fmt, onNext, onBack }) {
  const suggested = Math.round(totalIncome * 0.1);
  const [target, setTarget] = useState(data > 0 ? String(data) : String(suggested));
  const [error,  setError]  = useState(null);

  const handleNext = () => {
    const err = validateTargetStep(target);
    if (err) { setError(err); return; }
    setError(null);
    onNext(Math.round(parseFloat(target) || 0));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#064e3b', margin: '0 0 6px' }}>
          Set your surplus target
        </p>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
          This is how much you aim to save or invest each month after all expenses.
        </p>
      </div>

      {totalIncome > 0 && (
        <div style={{ background: '#f0fdf4', borderRadius: 12, padding: '14px 16px' }}>
          <p style={{ fontSize: 13, color: '#065f46', margin: '0 0 4px', fontWeight: 700 }}>
            Total expected income: {fmt(totalIncome)}
          </p>
          <p style={{ fontSize: 12, color: '#059669', margin: 0 }}>
            Suggested target (10%): {fmt(suggested)}
          </p>
        </div>
      )}

      <div>
        <p style={{ fontSize: 12, fontWeight: 800, color: '#6b7280', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>
          Monthly surplus target
        </p>
        <input
          type="number"
          value={target}
          onChange={e => { setTarget(e.target.value); setError(null); }}
          placeholder="0"
          min="0"
          style={{
            width: '100%', padding: '16px', borderRadius: 12,
            border: '1.5px solid #e5e7eb', fontSize: 24, fontWeight: 900,
            outline: 'none', background: '#f9fafb', boxSizing: 'border-box',
            fontFamily: "'Nunito', sans-serif", color: '#064e3b', textAlign: 'center',
          }}
          autoFocus
        />
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '6px 0 0', textAlign: 'center' }}>
          You can change this at any time in Settings
        </p>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', margin: 0 }}>{error}</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
        <button onClick={onBack} style={{ padding: '14px', borderRadius: 12, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', color: '#6b7280', fontFamily: "'Nunito', sans-serif" }}>← Back</button>
        <button onClick={handleNext} style={{ padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #064e3b, #0d7060)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>Continue →</button>
      </div>
    </div>
  );
}
