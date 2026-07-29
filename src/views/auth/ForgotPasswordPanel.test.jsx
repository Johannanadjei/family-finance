/**
 * views/auth/ForgotPasswordPanel.test.jsx
 *
 * The send step must be account-enumeration safe: identical confirmation whether or
 * not the address exists, and whether or not the service errored.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act }       from '@testing-library/react';
import { ForgotPasswordPanel }                  from './ForgotPasswordPanel';

const resetPassword = vi.fn();

vi.mock('../../services/auth.service', () => ({
  resetPasswordForEmail: (...a) => resetPassword(...a),
}));

const reveal = () => fireEvent.click(screen.getByTestId('forgot-password-btn'));

const send = async (email) => {
  fireEvent.change(screen.getByTestId('forgot-email-input'), { target: { value: email } });
  await act(async () => { fireEvent.click(screen.getByTestId('forgot-password-send-btn')); });
};

beforeEach(() => {
  resetPassword.mockClear();
  resetPassword.mockResolvedValue({ error: null });
});

describe('ForgotPasswordPanel', () => {
  it('starts collapsed, showing only the link', () => {
    render(<ForgotPasswordPanel />);
    expect(screen.getByTestId('forgot-password-btn')).toBeTruthy();
    expect(screen.queryByTestId('forgot-email-input')).toBeNull();
  });

  it('expands into an email field and send button', () => {
    render(<ForgotPasswordPanel />);
    reveal();
    expect(screen.getByTestId('forgot-email-input')).toBeTruthy();
    expect(screen.getByTestId('forgot-password-send-btn')).toBeTruthy();
  });

  it('collapses again on cancel', () => {
    render(<ForgotPasswordPanel />);
    reveal();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByTestId('forgot-email-input')).toBeNull();
  });

  it('sends the trimmed email to the service', async () => {
    render(<ForgotPasswordPanel />);
    reveal();
    await send('  a@b.com  ');
    expect(resetPassword).toHaveBeenCalledWith('a@b.com');
  });

  it('rejects an invalid address without calling the service', () => {
    render(<ForgotPasswordPanel />);
    reveal();
    fireEvent.change(screen.getByTestId('forgot-email-input'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByTestId('forgot-password-send-btn'));
    expect(resetPassword).not.toHaveBeenCalled();
    expect(screen.getByTestId('forgot-password-error')).toBeTruthy();
  });

  it('rejects an empty address without calling the service', () => {
    render(<ForgotPasswordPanel />);
    reveal();
    fireEvent.click(screen.getByTestId('forgot-password-send-btn'));
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('confirms after a successful send', async () => {
    render(<ForgotPasswordPanel />);
    reveal();
    await send('a@b.com');
    expect(screen.getByTestId('forgot-password-sent')).toBeTruthy();
  });

  it('shows the SAME confirmation when the service errors — no enumeration signal', async () => {
    resetPassword.mockResolvedValue({ error: { message: 'User not found' } });
    render(<ForgotPasswordPanel />);
    reveal();
    await send('ghost@b.com');
    expect(screen.getByTestId('forgot-password-sent')).toBeTruthy();
    expect(screen.queryByTestId('forgot-password-error')).toBeNull();
  });

  it('renders byte-identical copy for an existing and a non-existent address', async () => {
    const { unmount } = render(<ForgotPasswordPanel />);
    reveal();
    await send('real@b.com');
    const existing = screen.getByTestId('forgot-password-sent').textContent;
    unmount();

    resetPassword.mockResolvedValue({ error: { message: 'User not found' } });
    render(<ForgotPasswordPanel />);
    reveal();
    await send('ghost@b.com');
    expect(screen.getByTestId('forgot-password-sent').textContent).toBe(existing);
  });
});
