/**
 * views/settings/CentreSettingsSection.jsx
 *
 * Inline-editable card for centre name and surplus target.
 * Reads from BudgetCentreContext — calls updateCentre on save.
 * Optimistic update is handled inside useBudgetCentre.
 */

import { useState } from 'react';
import { useBudgetCentreContext } from '../../context/BudgetCentreContext';

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid var(--c-border, #e5e7eb)', fontSize: 15,
  fontWeight: 700, marginBottom: 8, boxSizing: 'border-box',
  background: 'var(--c-input-bg, #f9fafb)', fontFamily: "'Nunito', sans-serif",
  color: 'var(--c-text, #1c1917)',
};

export function CentreSettingsSection() {
  const { centre, fmt, updateCentre } = useBudgetCentreContext();
  const [editing, setEditing] = useState(false);
  const [name,    setName]    = useState('');
  const [surplus, setSurplus] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState(null);

  const openEdit = () => {
    setName(centre?.name || '');
    setSurplus(String(centre?.surplus_target || 0));
    setError(null);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error: err } = await updateCentre({
      name:           name.trim(),
      surplus_target: Math.round(parseFloat(surplus) || 0),
    });
    setSaving(false);
    if (err) { setError('Could not save. Please try again.'); return; }
    setEditing(false);
  };

  return (
    <div style={{ background: 'var(--c-card, #fff)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--c-shadow)', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editing ? 12 : 0 }}>
        <p style={{ fontSize: 13, fontWeight: 900, color: 'var(--c-muted, #6b7280)', margin: 0, textTransform: 'uppercase', letterSpacing: 0.8 }}>Budget Centre</p>
        {!editing && (
          <button data-testid="centre-edit-btn" onClick={openEdit} aria-label="Edit centre settings"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-muted, #6b7280)', padding: 4, display: 'flex', alignItems: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>

      {!editing ? (
        <div style={{ marginTop: 8 }}>
          <p data-testid="centre-name-display" style={{ fontSize: 17, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 4px' }}>{centre?.name}</p>
          <p style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: 0 }}>
            Surplus target: <span data-testid="centre-surplus-display">{fmt(centre?.surplus_target || 0)}</span>
          </p>
        </div>
      ) : (
        <>
          <input data-testid="centre-name-input" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
          <input data-testid="centre-surplus-input" type="number" value={surplus} onChange={e => setSurplus(e.target.value)}
            placeholder="Surplus target" style={inputStyle} />
          {error && <p style={{ fontSize: 12, color: 'var(--c-danger, #dc2626)', margin: '0 0 8px', fontWeight: 700 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditing(false)} style={{ flex: 1, padding: 10, borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)', background: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>Cancel</button>
            <button data-testid="centre-save-btn" onClick={handleSave} disabled={saving}
              style={{ flex: 2, padding: 10, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, var(--c-primary, #064e3b), var(--c-primary-2, #0d7060))', color: '#fff', fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif" }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
