/**
 * views/settings/PlanSection.test.jsx
 *
 * Renders correctly for free + pro, and deep-links to /pricing on CTA click.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent }            from '@testing-library/react';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

let mockIsPro = false;
vi.mock('../../context/SubscriptionContext', () => ({
  useSubscriptionContext: () => ({ isPro: mockIsPro }),
}));

import { PlanSection } from './PlanSection';

beforeEach(() => {
  mockNavigate.mockReset();
  mockIsPro = false;
});

describe('PlanSection', () => {
  it('shows Free tier and an Upgrade CTA for free users', () => {
    render(<PlanSection />);
    expect(screen.getByTestId('plan-tier').textContent).toBe('Free');
    expect(screen.getByTestId('plan-cta').textContent).toBe('Upgrade to Pro');
  });

  it('shows Pro tier and a Manage CTA for Pro users', () => {
    mockIsPro = true;
    render(<PlanSection />);
    expect(screen.getByTestId('plan-tier').textContent).toBe('Pro');
    expect(screen.getByTestId('plan-cta').textContent).toBe('Manage Plan');
  });

  it('navigates to /pricing when the CTA is clicked', () => {
    render(<PlanSection />);
    fireEvent.click(screen.getByTestId('plan-cta'));
    expect(mockNavigate).toHaveBeenCalledWith('/pricing');
  });
});
