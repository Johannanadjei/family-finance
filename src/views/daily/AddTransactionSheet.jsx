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
  const [day,          setDay]          = useState(() => String(new Date().getDate()));
  const [month,        setMonth]        = useState(() => String(new Date().getMonth() + 1));
  const [year,         setYear]         = useState(() => String(new Date().getFullYear()));
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
      const d = editTx?.date || new Date().toISOString().split('T')[0];
      const [y, m, dd] = d.split('-');
      setYear(y);
      setMonth(String(parseInt(m)));
      setDay(String(parseInt(dd)));
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
    const dayNum = parseInt(day), monthNum = parseInt(month), yearNum = parseInt(year);
    if (!day   || isNaN(dayNum)   || dayNum < 1   || dayNum > 31)    { setError('Please enter a valid day (1-31)'); return; }
    if (!month || isNaN(monthNum) || monthNum < 1  || monthNum > 12)  { setError('Please enter a valid month (1-12)'); return; }
    if (!year  || isNaN(yearNum)  || yearNum < 2020 || yearNum > 2030) { setError('Please enter a valid year (2020-2030)'); return; }
    if (new Date(yearNum, monthNum - 1, dayNum).getDate() !== dayNum)  { setError('Please enter a valid date'); return; }
    const dateStr = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
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
        date:          dateStr,
        week:          getWeekForDate(dateStr),
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
        date:          dateStr,
        week:          getWeekForDate(dateStr),
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
              style={{ padding: '10px', borderRadius: 10, border: 'none', fontFamily: "'Nunito', sans-serif", fontSize: 14, fontWeight: 800, cursor: 'pointer', background: type === t ? 'var(--c-primary, #064e3b)' : 'var(--c-bg, #f3f4f6)', color: type === t ? 'var(--c-btn-text, #ffffff)' : 'var(--c-muted, #6b7280)' }}>
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

          {/* Date — DD / MM / YYYY */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input data-testid="add-date-input" type="number" min="1" max="31" placeholder="DD" value={day} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setDay(v); setError(null); }} style={{ ...inputStyle, width: 60, padding: '12px 8px', textAlign: 'center' }} />
            <span style={{ color: 'var(--c-muted, #6b7280)', fontWeight: 800, fontSize: 18, flexShrink: 0 }}>/</span>
            <input data-testid="add-month-input" type="number" min="1" max="12" placeholder="MM" value={month} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setMonth(v); setError(null); }} style={{ ...inputStyle, width: 60, padding: '12px 8px', textAlign: 'center' }} />
            <span style={{ color: 'var(--c-muted, #6b7280)', fontWeight: 800, fontSize: 18, flexShrink: 0 }}>/</span>
            <input data-testid="add-year-input" type="number" min="2020" max="2030" placeholder="YYYY" value={year} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setYear(v); setError(null); }} style={{ ...inputStyle, width: 80, padding: '12px 8px', textAlign: 'center' }} />
          </div>

          {error && (
            <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '10px 14px' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{error}</p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <button onClick={onClose} disabled={loading} style={{ padding: '14px', borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'var(--c-chip-bg, #f3f4f6)', fontSize: 14, fontWeight: 800, cursor: 'pointer', color: 'var(--c-muted, #6b7280)', fontFamily: "'Nunito', sans-serif" }}>Cancel</button>
            <button onClick={handleSubmit} disabled={loading || saved} style={{ padding: '14px', borderRadius: 12, border: 'none', background: loading ? 'var(--c-border, #e5e7eb)' : saved ? 'var(--c-success, #059669)' : 'var(--c-primary, #064e3b)', color: loading ? 'var(--c-muted, #9ca3af)' : 'var(--c-btn-text, #ffffff)', fontSize: 14, fontWeight: 800, cursor: loading || saved ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif", transition: 'background .2s' }}>{loading ? 'Saving...' : saved ? '✓ Saved' : editTx ? 'Save Changes' : 'Save'}</button>
          </div>
        </div>
      </div>
    </>
  );
}
