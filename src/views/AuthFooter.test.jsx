/**
 * views/AuthFooter.test.jsx
 */

import { describe, it, expect } from 'vitest';
import { render, screen }       from '@testing-library/react';
import { AuthFooter }           from './AuthFooter';

describe('AuthFooter', () => {
  it('renders the four legal footer links with correct hrefs', () => {
    render(<AuthFooter />);
    const links = [
      { slug: 'privacy',    href: '/privacy' },
      { slug: 'terms',      href: '/terms' },
      { slug: 'cookies',    href: '/cookies' },
      { slug: 'disclaimer', href: '/disclaimer' },
    ];
    for (const l of links) {
      const link = screen.getByTestId(`auth-legal-link-${l.slug}`);
      expect(link).toBeTruthy();
      expect(link.getAttribute('href')).toBe(l.href);
    }
  });
});
