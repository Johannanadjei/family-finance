/**
 * views/payday/ConfirmSheet.jsx
 *
 * Bottom sheet for confirming income received.
 * Anchored to app container — same pattern as SidePanel.
 * Z-index 350 — above BottomNav (200), below SidePanel (400).
 * Resets amount and date when opened.
 *
 * @param {IncomeStream|null} income
 * @param {boolean}           isOpen
 * @param {function}          onClose
 * @param {function}          onConfirm  — (sourceId, amount, date) => void
 * @param {boolean}           loading
 * @param {string|null}       error
 * @param {function}          fmt
 */

import { useState, useEffect } from 'react';

const inputStyle = {
  width: '100%', padding: '14px 16px', borderRadius: 12,
  border: '1.5px solid var(--c-border, #e5e7eb)', fontSize: 16, fontWeight: 700,
  outline: 'none', background: 'var(--c-input-bg, #f9fafb)', boxSizing: 'border-box',
  fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)',
};

const computeDate = (d, m, y) => {
  const dd = parseInt(d), mm = parseInt(m), yy = parseInt(y);
  if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yy >= 2020 && yy <= 2030) {
    return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
  return '';
};

export function ConfirmSheet({ income, isOpen, onClose, onConfirm, loading, error, fmt }) {
  const [amount,     setAmount]     = useState('');
  const [date,       setDate]       = useState('');
  const [day,        setDay]        = useState('');
  const [month,      setMonth]      = useState('');
  const [year,       setYear]       = useState('');
  const [localError, setLocalError] = useState(null);

  useEffect(() => {
    if (isOpen && income) {
      setAmount(String(income.expected_amount));
      const today = new Date().toISOString().split('T')[0];
      setDate(today);
      const [y, m, d] = today.split('-');
      setYear(y);
      setMonth(String(parseInt(m)));
      setDay(String(parseInt(d)));
      setLocalError(null);
    }
  }, [isOpen, income?.id]);

  if (!isOpen || !income) return null;

  const handleConfirm = () => {
    const n = amount === '' ? NaN : Math.round(parseFloat(amount));
    if (isNaN(n) || n < 0) { setLocalError('Amount must be zero or greater'); return; }
    setLocalError(null);
    onConfirm(income.id, n, date);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,.4)',
          zIndex: 340,
        }}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-label={`Confirm income for ${income.label}`}
        style={{
          position:    'fixed',
          bottom:      0,
          left:        'max(0px, calc(50vw - 220px))',
          width:       '100%',
          maxWidth:    440,
          background:  'var(--c-card, #fff)',
          borderRadius: '20px 20px 0 0',
          padding:     '24px 20px calc(24px + env(safe-area-inset-bottom))',
          zIndex:      350,
          boxShadow:   '0 -8px 32px rgba(0,0,0,.12)',
        }}
      >
        {/* Handle */}
        <div style={{ width: 40, height: 4, background: 'var(--c-border, #e5e7eb)', borderRadius: 2, margin: '0 auto 20px' }} />

        <p style={{ fontSize: 18, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 4px' }}>
          {income.icon} {income.label}
        </p>
        <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: '0 0 20px' }}>
          Expected: {fmt(income.expected_amount)}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--c-muted, #6b7280)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>
              Amount received
            </p>
            <input
              data-testid="confirm-amount-input"
              type="number"
              value={amount}
              onChange={e => { setAmount(e.target.value); setLocalError(null); }}
              min="0"
              style={inputStyle}
            />
          </div>

          <div>
            <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--c-muted, #6b7280)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>
              Date received
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input data-testid="confirm-date-day" type="number" min="1" max="31" placeholder="DD" value={day} onChange={e => { const v = e.target.value; setDay(v); setDate(computeDate(v, month, year)); }} style={{ ...inputStyle, width: 60, padding: '12px 8px', textAlign: 'center' }} />
              <span style={{ color: 'var(--c-muted, #6b7280)', fontWeight: 800, fontSize: 18, flexShrink: 0 }}>/</span>
              <input data-testid="confirm-date-month" type="number" min="1" max="12" placeholder="MM" value={month} onChange={e => { const v = e.target.value; setMonth(v); setDate(computeDate(day, v, year)); }} style={{ ...inputStyle, width: 60, padding: '12px 8px', textAlign: 'center' }} />
              <span style={{ color: 'var(--c-muted, #6b7280)', fontWeight: 800, fontSize: 18, flexShrink: 0 }}>/</span>
              <input data-testid="confirm-date-year" type="number" min="2020" max="2030" placeholder="YYYY" value={year} onChange={e => { const v = e.target.value; setYear(v); setDate(computeDate(day, month, v)); }} style={{ ...inputStyle, width: 80, padding: '12px 8px', textAlign: 'center' }} />
            </div>
          </div>

          {(localError || error) && (
            <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '10px 14px' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>
                {localError || error}
              </p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginTop: 4 }}>
            <button
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '14px', borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)',
                background: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                color: 'var(--c-muted, #6b7280)', fontFamily: "'Nunito', sans-serif",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              style={{
                padding: '14px', borderRadius: 12, border: 'none',
                background: loading ? 'var(--c-border, #e5e7eb)' : 'linear-gradient(135deg, var(--c-primary, #064e3b), var(--c-primary-2, #0d7060))',
                color: loading ? 'var(--c-muted, #9ca3af)' : '#fff',
                fontSize: 14, fontWeight: 800,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: "'Nunito', sans-serif",
              }}
            >
              {loading ? 'Confirming...' : 'Confirm Receipt'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
