/**
 * views/settings/IncomeSourcesSection.jsx
 *
 * The "Income Sources" card in Settings. Reads income state from context and
 * owns its own UI state (add form, which month sections are expanded).
 *
 * Income sources are month-scoped (Phase 2A): sources are grouped under a month
 * header (current month expanded by default, others collapsible — a statement /
 * calendar feel), and "+ Add" lets the user pick which month to add to.
 */

import { useState }               from 'react';
import { useBudgetCentreContext } from '../../context/BudgetCentreContext';
import { useFinanceContext }      from '../../context/FinanceContext';
import { getCurrentMonth, offsetMonth } from '../../lib/finance';
import { selectStyle }            from '../../lib/selectStyle';
import { IncomeSourceRow }        from './IncomeSourceRow';

const card         = { background: 'var(--c-card, #fff)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--c-shadow)', marginBottom: 16 };
const sectionLabel = { fontSize: 13, fontWeight: 900, color: 'var(--c-muted, #6b7280)', margin: 0, textTransform: 'uppercase', letterSpacing: 0.8 };
const inputStyle   = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)', fontSize: 14, fontWeight: 700, marginBottom: 6, boxSizing: 'border-box', background: 'var(--c-input-bg, #f9fafb)', fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)' };

const formatMonth = (ym) => new Date(ym + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

export function IncomeSourcesSection() {
  const { fmt, centre } = useBudgetCentreContext();
  const { allIncomes, loading, addIncomeSource, deleteIncomeSource, updateIncomeSource } = useFinanceContext();

  const [addingSource,   setAddingSource]   = useState(false);
  const [newLabel,       setNewLabel]       = useState('');
  const [newAmount,      setNewAmount]      = useState('');
  const [newPayDayType,  setNewPayDayType]  = useState('flexible');
  const [newPayDay,      setNewPayDay]      = useState('');
  const [newMonth,       setNewMonth]       = useState(getCurrentMonth());
  const [addError,       setAddError]       = useState(null);
  const [savingSource,   setSavingSource]   = useState(false);
  const [showIncomeInfo, setShowIncomeInfo] = useState(false);
  // Month sections that are expanded. Current month starts open; others collapsed.
  const [expandedMonths, setExpandedMonths] = useState(() => ({ [getCurrentMonth()]: true }));

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
      month:           newMonth,
    });
    setSavingSource(false);
    if (error) { setAddError('Could not save. Please try again.'); return; }
    setExpandedMonths(prev => ({ ...prev, [newMonth]: true }));   // reveal the new row
    setNewLabel(''); setNewAmount(''); setNewPayDayType('flexible'); setNewPayDay('');
    setNewMonth(getCurrentMonth()); setAddError(null); setAddingSource(false);
  };

  // "+ Add" month range: current ±3 months, newest first.
  const monthOptions = [3, 2, 1, 0, -1, -2, -3].map(d => offsetMonth(getCurrentMonth(), d));

  // Group all-months sources by month, newest first, for the segmented list.
  const monthGroups = Object.entries(
    allIncomes.reduce((acc, src) => { (acc[src.month] = acc[src.month] || []).push(src); return acc; }, {})
  ).sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <p style={sectionLabel}>Income Sources</p>
          <button onClick={() => setShowIncomeInfo(v => !v)} aria-label="Income sources info"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: 'var(--c-muted, #6b7280)' }}>
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
            style={{ ...inputStyle, ...selectStyle }}>
            <option value="flexible">Flexible / Ad-hoc</option>
            <option value="fixed_date">Fixed date each month</option>
            <option value="last_working_day">Last working day</option>
          </select>
          {newPayDayType === 'fixed_date' && (
            <input data-testid="new-source-pay-day" type="number" value={newPayDay}
              onChange={e => setNewPayDay(e.target.value)}
              placeholder="Day of month (1–31)" min="1" max="31" style={inputStyle} />
          )}
          <select data-testid="new-source-month" value={newMonth}
            onChange={e => setNewMonth(e.target.value)}
            style={{ ...inputStyle, ...selectStyle }}>
            {monthOptions.map(m => (
              <option key={m} value={m}>{formatMonth(m)}{m === getCurrentMonth() ? ' (this month)' : ''}</option>
            ))}
          </select>
          {addError && <p style={{ fontSize: 12, color: 'var(--c-danger, #dc2626)', margin: '0 0 6px', fontWeight: 700 }}>{addError}</p>}
          <button data-testid="save-income-source-btn" onClick={handleAddSource} disabled={savingSource}
            style={{ width: '100%', padding: 10, borderRadius: 10, border: 'none', background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)', fontSize: 14, fontWeight: 800, cursor: savingSource ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif" }}>
            {savingSource ? 'Saving…' : 'Save Source'}
          </button>
        </div>
      )}

      {loading
        ? <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: 0 }}>Loading…</p>
        : monthGroups.length === 0
          ? <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: 0 }}>No income sources yet</p>
          : monthGroups.map(([month, sources]) => {
              const expanded = !!expandedMonths[month];
              return (
                <div key={month} data-testid={`income-month-group-${month}`}>
                  <button data-testid={`income-month-header-${month}`} aria-expanded={expanded}
                    onClick={() => setExpandedMonths(p => ({ ...p, [month]: !p[month] }))}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', fontFamily: "'Nunito', sans-serif" }}>
                    <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--c-muted, #6b7280)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                      {formatMonth(month)}{month === getCurrentMonth() ? ' · This month' : ''}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--c-muted, #6b7280)' }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{sources.length}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><polyline points="6 9 12 15 18 9"/></svg>
                    </span>
                  </button>
                  {expanded && sources.map((src, i) => (
                    <IncomeSourceRow key={src.id} source={src} fmt={fmt}
                      onDelete={deleteIncomeSource} onUpdate={updateIncomeSource}
                      monthLabel={src.month === getCurrentMonth() ? null : formatMonth(src.month)}
                      isLast={i === sources.length - 1} />
                  ))}
                </div>
              );
            })
      }
    </div>
  );
}
