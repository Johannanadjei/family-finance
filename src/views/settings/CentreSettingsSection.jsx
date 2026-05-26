/**
 * views/settings/CentreSettingsSection.jsx
 *
 * Inline-editable card for centre name and currency.
 * Reads from BudgetCentreContext — calls updateCentre on save.
 * Optimistic update is handled inside useBudgetCentre.
 */

import { useState } from 'react';
import { useBudgetCentreContext } from '../../context/BudgetCentreContext';
import { CURRENCIES }              from '../../features/onboarding/onboarding.constants';
import { selectStyle }             from '../../lib/selectStyle';
import { ArchiveHubSheet }         from './ArchiveHubSheet';

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid var(--c-border, #e5e7eb)', fontSize: 15,
  fontWeight: 700, marginBottom: 8, boxSizing: 'border-box',
  background: 'var(--c-input-bg, #f9fafb)', fontFamily: "'Nunito', sans-serif",
  color: 'var(--c-text, #1c1917)',
};

export function CentreSettingsSection() {
  const { centre, updateCentre, archiveCentre, permanentDeleteCentre, centreCount } = useBudgetCentreContext();
  const [editing,          setEditing]          = useState(false);
  const [name,             setName]             = useState('');
  const [currency,         setCurrency]         = useState('');
  const [saving,           setSaving]           = useState(false);
  const [error,            setError]            = useState(null);
  const [archiveSheetOpen, setArchiveSheetOpen] = useState(false);

  const openEdit = () => {
    setName(centre?.name || '');
    setCurrency(centre?.currency || 'GHS');
    setError(null);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Please enter a name'); return; }
    setSaving(true);
    const { error: err } = await updateCentre({ name: name.trim(), currency });
    setSaving(false);
    if (err) { setError('Could not save. Please try again.'); return; }
    setEditing(false);
  };

  return (
    <div style={{ background: 'var(--c-card, #fff)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--c-shadow)', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editing ? 12 : 0 }}>
        <p style={{ fontSize: 13, fontWeight: 900, color: 'var(--c-muted, #6b7280)', margin: 0, textTransform: 'uppercase', letterSpacing: 0.8 }}>BOS Hub</p>
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
            Currency: <span data-testid="centre-currency-display">{centre?.currency || 'GHS'}</span>
          </p>
        </div>
      ) : (
        <>
          <input data-testid="centre-name-input" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
          <select
            data-testid="centre-currency-select"
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            style={{ ...inputStyle, ...selectStyle }}
          >
            {CURRENCIES.map(c => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
          {error && <p style={{ fontSize: 12, color: 'var(--c-danger, #dc2626)', margin: '0 0 8px', fontWeight: 700 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditing(false)} style={{ flex: 1, padding: 10, borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'var(--c-card, #fff)', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>Cancel</button>
            <button data-testid="centre-save-btn" onClick={handleSave} disabled={saving}
              style={{ flex: 2, padding: 10, borderRadius: 10, border: 'none', background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)', fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif" }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}

      {/* Danger zone */}
      <div style={{ borderTop: '1px solid var(--c-border, #e5e7eb)', marginTop: 16, paddingTop: 14 }}>
        {centreCount <= 1 ? (
          <p data-testid="archive-blocked-msg" style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: 0, lineHeight: 1.5 }}>
            You can't archive your only hub. Create another hub first.
          </p>
        ) : (
          <button
            data-testid="archive-hub-btn"
            onClick={() => setArchiveSheetOpen(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-muted, #9ca3af)', fontSize: 13, fontWeight: 700, padding: 0, fontFamily: "'Nunito', sans-serif" }}
          >
            Archive this hub
          </button>
        )}
      </div>

      <ArchiveHubSheet
        isOpen={archiveSheetOpen}
        onClose={() => setArchiveSheetOpen(false)}
        centreName={centre?.name || ''}
        onArchive={archiveCentre}
        onPermanentDelete={permanentDeleteCentre}
      />
    </div>
  );
}
