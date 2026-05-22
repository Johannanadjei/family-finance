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

export function ConfirmSheet({ income, isOpen, onClose, onConfirm, loading, error, fmt }) {
  const [amount,     setAmount]     = useState('');
  const [date,       setDate]       = useState('');
  const [localError, setLocalError] = useState(null);

  useEffect(() => {
    if (isOpen && income) {
      setAmount(String(income.expected_amount));
      setDate(new Date().toISOString().split('T')[0]);
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
            <input
              data-testid="confirm-date-input"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          {(localError || error) && (
            <div style={{ background: '#fef2f2', borderRadius: 10, padding: '10px 14px' }}>
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
