/**
 * views/guest/GuestPinScreen.test.jsx
 * Written before GuestPinScreen.jsx — TDD.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent }        from '@testing-library/react';
import { GuestPinScreen }                        from './GuestPinScreen';
import { mockGuests }                            from '../../test-utils/fixtures';

const onAuthenticate = vi.fn();

const renderScreen = (props = {}) =>
  render(
    <GuestPinScreen
      guests={mockGuests}
      loading={false}
      error={null}
      onAuthenticate={onAuthenticate}
      {...props}
    />
  );

describe('GuestPinScreen', () => {
  beforeEach(() => { onAuthenticate.mockClear(); });

  it('shows loading state', () => {
    renderScreen({ loading: true });
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('renders guest names', () => {
    renderScreen();
    expect(screen.getByTestId('guest-btn-guest-1')).toBeTruthy();
    expect(screen.getByTestId('guest-btn-guest-2')).toBeTruthy();
    expect(screen.getByText('Sarah')).toBeTruthy();
    expect(screen.getByText('Tom')).toBeTruthy();
  });

  it('shows empty state when no guests', () => {
    renderScreen({ guests: [] });
    expect(screen.getByText(/No guests set up/)).toBeTruthy();
  });

  it('shows PIN input after selecting a guest', async () => {
    renderScreen();
    await act(async () => { screen.getByTestId('guest-btn-guest-1').click(); });
    expect(screen.getByTestId('guest-pin-input')).toBeTruthy();
  });

  it('shows the selected guest name in PIN label', async () => {
    renderScreen();
    await act(async () => { screen.getByTestId('guest-btn-guest-1').click(); });
    expect(screen.getByText(/PIN for Sarah/)).toBeTruthy();
  });

  it('hides PIN input when no guest selected', () => {
    renderScreen();
    expect(screen.queryByTestId('guest-pin-input')).toBeNull();
  });

  it('renders Enter button when guests exist', () => {
    renderScreen();
    expect(screen.getByTestId('guest-enter-btn')).toBeTruthy();
  });

  it('Enter button is not disabled (validation runs on click)', () => {
    renderScreen();
    const btn = screen.getByTestId('guest-enter-btn');
    expect(btn.disabled).toBe(false);
  });

  it('calls onAuthenticate with guestId and pin on submit', async () => {
    onAuthenticate.mockResolvedValue({ ok: true });
    renderScreen();
    await act(async () => { screen.getByTestId('guest-btn-guest-1').click(); });
    await act(async () => { fireEvent.change(screen.getByTestId('guest-pin-input'), { target: { value: '1234' } }); });
    await act(async () => { screen.getByTestId('guest-enter-btn').click(); });
    expect(onAuthenticate).toHaveBeenCalledWith('guest-1', '1234');
  });

  it('shows error from error prop', () => {
    renderScreen({ error: 'Incorrect PIN. Please try again.' });
    expect(screen.getByTestId('guest-pin-error')).toBeTruthy();
    expect(screen.getByText(/Incorrect PIN/)).toBeTruthy();
  });

  it('shows local error when submitting without a guest selected', async () => {
    renderScreen();
    await act(async () => { screen.getByTestId('guest-enter-btn').click(); });
    expect(screen.getByText(/Please select your name/)).toBeTruthy();
  });

  it('clears PIN on failed authentication', async () => {
    onAuthenticate.mockResolvedValue({ ok: false });
    renderScreen();
    await act(async () => { screen.getByTestId('guest-btn-guest-1').click(); });
    await act(async () => { fireEvent.change(screen.getByTestId('guest-pin-input'), { target: { value: '9999' } }); });
    await act(async () => { screen.getByTestId('guest-enter-btn').click(); });
    expect(screen.getByTestId('guest-pin-input').value).toBe('');
  });

  it('deselects guest when same name button clicked again', async () => {
    renderScreen();
    await act(async () => { screen.getByTestId('guest-btn-guest-1').click(); });
    expect(screen.getByTestId('guest-pin-input')).toBeTruthy();
    await act(async () => { screen.getByTestId('guest-btn-guest-1').click(); });
    expect(screen.queryByTestId('guest-pin-input')).toBeNull();
  });

  it('shows load error screen when error and no guests', () => {
    renderScreen({ guests: [], error: 'Could not load guests. Please try again.' });
    expect(screen.getByTestId('guest-load-error')).toBeTruthy();
    expect(screen.getByText(/Could not load guests/)).toBeTruthy();
    expect(screen.queryByText(/No guests set up/)).toBeNull();
  });

  it('shows retry button when onRetry provided with load error', () => {
    const onRetry = vi.fn();
    renderScreen({ guests: [], error: 'Could not load guests. Please try again.', onRetry });
    const retryBtn = screen.getByText('Try again');
    expect(retryBtn).toBeTruthy();
    retryBtn.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('hides retry button when no onRetry prop', () => {
    renderScreen({ guests: [], error: 'Could not load guests. Please try again.' });
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('shows guest list (not load error) when error is auth error and guests loaded', () => {
    renderScreen({ guests: mockGuests, error: 'Incorrect PIN. Please try again.' });
    expect(screen.queryByTestId('guest-load-error')).toBeNull();
    expect(screen.getByTestId('guest-btn-guest-1')).toBeTruthy();
  });
});
