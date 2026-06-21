/**
 * views/settings/LegalSection.test.jsx
 */

import { describe, it, expect } from 'vitest';
import { render, screen }       from '@testing-library/react';
import { LegalSection }         from './LegalSection';

const LINKS = [
  { slug: 'privacy',    href: '/privacy',    label: 'Privacy Policy' },
  { slug: 'terms',      href: '/terms',      label: 'Terms of Service' },
  { slug: 'cookies',    href: '/cookies',    label: 'Cookie Policy' },
  { slug: 'disclaimer', href: '/disclaimer', label: 'Disclaimer' },
];

describe('LegalSection', () => {
  it('renders the section container', () => {
    render(<LegalSection />);
    expect(screen.getByTestId('settings-legal-section')).toBeTruthy();
  });

  it('renders all four legal links with correct testids, hrefs, and labels', () => {
    render(<LegalSection />);
    for (const l of LINKS) {
      const link = screen.getByTestId(`settings-legal-link-${l.slug}`);
      expect(link).toBeTruthy();
      expect(link.getAttribute('href')).toBe(l.href);
      expect(link.textContent).toContain(l.label);
    }
  });

  it('renders exactly four legal links', () => {
    render(<LegalSection />);
    expect(screen.getAllByTestId(/^settings-legal-link-/)).toHaveLength(4);
  });
});
