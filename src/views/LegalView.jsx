import Markdown from 'react-markdown';
import privacyRaw    from '../content/legal/privacy.md?raw';
import termsRaw      from '../content/legal/terms.md?raw';
import cookiesRaw    from '../content/legal/cookies.md?raw';
import disclaimerRaw from '../content/legal/disclaimer.md?raw';

// slug → { title (UI heading), content (raw markdown) }.
// UI titles are deliberate display strings; the raw H1 still renders inside the markdown body.
const DOCS = {
  privacy:    { title: 'Privacy Policy',   content: privacyRaw },
  terms:      { title: 'Terms of Service', content: termsRaw },
  cookies:    { title: 'Cookie Policy',    content: cookiesRaw },
  disclaimer: { title: 'Disclaimer',       content: disclaimerRaw },
};

// Resolve a URL path to a legal slug (or null). Lives here so App.jsx stays thin and
// the slug list keeps a single source of truth alongside the DOCS map above.
export function resolveLegalSlug(pathname) {
  return ({ '/privacy': 'privacy', '/terms': 'terms', '/cookies': 'cookies', '/disclaimer': 'disclaimer' })[pathname.replace(/\/$/, '')] || null;
}

// Order for the cross-navigation footer.
const NAV = [
  { slug: 'privacy',    label: 'Privacy Policy',   href: '/privacy' },
  { slug: 'terms',      label: 'Terms of Service', href: '/terms' },
  { slug: 'cookies',    label: 'Cookie Policy',    href: '/cookies' },
  { slug: 'disclaimer', label: 'Disclaimer',       href: '/disclaimer' },
];

const fontStack = "'Nunito', sans-serif";

// Markdown element styling — brand tokens, mobile-readable measure.
const mdComponents = {
  h1:         (props) => <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '24px 0 12px', lineHeight: 1.3 }} {...props} />,
  h2:         (props) => <h2 style={{ fontSize: 18, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '22px 0 10px', lineHeight: 1.3 }} {...props} />,
  h3:         (props) => <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text, #1c1917)', margin: '18px 0 8px' }} {...props} />,
  p:          (props) => <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--c-text, #1c1917)', margin: '0 0 12px' }} {...props} />,
  ul:         (props) => <ul style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--c-text, #1c1917)', margin: '0 0 12px', paddingLeft: 22 }} {...props} />,
  ol:         (props) => <ol style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--c-text, #1c1917)', margin: '0 0 12px', paddingLeft: 22 }} {...props} />,
  li:         (props) => <li style={{ margin: '0 0 6px' }} {...props} />,
  a:          (props) => <a style={{ color: 'var(--c-accent, #059669)', fontWeight: 700, textDecoration: 'underline' }} {...props} />,
  strong:     (props) => <strong style={{ fontWeight: 800 }} {...props} />,
  hr:         (props) => <hr style={{ border: 'none', borderTop: '1px solid var(--c-border, #e5e7eb)', margin: '20px 0' }} {...props} />,
  blockquote: (props) => <blockquote style={{ margin: '0 0 14px', padding: '12px 14px', background: 'var(--c-accent-light, #f0fdf4)', borderLeft: '3px solid var(--c-accent, #059669)', borderRadius: 8, fontSize: 13, lineHeight: 1.6, color: 'var(--c-text, #1c1917)' }} {...props} />,
};

export function LegalView({ slug }) {
  const doc = DOCS[slug];

  if (!doc) {
    return (
      <div
        data-testid="legal-not-found"
        style={{ minHeight: '100vh', background: 'var(--c-bg, #f3f4f6)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: fontStack }}
      >
        <p style={{ fontSize: 32, margin: '0 0 12px' }}>📄</p>
        <p style={{ fontSize: 18, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 8px' }}>Page not found</p>
        <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: '0 0 20px', textAlign: 'center', maxWidth: 320, lineHeight: 1.5 }}>
          The legal document you're looking for doesn't exist.
        </p>
        <a data-testid="legal-back" href="/" style={{ color: 'var(--c-accent, #059669)', fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>
          ← Back to Money B.O.S
        </a>
      </div>
    );
  }

  return (
    <div
      data-testid="legal-view"
      style={{ minHeight: '100vh', background: 'var(--c-bg, #f3f4f6)', fontFamily: fontStack }}
    >
      <div style={{ maxWidth: 440, margin: '0 auto', padding: 16 }}>
        <a data-testid="legal-back" href="/" style={{ display: 'inline-block', color: 'var(--c-accent, #059669)', fontWeight: 800, fontSize: 14, textDecoration: 'none', margin: '8px 0 16px' }}>
          ← Back to Money B.O.S
        </a>

        <div style={{ background: 'var(--c-card, #ffffff)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--c-shadow, 0 2px 12px rgba(0,0,0,0.08))' }}>
          <h1 data-testid="legal-title" style={{ fontSize: 24, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 16px', lineHeight: 1.25 }}>
            {doc.title}
          </h1>

          <Markdown components={mdComponents}>{doc.content}</Markdown>
        </div>

        <nav style={{ marginTop: 20, padding: '4px 2px' }} aria-label="Legal pages">
          <p style={{ fontSize: 11, fontWeight: 900, color: 'var(--c-muted, #6b7280)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>
            Other legal pages
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {NAV.filter(n => n.slug !== slug).map(n => (
              <a
                key={n.slug}
                data-testid={`legal-nav-${n.slug}`}
                href={n.href}
                style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-accent, #059669)', textDecoration: 'none', padding: '6px 10px', background: 'var(--c-card, #ffffff)', border: '1px solid var(--c-border, #e5e7eb)', borderRadius: 10 }}
              >
                {n.label}
              </a>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
