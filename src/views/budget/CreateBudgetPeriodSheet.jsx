/**
 * views/budget/CreateBudgetPeriodSheet.jsx — user-driven budget-period creator (Phase B).
 *
 * Two modes (Decision 1 = Option B):
 *   'choose' (default) — two big buttons: "Next calendar month" (one tap, auto-fills
 *                        from nextCalendarMonthRange + saves) and "Custom period".
 *   'custom'           — name + start/end (three-field DD/MM/YYYY, matching
 *                        AddTransactionSheet) + a "Copy from previous budget?" toggle.
 *                        Save creates the period; if copy is on, the PARENT opens the
 *                        CopyCategoriesSheet against the new period (Decision 5).
 *
 * Pure orchestration: it computes the range and validates dates, but the actual write
 * (createBudgetPeriod), the cycles refresh, and the copy follow-up all live in the
 * parent's onCreate. onCreate returns { error }; a falsy error means the parent has
 * closed the sheet (isOpen → false), which resets local state via the effect below.
 *
 * @param {boolean}  isOpen
 * @param {function} onClose
 * @param {object[]} cycles    — live cycle list, for the "next calendar month" default
 * @param {function} onCreate  — async ({ name, startDate, endDate, copyPrevious }) => { error }
 */

import { useState, useEffect } from 'react';
import { createPortal }        from 'react-dom';
import { useModalChrome }      from '../../hooks/useModalChrome';
import { getToday, formatMonth } from '../../lib/dates';
import { nextCalendarMonthRange } from '../../lib/cycles';

const pad = (n) => String(n).padStart(2, '0');
const isValidYMD = (y, m, d) => {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
};

const inputStyle = {
  padding: '12px 10px', borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)',
  fontSize: 15, fontWeight: 700, outline: 'none', background: 'var(--c-input-bg, #f9fafb)',
  boxSizing: 'border-box', fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)',
  textAlign: 'center', width: '100%',
};
const primaryBtn = {
  padding: '14px', borderRadius: 12, border: 'none', background: 'var(--c-primary, #064e3b)',
  color: 'var(--c-btn-text, #fff)', fontSize: 15, fontWeight: 800, cursor: 'pointer',
  fontFamily: "'Nunito', sans-serif",
};

// Three-field DD/MM/YYYY row — mirrors AddTransactionSheet's date entry convention.
function DateFields({ label, parts, onChange, testid }) {
  const set = (key, raw) => onChange({ ...parts, [key]: raw.replace(/[^0-9]/g, '') });
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--c-muted, #6b7280)', margin: '0 0 6px' }}>{label}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input data-testid={`${testid}-day`}   type="number" min="1" max="31"   placeholder="DD"   value={parts.d} onChange={e => set('d', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        <input data-testid={`${testid}-month`} type="number" min="1" max="12"   placeholder="MM"   value={parts.m} onChange={e => set('m', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        <input data-testid={`${testid}-year`}  type="number" min="2020" max="2100" placeholder="YYYY" value={parts.y} onChange={e => set('y', e.target.value)} style={{ ...inputStyle, flex: 1.4 }} />
      </div>
    </div>
  );
}

const blank = { d: '', m: '', y: '' };

export function CreateBudgetPeriodSheet({ isOpen, onClose, cycles = [], onCreate }) {
  const [mode,        setMode]        = useState('choose');
  const [name,        setName]        = useState('');
  const [nameDirty,   setNameDirty]   = useState(false);
  const [start,       setStart]       = useState(blank);
  const [end,         setEnd]         = useState(blank);
  const [copyPrev,    setCopyPrev]    = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState(null);

  // Reset every time the sheet (re)opens.
  useEffect(() => {
    if (!isOpen) return;
    setMode('choose'); setName(''); setNameDirty(false);
    setStart(blank); setEnd(blank); setCopyPrev(false); setSaving(false); setError(null);
  }, [isOpen]);

  useModalChrome({ isOpen, onClose });
  if (!isOpen) return null;

  // Suggested (auto) name follows the start month until the user edits the field.
  const suggested = (start.y && start.m) ? formatMonth(`${start.y}-${pad(start.m)}`) : '';
  const shownName = nameDirty ? name : suggested;

  const openCustom = () => {
    const range = nextCalendarMonthRange(cycles, getToday());
    const [sy, sm, sd] = range.start.split('-').map(Number);
    const [ey, em, ed] = range.end.split('-').map(Number);
    setStart({ d: String(sd), m: String(sm), y: String(sy) });
    setEnd({ d: String(ed), m: String(em), y: String(ey) });
    setNameDirty(false); setError(null); setMode('custom');
  };

  const save = async (payload) => {
    setSaving(true); setError(null);
    const { error: err } = await onCreate(payload);
    if (err) {
      setError(err.code === 'CYC01'
        ? 'That overlaps an existing budget period. Pick different dates.'
        : 'Could not create the budget period. Please try again.');
      setSaving(false);
    }
    // success → parent closes the sheet (isOpen flips false → effect resets state).
  };

  const quickCreate = () => {
    const range = nextCalendarMonthRange(cycles, getToday());
    save({ name: null, startDate: range.start, endDate: range.end, copyPrevious: false });
  };

  const saveCustom = () => {
    const sy = +start.y, sm = +start.m, sd = +start.d;
    const ey = +end.y,   em = +end.m,   ed = +end.d;
    if (!isValidYMD(sy, sm, sd) || !isValidYMD(ey, em, ed)) { setError('Please enter valid start and end dates.'); return; }
    const startDate = `${sy}-${pad(sm)}-${pad(sd)}`;
    const endDate   = `${ey}-${pad(em)}-${pad(ed)}`;
    if (endDate < startDate) { setError('End date must be on or after the start date.'); return; }
    save({ name: shownName.trim() || null, startDate, endDate, copyPrevious: copyPrev });
  };

  return createPortal(
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 340 }} />

      <div role="dialog" aria-label="Create budget period" data-testid="create-period-sheet" data-modal-scrollable="true"
        style={{ position: 'fixed', bottom: 0, left: 'max(0px, calc(50vw - 220px))', width: '100%', maxWidth: 440,
          background: 'var(--c-card, #fff)', borderRadius: '20px 20px 0 0', padding: '24px 20px calc(24px + env(safe-area-inset-bottom))',
          zIndex: 350, boxShadow: '0 -8px 32px rgba(0,0,0,.12)', maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ width: 40, height: 4, background: 'var(--c-border, #e5e7eb)', borderRadius: 2, margin: '0 auto 16px' }} />

        <p style={{ fontSize: 18, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 4px' }}>New budget period</p>
        <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: '0 0 20px', lineHeight: 1.5 }}>
          A budget period is your spending window — usually a month, but you choose.
        </p>

        {error && (
          <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{error}</p>
          </div>
        )}

        {mode === 'choose' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button data-testid="quick-next-month-btn" onClick={quickCreate} disabled={saving}
              style={{ ...primaryBtn, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Creating…' : `Next calendar month (${nextCalendarMonthRange(cycles, getToday()).name})`}
            </button>
            <button data-testid="custom-period-btn" onClick={openCustom} disabled={saving}
              style={{ padding: '14px', borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'var(--c-card, #fff)', color: 'var(--c-text, #1c1917)', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>
              Custom period
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <input data-testid="period-name-input" type="text" value={shownName}
              onChange={e => { setNameDirty(true); setName(e.target.value); }}
              placeholder="Period name" maxLength={50}
              style={{ ...inputStyle, textAlign: 'left' }} />
            <DateFields label="Starts" parts={start} onChange={setStart} testid="period-start" />
            <DateFields label="Ends"   parts={end}   onChange={setEnd}   testid="period-end" />

            <button data-testid="copy-prev-toggle" onClick={() => setCopyPrev(v => !v)} aria-pressed={copyPrev}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                border: `1.5px solid ${copyPrev ? 'var(--c-primary, #064e3b)' : 'var(--c-border, #e5e7eb)'}`,
                background: copyPrev ? 'var(--c-accent-light, #f0fdf4)' : 'var(--c-card, #fff)', fontFamily: "'Nunito', sans-serif", textAlign: 'left' }}>
              <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                border: `2px solid ${copyPrev ? 'var(--c-primary, #064e3b)' : 'var(--c-border, #d1d5db)'}`,
                background: copyPrev ? 'var(--c-primary, #064e3b)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {copyPrev && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </span>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text, #1c1917)' }}>Copy categories from previous budget</span>
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
              <button data-testid="period-cancel-btn" onClick={() => { setMode('choose'); setError(null); }} disabled={saving}
                style={{ padding: '14px', borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'var(--c-card, #fff)', fontSize: 14, fontWeight: 800, cursor: 'pointer', color: 'var(--c-muted, #6b7280)', fontFamily: "'Nunito', sans-serif" }}>
                Back
              </button>
              <button data-testid="period-save-btn" onClick={saveCustom} disabled={saving}
                style={{ ...primaryBtn, fontSize: 14, background: saving ? 'var(--c-border, #e5e7eb)' : 'var(--c-primary, #064e3b)', color: saving ? 'var(--c-muted, #9ca3af)' : 'var(--c-btn-text, #fff)', cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Creating…' : 'Create period'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>,
    document.body
  );
}
