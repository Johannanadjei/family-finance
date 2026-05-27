/**
 * features/onboarding/steps/StepCategories.jsx
 *
 * Step 3 — Budget categories with amounts.
 * Starts with DEFAULT_CATEGORIES pre-loaded.
 * User can edit amounts, add custom categories, or remove any.
 *
 * @param {Category[]} data  — initial categories from OnboardingFlow
 * @param {function} fmt     — currency formatter from OnboardingFlow
 * @param {function} onNext  — (categories) => void
 * @param {function} onBack  — () => void
 */

import { useState } from 'react';
import { validateCategoriesStep } from '../onboarding.validation';

const inputStyle = {
  padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)',
  fontSize: 14, fontWeight: 600, outline: 'none', background: 'var(--c-input-bg, #f9fafb)',
  fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)', boxSizing: 'border-box',
};

export function StepCategories({ data, fmt, onNext, onBack }) {
  const [categories, setCategories] = useState(data);
  const [error,      setError]      = useState(null);

  const update = (id, field, value) =>
    setCategories(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));

  const remove = (id) =>
    setCategories(prev => prev.filter(c => c.id !== id));

  const addCategory = () =>
    setCategories(prev => [...prev, {
      id:            crypto.randomUUID(),
      name:          '',
      icon:          '💸',
      budget_amount: 0,
      is_fixed:      true,
      sort_order:    prev.length,
    }]);

  const totalBudgeted = categories.reduce((s, c) => s + Number(c.budget_amount || 0), 0);

  const handleNext = () => {
    const err = validateCategoriesStep(categories);
    if (err) { setError(err); return; }
    setError(null);
    onNext(categories);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--c-primary, #064e3b)', margin: '0 0 6px' }}>
          Set your budget categories
        </p>
        <p style={{ fontSize: 14, color: 'var(--c-muted, #6b7280)', margin: '0 0 4px' }}>
          Enter how much you plan to spend on each category per month.
        </p>
        <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-primary, #064e3b)', margin: 0 }}>
          Total budgeted: {fmt(totalBudgeted)}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {categories.map(cat => (
          <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--c-input-bg, #f9fafb)', borderRadius: 12, padding: '10px 12px' }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>{cat.icon}</span>
            <input
              type="text"
              value={cat.name}
              onChange={e => update(cat.id, 'name', e.target.value)}
              placeholder="Category name"
              style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            />
            <input
              type="number"
              value={cat.budget_amount || ''}
              onChange={e => update(cat.id, 'budget_amount', parseFloat(e.target.value) || 0)}
              placeholder="0"
              min="0"
              style={{ ...inputStyle, width: 80, textAlign: 'right' }}
            />
            <button
              onClick={() => remove(cat.id)}
              aria-label="Remove category"
              style={{ background: 'var(--c-danger-bg, #fef2f2)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: 'var(--c-danger, #dc2626)', cursor: 'pointer', flexShrink: 0 }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addCategory}
        style={{ width: '100%', padding: '11px', borderRadius: 12, border: '2px dashed var(--c-accent, #059669)', background: 'transparent', color: 'var(--c-accent, #059669)', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}
      >
        + Add category
      </button>

      {error && (
        <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{error}</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
        <button onClick={onBack} style={{ padding: '14px', borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'var(--c-card, #ffffff)', fontSize: 14, fontWeight: 800, cursor: 'pointer', color: 'var(--c-text, #1c1917)', fontFamily: "'Nunito', sans-serif" }}>← Back</button>
        <button onClick={handleNext} style={{ padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, var(--c-primary, #064e3b), var(--c-primary-2, #0d7060))', color: 'var(--c-btn-text, #ffffff)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>Continue →</button>
      </div>
    </div>
  );
}
