/**
 * views/PinScreen.test.jsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent }       from '@testing-library/react';
import { PinScreen }                            from './PinScreen';

const mockUser = { id: 'user-1', email: 'test@example.com' };

const renderScreen = (props = {}) =>
  render(
    <PinScreen
      user={mockUser}
      verifyPin={vi.fn().mockResolvedValue({ success: false, locked: false, attemptsLeft: 4 })}
      lockedUntil={null}
      attempts={0}
      onForgotPin={vi.fn()}
      {...props}
    />
  );

describe('PinScreen', () => {
  it('renders the screen', () => {
    renderScreen();
    expect(screen.getByTestId('pin-screen')).toBeTruthy();
  });

  it('shows the user email', () => {
    renderScreen();
    expect(screen.getByText('test@example.com')).toBeTruthy();
  });

  it('shows "Enter your PIN to continue" when no error and not locked', () => {
    renderScreen();
    expect(screen.getByText('Enter your PIN to continue')).toBeTruthy();
  });

  it('shows error message after a failed attempt', async () => {
    vi.useFakeTimers();
    const verifyPin = vi.fn().mockResolvedValue({ success: false, locked: false, attemptsLeft: 4 });
    renderScreen({ verifyPin });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-1')); });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-2')); });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-3')); });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-4')); vi.runAllTimers(); });
    await act(async () => {});
    expect(screen.getByTestId('pin-error-message')).toBeTruthy();
    vi.useRealTimers();
  });

  it('shows lockout message when lockedUntil is in the future', () => {
    renderScreen({ lockedUntil: Date.now() + 60000 });
    expect(screen.getByTestId('lockout-message')).toBeTruthy();
  });

  it('disables pad when locked', () => {
    renderScreen({ lockedUntil: Date.now() + 60000 });
    expect(screen.getByTestId('pin-key-0').disabled).toBe(true);
  });

  it('shows "Forgot PIN?" button', () => {
    renderScreen();
    expect(screen.getByTestId('forgot-pin-btn')).toBeTruthy();
  });

  it('shows forgot confirmation UI when Forgot PIN? tapped', async () => {
    renderScreen();
    await act(async () => { screen.getByTestId('forgot-pin-btn').click(); });
    expect(screen.getByTestId('forgot-pin-confirm-btn')).toBeTruthy();
  });

  it('calls onForgotPin when confirm button tapped', async () => {
    const onForgotPin = vi.fn().mockResolvedValue(undefined);
    renderScreen({ onForgotPin });
    await act(async () => { screen.getByTestId('forgot-pin-btn').click(); });
    await act(async () => { screen.getByTestId('forgot-pin-confirm-btn').click(); });
    expect(onForgotPin).toHaveBeenCalledOnce();
  });

  it('shows success message after forgot flow completes', async () => {
    const onForgotPin = vi.fn().mockResolvedValue(undefined);
    renderScreen({ onForgotPin });
    await act(async () => { screen.getByTestId('forgot-pin-btn').click(); });
    await act(async () => { screen.getByTestId('forgot-pin-confirm-btn').click(); });
    expect(screen.getByText(/Check your email/)).toBeTruthy();
  });
});
