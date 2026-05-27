/**
 * views/payday/MonthEmptyState.test.jsx
 */

import { describe, it, expect } from 'vitest';
import { render, screen }       from '@testing-library/react';
import { MonthEmptyState }      from './MonthEmptyState';

describe('MonthEmptyState', () => {
  it('renders the title', () => {
    render(<MonthEmptyState title="No income recorded for April 2026" />);
    expect(screen.getByText('No income recorded for April 2026')).toBeTruthy();
  });

  it('renders the subtitle when provided', () => {
    render(<MonthEmptyState title="No payday data for June 2026 yet" subtitle="Income will appear here once this month arrives." />);
    expect(screen.getByText(/Income will appear here/)).toBeTruthy();
  });

  it('omits the subtitle when not provided', () => {
    render(<MonthEmptyState title="No income recorded for April 2026" />);
    expect(screen.queryByText(/Income will appear/)).toBeNull();
  });
});
