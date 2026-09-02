/**
 * views/pricing/BillingToggle.test.jsx
 *
 * Pure display component: renders both options, reports the clicked interval, and
 * sources the savings percentage from PRICING rather than a hardcoded literal.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PRICING } from '../../lib/pricing';

import { BillingToggle } from './BillingToggle';

describe('BillingToggle', () => {
  it('renders both intervals with the savings percent from PRICING', () => {
    render(<BillingToggle billing="monthly" onChange={vi.fn()} />);
    expect(screen.getByTestId('toggle-monthly').textContent).toBe('Monthly');
    expect(screen.getByTestId('toggle-annual').textContent)
      .toContain(String(PRICING.annual.savings_percent));
  });

  it('calls onChange with the clicked interval', () => {
    const onChange = vi.fn();
    render(<BillingToggle billing="monthly" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('toggle-annual'));
    expect(onChange).toHaveBeenCalledWith('annual');
  });
});
