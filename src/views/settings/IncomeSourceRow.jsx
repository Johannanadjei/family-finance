/**
 * views/settings/IncomeSourceRow.jsx
 *
 * Single income source row with delete action.
 * Edit is handled in PaydayView — this row is settings-only delete.
 *
 * @param {{ id, label, icon, expected_amount }} source
 * @param {function} fmt
 * @param {function} onDelete — (id) => Promise<{ error }>
 * @param {boolean}  isLast
 */

import { useState } from 'react';

export function IncomeSourceRow({ source, fmt, onDelete, isLast }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete(source.id);
  };

  return (
    <div style={{
      display:        'flex',
      justifyContent: 'space-between',
      alignItems:     'center',
      padding:        '12px 0',
      borderBottom:   isLast ? 'none' : '1px solid var(--c-border, #e5e7eb)',
      opacity:        deleting ? 0.4 : 1,
      transition:     'opacity .2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>{source.icon || '💰'}</span>
        <div>
          <p data-testid={`income-label-${source.id}`} style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text, #1c1917)', margin: 0 }}>{source.label}</p>
          <p data-testid={`income-amount-${source.id}`} style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: 0 }}>{fmt(source.expected_amount)}</p>
        </div>
      </div>

      <button
        data-testid={`income-delete-${source.id}`}
        onClick={handleDelete}
        disabled={deleting}
        aria-label={`Delete ${source.label}`}
        style={{ background: 'none', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', color: 'var(--c-muted, #9ca3af)', padding: '6px 8px', display: 'flex', alignItems: 'center', opacity: deleting ? 0.4 : 1 }}
      >
        {deleting
          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: 'spin 0.7s linear infinite' }}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="40 20" strokeLinecap="round"/></svg>
          : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        }
      </button>
    </div>
  );
}
