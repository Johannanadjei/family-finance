/**
 * views/payday/IncomeCard.jsx — Single income source card for PaydayView.
 * Inline edit for expected amount + pay day type. Shows received-amount update
 * prompt when editing a confirmed income to a different amount.
 */

import { useState }                                                from 'react';
import { getIncomeStatus, INCOME_STATUS_CONFIG, calcDaysUntil }   from '../../lib/finance';
import { selectStyle }                                             from '../../lib/selectStyle';
import { UpdateReceivedSheet }                                     from './UpdateReceivedSheet';

export function IncomeCard({ income, fmt, onConfirm, onMarkPending, onUpdateExpected, disabled }) {
  const status    = getIncomeStatus(income);
  const config    = INCOME_STATUS_CONFIG[status];
  const daysUntil = income.pay_day ? calcDaysUntil(income.pay_day) : null;

  const [editing,            setEditing]            = useState(false);
  const [editAmount,         setEditAmount]         = useState('');
  const [payDayType,         setPayDayType]         = useState('');
  const [payDay,             setPayDay]             = useState('');
  const [saving,             setSaving]             = useState(false);
  const [editError,          setEditError]          = useState(null);
  const [showReceivedPrompt, setShowReceivedPrompt] = useState(false);
  const [pendingAmount,      setPendingAmount]      = useState(null);
  const [hoveredPending,     setHoveredPending]     = useState(false);

  const handleEditOpen = () => {
    setEditAmount(String(income.expected_amount));
    setPayDayType(income.pay_day_type || 'flexible');
    setPayDay(String(income.pay_day || ''));
    setEditError(null);
    setEditing(true);
  };

  const handleEditSave = async () => {
    const n = Math.round(parseFloat(editAmount) || 0);
    if (n < 0) { setEditError('Please enter a valid amount'); return; }
    if (payDayType === 'fixed_date') {
      const pd = parseInt(payDay);
      if (!payDay || isNaN(pd) || pd < 1 || pd > 31) { setEditError('Please enter a day between 1 and 31'); return; }
    }
    setEditError(null);
    setSaving(true);
    await onUpdateExpected(income.id, n, {
      pay_day_type: payDayType,
      pay_day:      payDayType === 'fixed_date' ? Number(payDay) || null : null,
    });
    setSaving(false);
    if (income.received && n !== income.received_amount) {
      setPendingAmount(n);
      setEditing(false);
      setShowReceivedPrompt(true);
    } else {
      setEditing(false);
    }
  };

  const handleUpdateReceived = async () => {
    setShowReceivedPrompt(false); setEditing(false);
    await onMarkPending(income.id);
    onConfirm(income);
  };

  const handleKeepReceived = () => { setShowReceivedPrompt(false); setEditing(false); };

  const btnStyle = (primary) => ({ background: primary ? 'var(--c-primary, #064e3b)' : 'var(--c-border, #e5e7eb)', border: 'none', borderRadius: 8, padding: '6px 10px', color: primary ? 'var(--c-btn-text, #ffffff)' : 'inherit', fontSize: 14, cursor: 'pointer' });

  return (
    <div style={{ background: 'var(--c-card, #fff)', borderRadius: 16, padding: '16px 18px', marginBottom: 12, border: '1px solid rgba(255,255,255,0.2)', boxShadow: 'var(--c-shadow)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>{income.icon}</span>
          <div>
            <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 2px' }}>{income.label}</p>
            <p style={{ fontSize: 11, color: 'var(--c-muted, #6b7280)', margin: 0 }}>
              {income.pay_day_type === 'flexible' ? 'Flexible' : income.pay_day_type === 'last_working_day' ? 'Last working day' : `Day ${income.pay_day}`}
            </p>
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20, background: config.bg, color: config.color, whiteSpace: 'nowrap' }}>{config.label}</span>
      </div>

      {/* Amounts */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 11, color: 'var(--c-muted, #6b7280)', margin: '0 0 4px' }}>Expected</p>
          {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input data-testid={`edit-expected-input-${income.id}`} type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} autoFocus style={{ width: 120, padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--c-primary, #064e3b)', fontSize: 16, fontWeight: 800, outline: 'none', fontFamily: "'Nunito', sans-serif" }} />
                  <button aria-label="Save expected amount" onClick={handleEditSave} disabled={saving} style={btnStyle(true)}>✓</button>
                  <button aria-label="Cancel edit" onClick={() => setEditing(false)} style={btnStyle(false)}>✕</button>
                </div>
                <select data-testid={`edit-pay-day-type-${income.id}`} value={payDayType} onChange={e => setPayDayType(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--c-border, #e5e7eb)', fontSize: 13, fontWeight: 700, outline: 'none', background: 'var(--c-input-bg, #f9fafb)', fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)', ...selectStyle }}>
                  <option value="flexible">Flexible / Ad-hoc</option>
                  <option value="fixed_date">Fixed date each month</option>
                  <option value="last_working_day">Last working day</option>
                </select>
                {payDayType === 'fixed_date' && (
                  <input data-testid={`edit-pay-day-${income.id}`} type="number" min="1" max="31" placeholder="Day of month" value={payDay} onChange={e => { setPayDay(e.target.value); setEditError(null); }} style={{ width: 120, padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--c-border, #e5e7eb)', fontSize: 13, fontWeight: 700, outline: 'none', fontFamily: "'Nunito', sans-serif" }} />
                )}
                {editError && <p style={{ fontSize: 12, color: 'var(--c-danger, #dc2626)', margin: 0, fontWeight: 700 }}>{editError}</p>}
              </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <p data-testid={`income-expected-${income.id}`} style={{ fontSize: 18, fontWeight: 900, color: income.expected_amount === 0 ? 'var(--c-muted, #9ca3af)' : 'var(--c-text, #1c1917)', margin: 0 }}>{fmt(income.expected_amount)}</p>
                <button aria-label="Edit expected amount" onClick={handleEditOpen} disabled={disabled} style={{ background: 'none', border: 'none', cursor: 'pointer', color: income.expected_amount === 0 ? 'var(--c-warning, #d97706)' : 'var(--c-muted, #9ca3af)', padding: '2px 4px', display: 'flex', alignItems: 'center', animation: income.expected_amount === 0 ? 'pulse 1.6s ease-in-out infinite' : 'none' }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M9 1.5 11.5 4 4.5 11H2v-2.5L9 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"/></svg>
                </button>
              </div>
              {income.expected_amount === 0 && <p style={{ fontSize: 11, color: 'var(--c-warning, #d97706)', margin: '4px 0 0', fontWeight: 600 }}>Tap ✏ to set your expected amount</p>}
            </>
          )}
        </div>
        {income.received && (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: 'var(--c-muted, #6b7280)', margin: '0 0 2px' }}>Received</p>
            <p data-testid={`income-received-${income.id}`} style={{ fontSize: 22, fontWeight: 900, color: 'var(--c-success, #059669)', margin: 0 }}>{fmt(income.received_amount)}</p>
          </div>
        )}
        {!income.received && daysUntil !== null && (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: 'var(--c-muted, #6b7280)', margin: '0 0 2px' }}>{daysUntil === 0 ? 'Due today' : `${daysUntil} days away`}</p>
          </div>
        )}
      </div>

      {/* Action button */}
      {income.received ? (
        <button onClick={() => onMarkPending(income.id)} disabled={disabled} onMouseEnter={() => !disabled && setHoveredPending(true)} onMouseLeave={() => setHoveredPending(false)}
          style={{ width: '100%', padding: '11px', borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)', background: hoveredPending && !disabled ? 'var(--c-input-bg, #f9fafb)' : 'var(--c-card, #ffffff)', color: 'var(--c-muted, #6b7280)', fontSize: 13, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, fontFamily: "'Nunito', sans-serif", transition: 'background .15s' }}>
          {disabled ? 'Updating…' : 'Mark as Pending'}
        </button>
      ) : (
        <button onClick={() => onConfirm(income)} disabled={disabled}
          style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: disabled ? 'var(--c-border, #e5e7eb)' : 'var(--c-primary, #064e3b)', color: disabled ? 'var(--c-muted, #9ca3af)' : 'var(--c-btn-text, #ffffff)', fontSize: 13, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif" }}>
          {disabled ? 'Confirming…' : 'Confirm Received'}
        </button>
      )}
      <UpdateReceivedSheet
        isOpen={showReceivedPrompt}
        sourceId={income.id}
        receivedAmount={income.received_amount}
        pendingAmount={pendingAmount}
        fmt={fmt}
        onConfirm={handleUpdateReceived}
        onDismiss={handleKeepReceived}
      />
    </div>
  );
}
