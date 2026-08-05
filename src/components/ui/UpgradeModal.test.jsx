/**
 * components/ui/UpgradeModal.test.jsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UpgradeModal }              from './UpgradeModal';

// The /pricing CTA must call the hook's escape hatch before navigating; spy on it.
const mockDismissForNavigation = vi.fn();
vi.mock('../../hooks/useModalChrome', () => ({
  useModalChrome: () => ({ dismissForNavigation: mockDismissForNavigation }),
}));

describe('UpgradeModal', () => {
  beforeEach(() => mockDismissForNavigation.mockReset());

  it('renders the default hub-cap content when open', () => {
    render(<UpgradeModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('💜 Upgrade to Pro')).toBeTruthy();   // the title (body now also contains "Upgrade to Pro")
    expect(screen.getByText(/reached your plan's hub limit/i)).toBeTruthy();
    expect(screen.getByText(/manage up to 10 hubs/i)).toBeTruthy();   // present-tense Pro copy
    expect(screen.getByText('Got it')).toBeTruthy();                  // dismiss label when no onUpgrade
  });

  it('renders no bullet list or "Until then" section by default (hub-cap gate)', () => {
    const { container } = render(<UpgradeModal open={true} onClose={vi.fn()} />);
    expect(screen.queryByText(/Until then, you can:/i)).toBeNull();
    expect(screen.queryByText(/Archive hubs/i)).toBeNull();
    expect(container.querySelector('ul')).toBeNull();
  });

  it('does not render when closed', () => {
    render(<UpgradeModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('calls onClose when the dismiss button is tapped', () => {
    const onClose = vi.fn();
    render(<UpgradeModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText('Got it'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('when onUpgrade is provided: CTA reads "Upgrade to Pro" and calls onUpgrade, not onClose', () => {
    const onUpgrade = vi.fn();
    const onClose   = vi.fn();
    render(<UpgradeModal open={true} onClose={onClose} onUpgrade={onUpgrade} />);
    expect(screen.queryByText('Got it')).toBeNull();           // label switches to the upgrade CTA
    fireEvent.click(screen.getByText('Upgrade to Pro'));        // the button (not the 💜 title)
    expect(onUpgrade).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('CTA tap calls dismissForNavigation BEFORE onUpgrade (so the close skips history.back())', () => {
    const order = [];
    mockDismissForNavigation.mockImplementation(() => order.push('dismiss'));
    const onUpgrade = vi.fn(() => order.push('upgrade'));
    render(<UpgradeModal open={true} onClose={vi.fn()} onUpgrade={onUpgrade} />);
    fireEvent.click(screen.getByText('Upgrade to Pro'));
    expect(order).toEqual(['dismiss', 'upgrade']);   // escape hatch fires first
  });

  it('does NOT call dismissForNavigation on a plain dismiss (no onUpgrade)', () => {
    render(<UpgradeModal open={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Got it'));
    expect(mockDismissForNavigation).not.toHaveBeenCalled();
  });

  it('honours custom title / body / items for reuse by other gates', () => {
    render(
      <UpgradeModal
        open={true}
        onClose={vi.fn()}
        title="Member limit reached"
        body="Free hubs allow 2 members."
        items={['Remove a member', 'Upgrade later']}
        ctaLabel="OK"
      />
    );
    expect(screen.getByText(/Member limit reached/)).toBeTruthy();
    expect(screen.getByText('Free hubs allow 2 members.')).toBeTruthy();
    expect(screen.getByText('Remove a member')).toBeTruthy();
    expect(screen.getByText('OK')).toBeTruthy();
  });

  it('accepts a multi-paragraph body array', () => {
    render(<UpgradeModal open={true} onClose={vi.fn()} body={['First para.', 'Second para.']} items={[]} />);
    expect(screen.getByText('First para.')).toBeTruthy();
    expect(screen.getByText('Second para.')).toBeTruthy();
  });

  // ── canUpgrade — the owner-only purchase path ───────────────────────────────
  // A subscription attaches to the payer's account, but hub caps resolve from the
  // OWNER's tier. So a non-owner still sees the cap explanation in full; only the
  // pay CTA is withheld.
  describe('canUpgrade', () => {
    it('withholds the pay CTA for a non-owner but keeps the cap message', () => {
      const onUpgrade = vi.fn();
      render(
        <UpgradeModal
          open={true}
          onClose={vi.fn()}
          onUpgrade={onUpgrade}
          canUpgrade={false}
          body={['You have reached this hub\'s category limit.']}
        />
      );

      // The cap explanation survives — hiding it would leave a non-owner stuck at a
      // limit with no explanation, which is worse than the misleading button.
      expect(screen.getByText("You have reached this hub's category limit.")).toBeTruthy();
      expect(screen.getByTestId('ask-owner-note').textContent).toBe('Ask your hub owner to upgrade to Pro.');
      expect(screen.queryByText('Upgrade to Pro')).toBeNull();
      expect(screen.getByText('Got it')).toBeTruthy();
    });

    it('never invokes onUpgrade when canUpgrade is false — the CTA dismisses instead', () => {
      const onUpgrade = vi.fn();
      const onClose   = vi.fn();
      render(<UpgradeModal open={true} onClose={onClose} onUpgrade={onUpgrade} canUpgrade={false} />);

      fireEvent.click(screen.getByText('Got it'));
      expect(onUpgrade).not.toHaveBeenCalled();   // no /pricing, no Paystack
      expect(onClose).toHaveBeenCalled();
    });

    it('gives an owner the pay CTA and no ask-owner note', () => {
      const onUpgrade = vi.fn();
      render(<UpgradeModal open={true} onClose={vi.fn()} onUpgrade={onUpgrade} canUpgrade={true} />);

      expect(screen.queryByTestId('ask-owner-note')).toBeNull();
      fireEvent.click(screen.getByText('Upgrade to Pro'));
      expect(onUpgrade).toHaveBeenCalled();
    });

    it('defaults to allowing the upgrade, so account-scoped gates are unaffected', () => {
      // The hub cap (HubFooter) passes no canUpgrade: create_hub gates on the CALLER's
      // tier, so that purchase genuinely does lift that cap for whoever is looking.
      const onUpgrade = vi.fn();
      render(<UpgradeModal open={true} onClose={vi.fn()} onUpgrade={onUpgrade} />);

      expect(screen.queryByTestId('ask-owner-note')).toBeNull();
      expect(screen.getByText('Upgrade to Pro')).toBeTruthy();
    });

    it('shows no ask-owner note when there was no upgrade path to begin with', () => {
      // canUpgrade is irrelevant to an informational modal with no onUpgrade.
      render(<UpgradeModal open={true} onClose={vi.fn()} canUpgrade={false} />);
      expect(screen.queryByTestId('ask-owner-note')).toBeNull();
      expect(screen.getByText('Got it')).toBeTruthy();
    });
  });

  it('applies the testid prop to the dialog container, defaulting to "upgrade-modal"', () => {
    const { rerender } = render(<UpgradeModal open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('upgrade-modal')).toBe(screen.getByRole('dialog'));   // default fallback

    rerender(<UpgradeModal open={true} onClose={vi.fn()} testid="upgrade-modal-hub" />);
    expect(screen.getByTestId('upgrade-modal-hub')).toBe(screen.getByRole('dialog'));  // per-gate value
    expect(screen.queryByTestId('upgrade-modal')).toBeNull();                          // no longer the default
  });
});
