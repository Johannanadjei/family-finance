import { useState } from 'react';
import { cardStyle } from '../ui';

/** Expandable category breakdown for LogView — fmt passed from parent */
export function CategoryBreakdown({ categories, fmt }) {
  const [open, setOpen] = useState(false);
  if (categories.length === 0) return null;

  return (
    <div style={{ ...cardStyle }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <p style={{ fontWeight: 800, fontSize: 14, color: 'var(--c-text, #1c1917)', margin: 0 }}>Category Breakdown</p>
        <span style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', fontWeight: 700 }}>{open ? 'Hide ▲' : 'Show ▼'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {categories.map(({ category, amount, pct }) => (
            <div key={category}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text, #1c1917)', margin: 0 }}>{category}</p>
                <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-text, #1c1917)', margin: 0 }}>
                  {fmt(amount)} <span style={{ color: 'var(--c-muted, #9ca3af)', fontWeight: 600 }}>({pct}%)</span>
                </p>
              </div>
              <div style={{ height: 6, background: 'var(--c-border, #f3f4f6)', borderRadius: 6 }}>
                <div style={{ height: 6, borderRadius: 6, background: 'var(--c-accent, #059669)', width: String(pct) + '%', transition: 'width .4s' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
