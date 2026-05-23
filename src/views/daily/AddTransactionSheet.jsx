/**
 * views/daily/AddTransactionSheet.jsx
 *
 * Bottom sheet for logging transactions from any tab via FAB.
 * Rendered at App.jsx level — above all views.
 * Reads addTransaction from FinanceContext.
 * Reads categories, centre, fmt, getCatIcon from BudgetCentreContext.
 *
 * Type toggle: Expense (default) | Income.
 * Expense: category chips + free text fallback.
 * Income: free text source field only.
 *
 * z-index 350 — above BottomNav, below SidePanel (400).
 */

import { useState, useEffect }        from 'react';
import { useBudgetCentreContext }     from '../../context/BudgetCentreContext';
import { useFinanceContext }          from '../../context/FinanceContext';
import { getWeekForDate }            from '../../lib/finance';

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '1.5px solid var(--c-border, #e5e7eb)', fontSize: 15, fontWeight: 700,
  outline: 'none', background: 'var(--c-input-bg, #f9fafb)', boxSizing: 'border-box',
  fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)',
};

export function AddTransactionSheet({ isOpen, onClose, onSaved, editTx = null }) {
  const { centre, categories, getCatIcon } = useBudgetCentreContext();
  const { addTransaction, updateTransaction } = useFinanceContext();

  const [type,         setType]         = useState('expense');
  const [amount,       setAmount]       = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [categoryId,   setCategoryId]   = useState(null);
  const [description,  setDescription]  = useState('');
  const [date,         setDate]         = useState(() => new Date().toISOString().split('T')[0]);
  const [loading,      setLoading]      = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [error,        setError]        = useState(null);

  useEffect(() => {
    if (isOpen) {
      setType(editTx?.type || 'expense');
      setAmount(editTx ? String(editTx.amount) : '');
      setCategoryName(editTx?.category_name || '');
      setCategoryId(editTx?.category_id || null);
      setDescription(editTx?.description || '');
      setDate(editTx?.date || new Date().toISOString().split('T')[0]);
      setError(null);
      setSaved(false);
    }
  }, [isOpen, editTx?.id]);

  if (!isOpen) return null;

  const handleCategoryChip = (cat) => {
    setCategoryName(cat.name);
    setCategoryId(cat.id);
  };

  const handleSubmit = async () => {
    const n = Math.round(parseFloat(amount) || 0);
    if (!n || n <= 0) { setError('Amount must be greater than zero'); return; }
    if (!date)          { setError('Please select a date'); return; }
    const finalCategory   = categoryName.trim() || 'Other';
    const finalCategoryId = categoryName.trim() ? categoryId : null;
    setLoading(true);
    let savedTx = null;
    let err     = null;

    if (editTx) {
      const result = await updateTransaction(editTx.id, {
        amount:        n,
        category_name: finalCategory,
        category_id:   finalCategoryId,
        description:   description.trim(),
        date,
        week:          getWeekForDate(date),
      });
      err     = result.error;
      savedTx = result.data;
    } else {
      const result = await addTransaction({
        type,
        amount:        n,
        category_name: finalCategory,
        category_id:   finalCategoryId,
        description:   description.trim(),
        date,
        week:          getWeekForDate(date),
        currency:      centre?.currency || 'GHS',
        source:        'main_app',
      });
      err     = result.error;
      savedTx = result.data;
    }

    if (err) {
      console.error('[AddTransactionSheet] save error:', err);
      setError('Could not save transaction. Please try again.');
      setLoading(false);
    } else {
      setSaved(true);
      setLoading(false);
      if (onSaved) onSaved(savedTx || { type, category_name: finalCategory });
      setTimeout(onClose, 600);
    }
  };

  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 340 }} />
      <div role="dialog" aria-label="Add transaction" style={{ position: 'fixed', bottom: 0, left: 'max(0px, calc(50vw - 220px))', width: '100%', maxWidth: 440, background: 'var(--c-modal-bg, var(--c-card, #fff))', borderRadius: '20px 20px 0 0', padding: '20px 20px calc(20px + env(safe-area-inset-bottom))', zIndex: 350, boxShadow: '0 -8px 32px rgba(0,0,0,.12)', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ width: 40, height: 4, background: 'var(--c-border, #e5e7eb)', borderRadius: 2, margin: '0 auto 16px' }} />
        {editTx && <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 16px', textAlign: 'center' }}>Edit Transaction</p>}

        {/* Type toggle */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {['expense', 'income'].map(t => (
            <button key={t} onClick={() => { setType(t); setCategoryName(''); setCategoryId(null); setError(null); }}
              style={{ padding: '10px', borderRadius: 10, border: 'none', fontFamily: "'Nunito', sans-serif", fontSize: 14, fontWeight: 800, cursor: 'pointer', background: type === t ? 'linear-gradient(135deg, var(--c-primary, #064e3b), var(--c-primary-2, #0d7060))' : 'var(--c-bg, #f3f4f6)', color: type === t ? '#fff' : 'var(--c-muted, #6b7280)' }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Amount */}
          <input data-testid="add-amount-input" type="number" value={amount} onChange={e => { setAmount(e.target.value); setError(null); }} placeholder="0" min="0" style={{ ...inputStyle, fontSize: 24, fontWeight: 900, textAlign: 'center' }} autoFocus />

          {/* Category chips — expense only */}
          {type === 'expense' && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--c-muted, #6b7280)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Category</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {categories.map(cat => (
                  <button key={cat.id} onClick={() => handleCategoryChip(cat)}
                    style={{ padding: '6px 12px', borderRadius: 20, border: `1.5px solid ${categoryId === cat.id ? 'var(--c-primary, #064e3b)' : 'var(--c-border, #e5e7eb)'}`, background: categoryId === cat.id ? 'var(--c-chip-selected-bg, #f0fdf4)' : 'var(--c-chip-bg, #f3f4f6)', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: categoryId === cat.id ? 'var(--c-chip-selected-text, #064e3b)' : 'var(--c-chip-text, #1c1917)', fontFamily: "'Nunito', sans-serif" }}>
                    {getCatIcon(cat.name)} {cat.name}
                  </button>
                ))}
              </div>
              <input data-testid="add-category-input" type="text" value={categoryName} onChange={e => { setCategoryName(e.target.value); setCategoryId(null); setError(null); }} placeholder="Or type a custom category" style={inputStyle} />
            </div>
          )}

          {/* Source — income only */}
          {type === 'income' && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--c-muted, #6b7280)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Source</p>
              <input data-testid="add-category-input" type="text" value={categoryName} onChange={e => { setCategoryName(e.target.value); setError(null); }} placeholder="e.g. Freelance, Gift, Sale" style={inputStyle} />
            </div>
          )}

          {/* Description */}
          <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" style={inputStyle} />

          {/* Date */}
          <div style={{ position: 'relative' }}>
            <input data-testid="add-date-input" type="date" lang="en-GB" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputStyle, paddingRight: 44, WebkitAppearance: 'none', appearance: 'none' }} />
            <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-muted, #9ca3af)', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M3 9h18" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </span>
          </div>

          {error && (
            <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '10px 14px' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{error}</p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <button onClick={onClose} disabled={loading} style={{ padding: '14px', borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'var(--c-chip-bg, #f3f4f6)', fontSize: 14, fontWeight: 800, cursor: 'pointer', color: 'var(--c-muted, #6b7280)', fontFamily: "'Nunito', sans-serif" }}>Cancel</button>
            <button onClick={handleSubmit} disabled={loading || saved} style={{ padding: '14px', borderRadius: 12, border: 'none', background: loading ? 'var(--c-border, #e5e7eb)' : saved ? 'var(--c-success, #059669)' : 'linear-gradient(135deg, var(--c-primary, #064e3b), var(--c-primary-2, #0d7060))', color: loading ? 'var(--c-muted, #9ca3af)' : '#fff', fontSize: 14, fontWeight: 800, cursor: loading || saved ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif", transition: 'background .2s' }}>{loading ? 'Saving...' : saved ? '✓ Saved' : editTx ? 'Save Changes' : 'Save'}</button>
          </div>
        </div>
      </div>
    </>
  );
}
