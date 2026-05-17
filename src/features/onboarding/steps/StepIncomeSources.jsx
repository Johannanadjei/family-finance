/**
 * StepIncomeSources.jsx
 * Onboarding Step 3 — Named income sources with pay dates.
 */

import { useState } from 'react';
import { inputStyle } from '../../../components/ui';

const EMPTY_SOURCE = { label: '', expected_amount: '', pay_day: '', pay_day_type: 'fixed_date', icon: '👤' };
const ICONS = ['👩', '👨', '💼', '🏢', '💰', '📈'];

export function StepIncomeSources({ data, onNext, onBack }) {
  const [sources, setSources] = useState(
    data.incomeSources.length > 0 ? data.incomeSources : [{ ...EMPTY_SOURCE }]
  );

  const update = (i, patch) =>
    setSources(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));

  const addSource = () => {
    if (sources.length >= 5) return;
    setSources(prev => [...prev, { ...EMPTY_SOURCE }]);
  };

  const removeSource = (i) => setSources(prev => prev.filter((_, idx) => idx !== i));

  const valid = sources.every(s => s.label.trim() && parseFloat(s.expected_amount) > 0);

  const handleNext = () => {
    if (!valid) return;
    onNext({
      incomeSources: sources.map(s => ({
        label:           s.label.trim(),
        expected_amount: parseFloat(s.expected_amount),
        pay_day:         s.pay_day ? parseInt(s.pay_day) : null,
        pay_day_type:    s.pay_day_type,
        icon:            s.icon,
      })),
    });
  };

  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 800, color: '#059669', letterSpacing: 1, margin: '0 0 4px' }}>STEP 3 OF 5</p>
      <p style={{ fontWeight: 900, fontSize: 22, color: '#1c1917', margin: '0 0 4px' }}>Income Sources</p>
      <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 20px' }}>Add each salary or regular income — up to 5 sources.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
        {sources.map((s, i) => (
          <div key={i} style={{ background: '#f9fafb', borderRadius: 14, padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {ICONS.map(ic => (
                  <button key={ic} onClick={() => update(i, { icon: ic })}
                    style={{ fontSize: 18, background: s.icon === ic ? '#d1fae5' : 'transparent', border: 'none', borderRadius: 8, padding: '2px 4px', cursor: 'pointer' }}>
                    {ic}
                  </button>
                ))}
              </div>
              {sources.length > 1 && (
                <button onClick={() => removeSource(i)}
                  style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>
                  Remove
                </button>
              )}
            </div>
            <input placeholder="e.g. Adult 1 Salary" value={s.label}
              onChange={e => update(i, { label: e.target.value })}
              style={{ ...inputStyle, marginBottom: 8 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input type="number" placeholder="Amount" value={s.expected_amount}
                onChange={e => update(i, { expected_amount: e.target.value })}
                style={{ ...inputStyle }} />
              <input type="number" placeholder="Pay day (1–31)" min="1" max="31" value={s.pay_day}
                onChange={e => update(i, { pay_day: e.target.value })}
                style={{ ...inputStyle }} />
            </div>
            <select value={s.pay_day_type} onChange={e => update(i, { pay_day_type: e.target.value })}
              style={{ ...inputStyle, marginTop: 8, cursor: 'pointer' }}>
              <option value="fixed_date">Fixed date each month</option>
              <option value="last_working_day">Last working day</option>
            </select>
          </div>
        ))}
      </div>

      {sources.length < 5 && (
        <button onClick={addSource}
          style={{ width: '100%', padding: '11px', borderRadius: 12, border: '1.5px dashed #d1d5db', background: '#fff', fontWeight: 700, fontSize: 13, color: '#6b7280', cursor: 'pointer', marginBottom: 16 }}>
          + Add another income source
        </button>
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
