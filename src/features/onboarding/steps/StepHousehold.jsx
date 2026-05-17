/**
 * StepHousehold.jsx
 * Onboarding Step 1 — Household name, adults, children, currency.
 */

import { useState } from 'react';
import { inputStyle } from '../../../components/ui';

const CURRENCIES = ['GHS', 'USD', 'GBP', 'NGN', 'KES', 'ZAR', 'EUR', 'CAD'];

export function StepHousehold({ data, onNext }) {
  const [name,     setName]     = useState(data.name     || '');
  const [adults,   setAdults]   = useState(data.adults   || 2);
  const [children, setChildren] = useState(data.children || 0);
  const [currency, setCurrency] = useState(data.currency || 'GHS');

  const valid = name.trim().length >= 2;

  const handleNext = () => {
    if (!valid) return;
    onNext({ name: name.trim(), adults, children, currency });
  };

  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 800, color: '#059669', letterSpacing: 1, margin: '0 0 4px' }}>STEP 1 OF 5</p>
      <p style={{ fontWeight: 900, fontSize: 22, color: '#1c1917', margin: '0 0 4px' }}>Your Household</p>
      <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px' }}>Tell us a little about your family.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>Household Name</p>
          <input
            style={{ ...inputStyle }}
            placeholder="e.g. The Adjei Family"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>

        <div>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>Currency</p>
          <select value={currency} onChange={e => setCurrency(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>Adults</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => setAdults(a => Math.max(1, a - 1))}
                style={{ width: 36, height: 36, borderRadius: '50%', border: '1.5px solid #e5e7eb', background: '#f9fafb', fontSize: 18, cursor: 'pointer', fontWeight: 700 }}>−</button>
              <p style={{ fontWeight: 900, fontSize: 20, margin: 0, minWidth: 24, textAlign: 'center' }}>{adults}</p>
              <button onClick={() => setAdults(a => Math.min(10, a + 1))}
                style={{ width: 36, height: 36, borderRadius: '50%', border: '1.5px solid #e5e7eb', background: '#f9fafb', fontSize: 18, cursor: 'pointer', fontWeight: 700 }}>+</button>
            </div>
          </div>
          <div>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>Children</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => setChildren(c => Math.max(0, c - 1))}
                style={{ width: 36, height: 36, borderRadius: '50%', border: '1.5px solid #e5e7eb', background: '#f9fafb', fontSize: 18, cursor: 'pointer', fontWeight: 700 }}>−</button>
              <p style={{ fontWeight: 900, fontSize: 20, margin: 0, minWidth: 24, textAlign: 'center' }}>{children}</p>
              <button onClick={() => setChildren(c => Math.min(15, c + 1))}
                style={{ width: 36, height: 36, borderRadius: '50%', border: '1.5px solid #e5e7eb', background: '#f9fafb', fontSize: 18, cursor: 'pointer', fontWeight: 700 }}>+</button>
            </div>
          </div>
        </div>
      </div>

      <button onClick={handleNext} disabled={!valid}
        style={{ width: '100%', marginTop: 28, padding: '14px', borderRadius: 14, border: 'none', background: valid ? 'linear-gradient(135deg,#064e3b,#0d7060)' : '#e5e7eb', color: valid ? '#fff' : '#9ca3af', fontWeight: 800, fontSize: 15, cursor: valid ? 'pointer' : 'not-allowed' }}>
        Continue →
      </button>
    </div>
  );
}
