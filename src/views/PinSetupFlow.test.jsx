/**
 * views/PinSetupFlow.test.jsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { PinSetupFlow }             from './PinSetupFlow';

const renderFlow = (props = {}) =>
  render(
    <PinSetupFlow
      setupPin={vi.fn().mockResolvedValue({ error: null })}
      onSkip={vi.fn()}
      {...props}
    />
  );

describe('PinSetupFlow', () => {
  it('renders the setup flow', () => {
    renderFlow();
    expect(screen.getByTestId('pin-setup-flow')).toBeTruthy();
  });

  it('shows "Set a PIN" heading on step 1', () => {
    renderFlow();
    expect(screen.getByText('Set a PIN')).toBeTruthy();
  });

  it('shows "Confirm your PIN" heading after entering a PIN', async () => {
    vi.useFakeTimers();
    renderFlow();
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-1')); });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-2')); });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-3')); });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-4')); vi.runAllTimers(); });
    await act(async () => {});
    expect(screen.getByText('Confirm your PIN')).toBeTruthy();
    vi.useRealTimers();
  });

  it('shows mismatch message and resets to step 1 when PINs differ', async () => {
    vi.useFakeTimers();
    renderFlow();
    // Enter 1234
    for (const k of ['1','2','3','4']) {
      await act(async () => { fireEvent.click(screen.getByTestId(`pin-key-${k}`)); });
    }
    await act(async () => { vi.runAllTimers(); });
    await act(async () => {});
    // Confirm with 5678 (mismatch)
    for (const k of ['5','6','7','8']) {
      await act(async () => { fireEvent.click(screen.getByTestId(`pin-key-${k}`)); });
    }
    // Advance past PinPad's 80ms submit timeout only — not the 700ms mismatch reset
    await act(async () => { vi.advanceTimersByTime(100); });
    await act(async () => {});
    expect(screen.getByTestId('pin-mismatch-msg')).toBeTruthy();
    vi.useRealTimers();
  });

  it('calls setupPin when confirmation matches', async () => {
    vi.useFakeTimers();
    const setupPin = vi.fn().mockResolvedValue({ error: null });
    renderFlow({ setupPin });
    for (const k of ['1','2','3','4']) {
      await act(async () => { fireEvent.click(screen.getByTestId(`pin-key-${k}`)); });
    }
    await act(async () => { vi.runAllTimers(); });
    await act(async () => {});
    for (const k of ['1','2','3','4']) {
      await act(async () => { fireEvent.click(screen.getByTestId(`pin-key-${k}`)); });
    }
    await act(async () => { vi.runAllTimers(); });
    await act(async () => {});
    expect(setupPin).toHaveBeenCalledWith('1234');
    vi.useRealTimers();
  });

  it('shows Skip button', () => {
    renderFlow();
    expect(screen.getByTestId('pin-setup-skip')).toBeTruthy();
  });

  it('calls onSkip when Skip tapped', async () => {
    const onSkip = vi.fn();
    renderFlow({ onSkip });
    await act(async () => { screen.getByTestId('pin-setup-skip').click(); });
    expect(onSkip).toHaveBeenCalledOnce();
  });
});
