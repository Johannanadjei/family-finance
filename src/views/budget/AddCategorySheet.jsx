/**
 * views/budget/AddCategorySheet.jsx
 *
 * Bottom sheet for adding a new budget category mid-month.
 * Rendered from BudgetView — above all views.
 * Calls onAdd with validated category data.
 *
 * @param {boolean}  isOpen
 * @param {function} onClose
 * @param {function} onAdd   — (category) => void
 */

import { useState, useEffect }    from 'react';
import { useBudgetCentreContext } from '../../context/BudgetCentreContext';
import { getCurrentMonth }         from '../../lib/finance';

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '1.5px solid var(--c-border, #e5e7eb)', fontSize: 15, fontWeight: 700,
  outline: 'none', background: 'var(--c-input-bg, #f9fafb)', boxSizing: 'border-box',
  fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)',
};

export function AddCategorySheet({ isOpen, onClose, onAdd }) {
  const { fmt } = useBudgetCentreContext();
  const [name,   setName]   = useState('');
  const [amount, setAmount] = useState('');
  const [icon,   setIcon]   = useState('💸');
  const [error,  setError]  = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) { setName(''); setAmount(''); setIcon('💸'); setError(null); }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim()) { setError('Please enter a category name'); return; }
    const n = Math.round(parseFloat(amount) || 0);
    setSaving(true);
    const { error: err } = await onAdd({ name: name.trim(), icon, budget_amount: n, is_fixed: true, month: getCurrentMonth(), sort_order: 0 });
    if (err) { setError('Could not save category. Please try again.'); }
    else     { onClose(); }
    setSaving(false);
  };

  const icons = ['🏠','🚗','🛒','💡','💧','📱','🎓','🏥','🎯','✈️','🎉','💰','🏋️','🐾','💸'];

  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 340 }} />
      <div role="dialog" aria-label="Add budget category" style={{ position: 'fixed', bottom: 0, left: 'max(0px, calc(50vw - 220px))', width: '100%', maxWidth: 440, background: 'var(--c-modal-bg, var(--c-card, #fff))', borderRadius: '20px 20px 0 0', padding: '20px 20px calc(20px + env(safe-area-inset-bottom))', zIndex: 350, boxShadow: '0 -8px 32px rgba(0,0,0,.12)' }}>
        <div style={{ width: 40, height: 4, background: 'var(--c-border, #e5e7eb)', borderRadius: 2, margin: '0 auto 16px' }} />
        <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 16px', textAlign: 'center' }}>Add Budget Category</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Icon picker */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {icons.map(i => (
              <button key={i} onClick={() => setIcon(i)}
                style={{ width: 36, height: 36, borderRadius: 8, border: 'none', fontSize: 18, cursor: 'pointer', background: icon === i ? 'var(--c-primary, #064e3b)' : 'var(--c-chip-bg, #f3f4f6)' }}>
                {i}
              </button>
            ))}
          </div>

          <input data-testid="add-cat-name-input" type="text" value={name} onChange={e => { setName(e.target.value); setError(null); }} placeholder="Category name (e.g. School Fees)" style={inputStyle} />
          <input data-testid="add-cat-amount-input" type="number" value={amount} onChange={e => { setAmount(e.target.value); setError(null); }} placeholder="Monthly budget (0 if flexible)" min="0" style={inputStyle} />

          {error && (
            <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '10px 14px' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{error}</p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <button onClick={onClose} disabled={saving} style={{ padding: '14px', borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'var(--c-chip-bg, #f3f4f6)', fontSize: 14, fontWeight: 800, cursor: 'pointer', color: 'var(--c-text, #1c1917)', fontFamily: "'Nunito', sans-serif" }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '14px', borderRadius: 12, border: 'none', background: saving ? 'var(--c-border, #e5e7eb)' : 'var(--c-primary, #064e3b)', color: saving ? 'var(--c-muted, #9ca3af)' : 'var(--c-btn-text, #ffffff)', fontSize: 14, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif" }}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </div>
    </>
  );
}
