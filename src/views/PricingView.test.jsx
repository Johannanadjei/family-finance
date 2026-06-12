/**
 * views/PricingView.test.jsx
 *
 * Covers the 7 Phase-2 cases: renders both cards with PRICING prices, billing toggle
 * switches price + savings badge, free-user CTA fires startCheckout and redirects,
 * Pro-user "Your plan" + suppressed CTA + manage placeholder, ?checkout=return polls
 * refresh(), loading → skeleton, and a checkout failure surfaces an error without redirect.
 *
 * Prices are asserted against PRICING (lib/pricing.js) — never hardcoded literals.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor }   from '@testing-library/react';
import { mockSubscriptionFree, mockSubscriptionPro } from '../test-utils/fixtures';
import { PRICING } from '../lib/pricing';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

let ctx;
vi.mock('../context/SubscriptionContext', () => ({
  useSubscriptionContext: () => ctx,
}));

const mockStartCheckout = vi.fn();
vi.mock('../services/checkout.service', () => ({ startCheckout: (i) => mockStartCheckout(i) }));

import { PricingView } from './PricingView';

let assign;

beforeEach(() => {
  mockNavigate.mockReset();
  mockStartCheckout.mockReset();
  mockStartCheckout.mockResolvedValue({ data: { authorization_url: 'https://pay/abc' }, error: null });
  ctx = { ...mockSubscriptionFree, refresh: vi.fn() };

  assign = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { search: '', pathname: '/pricing', assign },
  });
});

describe('PricingView', () => {
  it('renders Free and Pro cards with the monthly price from PRICING', () => {
    render(<PricingView />);
    expect(screen.getByTestId('plan-free')).toBeTruthy();
    expect(screen.getByTestId('plan-pro')).toBeTruthy();
    expect(screen.getByTestId('plan-pro').textContent).toContain(PRICING.monthly.display);
  });

  it('toggling to annual swaps in the annual price and shows the savings badge', () => {
    render(<PricingView />);
    fireEvent.click(screen.getByTestId('toggle-annual'));
    expect(screen.getByTestId('plan-pro').textContent).toContain(PRICING.annual.display);
    expect(screen.getByTestId('toggle-annual').textContent).toContain(String(PRICING.annual.savings_percent));
  });

  it('free user: Upgrade CTA fires startCheckout with the interval and redirects', async () => {
    render(<PricingView />);
    fireEvent.click(screen.getByTestId('upgrade-cta'));
    expect(mockStartCheckout).toHaveBeenCalledWith('monthly');
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://pay/abc'));
  });

  it('Pro user: shows "Your plan", suppresses the Upgrade CTA, shows the manage placeholder', () => {
    ctx = { ...mockSubscriptionPro, refresh: vi.fn() };
    render(<PricingView />);
    expect(screen.getByTestId('current-pro')).toBeTruthy();
    expect(screen.queryByTestId('upgrade-cta')).toBeNull();
    expect(screen.getByTestId('manage-sub')).toBeTruthy();
  });

  it('?checkout=return polls refresh() and shows the processing banner', () => {
    const refresh = vi.fn();
    ctx = { ...mockSubscriptionFree, refresh };
    window.location.search = '?checkout=return';
    render(<PricingView />);
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByTestId('processing-banner')).toBeTruthy();
  });

  it('renders the skeleton while subscription state is loading', () => {
    ctx = { ...mockSubscriptionFree, isLoading: true, refresh: vi.fn() };
    render(<PricingView />);
    expect(screen.getByTestId('pricing-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('plan-pro')).toBeNull();
  });

  it('a checkout failure shows an error and does not redirect', async () => {
    mockStartCheckout.mockResolvedValue({ data: null, error: new Error('checkout_failed') });
    render(<PricingView />);
    fireEvent.click(screen.getByTestId('upgrade-cta'));
    expect(await screen.findByTestId('cta-error')).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });
});
