/**
 * views/daily/MoveCycleSheet.jsx — single-select "Move to period" sheet (Commit 12).
 *
 * Bottom sheet listing the periods a transaction can be moved INTO. The owner view
 * (LogView / DailyView) passes a prepared `cycles` list — already filtered to live
 * cycles excluding the tx's current one, sorted newest-first — mirroring how
 * CopyIncomeSheet receives a prepared `sources` list. Single-select: Confirm is
 * disabled until a period is picked.
 *
 * Same chrome as CopyIncomeSheet / ConfirmSheet — useModalChrome (scroll-lock +
 * back-button intercept) above the isOpen guard, portalled to <body>. Z-index 350.
 *
 * @param {boolean}   isOpen
 * @param {function}  onClose
 * @param {object[]}  cycles   — prepared destination cycles (name + start_date), newest-first
 * @param {function}  onMove   — (cycleId: string) => void
 * @param {boolean}   [moving] — a move is in flight
 */

import { useState, useEffect } from 'react';
import { createPortal }        from 'react-dom';
import { useModalChrome }      from '../../hooks/useModalChrome';

const formatRange = (cycle) => {
  const opts = { day: 'numeric', month: 'short' };
  const from = new Date(cycle.start_date).toLocaleDateString('en-GB', opts);
  const to   = new Date(cycle.end_date).toLocaleDateString('en-GB', opts);
  return `${from} – ${to}`;
};

export function MoveCycleSheet({ isOpen, onClose, cycles = [], onMove, moving = false }) {
  const [selectedId, setSelectedId] = useState(null);

  // Clear the selection each time the sheet (re)opens.
  useEffect(() => { if (isOpen) setSelectedId(null); }, [isOpen]);

  useModalChrome({ isOpen, onClose });

  if (!isOpen) return null;

  const disabled = moving || !selectedId;

  return createPortal(
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 340 }} />

      <div
        role="dialog"
        aria-label="Move to period"
        data-testid="move-cycle-sheet"
        data-modal-scrollable="true"
        style={{
          position: 'fixed', bottom: 0, left: 'max(0px, calc(50vw - 220px))',
          width: '100%', maxWidth: 440, background: 'var(--c-card, #fff)',
          borderRadius: '20px 20px 0 0', padding: '24px 20px calc(24px + env(safe-area-inset-bottom))',
          zIndex: 350, boxShadow: '0 -8px 32px rgba(0,0,0,.12)', maxHeight: '80vh', overflowY: 'auto',
        }}
      >
        <div style={{ width: 40, height: 4, background: 'var(--c-border, #e5e7eb)', borderRadius: 2, margin: '0 auto 20px' }} />

        <p style={{ fontSize: 18, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 4px' }}>
          Move to period
        </p>
        <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: '0 0 20px' }}>
          Pick the period this transaction belongs to. Its date stays the same.
        </p>

        {cycles.length === 0 ? (
          <div data-testid="move-cycle-empty" style={{ textAlign: 'center', padding: '24px 0 28px' }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text, #1c1917)', margin: '0 0 4px' }}>No other periods</p>
            <p style={{ fontSize: 13, color: 'var(--c-muted, #9ca3af)', fontWeight: 600, margin: 0 }}>There's nowhere else to move this transaction yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {cycles.map(cycle => {
              const checked = selectedId === cycle.id;
              return (
                <button
                  key={cycle.id}
                  data-testid={`move-cycle-option-${cycle.id}`}
                  onClick={() => setSelectedId(cycle.id)}
                  aria-pressed={checked}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                    border: `1.5px solid ${checked ? 'var(--c-primary, #064e3b)' : 'var(--c-border, #e5e7eb)'}`,
                    background: checked ? 'var(--c-accent-light, #f0fdf4)' : 'var(--c-card, #fff)',
                    fontFamily: "'Nunito', sans-serif", textAlign: 'left',
                  }}
                >
                  <span aria-hidden="true" style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${checked ? 'var(--c-primary, #064e3b)' : 'var(--c-border, #d1d5db)'}`,
                    background: checked ? 'var(--c-primary, #064e3b)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {checked && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: 'var(--c-text, #1c1917)' }}>{cycle.name}</span>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--c-muted, #6b7280)' }}>{formatRange(cycle)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
          <button
            data-testid="move-cancel-btn"
            onClick={onClose}
            disabled={moving}
            style={{
              padding: '14px', borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)',
              background: 'var(--c-card, #ffffff)', fontSize: 14, fontWeight: 800,
              cursor: moving ? 'not-allowed' : 'pointer', color: 'var(--c-muted, #6b7280)',
              fontFamily: "'Nunito', sans-serif",
            }}
          >
            Cancel
          </button>
          <button
            data-testid="move-confirm-btn"
            onClick={() => onMove(selectedId)}
            disabled={disabled}
            style={{
              padding: '14px', borderRadius: 12, border: 'none',
              background: disabled ? 'var(--c-border, #e5e7eb)' : 'var(--c-primary, #064e3b)',
              color: disabled ? 'var(--c-muted, #9ca3af)' : 'var(--c-btn-text, #ffffff)',
              fontSize: 14, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer',
              fontFamily: "'Nunito', sans-serif",
            }}
          >
            {moving ? 'Moving…' : 'Move'}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
