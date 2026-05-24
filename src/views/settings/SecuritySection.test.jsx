/**
 * views/settings/SecuritySection.test.jsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen }                       from '@testing-library/react';
import { SecuritySection }                      from './SecuritySection';

vi.mock('../../context/PinContext', () => ({
  usePinContext: vi.fn(),
}));

import { usePinContext } from '../../context/PinContext';

const makeCtx = (hasPinSetup = false) => ({
  hasPinSetup,
  pinUnlocked: true,
  verifyPin:   vi.fn().mockResolvedValue({ success: false }),
  setupPin:    vi.fn().mockResolvedValue({ error: null }),
  removePin:   vi.fn().mockResolvedValue({ error: null }),
});

describe('SecuritySection', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the security section card', () => {
    usePinContext.mockReturnValue(makeCtx(false));
    render(<SecuritySection />);
    expect(screen.getByTestId('security-section')).toBeTruthy();
  });

  it('shows "Set up PIN" button when no PIN set', () => {
    usePinContext.mockReturnValue(makeCtx(false));
    render(<SecuritySection />);
    expect(screen.getByTestId('setup-pin-btn')).toBeTruthy();
  });

  it('does not show Change PIN or Remove PIN when no PIN set', () => {
    usePinContext.mockReturnValue(makeCtx(false));
    render(<SecuritySection />);
    expect(screen.queryByTestId('change-pin-btn')).toBeNull();
    expect(screen.queryByTestId('remove-pin-btn')).toBeNull();
  });

  it('shows Change PIN and Remove PIN buttons when PIN is set', () => {
    usePinContext.mockReturnValue(makeCtx(true));
    render(<SecuritySection />);
    expect(screen.getByTestId('change-pin-btn')).toBeTruthy();
    expect(screen.getByTestId('remove-pin-btn')).toBeTruthy();
  });

  it('does not show Set up PIN when PIN is already set', () => {
    usePinContext.mockReturnValue(makeCtx(true));
    render(<SecuritySection />);
    expect(screen.queryByTestId('setup-pin-btn')).toBeNull();
  });

  it('opens setup modal when Set up PIN tapped', async () => {
    const { act } = await import('@testing-library/react');
    usePinContext.mockReturnValue(makeCtx(false));
    render(<SecuritySection />);
    await act(async () => { screen.getByTestId('setup-pin-btn').click(); });
    expect(screen.getByText('Set a PIN')).toBeTruthy();
  });

  it('opens change-verify modal when Change PIN tapped', async () => {
    const { act } = await import('@testing-library/react');
    usePinContext.mockReturnValue(makeCtx(true));
    render(<SecuritySection />);
    await act(async () => { screen.getByTestId('change-pin-btn').click(); });
    expect(screen.getByTestId('change-pin-modal')).toBeTruthy();
  });

  it('opens remove-verify modal when Remove PIN tapped', async () => {
    const { act } = await import('@testing-library/react');
    usePinContext.mockReturnValue(makeCtx(true));
    render(<SecuritySection />);
    await act(async () => { screen.getByTestId('remove-pin-btn').click(); });
    expect(screen.getByTestId('remove-pin-modal')).toBeTruthy();
  });
});
