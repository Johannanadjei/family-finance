import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemberRow }                 from './MemberRow';

const owner    = { id: 'mem-1', role: 'owner',    users: { name: 'Johannan', email: 'j@test.com' } };
const standard = { id: 'mem-2', role: 'standard', users: { name: 'Bob',      email: 'b@test.com' } };

const baseProps = {
  showBorder: true,
  canManage:  true,
  removing:   false,
  confirming: false,
  onAskRemove:     vi.fn(),
  onConfirmRemove: vi.fn(),
  onCancelRemove:  vi.fn(),
};

describe('MemberRow', () => {
  it('renders the member name and role label', () => {
    render(<MemberRow member={standard} {...baseProps} />);
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Standard')).toBeTruthy();
  });

  it('falls back to email then "Unknown" when no name', () => {
    render(<MemberRow member={{ id: 'm', role: 'standard', users: { email: 'x@test.com' } }} {...baseProps} />);
    expect(screen.getByText('x@test.com')).toBeTruthy();
  });

  it('shows a Remove button for non-owner members when manageable', () => {
    render(<MemberRow member={standard} {...baseProps} />);
    expect(screen.getByTestId('remove-member-mem-2')).toBeTruthy();
  });

  it('does not show a Remove button for the owner', () => {
    render(<MemberRow member={owner} {...baseProps} />);
    expect(screen.queryByTestId('remove-member-mem-1')).toBeNull();
  });

  it('does not show a Remove button when not manageable', () => {
    render(<MemberRow member={standard} {...baseProps} canManage={false} />);
    expect(screen.queryByTestId('remove-member-mem-2')).toBeNull();
  });

  it('calls onAskRemove when Remove is clicked', () => {
    const onAskRemove = vi.fn();
    render(<MemberRow member={standard} {...baseProps} onAskRemove={onAskRemove} />);
    fireEvent.click(screen.getByTestId('remove-member-mem-2'));
    expect(onAskRemove).toHaveBeenCalled();
  });

  it('shows the confirmation prompt with Yes/No when confirming', () => {
    render(<MemberRow member={standard} {...baseProps} confirming />);
    expect(screen.getByText(/Remove Bob\?/)).toBeTruthy();
    expect(screen.getByTestId('confirm-remove-member-mem-2')).toBeTruthy();
    expect(screen.getByTestId('cancel-remove-member-mem-2')).toBeTruthy();
  });

  it('calls onConfirmRemove / onCancelRemove from the confirmation buttons', () => {
    const onConfirmRemove = vi.fn();
    const onCancelRemove  = vi.fn();
    render(<MemberRow member={standard} {...baseProps} confirming onConfirmRemove={onConfirmRemove} onCancelRemove={onCancelRemove} />);
    fireEvent.click(screen.getByTestId('confirm-remove-member-mem-2'));
    expect(onConfirmRemove).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('cancel-remove-member-mem-2'));
    expect(onCancelRemove).toHaveBeenCalled();
  });

  it('disables the Remove button and shows an ellipsis while removing', () => {
    render(<MemberRow member={standard} {...baseProps} removing />);
    const btn = screen.getByTestId('remove-member-mem-2');
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('…');
  });
});
