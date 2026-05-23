/**
 * views/payday/UpdateReceivedSheet.test.jsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { UpdateReceivedSheet }      from './UpdateReceivedSheet';

const mockFmt = (n) => `GHS ${Math.round(n || 0).toLocaleString()}`;

const renderSheet = (props = {}) =>
  render(
    <UpdateReceivedSheet
      isOpen={true}
      sourceId="src-1"
      receivedAmount={30000}
      pendingAmount={25000}
      fmt={mockFmt}
      onConfirm={vi.fn()}
      onDismiss={vi.fn()}
      {...props}
    />
  );

describe('UpdateReceivedSheet', () => {
  it('does not render when closed', () => {
    renderSheet({ isOpen: false });
    expect(screen.queryByTestId('received-update-prompt-src-1')).toBeNull();
  });

  it('renders heading', () => {
    renderSheet();
    expect(screen.getByText('Update received amount?')).toBeTruthy();
  });

  it('renders body mentioning old and new amounts', () => {
    renderSheet();
    expect(screen.getAllByText(/GHS 30,000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/GHS 25,000/).length).toBeGreaterThan(0);
  });

  it('renders confirm button with new amount', () => {
    renderSheet();
    expect(screen.getByTestId('received-update-confirm-src-1').textContent).toContain('GHS 25,000');
  });

  it('renders keep button with old amount', () => {
    renderSheet();
    expect(screen.getByTestId('received-update-keep-src-1').textContent).toContain('GHS 30,000');
  });

  it('calls onConfirm when confirm button tapped', () => {
    const onConfirm = vi.fn();
    renderSheet({ onConfirm });
    screen.getByTestId('received-update-confirm-src-1').click();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onDismiss when keep button tapped', () => {
    const onDismiss = vi.fn();
    renderSheet({ onDismiss });
    screen.getByTestId('received-update-keep-src-1').click();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('calls onDismiss when backdrop tapped', () => {
    const onDismiss = vi.fn();
    renderSheet({ onDismiss });
    screen.getByTestId('update-received-backdrop').click();
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
