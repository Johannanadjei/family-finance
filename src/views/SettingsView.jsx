import { useState }                   from 'react';
import { useNavigate }                from 'react-router-dom';
import { useBudgetCentreContext }      from '../context/BudgetCentreContext';
import { useFinanceContext }           from '../context/FinanceContext';
import { useAuth }                    from '../hooks/useAuth';
import { AccessBlocked }              from '../components/ui/AccessBlocked';
import { getCurrentMonth }            from '../lib/finance';
import { CentreSettingsSection }      from './settings/CentreSettingsSection';
import { CategorySettingsRow }        from './settings/CategorySettingsRow';
import { IncomeSourceRow }            from './settings/IncomeSourceRow';
import { ThemeSection }               from './settings/ThemeSection';
import { InstallAppSection }          from './settings/InstallAppSection';
import { AddCategorySheet }           from './budget/AddCategorySheet';
import { GuestSettingsSection }       from './settings/GuestSettingsSection';
import { MembersSection }             from './settings/MembersSection';
import { SecuritySection }            from './settings/SecuritySection';

const card         = { background: 'var(--c-card, #fff)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--c-shadow)', marginBottom: 16 };
const sectionLabel = { fontSize: 13, fontWeight: 900, color: 'var(--c-muted, #6b7280)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.8 };
const inputStyle   = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)', fontSize: 14, fontWeight: 700, marginBottom: 6, boxSizing: 'border-box', background: 'var(--c-input-bg, #f9fafb)', fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)' };

export function SettingsView() {
  const navigate  = useNavigate();
  const { signOut }                                                            = useAuth();
  const { categories, fmt, addCategory, updateCategory, deleteCategory, updateIncomeSource, centre, can } = useBudgetCentreContext();

  if (!can('settings')) return <AccessBlocked message="Settings are only available to hub owners and full-access members." />;
  const { incomes, loading, addIncomeSource, deleteIncomeSource }             = useFinanceContext();

  const [addCatOpen,      setAddCatOpen]      = useState(false);
  const [addingSource,    setAddingSource]    = useState(false);
  const [newLabel,        setNewLabel]        = useState('');
  const [newAmount,       setNewAmount]       = useState('');
  const [newPayDayType,   setNewPayDayType]   = useState('flexible');
  const [newPayDay,       setNewPayDay]       = useState('');
  const [addError,        setAddError]        = useState(null);
  const [savingSource,    setSavingSource]    = useState(false);
  const [showIncomeInfo,  setShowIncomeInfo]  = useState(false);

  const handleAddSource = async () => {
    if (!newLabel.trim()) { setAddError('Please enter a source name'); return; }
    if (newPayDayType === 'fixed_date') {
      const pd = parseInt(newPayDay);
      if (!newPayDay || isNaN(pd) || pd < 1 || pd > 31) { setAddError('Please enter a day between 1 and 31'); return; }
    }
    setSavingSource(true);
    const { error } = await addIncomeSource({
      label:           newLabel.trim(),
      expected_amount: Math.round(parseFloat(newAmount) || 0),
      icon:            '💰',
      currency:        centre?.currency || 'GHS',
      pay_day_type:    newPayDayType,
      pay_day:         newPayDayType === 'fixed_date' ? (parseInt(newPayDay) || null) : null,
      month:           getCurrentMonth(),
    });
    setSavingSource(false);
    if (error) { setAddError('Could not save. Please try again.'); return; }
    setNewLabel('');
    setNewAmount('');
    setNewPayDayType('flexible');
    setNewPayDay('');
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

      {/* Income Sources */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <p style={{ ...sectionLabel, margin: 0 }}>Income Sources</p>
            <button
              onClick={() => setShowIncomeInfo(v => !v)}
              aria-label="Income sources info"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: 'var(--c-muted, #6b7280)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 8v1M12 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          <button data-testid="add-income-source-btn"
            onClick={() => { setAddingSource(v => !v); setAddError(null); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-primary, #064e3b)', fontSize: 13, fontWeight: 800, padding: 0, fontFamily: "'Nunito', sans-serif" }}>
            {addingSource ? 'Cancel' : '+ Add'}
          </button>
        </div>
        {showIncomeInfo && (
          <div style={{ background: 'var(--c-accent-light, #f0fdf4)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
            <p style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: 0, lineHeight: 1.5 }}>
              Add a separate income source for each person contributing to this budget — e.g. your salary, your partner's salary, freelance income. Each source is tracked individually in the Payday screen.
            </p>
          </div>
        )}

        {addingSource && (
          <div style={{ marginBottom: 12 }}>
            <input data-testid="new-source-label" value={newLabel}
              onChange={e => { setNewLabel(e.target.value); setAddError(null); }}
              placeholder="e.g. Freelance, Side Business" style={inputStyle} />
            <input data-testid="new-source-amount" type="number" value={newAmount}
              onChange={e => setNewAmount(e.target.value)}
              placeholder="Expected amount (optional)" style={inputStyle} />
            <select data-testid="new-source-pay-day-type" value={newPayDayType}
              onChange={e => { setNewPayDayType(e.target.value); setNewPayDay(''); }}
              style={{ ...inputStyle, appearance: 'none', WebkitAppearance: 'none' }}>
              <option value="flexible">Flexible / Ad-hoc</option>
              <option value="fixed_date">Fixed date each month</option>
              <option value="last_working_day">Last working day</option>
            </select>
            {newPayDayType === 'fixed_date' && (
              <input data-testid="new-source-pay-day" type="number" value={newPayDay}
                onChange={e => setNewPayDay(e.target.value)}
                placeholder="Day of month (1–31)" min="1" max="31" style={inputStyle} />
            )}
            {addError && <p style={{ fontSize: 12, color: 'var(--c-danger, #dc2626)', margin: '0 0 6px', fontWeight: 700 }}>{addError}</p>}
            <button data-testid="save-income-source-btn" onClick={handleAddSource} disabled={savingSource}
              style={{ width: '100%', padding: 10, borderRadius: 10, border: 'none', background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)', fontSize: 14, fontWeight: 800, cursor: savingSource ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif" }}>
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
                  onDelete={deleteIncomeSource} onUpdate={updateIncomeSource} isLast={i === incomes.length - 1} />
              ))
        }
      </div>

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

      {/* Members */}
      <MembersSection />

      {/* Guest Access */}
      <GuestSettingsSection />

      {/* Security (PIN) */}
      <SecuritySection />

      {/* Theme */}
      <ThemeSection />

      {/* Install App */}
      <InstallAppSection />

      {/* Sign Out */}
      <div style={card}>
        <button onClick={signOut}
          style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'var(--c-card, #ffffff)', fontSize: 14, fontWeight: 800, cursor: 'pointer', color: 'var(--c-text, #1c1917)', fontFamily: "'Nunito', sans-serif" }}>
          Sign Out
        </button>
      </div>

      <AddCategorySheet isOpen={addCatOpen} onClose={() => setAddCatOpen(false)} onAdd={addCategory} />
    </div>
  );
}
