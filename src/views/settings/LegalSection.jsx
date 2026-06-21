/**
 * views/settings/LegalSection.jsx
 *
 * Static footer card in Settings linking to the four public legal pages.
 *
 * Uses plain <a href> — NOT react-router <Link>. The legal routes (/privacy,
 * /terms, /cookies, /disclaimer) are public, gate-bypassing handlers resolved in
 * App.jsx against window.location.pathname, OUTSIDE the SPA <Routes>. A <Link>
 * would navigate within the router and never reach them; a full navigation does.
 * Labels mirror LegalView's NAV array (the canonical display strings).
 */

const LEGAL_LINKS = [
  { slug: 'privacy',    href: '/privacy',    label: 'Privacy Policy' },
  { slug: 'terms',      href: '/terms',      label: 'Terms of Service' },
  { slug: 'cookies',    href: '/cookies',    label: 'Cookie Policy' },
  { slug: 'disclaimer', href: '/disclaimer', label: 'Disclaimer' },
];

const card  = { background: 'var(--c-card, #fff)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--c-shadow)', marginBottom: 16 };
const label = { fontSize: 13, fontWeight: 900, color: 'var(--c-muted, #6b7280)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.8 };

export function LegalSection() {
  return (
    <div data-testid="settings-legal-section" style={card}>
      <p style={label}>Legal</p>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {LEGAL_LINKS.map((l, i) => (
          <a
            key={l.slug}
            data-testid={`settings-legal-link-${l.slug}`}
            href={l.href}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 0', textDecoration: 'none',
              fontSize: 14, fontWeight: 700, color: 'var(--c-text, #1c1917)',
              borderTop: i === 0 ? 'none' : '1px solid var(--c-border, #e5e7eb)',
            }}
          >
            {l.label}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: 'var(--c-muted, #6b7280)', flexShrink: 0 }}>
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        ))}
      </div>
    </div>
  );
}
