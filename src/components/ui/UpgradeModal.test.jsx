/**
 * components/ui/UpgradeModal.test.jsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UpgradeModal }              from './UpgradeModal';

describe('UpgradeModal', () => {
  it('renders the default hub-cap content when open', () => {
    render(<UpgradeModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/Upgrade to Pro/)).toBeTruthy();
    expect(screen.getByText(/reached your plan's hub limit/i)).toBeTruthy();
    expect(screen.getByText(/coming soon/i)).toBeTruthy();
    expect(screen.getByText('Got it')).toBeTruthy();
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
});
