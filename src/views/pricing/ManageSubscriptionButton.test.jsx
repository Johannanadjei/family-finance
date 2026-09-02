/**
 * views/pricing/ManageSubscriptionButton.test.jsx
 *
 * Pure display component: renders label + helper copy, fires onClick, disables and
 * relabels while loading, and shows the error line only when an error is passed.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ManageSubscriptionButton } from './ManageSubscriptionButton';

describe('ManageSubscriptionButton', () => {
  it('renders the label and the Paystack helper line', () => {
    render(<ManageSubscriptionButton onClick={vi.fn()} loading={false} error={null} />);
    expect(screen.getByTestId('manage-sub').textContent).toBe('Manage subscription');
    expect(screen.getByText(/Update your card or cancel on Paystack/)).toBeTruthy();
  });

  it('calls onClick when pressed', () => {
    const onClick = vi.fn();
    render(<ManageSubscriptionButton onClick={onClick} loading={false} error={null} />);
    fireEvent.click(screen.getByTestId('manage-sub'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled and relabelled while loading', () => {
    render(<ManageSubscriptionButton onClick={vi.fn()} loading error={null} />);
    const btn = screen.getByTestId('manage-sub');
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Opening…');
  });

  it('hides the error line when there is no error', () => {
    render(<ManageSubscriptionButton onClick={vi.fn()} loading={false} error={null} />);
    expect(screen.queryByTestId('manage-error')).toBeNull();
  });

  it('shows the error line when an error is passed', () => {
    render(<ManageSubscriptionButton onClick={vi.fn()} loading={false} error="Couldn't open the billing page." />);
    expect(screen.getByTestId('manage-error').textContent).toBe("Couldn't open the billing page.");
  });
});
