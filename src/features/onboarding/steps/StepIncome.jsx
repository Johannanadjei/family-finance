/**
 * StepIncome.jsx
 * Onboarding Step 2 — Total monthly income.
 * Surplus target is auto-calculated in Step 5 after categories are set.
 */

import { useState } from 'react';
import { inputStyle } from '../../../components/ui';

export function StepIncome({ data, onNext, onBack }) {
  const [monthlyIncome, setMonthlyIncome] = useState(
    data.monthlyIncome > 0 ? String(data.monthlyIncome) : ''
  );

  const parsed = parseFloat(monthlyIncome) || 0;
  const valid  = parsed > 0;

  const fmt = (n) => data.currency + ' ' + Math.round(n).toLocaleString();

  const handleNext = () => {
    if (!valid) return;
    onNext({ monthlyIncome: parsed });
  };

  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 800, color: '#059669', letterSpacing: 1, margin: '0 0 4px' }}>STEP 2 OF 5</p>
      <p style={{ fontWeight: 900, fontSize: 22, color: '#1c1917', margin: '0 0 4px' }}>Monthly Income</p>
      <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px' }}>Enter your total household income each month — all salaries and regular income combined.</p>

      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>
          Total Monthly Income ({data.currency})
        </p>
        <input
          type="number"
          min="0"
          placeholder="0"
          value={monthlyIncome}
          onChange={e => setMonthlyIncome(e.target.value)}
          style={{ ...inputStyle, fontSize: 28, fontWeight: 900, textAlign: 'center' }}
        />
      </div>

      {valid && (
        <div style={{ background: '#f0fdf4', borderRadius: 14, padding: '14px 16px', marginBottom: 24 }}>
          <p style={{ fontSize: 13, color: '#065f46', fontWeight: 700, margin: 0 }}>
            💰 Your monthly household income is <strong>{fmt(parsed)}</strong>
          </p>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>
            We'll help you allocate this across your budget categories in the next steps.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onBack}
          style={{ flex: 1, padding: '14px', borderRadius: 14, border: '1.5px solid #e5e7eb', background: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', color: '#6b7280' }}>
          ← Back
        </button>
        <button onClick={handleNext} disabled={!valid}
          style={{ flex: 2, padding: '14px', borderRadius: 14, border: 'none', background: valid ? 'linear-gradient(135deg,#064e3b,#0d7060)' : '#e5e7eb', color: valid ? '#fff' : '#9ca3af', fontWeight: 800, fontSize: 15, cursor: valid ? 'pointer' : 'not-allowed' }}>
          Continue →
        </button>
      </div>
    </div>
  );
}
