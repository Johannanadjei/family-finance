/**
 * components/ui/AccessBlocked.jsx
 *
 * Full-page blocked state for restricted routes (Payday, Settings).
 * Shown to standard and view_only members who navigate to gated views.
 */

export function AccessBlocked({ message = "You don't have access to this section." }) {
  return (
    <div
      data-testid="access-blocked"
      style={{
        padding:        '48px 24px',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        textAlign:      'center',
        gap:            16,
      }}
    >
      <div style={{
        width:          64,
        height:         64,
        borderRadius:   20,
        background:     'var(--c-bg, #f3f4f6)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        color:          'var(--c-muted, #6b7280)',
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: 0 }}>
        {message}
      </p>
      <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: 0, lineHeight: 1.5 }}>
        Contact your hub owner to request access.
      </p>
    </div>
  );
}
