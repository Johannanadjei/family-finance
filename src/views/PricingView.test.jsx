/**
 * views/PricingView.test.jsx
 *
 * Covers the 7 Phase-2 cases: renders both cards with PRICING prices, billing toggle
 * switches price + savings badge, free-user CTA fires startCheckout and redirects,
 * Pro-user "Your plan" + suppressed CTA + a working manage button, ?checkout=return
 * polls refresh(), loading → skeleton, and a checkout failure surfaces an error
 * without redirect. Also covers the manage-link flow: fetch → redirect, and failure.
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

const mockGetManageLink = vi.fn();
vi.mock('../services/billing.service', () => ({ getManageLink: () => mockGetManageLink() }));

import { PricingView } from './PricingView';

let assign;

beforeEach(() => {
  mockNavigate.mockReset();
  mockStartCheckout.mockReset();
  mockStartCheckout.mockResolvedValue({ data: { authorization_url: 'https://pay/abc' }, error: null });
  mockGetManageLink.mockReset();
  mockGetManageLink.mockResolvedValue({ data: { link: 'https://paystack.com/manage/xyz' }, error: null });
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

  it('Pro user: shows "Your plan", suppresses the Upgrade CTA, offers manage subscription', () => {
    ctx = { ...mockSubscriptionPro, refresh: vi.fn() };
    render(<PricingView />);
    expect(screen.getByTestId('current-pro')).toBeTruthy();
    expect(screen.queryByTestId('upgrade-cta')).toBeNull();
    const manage = screen.getByTestId('manage-sub');
    expect(manage).toBeTruthy();
    expect(manage.disabled).toBe(false);          // no longer a "coming soon" placeholder
  });

  it('free user: no manage button — there is no subscription to manage', () => {
    render(<PricingView />);
    expect(screen.queryByTestId('manage-sub')).toBeNull();
  });

  it('Pro user: manage button fetches the link and redirects to Paystack', async () => {
    ctx = { ...mockSubscriptionPro, refresh: vi.fn() };
    render(<PricingView />);
    fireEvent.click(screen.getByTestId('manage-sub'));
    expect(mockGetManageLink).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://paystack.com/manage/xyz'));
  });

  it('Pro user: a failed manage-link surfaces an error and never redirects', async () => {
    ctx = { ...mockSubscriptionPro, refresh: vi.fn() };
    mockGetManageLink.mockResolvedValue({ data: null, error: new Error('no_subscription') });
    render(<PricingView />);
    fireEvent.click(screen.getByTestId('manage-sub'));
    await waitFor(() => expect(screen.getByTestId('manage-error')).toBeTruthy());
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByTestId('manage-sub').disabled).toBe(false);   // re-enabled to retry
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
