/**
 * components/layout/ArchivedHubsList.jsx
 *
 * Collapsible list of archived hubs inside SidePanel.
 * Pure display — toggle state owned by SidePanel.
 */

import { useState } from 'react';

export function ArchivedHubsList({ archivedCentres, onRestore }) {
  const [expanded, setExpanded] = useState(false);

  if (!archivedCentres.length) return null;

  return (
    <div style={{ borderTop: '1px solid var(--c-border, #e5e7eb)', marginTop: 8 }}>
      {/* Toggle header */}
      <button
        data-testid="archived-section-toggle"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        style={{
          width: '100%', padding: '10px 16px', textAlign: 'left',
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontFamily: "'Nunito', sans-serif",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--c-muted, #9ca3af)', textTransform: 'uppercase', letterSpacing: 1 }}>
          Archived
        </span>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"
          style={{ transition: 'transform .2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
        >
          <path d="M2 4l4 4 4-4" stroke="var(--c-muted, #9ca3af)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Rows */}
      {expanded && archivedCentres.map(c => (
        <div
          key={c.id}
          style={{
            padding: '10px 16px 10px 14px', display: 'flex', alignItems: 'center', gap: 10,
            opacity: 0.6, borderLeft: '4px solid transparent',
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 9, flexShrink: 0,
            background: 'var(--c-bg, #f3f4f6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
          }}>
            {c.icon}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 800, margin: 0, color: 'var(--c-text, #1c1917)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.name}
            </p>
            <p style={{ fontSize: 11, color: 'var(--c-muted, #6b7280)', margin: 0 }}>{c.currency}</p>
          </div>

          <button
            data-testid={`restore-hub-${c.id}`}
            onClick={() => onRestore(c.id)}
            aria-label={`Restore ${c.name}`}
            style={{
              background: 'none', border: '1.5px solid var(--c-border, #e5e7eb)',
              borderRadius: 8, padding: '4px 10px',
              fontSize: 11, fontWeight: 800, cursor: 'pointer',
              color: 'var(--c-text, #1c1917)', fontFamily: "'Nunito', sans-serif", flexShrink: 0,
            }}
          >
            Restore
          </button>
        </div>
      ))}
    </div>
  );
}
