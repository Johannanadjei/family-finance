/**
 * views/SettingsView.jsx
 *
 * Settings screen — centre config, categories, income sources, theme, sign out.
 * No Supabase calls — all writes delegate to hooks via context.
 */

import { useState }                   from 'react';
import { useNavigate }                from 'react-router-dom';
import { useBudgetCentreContext }      from '../context/BudgetCentreContext';
import { useFinanceContext }           from '../context/FinanceContext';
import { useAuth }                    from '../hooks/useAuth';
import { getCurrentMonth }            from '../lib/finance';
import { CentreSettingsSection }      from './settings/CentreSettingsSection';
import { CategorySettingsRow }        from './settings/CategorySettingsRow';
import { IncomeSourceRow }            from './settings/IncomeSourceRow';
import { ThemeSection }               from './settings/ThemeSection';
import { AddCategorySheet }           from './budget/AddCategorySheet';

const card         = { background: 'var(--c-card, #fff)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--c-shadow)', marginBottom: 16 };
const sectionLabel = { fontSize: 13, fontWeight: 900, color: 'var(--c-muted, #6b7280)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.8 };
const inputStyle   = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)', fontSize: 14, fontWeight: 700, marginBottom: 6, boxSizing: 'border-box', background: 'var(--c-input-bg, #f9fafb)', fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)' };

export function SettingsView() {
  const navigate  = useNavigate();
  const { signOut }                                                            = useAuth();
  const { categories, fmt, addCategory, updateCategory, deleteCategory, centre } = useBudgetCentreContext();
  const { incomes, loading, addIncomeSource, deleteIncomeSource }             = useFinanceContext();

  const [addCatOpen,   setAddCatOpen]   = useState(false);
  const [addingSource, setAddingSource] = useState(false);
  const [newLabel,     setNewLabel]     = useState('');
  const [newAmount,    setNewAmount]    = useState('');
  const [addError,     setAddError]     = useState(null);
  const [savingSource, setSavingSource] = useState(false);

  const handleAddSource = async () => {
    if (!newLabel.trim()) { setAddError('Please enter a source name'); return; }
    setSavingSource(true);
    const { error } = await addIncomeSource({
      label:           newLabel.trim(),
      expected_amount: Math.round(parseFloat(newAmount) || 0),
      icon:            '💰',
      currency:        centre?.currency || 'GHS',
      pay_day_type:    'flexible',
      pay_day:         null,
      month:           getCurrentMonth(),
    });
    setSavingSource(false);
    if (error) { setAddError('Could not save. Please try again.'); return; }
    setNewLabel('');
    setNewAmount('');
    setAddError(null);
    setAddingSource(false);
  };

  return (
    <div style={{ padding: 16, paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate(-1)} aria-label="Go back"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text, #1c1917)', padding: '4px 8px 4px 0', display: 'flex', alignItems: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: 0 }}>Settings</p>
      </div>

      {/* Centre */}
      <CentreSettingsSection />

      {/* Budget Categories */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p style={{ ...sectionLabel, margin: 0 }}>Budget Categories</p>
          <button onClick={() => setAddCatOpen(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-primary, #064e3b)', fontSize: 13, fontWeight: 800, padding: 0, fontFamily: "'Nunito', sans-serif" }}>
            + Add
          </button>
        </div>
        {categories.length === 0
          ? <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: 0 }}>No categories this month</p>
          : categories.map((cat, i) => (
              <CategorySettingsRow key={cat.id} cat={cat} fmt={fmt}
                onUpdate={updateCategory} onDelete={deleteCategory}
                isLast={i === categories.length - 1} />
            ))
        }
      </div>

      {/* Income Sources */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p style={{ ...sectionLabel, margin: 0 }}>Income Sources</p>
          <button data-testid="add-income-source-btn"
            onClick={() => { setAddingSource(v => !v); setAddError(null); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-primary, #064e3b)', fontSize: 13, fontWeight: 800, padding: 0, fontFamily: "'Nunito', sans-serif" }}>
            {addingSource ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {addingSource && (
          <div style={{ marginBottom: 12 }}>
            <input data-testid="new-source-label" value={newLabel}
              onChange={e => { setNewLabel(e.target.value); setAddError(null); }}
              placeholder="e.g. Freelance, Side Business" style={inputStyle} />
            <input data-testid="new-source-amount" type="number" value={newAmount}
              onChange={e => setNewAmount(e.target.value)}
              placeholder="Expected amount (optional)" style={inputStyle} />
            {addError && <p style={{ fontSize: 12, color: 'var(--c-danger, #dc2626)', margin: '0 0 6px', fontWeight: 700 }}>{addError}</p>}
            <button data-testid="save-income-source-btn" onClick={handleAddSource} disabled={savingSource}
              style={{ width: '100%', padding: 10, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, var(--c-primary, #064e3b), var(--c-primary-2, #0d7060))', color: '#fff', fontSize: 14, fontWeight: 800, cursor: savingSource ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif" }}>
              {savingSource ? 'Saving…' : 'Save Source'}
            </button>
          </div>
        )}

        {loading
          ? <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: 0 }}>Loading…</p>
          : incomes.length === 0
            ? <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: 0 }}>No income sources yet</p>
            : incomes.map((src, i) => (
                <IncomeSourceRow key={src.id} source={src} fmt={fmt}
                  onDelete={deleteIncomeSource} isLast={i === incomes.length - 1} />
              ))
        }
      </div>

      {/* Theme */}
      <ThemeSection />

      {/* Sign Out */}
      <div style={card}>
        <button onClick={signOut}
          style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1.5px solid var(--c-danger, #dc2626)', background: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', color: 'var(--c-danger, #dc2626)', fontFamily: "'Nunito', sans-serif" }}>
          Sign Out
        </button>
      </div>

      <AddCategorySheet isOpen={addCatOpen} onClose={() => setAddCatOpen(false)} onAdd={addCategory} />
    </div>
  );
}
