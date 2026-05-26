/**
 * features/onboarding/steps/StepIncome.jsx
 *
 * Step 2 — Income streams.
 * Free plan: max 2 income streams.
 * Each stream has label, icon, expected amount, currency, pay day.
 *
 * @param {IncomeStream[]} data    — initial income streams
 * @param {string} centreCurrency  — default currency for new streams
 * @param {string} plan            — 'free' | 'pro'
 * @param {function} onNext        — (incomes) => void
 * @param {function} onBack        — () => void
 */

import { useState } from 'react';
import { validateIncomeStep } from '../onboarding.validation';
import { INCOME_ICONS, CURRENCIES, MAX_FREE_INCOMES, emptyIncome } from '../onboarding.constants';

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '1.5px solid #e5e7eb', fontSize: 14, fontWeight: 600,
  outline: 'none', background: '#f9fafb', boxSizing: 'border-box',
  fontFamily: "'Nunito', sans-serif", color: '#1c1917',
};

function IncomeCard({ income, idx, total, centreCurrency, onUpdate, onRemove }) {
  return (
    <div style={{ background: '#f9fafb', borderRadius: 14, padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: '#064e3b', margin: 0 }}>Income Stream {idx + 1}</p>
        {total > 1 && (
          <button onClick={() => onRemove(income.id)} style={{ background: '#fee2e2', border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 800, color: '#dc2626', cursor: 'pointer' }}>
            Remove
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {INCOME_ICONS.map(i => (
          <button key={i} onClick={() => onUpdate(income.id, 'icon', i)} style={{ width: 36, height: 36, borderRadius: 8, border: 'none', fontSize: 16, cursor: 'pointer', background: income.icon === i ? '#064e3b' : '#e5e7eb', transition: 'all .2s' }}>{i}</button>
        ))}
      </div>
      <input type="text" placeholder="e.g. Salary, Freelance" value={income.label} onChange={e => onUpdate(income.id, 'label', e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <input type="number" placeholder="Expected amount" value={income.expected_amount || ''} onChange={e => onUpdate(income.id, 'expected_amount', parseFloat(e.target.value) || 0)} min="0" style={inputStyle} />
        <select value={income.currency} onChange={e => onUpdate(income.id, 'currency', e.target.value)} style={{ ...inputStyle, appearance: 'none' }}>
          {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
        </select>
      </div>
      <select value={income.pay_day_type} onChange={e => onUpdate(income.id, 'pay_day_type', e.target.value)} style={{ ...inputStyle, marginBottom: income.pay_day_type === 'fixed_date' ? 8 : 0 }}>
        <option value="flexible">Flexible / Ad-hoc</option>
        <option value="fixed_date">Fixed date each month</option>
        <option value="last_working_day">Last working day</option>
      </select>
      {income.pay_day_type === 'fixed_date' && (
        <input type="number" placeholder="Day of month (1-31)" value={income.pay_day || ''} onChange={e => onUpdate(income.id, 'pay_day', parseInt(e.target.value) || null)} min="1" max="31" style={inputStyle} />
      )}
    </div>
  );
}

export function StepIncome({ data, centreCurrency, plan, onNext, onBack }) {
  const [incomes, setIncomes] = useState(
    data.length ? data : [emptyIncome(centreCurrency)]
  );
  const [error, setError] = useState(null);

  const canAdd = plan === 'pro' || incomes.length < MAX_FREE_INCOMES;

  const update = (id, field, value) =>
    setIncomes(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));

  const addIncome = () => {
    if (!canAdd) return;
    setIncomes(prev => [...prev, emptyIncome(centreCurrency)]);
  };

  const removeIncome = (id) =>
    setIncomes(prev => prev.filter(i => i.id !== id));

  const handleNext = () => {
    const err = validateIncomeStep(incomes);
    if (err) { setError(err); return; }
    setError(null);
    onNext(incomes);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#064e3b', margin: '0 0 6px' }}>
          Add your income streams
        </p>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
          Add each source of income for this BOS Hub.
          {plan === 'free' && ` Free plan includes ${MAX_FREE_INCOMES} income streams.`}
        </p>
      </div>

      {/* Income stream cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {incomes.map((income, idx) => (
          <IncomeCard
            key={income.id}
            income={income}
            idx={idx}
            total={incomes.length}
            centreCurrency={centreCurrency}
            onUpdate={update}
            onRemove={removeIncome}
          />
        ))}
      </div>

      {/* Add income button */}
      {canAdd ? (
        <button
          onClick={addIncome}
          style={{
            width: '100%', padding: '12px', borderRadius: 12,
            border: '2px dashed #059669', background: 'transparent',
            color: '#059669', fontSize: 14, fontWeight: 800, cursor: 'pointer',
            fontFamily: "'Nunito', sans-serif",
          }}
        >
          + Add income stream
        </button>
      ) : (
        <div style={{ background: '#fef3c7', borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#92400e', margin: 0 }}>
            Free plan includes {MAX_FREE_INCOMES} income streams. Upgrade to Pro for unlimited.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: '#fef2f2', borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          onClick={() => onNext([])}
          style={{
            padding: '10px', borderRadius: 12, border: '1.5px solid #e5e7eb',
            background: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
            color: '#6b7280', fontFamily: "'Nunito', sans-serif", textAlign: 'center',
          }}
        >
          Skip for now
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
          <button
            onClick={onBack}
            style={{
              padding: '14px', borderRadius: 12, border: '1.5px solid #e5e7eb',
              background: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
              color: '#6b7280', fontFamily: "'Nunito', sans-serif",
            }}
          >
            ← Back
          </button>
          <button
            onClick={handleNext}
            style={{
              padding: '14px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #064e3b, #0d7060)',
              color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
              fontFamily: "'Nunito', sans-serif",
            }}
          >
            Continue →
          </button>
        </div>
      </div>
    </div>
  );
}
