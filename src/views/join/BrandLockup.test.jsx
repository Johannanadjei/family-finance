/**
 * views/join/BrandLockup.test.jsx
 * Written before BrandLockup.jsx — TDD.
 */

import { describe, it, expect } from 'vitest';
import { render, screen }       from '@testing-library/react';
import { BrandLockup }          from './BrandLockup';

describe('BrandLockup', () => {
  it('renders the white BOS icon', () => {
    render(<BrandLockup />);
    expect(screen.getByAltText('Money B.O.S logo')).toBeTruthy();
  });

  it('renders the Money B.O.S wordmark', () => {
    render(<BrandLockup />);
    expect(screen.getByText('Money B.O.S')).toBeTruthy();
  });

  it('renders the Budget · Overview · System tagline', () => {
    render(<BrandLockup />);
    expect(screen.getByText(/Budget · Overview · System/)).toBeTruthy();
  });
});
