/**
 * views/AuthScreen.test.jsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent }            from '@testing-library/react';
import { AuthScreen }                           from './AuthScreen';

const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
const signUp             = vi.fn().mockResolvedValue({ error: null });
const signInWithOAuth    = vi.fn().mockResolvedValue({ error: null });

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
