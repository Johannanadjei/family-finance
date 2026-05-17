/**
 * StepCategories.jsx
 * Onboarding Step 4 — Budget categories with emoji picker,
 * duplicate detection, and autosave feedback.
 */

import { useState, useCallback } from 'react';
import { inputStyle } from '../../../components/ui';
import { EmojiPicker }    from '../../../components/ui/EmojiPicker';
import { DuplicatePrompt } from '../../../components/ui/DuplicatePrompt';
import { detectDuplicateBudgetCategory } from '../../../lib/categories';
import { saveDraft } from '../../../services/onboarding.service';

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

export function StepCategories({ data, onNext, onBack, step }) {
  const [cats,        setCats]        = useState(data.categories.length > 0 ? data.categories : GENERIC_DEFAULTS);
  const [newName,     setNewName]     = useState('');
  const [newAmount,   setNewAmount]   = useState('');
  const [newIcon,     setNewIcon]     = useState('💸');
  const [pickerIdx,   setPickerIdx]   = useState(null);
  const [newPicker,   setNewPicker]   = useState(false);
  const [dupPrompt,   setDupPrompt]   = useState(null);
  const [savedLabel,  setSavedLabel]  = useState('');
  const [pendingCat,  setPendingCat]  = useState(null);

  const autosave = useCallback((updatedCats) => {
    saveDraft({ step, data: { ...data, categories: updatedCats } });
    setSavedLabel('Saved');
    setTimeout(() => setSavedLabel(''), 2000);
  }, [step, data]);

  const updateAmount = (i, val) => {
    const updated = cats.map((c, idx) => idx === i ? { ...c, budget_amount: parseFloat(val) || 0 } : c);
    setCats(updated);
    autosave(updated);
  };

  const updateIcon = (i, icon) => {
    const updated = cats.map((c, idx) => idx === i ? { ...c, icon } : c);
    setCats(updated);
    autosave(updated);
  };

  const removeCat = (i) => {
    const updated = cats.filter((_, idx) => idx !== i);
    setCats(updated);
    autosave(updated);
  };

  const commitAdd = (cat) => {
    const updated = [...cats, cat];
    setCats(updated);
    autosave(updated);
    setNewName('');
    setNewAmount('');
    setNewIcon('💸');
    setPendingCat(null);
    setDupPrompt(null);
  };

  const handleAdd = () => {
    if (!newName.trim() || parseFloat(newAmount) < 0) return;
    const candidate = { name: newName.trim(), icon: newIcon, budget_amount: parseFloat(newAmount) || 0, is_fixed: true };
    const { isDuplicate, matchType, matchedCategory } = detectDuplicateBudgetCategory(candidate, cats);
    if (isDuplicate) {
      setPendingCat(candidate);
      setDupPrompt({ matchType, matchedCategory });
    } else {
      commitAdd(candidate);
    }
  };

  const total      = cats.reduce((s, c) => s + (c.budget_amount || 0), 0);
  const fmt        = (n) => data.currency + ' ' + Math.round(n).toLocaleString();
  const valid      = cats.length > 0 && total > 0;
  const overBudget = total > data.monthlyIncome;

  return (
    <div>
      {pickerIdx !== null && <EmojiPicker onSelect={e => updateIcon(pickerIdx, e)} onClose={() => setPickerIdx(null)} />}
      {newPicker          && <EmojiPicker onSelect={e => { setNewIcon(e); setNewPicker(false); }} onClose={() => setNewPicker(false)} />}
      {dupPrompt && pendingCat && (
        <DuplicatePrompt
          matchType={dupPrompt.matchType}
          categoryName={pendingCat.name}
          onAddAnyway={() => commitAdd(pendingCat)}
          onCancel={() => { setDupPrompt(null); setPendingCat(null); }}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <p style={{ fontSize: 11, fontWeight: 800, color: '#059669', letterSpacing: 1, margin: 0 }}>STEP 4 OF 5</p>
        {savedLabel && <p style={{ fontSize: 11, color: '#059669', fontWeight: 700, margin: 0 }}>✓ {savedLabel}</p>}
      </div>
      <p style={{ fontWeight: 900, fontSize: 22, color: '#1c1917', margin: '0 0 4px' }}>Budget Categories</p>
      <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 12px' }}>Enter your monthly budget for each category. Tap an emoji to change it.</p>

      <div style={{ background: overBudget ? '#fef2f2' : total > 0 ? '#f0fdf4' : '#f9fafb', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: overBudget ? '#dc2626' : total > 0 ? '#065f46' : '#9ca3af', margin: 0 }}>
          {total === 0 ? 'Enter amounts for each category below'
            : 'Total: ' + fmt(total) + ' of ' + fmt(data.monthlyIncome) + (overBudget ? ' — Over budget!' : ' ✓')}
        </p>
      </div>

      <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {cats.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f9fafb', borderRadius: 10, padding: '8px 10px' }}>
            <button onClick={() => setPickerIdx(i)}
              style={{ fontSize: 18, background: '#e5e7eb', border: 'none', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', flexShrink: 0 }}>
              {c.icon}
            </button>
            <p style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#1c1917', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
            <input type="number" placeholder="0" value={c.budget_amount || ''}
              onChange={e => updateAmount(i, e.target.value)}
              style={{ width: 88, padding: '6px 8px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, fontWeight: 700, textAlign: 'right', outline: 'none' }} />
            <button onClick={() => removeCat(i)}
              style={{ fontSize: 14, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}>✕</button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <button onClick={() => setNewPicker(true)}
          style={{ fontSize: 18, background: '#e5e7eb', border: 'none', borderRadius: 8, width: 40, height: 40, cursor: 'pointer', flexShrink: 0 }}>
          {newIcon}
        </button>
        <input placeholder="Category name" value={newName} onChange={e => setNewName(e.target.value)}
          style={{ ...inputStyle, flex: 2, fontSize: 13, padding: '9px 12px' }} />
        <input type="number" placeholder="Amount" value={newAmount} onChange={e => setNewAmount(e.target.value)}
          style={{ ...inputStyle, flex: 1, fontSize: 13, padding: '9px 12px' }} />
        <button onClick={handleAdd}
          style={{ padding: '9px 14px', borderRadius: 10, border: 'none', background: '#064e3b', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>+</button>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onBack}
          style={{ flex: 1, padding: '14px', borderRadius: 14, border: '1.5px solid #e5e7eb', background: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', color: '#6b7280' }}>
          Back
        </button>
        <button onClick={() => { if (valid && !overBudget) onNext({ categories: cats }); }} disabled={!valid || overBudget}
          style={{ flex: 2, padding: '14px', borderRadius: 14, border: 'none', background: valid && !overBudget ? 'linear-gradient(135deg,#064e3b,#0d7060)' : '#e5e7eb', color: valid && !overBudget ? '#fff' : '#9ca3af', fontWeight: 800, fontSize: 15, cursor: valid && !overBudget ? 'pointer' : 'not-allowed' }}>
          Continue →
        </button>
      </div>
    </div>
  );
}
