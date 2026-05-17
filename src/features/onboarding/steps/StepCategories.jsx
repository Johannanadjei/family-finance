/**
 * StepCategories.jsx
 * Onboarding Step 4 — Budget categories.
 * Starts with a clean generic list. User edits amounts and adds their own.
 * No household-specific categories — every user builds their own budget.
 */

import { useState } from 'react';
import { inputStyle } from '../../../components/ui';

const GENERIC_DEFAULTS = [
  { name: 'Rent / Mortgage',  icon: '🏠', budget_amount: 0, is_fixed: true },
  { name: 'Food & Groceries', icon: '🛒', budget_amount: 0, is_fixed: true },
  { name: 'Transport',        icon: '🚗', budget_amount: 0, is_fixed: true },
  { name: 'Utilities',        icon: '💡', budget_amount: 0, is_fixed: true },
  { name: 'School Fees',      icon: '🎓', budget_amount: 0, is_fixed: true },
  { name: 'Healthcare',       icon: '💊', budget_amount: 0, is_fixed: true },
  { name: 'Savings',          icon: '💰', budget_amount: 0, is_fixed: true },
  { name: 'Internet & Phone', icon: '📱', budget_amount: 0, is_fixed: true },
];

export function StepCategories({ data, onNext, onBack }) {
  const [cats, setCats] = useState(
    data.categories.length > 0 ? data.categories : GENERIC_DEFAULTS
  );
  const [newName,   setNewName]   = useState('');
  const [newAmount, setNewAmount] = useState('');

  const updateAmount = (i, val) =>
    setCats(prev => prev.map((c, idx) =>
      idx === i ? { ...c, budget_amount: parseFloat(val) || 0 } : c
    ));

  const removeCat = (i) => setCats(prev => prev.filter((_, idx) => idx !== i));

  const addCat = () => {
    if (!newName.trim() || !parseFloat(newAmount)) return;
    setCats(prev => [...prev, {
      name:          newName.trim(),
      icon:          '💸',
      budget_amount: parseFloat(newAmount),
      is_fixed:      true,
    }]);
    setNewName('');
    setNewAmount('');
  };

  const total      = cats.reduce((s, c) => s + (c.budget_amount || 0), 0);
  const fmt        = (n) => data.currency + ' ' + Math.round(n).toLocaleString();
  const valid      = cats.length > 0 && total > 0;
  const overBudget = total > data.monthlyIncome;

  const handleNext = () => {
    if (!valid || overBudget) return;
    onNext({ categories: cats });
  };

  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 800, color: '#059669', letterSpacing: 1, margin: '0 0 4px' }}>STEP 4 OF 5</p>
      <p style={{ fontWeight: 900, fontSize: 22, color: '#1c1917', margin: '0 0 4px' }}>Budget Categories</p>
      <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 12px' }}>Enter how much you spend on each category monthly. Add or remove as needed.</p>

      <div style={{ background: overBudget ? '#fef2f2' : total > 0 ? '#f0fdf4' : '#f9fafb', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: overBudget ? '#dc2626' : total > 0 ? '#065f46' : '#9ca3af', margin: 0 }}>
          {total === 0
            ? 'Enter amounts for each category below'
            : 'Total budgeted: ' + fmt(total) + ' of ' + fmt(data.monthlyIncome) + (overBudget ? ' — Over budget!' : ' ✓')}
        </p>
      </div>

      <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {cats.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f9fafb', borderRadius: 10, padding: '8px 10px' }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{c.icon}</span>
            <p style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#1c1917', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
            <input
              type="number"
              placeholder="0"
              value={c.budget_amount || ''}
              onChange={e => updateAmount(i, e.target.value)}
              style={{ width: 90, padding: '6px 8px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, fontWeight: 700, textAlign: 'right', outline: 'none' }}
            />
            <button onClick={() => removeCat(i)}
              style={{ fontSize: 14, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}>✕</button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          placeholder="Add category (e.g. Nanny)"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          style={{ ...inputStyle, flex: 2, fontSize: 13, padding: '9px 12px' }}
        />
        <input
          type="number"
          placeholder="Amount"
          value={newAmount}
          onChange={e => setNewAmount(e.target.value)}
          style={{ ...inputStyle, flex: 1, fontSize: 13, padding: '9px 12px' }}
        />
        <button onClick={addCat}
          style={{ padding: '9px 14px', borderRadius: 10, border: 'none', background: '#064e3b', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>+</button>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onBack}
          style={{ flex: 1, padding: '14px', borderRadius: 14, border: '1.5px solid #e5e7eb', background: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', color: '#6b7280' }}>
          Back
        </button>
        <button onClick={handleNext} disabled={!valid || overBudget}
          style={{ flex: 2, padding: '14px', borderRadius: 14, border: 'none', background: valid && !overBudget ? 'linear-gradient(135deg,#064e3b,#0d7060)' : '#e5e7eb', color: valid && !overBudget ? '#fff' : '#9ca3af', fontWeight: 800, fontSize: 15, cursor: valid && !overBudget ? 'pointer' : 'not-allowed' }}>
          Continue →
        </button>
      </div>
    </div>
  );
}
