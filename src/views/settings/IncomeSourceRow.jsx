/**
 * views/settings/IncomeSourceRow.jsx
 *
 * Single income source row with inline edit and delete.
 *
 * @param {{ id, label, icon, expected_amount, pay_day_type, pay_day }} source
 * @param {function} fmt
 * @param {function} onDelete — (id) => Promise<{ error }>
 * @param {function} onUpdate — (id, updates) => Promise<{ error }>
 * @param {string}   [monthLabel] — shown as a badge when the source is not in
 *                   the current month (null/omitted for current-month rows)
 * @param {boolean}  isLast
 */

import { useState } from 'react';
import { selectStyle } from '../../lib/selectStyle';

const fieldStyle = {
  width: '100%', padding: '6px 10px', borderRadius: 8,
  border: '1.5px solid var(--c-border, #e5e7eb)', fontSize: 13, fontWeight: 700,
  outline: 'none', background: 'var(--c-input-bg, #f9fafb)', boxSizing: 'border-box',
  fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)',
};

export function IncomeSourceRow({ source, fmt, onDelete, onUpdate, monthLabel = null, isLast }) {
  const [deleting,       setDeleting]       = useState(false);
  const [confirmDelete,  setConfirmDelete]  = useState(false);
  const [editing,        setEditing]        = useState(false);
  const [editLabel,     setEditLabel]     = useState('');
  const [editAmount,    setEditAmount]    = useState('');
  const [editPayDayType, setEditPayDayType] = useState('');
  const [editPayDay,    setEditPayDay]    = useState('');
  const [saving,        setSaving]        = useState(false);
  const [editError,     setEditError]     = useState('');

  const handleEditOpen = () => {
    setEditLabel(source.label);
    setEditAmount(String(source.expected_amount));
    setEditPayDayType(source.pay_day_type || 'flexible');
    setEditPayDay(String(source.pay_day || ''));
    setEditError('');
    setEditing(true);
  };

  const handleEditSave = async () => {
    if (!editLabel.trim()) { setEditError('Please enter a name'); return; }
    if (editPayDayType === 'fixed_date') {
      const pd = parseInt(editPayDay);
      if (!editPayDay || isNaN(pd) || pd < 1 || pd > 31) { setEditError('Please enter a day between 1 and 31'); return; }
    }
    setEditError('');
    setSaving(true);
    await onUpdate(source.id, {
      label:           editLabel.trim(),
      expected_amount: Math.round(parseFloat(editAmount) || 0),
      pay_day_type:    editPayDayType,
      pay_day:         editPayDayType === 'fixed_date' ? Number(editPayDay) || null : null,
    });
    setSaving(false);
    setEditing(false);
  };

  const handleDeleteConfirm = async () => {
    setConfirmDelete(false);
    setDeleting(true);
    await onDelete(source.id);
  };

  return (
    <div style={{
      padding:      '12px 0',
      borderBottom: isLast ? 'none' : '1px solid var(--c-border, #e5e7eb)',
      opacity:      deleting ? 0.4 : 1,
      transition:   'opacity .2s',
    }}>
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            data-testid={`income-edit-label-${source.id}`}
            type="text"
            value={editLabel}
            onChange={e => setEditLabel(e.target.value)}
            placeholder="Source name"
            autoFocus
            style={fieldStyle}
          />
          <input
            data-testid={`income-edit-amount-${source.id}`}
            type="number"
            value={editAmount}
            onChange={e => setEditAmount(e.target.value)}
            placeholder="Expected amount"
            min="0"
            style={fieldStyle}
          />
          <select
            data-testid={`income-edit-pay-day-type-${source.id}`}
            value={editPayDayType}
            onChange={e => { setEditPayDayType(e.target.value); setEditPayDay(''); }}
            style={{ ...fieldStyle, ...selectStyle }}
          >
            <option value="flexible">Flexible / Ad-hoc</option>
            <option value="fixed_date">Fixed date each month</option>
            <option value="last_working_day">Last working day</option>
          </select>
          {editPayDayType === 'fixed_date' && (
            <input
              data-testid={`income-edit-pay-day-${source.id}`}
              type="number"
              min="1"
              max="31"
              placeholder="Day of month (1–31)"
              value={editPayDay}
              onChange={e => { setEditPayDay(e.target.value); setEditError(''); }}
              style={fieldStyle}
            />
          )}
          {editError && <p style={{ fontSize: 12, color: 'var(--c-danger, #dc2626)', margin: '0 0 2px', fontWeight: 700 }}>{editError}</p>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              aria-label="Save income source"
              onClick={handleEditSave}
              disabled={saving}
              style={{ background: 'var(--c-primary, #064e3b)', border: 'none', borderRadius: 8, padding: '6px 14px', color: 'var(--c-btn-text, #ffffff)', fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif", fontWeight: 800 }}
            >
              {saving ? '…' : '✓'}
            </button>
            <button
              aria-label="Cancel edit"
              onClick={() => setEditing(false)}
              style={{ background: 'var(--c-border, #e5e7eb)', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 14, cursor: 'pointer', fontFamily: "'Nunito', sans-serif", fontWeight: 800 }}
            >
              ✕
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>{source.icon || '💰'}</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <p data-testid={`income-label-${source.id}`} style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text, #1c1917)', margin: 0 }}>{source.label}</p>
                {monthLabel && (
                  <span data-testid={`income-month-badge-${source.id}`} style={{ fontSize: 10, fontWeight: 800, color: 'var(--c-muted, #6b7280)', background: 'var(--c-bg, #f3f4f6)', borderRadius: 6, padding: '2px 6px' }}>{monthLabel}</span>
                )}
              </div>
              <p data-testid={`income-amount-${source.id}`} style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: 0 }}>{fmt(source.expected_amount)}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              data-testid={`income-edit-${source.id}`}
              onClick={handleEditOpen}
              aria-label={`Edit ${source.label}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-muted, #6b7280)', padding: '6px 8px', display: 'flex', alignItems: 'center' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
            {confirmDelete ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-muted, #6b7280)', whiteSpace: 'nowrap' }}>Are you sure?</span>
                <button
                  data-testid={`income-delete-confirm-${source.id}`}
                  onClick={handleDeleteConfirm}
                  style={{ background: 'var(--c-danger, #dc2626)', border: 'none', borderRadius: 6, padding: '4px 10px', color: 'var(--c-btn-text, #ffffff)', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}
                >
                  Delete
                </button>
                <button
                  data-testid={`income-delete-cancel-${source.id}`}
                  onClick={() => setConfirmDelete(false)}
                  style={{ background: 'var(--c-border, #e5e7eb)', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                data-testid={`income-delete-${source.id}`}
                onClick={() => setConfirmDelete(true)}
                disabled={deleting}
                aria-label={`Delete ${source.label}`}
                style={{ background: 'none', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', color: 'var(--c-muted, #9ca3af)', padding: '6px 8px', display: 'flex', alignItems: 'center', opacity: deleting ? 0.4 : 1 }}
              >
                {deleting
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: 'spin 0.7s linear infinite' }}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="40 20" strokeLinecap="round"/></svg>
                  : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                }
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
