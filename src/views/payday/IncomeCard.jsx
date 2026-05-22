/**
 * views/payday/IncomeCard.jsx
 *
 * Single income source card for PaydayView.
 * Uses getIncomeStatus and INCOME_STATUS_CONFIG from finance.js.
 * Inline edit for expected amount — calls onUpdateExpected.
 *
 * @param {IncomeStream} income
 * @param {function}     fmt
 * @param {function}     onConfirm          — (income) => void
 * @param {function}     onMarkPending      — (sourceId) => void
 * @param {function}     onUpdateExpected   — (sourceId, newAmount) => void
 * @param {boolean}      disabled
 */

import { useState }                                                from 'react';
import { getIncomeStatus, INCOME_STATUS_CONFIG, calcDaysUntil }   from '../../lib/finance';

export function IncomeCard({ income, fmt, onConfirm, onMarkPending, onUpdateExpected, disabled }) {
  const status    = getIncomeStatus(income);
  const config    = INCOME_STATUS_CONFIG[status];
  const daysUntil = income.pay_day ? calcDaysUntil(income.pay_day) : null;

  const [editing,    setEditing]    = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [saving,     setSaving]     = useState(false);

  const handleEditOpen = () => {
    setEditAmount(String(income.expected_amount));
    setEditing(true);
  };

  const handleEditSave = async () => {
    const n = Math.round(parseFloat(editAmount) || 0);
    if (isNaN(n) || n < 0) { setEditing(false); return; }
    setSaving(true);
    await onUpdateExpected(income.id, n);
    setSaving(false);
    setEditing(false);
  };

  return (
    <div style={{
      background:   'var(--c-card, #fff)',
      borderRadius: 16,
      padding:      '16px 18px',
      marginBottom: 12,
      border:       `1.5px solid ${config.border}`,
      boxShadow:    'var(--c-shadow)',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>{income.icon}</span>
          <div>
            <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 2px' }}>
              {income.label}
            </p>
            <p style={{ fontSize: 11, color: 'var(--c-muted, #6b7280)', margin: 0 }}>
              {income.currency} · {income.pay_day_type === 'flexible' ? 'Flexible' : income.pay_day_type === 'last_working_day' ? 'Last working day' : `Day ${income.pay_day}`}
            </p>
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20, background: config.bg, color: config.color, whiteSpace: 'nowrap' }}>
          {config.label}
        </span>
      </div>

      {/* Amounts */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 11, color: 'var(--c-muted, #6b7280)', margin: '0 0 4px' }}>Expected</p>
          {editing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                data-testid={`edit-expected-input-${income.id}`}
                type="number"
                value={editAmount}
                onChange={e => setEditAmount(e.target.value)}
                autoFocus
                style={{ width: 120, padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--c-primary, #064e3b)', fontSize: 16, fontWeight: 800, outline: 'none', fontFamily: "'Nunito', sans-serif" }}
              />
              <button
                aria-label="Save expected amount"
                onClick={handleEditSave}
                disabled={saving}
                style={{ background: 'var(--c-primary, #064e3b)', border: 'none', borderRadius: 8, padding: '6px 10px', color: '#fff', fontSize: 14, cursor: 'pointer' }}
              >✓</button>
              <button
                aria-label="Cancel edit"
                onClick={() => setEditing(false)}
                style={{ background: 'var(--c-border, #e5e7eb)', border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 14, cursor: 'pointer' }}
              >✕</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <p data-testid={`income-expected-${income.id}`} style={{ fontSize: 18, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: 0 }}>
                {fmt(income.expected_amount)}
              </p>
              <button
                aria-label="Edit expected amount"
                onClick={handleEditOpen}
                disabled={disabled}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-muted, #9ca3af)', padding: '2px 4px', display: 'flex', alignItems: 'center' }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <path d="M9 1.5 11.5 4 4.5 11H2v-2.5L9 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          )}
        </div>
        {income.received && (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: 'var(--c-muted, #6b7280)', margin: '0 0 2px' }}>Received</p>
            <p data-testid={`income-received-${income.id}`} style={{ fontSize: 22, fontWeight: 900, color: 'var(--c-success, #059669)', margin: 0 }}>
              {fmt(income.received_amount)}
            </p>
          </div>
        )}
        {!income.received && daysUntil !== null && (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: 'var(--c-muted, #6b7280)', margin: '0 0 2px' }}>
              {daysUntil === 0 ? 'Due today' : `${daysUntil} days away`}
            </p>
          </div>
        )}
      </div>

      {/* Action button */}
      {income.received ? (
        <button onClick={() => onMarkPending(income.id)} disabled={disabled}
          style={{ width: '100%', padding: '11px', borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)', background: '#fff', color: 'var(--c-muted, #6b7280)', fontSize: 13, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, fontFamily: "'Nunito', sans-serif" }}>
          Mark as Pending
        </button>
      ) : (
        <button onClick={() => onConfirm(income)} disabled={disabled}
          style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: disabled ? 'var(--c-border, #e5e7eb)' : 'linear-gradient(135deg, var(--c-primary, #064e3b), var(--c-primary-2, #0d7060))', color: disabled ? 'var(--c-muted, #9ca3af)' : '#fff', fontSize: 13, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif" }}>
          Confirm Received
        </button>
      )}
    </div>
  );
}
