/**
 * views/settings/ArchiveHubSheet.test.jsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent }        from '@testing-library/react';
import { ArchiveHubSheet }                       from './ArchiveHubSheet';

const CENTRE_NAME = "The Adjei's";

const defaultProps = {
  isOpen:             true,
  onClose:            vi.fn(),
  centreName:         CENTRE_NAME,
  onArchive:          vi.fn().mockResolvedValue({ error: null }),
  onPermanentDelete:  vi.fn().mockResolvedValue({ error: null }),
};

describe('ArchiveHubSheet', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders nothing when isOpen is false', () => {
    render(<ArchiveHubSheet {...defaultProps} isOpen={false} />);
    expect(screen.queryByTestId('archive-hub-dialog')).toBeNull();
  });

  it('renders the archive step by default when open', () => {
    render(<ArchiveHubSheet {...defaultProps} />);
    expect(screen.getByTestId('archive-hub-dialog')).toBeTruthy();
    expect(screen.getByTestId('archive-confirm-btn')).toBeTruthy();
    expect(screen.getByText(/Archive hub/)).toBeTruthy();
  });

  it('shows the centre name in the archive step description', () => {
    render(<ArchiveHubSheet {...defaultProps} />);
    expect(screen.getByText(CENTRE_NAME)).toBeTruthy();
  });

  it('calls onArchive when Archive button is clicked', async () => {
    render(<ArchiveHubSheet {...defaultProps} />);
    await act(async () => { screen.getByTestId('archive-confirm-btn').click(); });
    expect(defaultProps.onArchive).toHaveBeenCalledTimes(1);
  });

  it('calls onClose after successful archive', async () => {
    render(<ArchiveHubSheet {...defaultProps} />);
    await act(async () => { screen.getByTestId('archive-confirm-btn').click(); });
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows error message when onArchive returns error', async () => {
    const props = { ...defaultProps, onArchive: vi.fn().mockResolvedValue({ error: new Error('fail') }) };
    render(<ArchiveHubSheet {...props} />);
    await act(async () => { screen.getByTestId('archive-confirm-btn').click(); });
    expect(screen.getByText(/Couldn't archive/)).toBeTruthy();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it('navigates to delete step when "Permanently delete" link clicked', async () => {
    render(<ArchiveHubSheet {...defaultProps} />);
    await act(async () => { screen.getByTestId('archive-delete-link').click(); });
    expect(screen.getByTestId('delete-name-input')).toBeTruthy();
    expect(screen.getByText(/Permanently delete\?/)).toBeTruthy();
  });

  it('delete button is disabled when name input is empty', async () => {
    render(<ArchiveHubSheet {...defaultProps} />);
    await act(async () => { screen.getByTestId('archive-delete-link').click(); });
    expect(screen.getByTestId('delete-forever-btn').disabled).toBe(true);
  });

  it('delete button is disabled when name input does not match', async () => {
    render(<ArchiveHubSheet {...defaultProps} />);
    await act(async () => { screen.getByTestId('archive-delete-link').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('delete-name-input'), { target: { value: 'wrong name' } });
    });
    expect(screen.getByTestId('delete-forever-btn').disabled).toBe(true);
  });

  it('delete button is enabled when name input matches exactly', async () => {
    render(<ArchiveHubSheet {...defaultProps} />);
    await act(async () => { screen.getByTestId('archive-delete-link').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('delete-name-input'), { target: { value: CENTRE_NAME } });
    });
    expect(screen.getByTestId('delete-forever-btn').disabled).toBe(false);
  });

  it('calls onPermanentDelete when Delete Forever clicked with matching name', async () => {
    render(<ArchiveHubSheet {...defaultProps} />);
    await act(async () => { screen.getByTestId('archive-delete-link').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('delete-name-input'), { target: { value: CENTRE_NAME } });
    });
    await act(async () => { screen.getByTestId('delete-forever-btn').click(); });
    expect(defaultProps.onPermanentDelete).toHaveBeenCalledTimes(1);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows error when onPermanentDelete returns error', async () => {
    const props = { ...defaultProps, onPermanentDelete: vi.fn().mockResolvedValue({ error: new Error('fail') }) };
    render(<ArchiveHubSheet {...props} />);
    await act(async () => { screen.getByTestId('archive-delete-link').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('delete-name-input'), { target: { value: CENTRE_NAME } });
    });
    await act(async () => { screen.getByTestId('delete-forever-btn').click(); });
    expect(screen.getByText(/Couldn't delete/)).toBeTruthy();
  });

  it('Back button returns to archive step', async () => {
    render(<ArchiveHubSheet {...defaultProps} />);
    await act(async () => { screen.getByTestId('archive-delete-link').click(); });
    expect(screen.getByTestId('delete-name-input')).toBeTruthy();
    await act(async () => { screen.getByTestId('delete-back-btn').click(); });
    expect(screen.queryByTestId('delete-name-input')).toBeNull();
    expect(screen.getByTestId('archive-confirm-btn')).toBeTruthy();
  });

  it('resets step and name input when reopened', async () => {
    const { rerender } = render(<ArchiveHubSheet {...defaultProps} />);
    await act(async () => { screen.getByTestId('archive-delete-link').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('delete-name-input'), { target: { value: 'some text' } });
    });
    rerender(<ArchiveHubSheet {...defaultProps} isOpen={false} />);
    rerender(<ArchiveHubSheet {...defaultProps} isOpen={true} />);
    expect(screen.getByTestId('archive-confirm-btn')).toBeTruthy();
    expect(screen.queryByTestId('delete-name-input')).toBeNull();
  });

  it('calls onClose when backdrop is clicked', async () => {
    render(<ArchiveHubSheet {...defaultProps} />);
    // The backdrop is the div before the dialog; clicking it fires onClose
    const backdrop = screen.getByTestId('archive-hub-dialog').previousSibling;
    await act(async () => { backdrop.click(); });
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });
});
