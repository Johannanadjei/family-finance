/**
 * components/ui/Toast.test.jsx
 * Written before Toast.jsx — TDD.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, act }      from '@testing-library/react';
import { Toast }                    from './Toast';

const renderToast = (props = {}) =>
  render(
    <Toast
      message="Test toast message"
      onEdit={vi.fn()}
      onDismiss={vi.fn()}
      {...props}
    />
  );

describe('Toast', () => {
  it('renders message', () => {
    renderToast();
    expect(screen.getByText(/Test toast message/)).toBeTruthy();
  });

  it('renders Edit button', () => {
    renderToast();
    expect(screen.getByText('Edit')).toBeTruthy();
  });

  it('calls onEdit when Edit tapped', () => {
    const onEdit = vi.fn();
    renderToast({ onEdit });
    screen.getByText('Edit').click();
    expect(onEdit).toHaveBeenCalled();
  });

  it('calls onDismiss when dismiss tapped', () => {
    const onDismiss = vi.fn();
    renderToast({ onDismiss });
    screen.getByLabelText('Dismiss').click();
    expect(onDismiss).toHaveBeenCalled();
  });

  it('renders custom actionLabel when provided', () => {
    renderToast({ actionLabel: 'Set up' });
    expect(screen.getByText('Set up')).toBeTruthy();
  });

  it('auto-dismisses after 4 seconds', async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    renderToast({ onDismiss });
    await act(async () => { vi.advanceTimersByTime(4000); });
    expect(onDismiss).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
