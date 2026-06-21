import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LegalView }             from './LegalView';

const SLUGS = [
  { slug: 'privacy',    title: 'Privacy Policy' },
  { slug: 'terms',      title: 'Terms of Service' },
  { slug: 'cookies',    title: 'Cookie Policy' },
  { slug: 'disclaimer', title: 'Disclaimer' },
];

describe('LegalView', () => {
  it('renders the correct UI title for the privacy slug', () => {
    render(<LegalView slug="privacy" />);
    expect(screen.getByTestId('legal-title').textContent).toContain('Privacy Policy');
  });

  it('parses markdown to HTML rather than showing raw markdown markers', () => {
    render(<LegalView slug="terms" />);
    const container = screen.getByTestId('legal-view');
    // The raw markdown begins "# Part A — Terms of Service". If react-markdown ran,
    // that becomes a heading element and the literal "# " marker is gone.
    const headings = within(container).getAllByRole('heading');
    expect(headings.length).toBeGreaterThan(1); // UI title h1 + at least one parsed md heading
    expect(container.textContent).toContain('Part A'); // body content rendered
    expect(container.textContent).not.toContain('# Part A'); // marker consumed, not literal
  });

  it.each(SLUGS)('renders the $slug document with its distinct title and container', ({ slug, title }) => {
    render(<LegalView slug={slug} />);
    expect(screen.getByTestId('legal-view')).toBeTruthy();
    expect(screen.getByTestId('legal-title').textContent).toContain(title);
  });

  it('shows a graceful not-found fallback for an invalid slug', () => {
    render(<LegalView slug="not-a-real-doc" />);
    expect(screen.getByTestId('legal-not-found')).toBeTruthy();
    expect(screen.queryByTestId('legal-view')).toBeNull();
  });

  it('renders a back-to-app link pointing at "/"', () => {
    render(<LegalView slug="cookies" />);
    const back = screen.getByTestId('legal-back');
    expect(back.getAttribute('href')).toBe('/');
    expect(back.textContent).toContain('Back to Money B.O.S');
  });
});
