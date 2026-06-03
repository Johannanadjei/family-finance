import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MoveCycleSheet } from './MoveCycleSheet';

const CYCLES = [
  { id: 'cyc-jun', name: 'June 2026',  start_date: '2026-06-01', end_date: '2026-06-30', deleted_at: null },
  { id: 'cyc-apr', name: 'April 2026', start_date: '2026-04-01', end_date: '2026-04-30', deleted_at: null },
];

const renderSheet = (props = {}) =>
  render(
    <MoveCycleSheet
      isOpen={true}
      onClose={vi.fn()}
      cycles={CYCLES}
      onMove={vi.fn()}
      {...props}
    />
  );

describe('MoveCycleSheet', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders nothing when closed', () => {
    renderSheet({ isOpen: false });
    expect(screen.queryByTestId('move-cycle-sheet')).toBeNull();
  });

  it('lists the destination cycles by name when open', () => {
    renderSheet();
    expect(screen.getByText('June 2026')).toBeTruthy();
    expect(screen.getByText('April 2026')).toBeTruthy();
  });

  it('shows the empty state when there are no other periods', () => {
    renderSheet({ cycles: [] });
    expect(screen.getByTestId('move-cycle-empty')).toBeTruthy();
  });

  it('disables Confirm until a period is selected, then enables it', () => {
    renderSheet();
    expect(screen.getByTestId('move-confirm-btn').disabled).toBe(true);
    fireEvent.click(screen.getByTestId('move-cycle-option-cyc-jun'));
    expect(screen.getByTestId('move-confirm-btn').disabled).toBe(false);
  });

  it('calls onMove with the selected cycle id', () => {
    const onMove = vi.fn();
    renderSheet({ onMove });
    fireEvent.click(screen.getByTestId('move-cycle-option-cyc-apr'));
    fireEvent.click(screen.getByTestId('move-confirm-btn'));
    expect(onMove).toHaveBeenCalledWith('cyc-apr');
  });

  it('calls onClose when Cancel is tapped', () => {
    const onClose = vi.fn();
    renderSheet({ onClose });
    fireEvent.click(screen.getByTestId('move-cancel-btn'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a moving state with both buttons disabled while a move is in flight', () => {
    renderSheet({ moving: true });
    expect(screen.getByTestId('move-confirm-btn').textContent).toBe('Moving…');
    expect(screen.getByTestId('move-confirm-btn').disabled).toBe(true);
    expect(screen.getByTestId('move-cancel-btn').disabled).toBe(true);
  });
});
