/**
 * views/auth/ResetPasswordForm.test.jsx
 *
 * Pure display component — it renders what it is given and reports events upward.
 * Validation and the updateUser write live in ResetPasswordScreen and are covered
 * in views/ResetPasswordScreen.test.jsx.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResetPasswordForm }         from './ResetPasswordForm';

const defaults = {
  maskedEmail: 'a***@***.com',
  password: '', confirm: '', error: null, submitting: false,
  onPasswordChange: vi.fn(), onConfirmChange: vi.fn(), onSubmit: vi.fn(),
};

const setup = (props = {}) => {
  const merged = { ...defaults, ...props };
  render(<ResetPasswordForm {...merged} />);
  return merged;
};

describe('ResetPasswordForm', () => {
  it('displays the masked email it is given', () => {
    setup();
    expect(screen.getByTestId('reset-masked-email').textContent).toBe('a***@***.com');
  });

  it('renders both password fields', () => {
    setup();
    expect(screen.getByTestId('reset-password-input')).toBeTruthy();
    expect(screen.getByTestId('reset-confirm-input')).toBeTruthy();
  });

  it('reports password edits upward', () => {
    const { onPasswordChange } = setup();
    fireEvent.change(screen.getByTestId('reset-password-input'), { target: { value: 'secret123' } });
    expect(onPasswordChange).toHaveBeenCalledWith('secret123');
  });

  it('reports confirmation edits upward', () => {
    const { onConfirmChange } = setup();
    fireEvent.change(screen.getByTestId('reset-confirm-input'), { target: { value: 'secret123' } });
    expect(onConfirmChange).toHaveBeenCalledWith('secret123');
  });

  it('calls onSubmit when the button is clicked', () => {
    const { onSubmit } = setup();
    fireEvent.click(screen.getByTestId('reset-submit-btn'));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('renders no error slot when there is no error', () => {
    setup();
    expect(screen.queryByTestId('reset-error')).toBeNull();
  });

  it('renders the error it is given', () => {
    setup({ error: 'Passwords do not match' });
    expect(screen.getByTestId('reset-error').textContent).toBe('Passwords do not match');
  });

  it('disables the button while submitting', () => {
    setup({ submitting: true });
    expect(screen.getByTestId('reset-submit-btn').disabled).toBe(true);
  });

  it('shows progress copy while submitting', () => {
    setup({ submitting: true });
    expect(screen.getByTestId('reset-submit-btn').textContent).toBe('Updating…');
  });
});
