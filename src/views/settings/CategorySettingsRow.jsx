/**
 * views/settings/CategorySettingsRow.jsx
 *
 * Single budget category row with inline edit and delete.
 * Receives onUpdate(id, updates) and onDelete(id) from SettingsView.
 * Owns local UI state only — no context calls.
 *
 * @param {{ id, name, icon, budget_amount }} cat
 * @param {function} fmt
 * @param {function} onUpdate — (id, { name, budget_amount }) => Promise<{ error }>
 * @param {function} onDelete — (id) => Promise<{ error }>
 * @param {boolean}  isLast
 */

import { useState } from 'react';

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1.5px solid var(--c-border, #e5e7eb)', fontSize: 14,
  fontWeight: 700, marginBottom: 6, boxSizing: 'border-box',
  background: 'var(--c-input-bg, #f9fafb)', fontFamily: "'Nunito', sans-serif",
  color: 'var(--c-text, #1c1917)',
};

export function CategorySettingsRow({ cat, fmt, onUpdate, onDelete, isLast }) {
  const [editing,  setEditing]  = useState(false);
  const [name,     setName]     = useState('');
  const [budget,   setBudget]   = useState('');
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState(null);

  const openEdit = () => { setName(cat.name); setBudget(String(cat.budget_amount || 0)); setError(null); setEditing(true); };

  const handleSave = async () => {
    if (!name.trim()) { setError('Please enter a name'); return; }
    if (isNaN(parseFloat(budget)) || parseFloat(budget) < 0) { setError('Please enter a valid amount'); return; }
    setSaving(true);
    await onUpdate(cat.id, { name: name.trim(), budget_amount: Math.round(parseFloat(budget) || 0) });
    setSaving(false);
    setEditing(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete(cat.id);
  };

  return (
    <div style={{ padding: '12px 0', borderBottom: isLast ? 'none' : '1px solid var(--c-border, #e5e7eb)' }}>
      {!editing ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>{cat.icon}</span>
            <div>
              <p data-testid={`cat-name-${cat.id}`} style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text, #1c1917)', margin: 0 }}>{cat.name}</p>
              <p data-testid={`cat-budget-${cat.id}`} style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: 0 }}>{fmt(cat.budget_amount)}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button data-testid={`cat-edit-${cat.id}`} onClick={openEdit} aria-label="Edit category"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-muted, #6b7280)', padding: '6px 8px', display: 'flex', alignItems: 'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
            <button data-testid={`cat-delete-${cat.id}`} onClick={handleDelete} disabled={deleting} aria-label="Delete category"
              style={{ background: 'none', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', color: 'var(--c-muted, #9ca3af)', padding: '6px 8px', display: 'flex', alignItems: 'center', opacity: deleting ? 0.4 : 1, transition: 'opacity .2s' }}>
              {deleting
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: 'spin 0.7s linear infinite' }}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="40 20" strokeLinecap="round"/></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              }
            </button>
          </div>
        </div>
      ) : (
        <div>
          <input data-testid={`cat-name-input-${cat.id}`} value={name} onChange={e => { setName(e.target.value); setError(null); }} style={inputStyle} />
          <input data-testid={`cat-budget-input-${cat.id}`} type="number" value={budget} onChange={e => { setBudget(e.target.value); setError(null); }} style={inputStyle} />
          {error && <p style={{ fontSize: 12, color: 'var(--c-danger, #dc2626)', margin: '0 0 4px', fontWeight: 700 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setEditing(false)} style={{ flex: 1, padding: 8, borderRadius: 8, border: '1.5px solid var(--c-border, #e5e7eb)', background: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>Cancel</button>
            <button data-testid={`cat-save-${cat.id}`} onClick={handleSave} disabled={saving}
              style={{ flex: 2, padding: 8, borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, var(--c-primary, #064e3b), var(--c-primary-2, #0d7060))', color: '#fff', fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif" }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
