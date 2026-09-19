/**
 * components/ui/BuildStamp.test.jsx
 *
 * Asserts against the real BUILD_MARKER rather than a mock: the whole point of the
 * stamp is that it shows the value that actually shipped, so a test that stubbed it
 * would pass even if the wiring were broken.
 */

import { describe, it, expect } from 'vitest';
import { render, screen }       from '@testing-library/react';
import { BuildStamp }           from './BuildStamp';
import { BUILD_MARKER }         from '../../lib/buildInfo';

describe('BuildStamp', () => {
  it('renders the build marker', () => {
    render(<BuildStamp />);
    expect(screen.getByTestId('build-stamp').textContent).toContain(BUILD_MARKER);
  });

  it('prefixes the marker with "Build:"', () => {
    render(<BuildStamp />);
    expect(screen.getByTestId('build-stamp').textContent).toBe(`Build: ${BUILD_MARKER}`);
  });

  it('applies the colour it is given, for use on a dark gradient', () => {
    render(<BuildStamp color="rgba(255,255,255,0.55)" />);
    expect(screen.getByTestId('build-stamp').style.color).toBe('rgba(255, 255, 255, 0.55)');
  });
});
