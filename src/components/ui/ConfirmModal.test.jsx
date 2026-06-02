/**
 * components/ui/ConfirmModal.test.jsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmModal }              from './ConfirmModal';

const base = {
  open: true,
  title: 'Edit past period?',
  body: "You're changing May 2026, which has ended. Continue?",
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe('ConfirmModal', () => {
  it('renders title and body when open', () => {
    render(<ConfirmModal {...base} />);
    expect(screen.getByText('Edit past period?')).toBeTruthy();
    expect(screen.getByText(/changing May 2026, which has ended/)).toBeTruthy();
  });

  it('does not render when closed', () => {
    render(<ConfirmModal {...base} open={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('defaults the button labels to Cancel / Continue', () => {
    render(<ConfirmModal {...base} />);
    expect(screen.getByText('Cancel')).toBeTruthy();
    expect(screen.getByText('Continue')).toBeTruthy();
  });

  it('honours custom button labels', () => {
    render(<ConfirmModal {...base} cancelLabel="No" confirmLabel="Yes" />);
    expect(screen.getByText('No')).toBeTruthy();
    expect(screen.getByText('Yes')).toBeTruthy();
  });

  it('calls onConfirm when the confirm button is tapped', () => {
    const onConfirm = vi.fn();
    render(<ConfirmModal {...base} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('Continue'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the cancel button is tapped', () => {
    const onCancel = vi.fn();
    render(<ConfirmModal {...base} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
