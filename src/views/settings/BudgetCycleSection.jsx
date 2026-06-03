/**
 * views/settings/BudgetCycleSection.jsx
 *
 * Inline-editable card for the hub's budget-cycle anchor (Commit 14b).
 * Reads centre + updateCentre from BudgetCentreContext and the live cycles +
 * income sources from FinanceContext. Optimistic update is handled inside
 * useBudgetCentre; the cycle range math is pure (lib/cycles).
 *
 * "Suggest from income" maps an income source's pay_day_type/pay_day onto an
 * anchor, and is hidden entirely when the hub has no income sources (progressive
 * disclosure). The next-cycle preview reflects the PENDING selection, not the
 * saved value, so the user sees the effect before saving.
 */

import { useState } from 'react';
import { useBudgetCentreContext } from '../../context/BudgetCentreContext';
import { useFinanceContext }       from '../../context/FinanceContext';
import { selectStyle }             from '../../lib/selectStyle';
import { computeNextCycleParams }  from '../../lib/cycles';
import { getToday }                from '../../lib/dates';
import { CYCLE_ANCHOR_OPTIONS }    from '../../features/onboarding/onboarding.constants';

const anchorLabel = (v) => CYCLE_ANCHOR_OPTIONS.find(o => o.value === v)?.label ?? CYCLE_ANCHOR_OPTIONS[0].label;

// Map an income source's pay schedule onto a cycle anchor.
const anchorFromIncome = (inc) => inc.pay_day_type === 'fixed_date'
  ? { type: 'fixed_day', day: inc.pay_day || 1 }
  : inc.pay_day_type === 'last_working_day'
    ? { type: 'last_working_day', day: null }
    : { type: 'calendar', day: null };

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid var(--c-border, #e5e7eb)', fontSize: 15,
  fontWeight: 700, marginBottom: 8, boxSizing: 'border-box',
  background: 'var(--c-input-bg, #f9fafb)', fontFamily: "'Nunito', sans-serif",
  color: 'var(--c-text, #1c1917)',
};

export function BudgetCycleSection() {
  const { centre, updateCentre } = useBudgetCentreContext();
  const { incomes = [], cycles = [] } = useFinanceContext();

  const [editing,    setEditing]    = useState(false);
  const [anchorType, setAnchorType] = useState('calendar');
  const [anchorDay,  setAnchorDay]  = useState(1);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState(null);

  const savedType = centre?.cycle_anchor_type || 'calendar';
  const savedDay  = centre?.cycle_anchor_day ?? null;

  const openEdit = () => {
    setAnchorType(savedType);
    setAnchorDay(savedDay ?? 1);
    setError(null);
    setEditing(true);
  };

  // Preview the next cycle for the PENDING selection (not the saved centre).
  const latestCycle = cycles.filter(c => !c.deleted_at).sort((a, b) => b.end_date.localeCompare(a.end_date))[0] || null;
  const preview = computeNextCycleParams(
    { cycle_anchor_type: anchorType, cycle_anchor_day: anchorType === 'fixed_day' ? Number(anchorDay) || 1 : null },
    latestCycle,
    getToday(),
  );

  const applySuggestion = (inc) => {
    const a = anchorFromIncome(inc);
    setAnchorType(a.type);
    if (a.day != null) setAnchorDay(a.day);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error: err } = await updateCentre({
      cycle_anchor_type: anchorType,
      cycle_anchor_day:  anchorType === 'fixed_day' ? Number(anchorDay) || 1 : null,
    });
    setSaving(false);
    if (err) { setError('Could not save. Please try again.'); return; }
    setEditing(false);
  };

  return (
    <div style={{ background: 'var(--c-card, #fff)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--c-shadow)', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editing ? 12 : 0 }}>
        <p style={{ fontSize: 13, fontWeight: 900, color: 'var(--c-muted, #6b7280)', margin: 0, textTransform: 'uppercase', letterSpacing: 0.8 }}>Budget cycle</p>
        {!editing && (
          <button data-testid="budget-cycle-edit-btn" onClick={openEdit} aria-label="Edit budget cycle"
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
          <p data-testid="budget-cycle-type-display" style={{ fontSize: 17, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 4px' }}>
            {anchorLabel(savedType)}{savedType === 'fixed_day' && savedDay ? ` (day ${savedDay})` : ''}
          </p>
          <p style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: 0 }}>
            New cycles start on this anchor. Existing cycles are unchanged.
          </p>
        </div>
      ) : (
        <>
          <select data-testid="budget-cycle-anchor-select" value={anchorType}
            onChange={e => { setAnchorType(e.target.value); setError(null); }}
            style={{ ...inputStyle, ...selectStyle }}>
            {CYCLE_ANCHOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {anchorType === 'fixed_day' && (
            <input data-testid="budget-cycle-day-input" type="number" min={1} max={31}
              value={anchorDay} onChange={e => setAnchorDay(e.target.value)}
              placeholder="Day of month (1–31)" style={inputStyle} />
          )}

          {incomes.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--c-muted, #6b7280)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 0.6 }}>Suggest from income</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {incomes.map(inc => (
                  <button key={inc.id} data-testid={`budget-cycle-suggest-${inc.id}`} onClick={() => applySuggestion(inc)}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'var(--c-card, #fff)', color: 'var(--c-primary, #064e3b)', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>
                    {inc.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p data-testid="budget-cycle-preview" style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: '0 0 8px', fontWeight: 700 }}>
            Next cycle: {preview.name} ({preview.start_date} → {preview.end_date})
          </p>

          {error && <p style={{ fontSize: 12, color: 'var(--c-danger, #dc2626)', margin: '0 0 8px', fontWeight: 700 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditing(false)} style={{ flex: 1, padding: 10, borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'var(--c-card, #fff)', color: 'var(--c-text, #1c1917)', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>Cancel</button>
            <button data-testid="budget-cycle-save-btn" onClick={handleSave} disabled={saving}
              style={{ flex: 2, padding: 10, borderRadius: 10, border: 'none', background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)', fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif" }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
