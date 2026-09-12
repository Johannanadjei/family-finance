/**
 * views/settings/AddIncomeSourceForm.jsx
 *
 * The "+ Add" form inside the Settings income card. Extracted from
 * IncomeSourcesSection when the month→period rework pushed that file past the
 * 200-line view cap: the form owns a self-contained cluster of input state and
 * hands the parent a single saved-payload callback, so the section is left doing
 * only what a view orchestrator should — grouping and dispatch.
 *
 * The period picker is id-valued. There is deliberately no month picker: two
 * periods can start in the same calendar month, so a month cannot name the target
 * (docs/backlog.md — income's two period keys). `month` is not in the payload at
 * all; the mutation derives it from the chosen period's start_date.
 *
 * @param {object[]} periods       — live periods, newest first (may be empty)
 * @param {string}   [activeCycleId] — pre-selected period
 * @param {string}   currency
 * @param {function} onSave        — (payload, cycleId) => Promise<{ error }>
 * @param {function} onSaved       — (cycleId) => void — fired after a clean save
 */

import { useState }    from 'react';
import { selectStyle } from '../../lib/selectStyle';
import { fmtDate }     from '../../lib/finance';

const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)', fontSize: 14, fontWeight: 700, marginBottom: 6, boxSizing: 'border-box', background: 'var(--c-input-bg, #f9fafb)', fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)' };

const periodRange = (c) => `${fmtDate(c.start_date)} – ${fmtDate(c.end_date)}`;

export function AddIncomeSourceForm({ periods = [], activeCycleId, currency, onSave, onSaved }) {
  const [label,      setLabel]      = useState('');
  const [amount,     setAmount]     = useState('');
  const [payDayType, setPayDayType] = useState('flexible');
  const [payDay,     setPayDay]     = useState('');
  const [cycleId,    setCycleId]    = useState('');   // '' → fall back to the active period
  const [error,      setError]      = useState(null);
  const [saving,     setSaving]     = useState(false);

  // The period this form targets: explicit pick → active period → newest.
  const targetCycleId = cycleId || activeCycleId || periods[0]?.id || '';

  const handleSave = async () => {
    if (!label.trim()) { setError('Please enter a source name'); return; }
    if (payDayType === 'fixed_date') {
      const pd = parseInt(payDay);
      if (!payDay || isNaN(pd) || pd < 1 || pd > 31) { setError('Please enter a day between 1 and 31'); return; }
    }
    if (!targetCycleId) { setError('Create a budget period first'); return; }
    setSaving(true);
    const { error: err } = await onSave({
      label:           label.trim(),
      expected_amount: Math.round(parseFloat(amount) || 0),
      icon:            '💰',
      currency:        currency || 'GHS',
      pay_day_type:    payDayType,
      pay_day:         payDayType === 'fixed_date' ? (parseInt(payDay) || null) : null,
    }, targetCycleId);
    setSaving(false);
    if (err) { setError('Could not save. Please try again.'); return; }
    onSaved(targetCycleId);
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <input data-testid="new-source-label" value={label}
        onChange={e => { setLabel(e.target.value); setError(null); }}
        placeholder="e.g. Freelance, Side Business" style={inputStyle} />
      <input data-testid="new-source-amount" type="number" value={amount}
        onChange={e => setAmount(e.target.value)}
        placeholder="Expected amount (optional)" style={inputStyle} />
      <select data-testid="new-source-pay-day-type" value={payDayType}
        onChange={e => { setPayDayType(e.target.value); setPayDay(''); }}
        style={{ ...inputStyle, ...selectStyle }}>
        <option value="flexible">Flexible / Ad-hoc</option>
        <option value="fixed_date">Fixed date each month</option>
        <option value="last_working_day">Last working day</option>
      </select>
      {payDayType === 'fixed_date' && (
        <input data-testid="new-source-pay-day" type="number" value={payDay}
          onChange={e => { setPayDay(e.target.value); setError(null); }}
          placeholder="Day of month (1–31)" min="1" max="31" style={inputStyle} />
      )}
      <select data-testid="new-source-period" value={targetCycleId}
        onChange={e => setCycleId(e.target.value)}
        style={{ ...inputStyle, ...selectStyle }}>
        {periods.length === 0
          ? <option value="">No budget periods yet</option>
          : periods.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} ({periodRange(c)}){c.id === activeCycleId ? ' · this period' : ''}
              </option>
            ))}
      </select>
      {error && <p style={{ fontSize: 12, color: 'var(--c-danger, #dc2626)', margin: '0 0 6px', fontWeight: 700 }}>{error}</p>}
      <button data-testid="save-income-source-btn" onClick={handleSave} disabled={saving}
        style={{ width: '100%', padding: 10, borderRadius: 10, border: 'none', background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)', fontSize: 14, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif" }}>
        {saving ? 'Saving…' : 'Save Source'}
      </button>
    </div>
  );
}
