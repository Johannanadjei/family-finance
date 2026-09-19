/**
 * views/budget/DateFields.jsx
 *
 * Three-field DD/MM/YYYY row — mirrors AddTransactionSheet's date entry convention.
 * Extracted from CreateBudgetPeriodSheet (which sat exactly at the 200-line audit
 * cap) when the period-range preview and overlap check landed.
 *
 * Pure display: it holds no date logic, only the digit-stripping keystroke filter.
 * The parent owns validation, the range preview, and the overlap check.
 *
 * @param {string}   label   — field-group heading, e.g. "Starts"
 * @param {{ d: string, m: string, y: string }} parts
 * @param {function} onChange — receives the next { d, m, y }
 * @param {string}   testid   — prefix; yields `${testid}-day|-month|-year`
 */

/** Shared with CreateBudgetPeriodSheet's name field so the two stay visually identical. */
export const inputStyle = {
  padding: '12px 10px', borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)',
  fontSize: 15, fontWeight: 700, outline: 'none', background: 'var(--c-input-bg, #f9fafb)',
  boxSizing: 'border-box', fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)',
  textAlign: 'center', width: '100%',
};

export function DateFields({ label, parts, onChange, testid }) {
  const set = (key, raw) => onChange({ ...parts, [key]: raw.replace(/[^0-9]/g, '') });
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--c-muted, #6b7280)', margin: '0 0 6px' }}>{label}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input data-testid={`${testid}-day`}   type="number" min="1" max="31"     placeholder="DD"   value={parts.d} onChange={e => set('d', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        <input data-testid={`${testid}-month`} type="number" min="1" max="12"     placeholder="MM"   value={parts.m} onChange={e => set('m', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        <input data-testid={`${testid}-year`}  type="number" min="2020" max="2100" placeholder="YYYY" value={parts.y} onChange={e => set('y', e.target.value)} style={{ ...inputStyle, flex: 1.4 }} />
      </div>
    </div>
  );
}
