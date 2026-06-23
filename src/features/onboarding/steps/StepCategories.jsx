/**
 * features/onboarding/steps/StepCategories.jsx
 *
 * Step 3 — Budget categories with amounts.
 * Starts with DEFAULT_CATEGORIES pre-loaded.
 * User can edit amounts, add custom categories, or remove any.
 *
 * @param {Category[]} data  — initial categories from OnboardingFlow
 * @param {function} fmt     — currency formatter from OnboardingFlow
 * @param {string}   plan    — 'free' | 'pro'; free is capped at the category limit
 * @param {function} onNext  — (categories) => void
 * @param {function} onBack  — () => void
 */

import { useState } from 'react';
import { validateCategoriesStep } from '../onboarding.validation';
import { getLimitsForTier } from '../../../lib/plans';
import { CategoryIconGrid } from '../../../components/ui/CategoryIconGrid';

const inputStyle = {
  padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)',
  fontSize: 14, fontWeight: 600, outline: 'none', background: 'var(--c-input-bg, #f9fafb)',
  fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)', boxSizing: 'border-box',
};

export function StepCategories({ data, fmt, plan = 'free', onNext, onBack }) {
  const [categories,   setCategories]   = useState(data);
  const [error,        setError]        = useState(null);
  const [openPickerId, setOpenPickerId] = useState(null); // row whose icon grid is open (one at a time)

  // Category cap (CAT01) — gate "+ Add" at the free limit during onboarding so the
  // seed never exceeds the cap and trips the server-side bulk reject on confirm.
  const limit = getLimitsForTier(plan).maxCategoriesPerHub;
  const atCap = plan === 'free' && categories.length >= limit;

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
          <div key={cat.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--c-input-bg, #f9fafb)', borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setOpenPickerId(openPickerId === cat.id ? null : cat.id)}
                aria-label="Choose icon"
                aria-expanded={openPickerId === cat.id}
                style={{ fontSize: 20, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
              >
                {cat.icon}
              </button>
              <input
                type="text"
                value={cat.name}
                onChange={e => update(cat.id, 'name', e.target.value)}
                placeholder="Category name"
                data-testid={`category-name-${cat.id}`}
                style={{ ...inputStyle, flex: 1, minWidth: 0 }}
              />
              <input
                type="number"
                value={cat.budget_amount || ''}
                onChange={e => update(cat.id, 'budget_amount', parseFloat(e.target.value) || 0)}
                placeholder="0"
                min="0"
                data-testid={`category-amount-${cat.id}`}
                style={{ ...inputStyle, width: 80, textAlign: 'right' }}
              />
              <button
                onClick={() => remove(cat.id)}
                aria-label="Remove category"
                data-testid={`category-remove-${cat.id}`}
                style={{ background: 'var(--c-danger-bg, #fef2f2)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: 'var(--c-danger, #dc2626)', cursor: 'pointer', flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
            {openPickerId === cat.id && (
              <CategoryIconGrid
                value={cat.icon}
                onSelect={i => { update(cat.id, 'icon', i); setOpenPickerId(null); }}
              />
            )}
          </div>
        ))}
      </div>

      <button
        data-testid="onboarding-add-category-btn"
        onClick={addCategory}
        disabled={atCap}
        style={{ width: '100%', padding: '11px', borderRadius: 12, border: '2px dashed var(--c-accent, #059669)', background: 'transparent', color: 'var(--c-accent, #059669)', fontSize: 13, fontWeight: 800, cursor: atCap ? 'not-allowed' : 'pointer', opacity: atCap ? 0.5 : 1, fontFamily: "'Nunito', sans-serif" }}
      >
        + Add category
      </button>
      {atCap && (
        <p style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: 0, textAlign: 'center', fontWeight: 600 }}>
          Free hubs can have up to {limit} categories. Upgrade to Pro after setup for unlimited.
        </p>
      )}

      {error && (
        <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{error}</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
        <button onClick={onBack} data-testid="category-back-btn" style={{ padding: '14px', borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'var(--c-card, #ffffff)', fontSize: 14, fontWeight: 800, cursor: 'pointer', color: 'var(--c-text, #1c1917)', fontFamily: "'Nunito', sans-serif" }}>← Back</button>
        <button onClick={handleNext} data-testid="category-continue-btn" style={{ padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, var(--c-primary, #064e3b), var(--c-primary-2, #0d7060))', color: 'var(--c-btn-text, #ffffff)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>Continue →</button>
      </div>
    </div>
  );
}
