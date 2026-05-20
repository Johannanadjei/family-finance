/**
 * views/payday/IncomeCard.jsx
 *
 * Single income source card for PaydayView.
 * Uses getIncomeStatus and INCOME_STATUS_CONFIG from finance.js — no reimplementation.
 * All styling driven by INCOME_STATUS_CONFIG — no hardcoded colours.
 *
 * @param {IncomeStream} income
 * @param {function}     fmt           — from PaydayView (from BudgetCentreContext)
 * @param {function}     onConfirm     — (income) => void
 * @param {function}     onMarkPending — (sourceId) => void
 * @param {boolean}      disabled
 */

import { getIncomeStatus, INCOME_STATUS_CONFIG, calcDaysUntil } from '../../lib/finance';

export function IncomeCard({ income, fmt, onConfirm, onMarkPending, disabled }) {
  const status   = getIncomeStatus(income);
  const config   = INCOME_STATUS_CONFIG[status];
  const daysUntil = income.pay_day ? calcDaysUntil(income.pay_day) : null;

  return (
    <div style={{
      background:   'var(--c-card, #fff)',
      borderRadius: 16,
      padding:      '16px 18px',
      marginBottom: 12,
      border:       `1.5px solid ${config.border}`,
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
        {/* Status badge */}
        <span style={{
          fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20,
          background: config.bg, color: config.color, whiteSpace: 'nowrap',
        }}>
          {config.label}
        </span>
      </div>

      {/* Amounts */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 11, color: 'var(--c-muted, #6b7280)', margin: '0 0 2px' }}>Expected</p>
          <p data-testid={`income-expected-${income.id}`} style={{ fontSize: 18, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: 0 }}>
            {fmt(income.expected_amount)}
          </p>
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
        <button
          onClick={() => onMarkPending(income.id)}
          disabled={disabled}
          style={{
            width: '100%', padding: '11px', borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)',
            background: '#fff', color: 'var(--c-muted, #6b7280)', fontSize: 13, fontWeight: 800,
            cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
            fontFamily: "'Nunito', sans-serif",
          }}
        >
          Mark as Pending
        </button>
      ) : (
        <button
          onClick={() => onConfirm(income)}
          disabled={disabled}
          style={{
            width: '100%', padding: '11px', borderRadius: 10, border: 'none',
            background: disabled ? 'var(--c-border, #e5e7eb)' : 'linear-gradient(135deg, var(--c-primary, #064e3b), var(--c-primary-2, #0d7060))',
            color: disabled ? 'var(--c-muted, #9ca3af)' : '#fff', fontSize: 13, fontWeight: 800,
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontFamily: "'Nunito', sans-serif",
          }}
        >
          Confirm Received
        </button>
      )}
    </div>
  );
}
