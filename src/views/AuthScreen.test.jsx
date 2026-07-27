/**
 * views/AuthScreen.test.jsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act }       from '@testing-library/react';
import { AuthScreen }                           from './AuthScreen';

const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
const signUp             = vi.fn().mockResolvedValue({ error: null });
const signInWithOAuth    = vi.fn().mockResolvedValue({ error: null });
const resetPassword      = vi.fn().mockResolvedValue({ error: null });

vi.mock('../services/auth.service', () => ({
  resetPasswordForEmail: (...a) => resetPassword(...a),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...a) => signInWithPassword(...a),
      signUp:             (...a) => signUp(...a),
      signInWithOAuth:    (...a) => signInWithOAuth(...a),
    },
  },
}));

describe('AuthScreen', () => {
  beforeEach(() => {
    signInWithPassword.mockClear();
    signUp.mockClear();
    signInWithOAuth.mockClear();
    resetPassword.mockClear();
    resetPassword.mockResolvedValue({ error: null });
  });

  it('renders the brand logo image and wordmark', () => {
    render(<AuthScreen />);
    expect(screen.getByAltText('Money B.O.S logo')).toBeTruthy();
    expect(screen.getByText('Money B.O.S')).toBeTruthy();
  });

  it('renders the tagline', () => {
    render(<AuthScreen />);
    expect(screen.getByText('Budget · Overview · System')).toBeTruthy();
  });

  // Two buttons read "Sign In" (the mode tab and the submit button); the submit
  // button is the second one in DOM order.
  const submitSignIn = () => {
    const buttons = screen.getAllByRole('button', { name: 'Sign In' });
    fireEvent.click(buttons[buttons.length - 1]);
  };

  it('shows a validation error when submitting with empty fields', () => {
    render(<AuthScreen />);
    submitSignIn();
    expect(screen.getByText('Email is required')).toBeTruthy();
  });

  it('switches to sign-up mode and shows the create-account subtext', () => {
    render(<AuthScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    expect(screen.getByText('Create your account')).toBeTruthy();
  });

  it('calls signInWithPassword with the entered credentials', () => {
    render(<AuthScreen />);
    fireEvent.change(screen.getByPlaceholderText('Email address'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'),      { target: { value: 'secret1' } });
    submitSignIn();
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'secret1' });
  });

  // The e2e sign-in helper (e2e/helpers/signIn.js) drives these three testids.
  // Asserting them here means a rename breaks a fast unit test, not a slow browser run.
  it('exposes the auth-email-input testid', () => {
    render(<AuthScreen />);
    expect(screen.getByTestId('auth-email-input')).toBeTruthy();
  });

  it('exposes the auth-password-input testid', () => {
    render(<AuthScreen />);
    expect(screen.getByTestId('auth-password-input')).toBeTruthy();
  });

  it('exposes the auth-submit-btn testid', () => {
    render(<AuthScreen />);
    expect(screen.getByTestId('auth-submit-btn')).toBeTruthy();
  });
});

describe('AuthScreen — forgot password', () => {
  beforeEach(() => {
    resetPassword.mockClear();
    resetPassword.mockResolvedValue({ error: null });
  });

  const reveal = () => fireEvent.click(screen.getByTestId('forgot-password-btn'));

  it('shows the forgot-password link on the sign in tab', () => {
    render(<AuthScreen />);
    expect(screen.getByTestId('forgot-password-btn')).toBeTruthy();
  });

  it('hides the forgot-password link on the sign up tab', () => {
    render(<AuthScreen />);
    fireEvent.click(screen.getByText('Sign Up'));
    expect(screen.queryByTestId('forgot-password-btn')).toBeNull();
  });

  it('reveals an email input and send button when clicked', () => {
    render(<AuthScreen />);
    reveal();
    expect(screen.getByTestId('forgot-email-input')).toBeTruthy();
    expect(screen.getByTestId('forgot-password-send-btn')).toBeTruthy();
  });

  it('sends the reset link for the entered email', async () => {
    render(<AuthScreen />);
    reveal();
    fireEvent.change(screen.getByTestId('forgot-email-input'), { target: { value: 'a@b.com' } });
    await act(async () => { fireEvent.click(screen.getByTestId('forgot-password-send-btn')); });
    expect(resetPassword).toHaveBeenCalledWith('a@b.com');
  });

  it('rejects an invalid email without calling the service', () => {
    render(<AuthScreen />);
    reveal();
    fireEvent.change(screen.getByTestId('forgot-email-input'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByTestId('forgot-password-send-btn'));
    expect(resetPassword).not.toHaveBeenCalled();
    expect(screen.getByTestId('forgot-password-error')).toBeTruthy();
  });

  it('shows the check-your-email confirmation after sending', async () => {
    render(<AuthScreen />);
    reveal();
    fireEvent.change(screen.getByTestId('forgot-email-input'), { target: { value: 'a@b.com' } });
    await act(async () => { fireEvent.click(screen.getByTestId('forgot-password-send-btn')); });
    expect(screen.getByTestId('forgot-password-sent')).toBeTruthy();
  });

  // Account-enumeration safety: an unknown address, a rate-limit, and a real send must
  // be indistinguishable to the caller. Same testid, same copy, no error surface.
  it('shows the SAME confirmation when the service returns an error', async () => {
    resetPassword.mockResolvedValue({ error: { message: 'User not found' } });
    render(<AuthScreen />);
    reveal();
    fireEvent.change(screen.getByTestId('forgot-email-input'), { target: { value: 'ghost@b.com' } });
    await act(async () => { fireEvent.click(screen.getByTestId('forgot-password-send-btn')); });
    expect(screen.getByTestId('forgot-password-sent')).toBeTruthy();
    expect(screen.queryByTestId('forgot-password-error')).toBeNull();
  });

  it('renders identical confirmation copy for an existing and a non-existent address', async () => {
    const { unmount } = render(<AuthScreen />);
    reveal();
    fireEvent.change(screen.getByTestId('forgot-email-input'), { target: { value: 'real@b.com' } });
    await act(async () => { fireEvent.click(screen.getByTestId('forgot-password-send-btn')); });
    const existing = screen.getByTestId('forgot-password-sent').textContent;
    unmount();

    resetPassword.mockResolvedValue({ error: { message: 'User not found' } });
    render(<AuthScreen />);
    reveal();
    fireEvent.change(screen.getByTestId('forgot-email-input'), { target: { value: 'ghost@b.com' } });
    await act(async () => { fireEvent.click(screen.getByTestId('forgot-password-send-btn')); });
    expect(screen.getByTestId('forgot-password-sent').textContent).toBe(existing);
  });
});
