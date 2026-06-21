/**
 * views/AuthFooter.jsx
 *
 * Legal footer beneath the AuthScreen card — links to the four public legal pages.
 *
 * Uses plain <a href> — NOT react-router <Link>. There is no Router context
 * pre-auth, and the legal routes (/privacy, /terms, /cookies, /disclaimer) are
 * public, gate-bypassing handlers resolved in App.jsx against
 * window.location.pathname, OUTSIDE the SPA <Routes>. A full navigation reaches
 * them; an in-router navigation never would. Labels mirror LegalView's NAV array
 * (the canonical display strings). Rendered on the green gradient → white text.
 */

const LEGAL_LINKS = [
  { slug: 'privacy',    href: '/privacy',    label: 'Privacy Policy' },
  { slug: 'terms',      href: '/terms',      label: 'Terms of Service' },
  { slug: 'cookies',    href: '/cookies',    label: 'Cookie Policy' },
  { slug: 'disclaimer', href: '/disclaimer', label: 'Disclaimer' },
];

export function AuthFooter() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '6px 14px', maxWidth: 400 }}>
      {LEGAL_LINKS.map(l => (
        <a key={l.slug} data-testid={`auth-legal-link-${l.slug}`} href={l.href}
          style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.75)', textDecoration: 'none' }}>
          {l.label}
        </a>
      ))}
    </div>
  );
}
