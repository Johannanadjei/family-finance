/**
 * views/daily/IncomeSourcePicker.jsx
 *
 * Required source selection for income logged through the "+" button.
 *
 * WHY IT IS REQUIRED (#4b): the old free-text "Source" box wrote only
 * category_name, so every "+" income arrived with income_source_id NULL. Payday
 * counts by that FK, so the money was invisible there while Home counted it —
 * the 55,884-vs-27,942 split. Making the link mandatory at the point of entry is
 * what stops unassignable income being created in the first place.
 *
 * "Other / one-off" is a first-class choice, not a fallback: genuinely ad-hoc
 * income (a gift, a sale) has no source, and forcing it into a fake one would be
 * worse than leaving it unassigned. It writes income_source_id NULL deliberately
 * and surfaces on Payday as "Unassigned income" rather than vanishing.
 *
 * `value` has three states and they are all distinct:
 *   undefined → nothing chosen yet; the parent blocks submit
 *   null      → "Other / one-off" chosen; NULL FK is intentional
 *   <uuid>    → linked to that income source
 *
 * @param {object[]} sources      — the viewed cycle's income sources
 * @param {string|null|undefined} value
 * @param {function} onChange     — (id|null) => void
 * @param {string}   name         — free-text label, used only for one-off income
 * @param {function} onNameChange — (string) => void
 */

import { inputStyle } from './fieldStyles';

const chip = (active) => ({
  padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
  border: `1.5px solid ${active ? 'var(--c-primary, #064e3b)' : 'var(--c-border, #e5e7eb)'}`,
  background: active ? 'var(--c-accent-light, #f0fdf4)' : 'var(--c-card, #ffffff)',
  color: active ? 'var(--c-primary, #064e3b)' : 'var(--c-text, #1c1917)',
  fontSize: 13, fontWeight: 800, fontFamily: "'Nunito', sans-serif",
});

export function IncomeSourcePicker({ sources = [], value, onChange, name, onNameChange }) {
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--c-muted, #6b7280)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>
        Source
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {sources.map(s => (
          <button
            key={s.id}
            data-testid={`income-source-${s.id}`}
            aria-pressed={value === s.id}
            onClick={() => onChange(s.id)}
            style={chip(value === s.id)}
          >
            {s.label}
          </button>
        ))}
        <button
          data-testid="income-source-other"
          aria-pressed={value === null}
          onClick={() => onChange(null)}
          style={chip(value === null)}
        >
          Other / one-off
        </button>
      </div>

      {value === null && (
        <input
          data-testid="add-category-input"
          type="text"
          value={name}
          onChange={e => onNameChange(e.target.value)}
          placeholder="e.g. Freelance, Gift, Sale"
          style={{ ...inputStyle, marginTop: 8 }}
        />
      )}
    </div>
  );
}
