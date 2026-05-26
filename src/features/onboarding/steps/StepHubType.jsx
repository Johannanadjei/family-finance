/**
 * features/onboarding/steps/StepHubType.jsx
 *
 * Hub type selection grid — shown as the first step of CreateHubSheet.
 * Tapping a tile calls onSelect(hubTypeId). Continue fires onNext(hubTypeId).
 *
 * @param {string|null} selected  — currently selected hub type id
 * @param {function}    onSelect  — (id) => void — called on tile tap
 * @param {function}    onNext    — (id) => void — called on Continue
 * @param {function}   [onBack]   — omit to hide Back button (first step)
 */

import { HUB_TYPES } from '../../../lib/hubTypes';

export function StepHubType({ selected, onSelect, onNext, onBack }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--c-primary, #064e3b)', margin: '0 0 6px' }}>
          What kind of hub?
        </p>
        <p style={{ fontSize: 14, color: 'var(--c-muted, #6b7280)', margin: 0 }}>
          Choose the type that best describes this BOS Hub.
        </p>
      </div>

      {/* Hub type grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {HUB_TYPES.map(h => {
          const active = selected === h.id;
          return (
            <button
              key={h.id}
              onClick={() => onSelect(h.id)}
              aria-label={`Select ${h.label}`}
              style={{
                padding:      '16px 12px',
                borderRadius: 14,
                border:       `2px solid ${active ? 'var(--c-accent, #059669)' : 'var(--c-border, #e5e7eb)'}`,
                background:   active ? 'var(--c-accent-light, #f0fdf4)' : 'var(--c-card, #fff)',
                cursor:       'pointer',
                textAlign:    'left',
                transition:   'all .15s',
                fontFamily:   "'Nunito', sans-serif",
              }}
            >
              <p style={{ fontSize: 28, margin: '0 0 6px', lineHeight: 1 }}>{h.icon}</p>
              <p style={{
                fontSize: 13, fontWeight: 900, margin: '0 0 4px',
                color: active ? 'var(--c-accent, #059669)' : 'var(--c-text, #1c1917)',
              }}>
                {h.label}
              </p>
              <p style={{ fontSize: 11, color: 'var(--c-muted, #6b7280)', margin: 0, lineHeight: 1.4 }}>
                {h.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: onBack ? '1fr 2fr' : '1fr', gap: 10 }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              padding: '14px', borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)',
              background: 'var(--c-card, #fff)', fontSize: 14, fontWeight: 800,
              cursor: 'pointer', color: 'var(--c-muted, #6b7280)', fontFamily: "'Nunito', sans-serif",
            }}
          >
            ← Back
          </button>
        )}
        <button
          onClick={() => selected && onNext(selected)}
          disabled={!selected}
          style={{
            padding: '14px', borderRadius: 12, border: 'none',
            background: selected ? 'linear-gradient(135deg, var(--c-primary, #064e3b), var(--c-primary-2, #0d7060))' : 'var(--c-border, #e5e7eb)',
            color: selected ? '#fff' : 'var(--c-muted, #9ca3af)',
            fontSize: 14, fontWeight: 800, cursor: selected ? 'pointer' : 'not-allowed',
            fontFamily: "'Nunito', sans-serif", transition: 'all .15s',
          }}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
