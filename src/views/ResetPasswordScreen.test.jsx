/**
 * views/ResetPasswordScreen.test.jsx
 *
 * Covers the recovery-link landing screen: session read, masked identity,
 * password validation, the updateUser write, and the dead-link retry path.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor }         from '@testing-library/react';
import { ResetPasswordScreen, maskEmail, isResetPasswordPath } from './ResetPasswordScreen';

const getSession = vi.fn();
const updateUser = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a) => getSession(...a),
      updateUser: (...a) => updateUser(...a),
    },
  },
}));

const withSession = (email = 'alice@example.com') =>
  getSession.mockResolvedValue({ data: { session: { user: { email } } }, error: null });

const noSession = () => getSession.mockResolvedValue({ data: { session: null }, error: null });

// Render and wait for the async session read to settle.
const renderReady = async (props = {}) => {
  const utils = render(<ResetPasswordScreen onComplete={props.onComplete || vi.fn()} {...props} />);
  await waitFor(() => expect(screen.queryByTestId('reset-checking')).toBeNull());
  return utils;
};

const fillForm = (password, confirm) => {
  fireEvent.change(screen.getByTestId('reset-password-input'), { target: { value: password } });
  fireEvent.change(screen.getByTestId('reset-confirm-input'),  { target: { value: confirm } });
};

beforeEach(() => {
  vi.clearAllMocks();
  updateUser.mockResolvedValue({ data: {}, error: null });
  withSession();
});

describe('maskEmail', () => {
  it('masks the local part and domain, keeping the first letter and the tld', () => {
    expect(maskEmail('alice@example.com')).toBe('a***@***.com');
  });

  it('handles a co.uk style domain by keeping only the final tld segment', () => {
    expect(maskEmail('bob@mail.co.uk')).toBe('b***@***.uk');
  });

  it('returns an empty string for a missing email', () => {
    expect(maskEmail('')).toBe('');
    expect(maskEmail(null)).toBe('');
    expect(maskEmail(undefined)).toBe('');
  });

  it('returns an empty string for a value with no @', () => {
    expect(maskEmail('notanemail')).toBe('');
  });

  it('never leaks the full local part', () => {
    expect(maskEmail('averylongname@example.com')).not.toContain('verylongname');
  });
});

describe('isResetPasswordPath', () => {
  it('matches the reset path', () => {
    expect(isResetPasswordPath('/reset-password')).toBe(true);
  });

  it('matches the reset path with a trailing slash', () => {
    expect(isResetPasswordPath('/reset-password/')).toBe(true);
  });

  it('does not match other paths', () => {
    expect(isResetPasswordPath('/')).toBe(false);
    expect(isResetPasswordPath('/settings')).toBe(false);
  });
});

describe('ResetPasswordScreen — session read', () => {
  it('shows a checking state before the session resolves', () => {
    render(<ResetPasswordScreen onComplete={vi.fn()} />);
    expect(screen.getByTestId('reset-checking')).toBeTruthy();
  });

  it('shows the masked email once the recovery session is read', async () => {
    await renderReady();
    expect(screen.getByTestId('reset-masked-email').textContent).toBe('a***@***.com');
  });

  it('renders the invalid state when there is no session', async () => {
    noSession();
    await renderReady();
    expect(screen.getByTestId('reset-invalid')).toBeTruthy();
  });

  it('renders the invalid state when getSession errors', async () => {
    getSession.mockResolvedValue({ data: null, error: { message: 'network' } });
    await renderReady();
    expect(screen.getByTestId('reset-invalid')).toBeTruthy();
  });

  it('offers a retry affordance back to the app on an expired link', async () => {
    noSession();
    await renderReady();
    const link = screen.getByTestId('reset-request-new-link');
    expect(link.getAttribute('href')).toBe('/');
  });

  it('does not render the password form on an expired link', async () => {
    noSession();
    await renderReady();
    expect(screen.queryByTestId('reset-password-input')).toBeNull();
  });
});

describe('ResetPasswordScreen — validation', () => {
  it('rejects mismatched passwords without calling updateUser', async () => {
    await renderReady();
    fillForm('secret123', 'secret124');
    fireEvent.click(screen.getByTestId('reset-submit-btn'));
    expect(screen.getByTestId('reset-error').textContent).toBe('Passwords do not match');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than 6 characters', async () => {
    await renderReady();
    fillForm('abc', 'abc');
    fireEvent.click(screen.getByTestId('reset-submit-btn'));
    expect(screen.getByTestId('reset-error').textContent).toMatch(/at least 6/);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('rejects an empty password', async () => {
    await renderReady();
    fireEvent.click(screen.getByTestId('reset-submit-btn'));
    expect(screen.getByTestId('reset-error').textContent).toBe('Please enter a new password');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('rejects an empty confirmation', async () => {
    await renderReady();
    fillForm('secret123', '');
    fireEvent.click(screen.getByTestId('reset-submit-btn'));
    expect(screen.getByTestId('reset-error').textContent).toBe('Please confirm your new password');
    expect(updateUser).not.toHaveBeenCalled();
  });
});

describe('ResetPasswordScreen — submit', () => {
  it('calls updateUser with the new password', async () => {
    await renderReady();
    fillForm('secret123', 'secret123');
    await act(async () => { fireEvent.click(screen.getByTestId('reset-submit-btn')); });
    expect(updateUser).toHaveBeenCalledWith({ password: 'secret123' });
  });

  it('shows the success confirmation', async () => {
    await renderReady();
    fillForm('secret123', 'secret123');
    await act(async () => { fireEvent.click(screen.getByTestId('reset-submit-btn')); });
    expect(screen.getByTestId('reset-success').textContent).toMatch(/Password updated/);
  });

  it('surfaces a generic update error inline and stays on the form', async () => {
    updateUser.mockResolvedValue({ data: null, error: { message: 'Something odd' } });
    await renderReady();
    fillForm('secret123', 'secret123');
    await act(async () => { fireEvent.click(screen.getByTestId('reset-submit-btn')); });
    expect(screen.getByTestId('reset-error').textContent).toBe('Something odd');
    expect(screen.getByTestId('reset-password-input')).toBeTruthy();
  });

  it('maps a same-password rejection to friendly copy', async () => {
    updateUser.mockResolvedValue({ data: null, error: { message: 'New password should be different from the old password' } });
    await renderReady();
    fillForm('secret123', 'secret123');
    await act(async () => { fireEvent.click(screen.getByTestId('reset-submit-btn')); });
    expect(screen.getByTestId('reset-error').textContent).toMatch(/different from your current/);
  });

  // A link consumed between page load and submit fails with a session error — the user
  // needs the retry affordance, not a dead form they can retype into forever.
  it('falls back to the invalid state when the session died before submit', async () => {
    updateUser.mockResolvedValue({ data: null, error: { message: 'Auth session missing!' } });
    await renderReady();
    fillForm('secret123', 'secret123');
    await act(async () => { fireEvent.click(screen.getByTestId('reset-submit-btn')); });
    expect(screen.getByTestId('reset-invalid')).toBeTruthy();
    expect(screen.getByTestId('reset-request-new-link')).toBeTruthy();
  });
});

describe('ResetPasswordScreen — handoff', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls onComplete after the confirmation delay', async () => {
    const onComplete = vi.fn();
    render(<ResetPasswordScreen onComplete={onComplete} />);
    await act(async () => { await Promise.resolve(); });   // settle the session read

    fillForm('secret123', 'secret123');
    await act(async () => { fireEvent.click(screen.getByTestId('reset-submit-btn')); });
    expect(onComplete).not.toHaveBeenCalled();             // ✓ is shown first

    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not call onComplete when the update failed', async () => {
    updateUser.mockResolvedValue({ data: null, error: { message: 'Something odd' } });
    const onComplete = vi.fn();
    render(<ResetPasswordScreen onComplete={onComplete} />);
    await act(async () => { await Promise.resolve(); });

    fillForm('secret123', 'secret123');
    await act(async () => { fireEvent.click(screen.getByTestId('reset-submit-btn')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(onComplete).not.toHaveBeenCalled();
  });
});
