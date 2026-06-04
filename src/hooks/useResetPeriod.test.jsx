/**
 * hooks/useResetPeriod.test.jsx
 *
 * Drives the hook through a tiny harness component (it returns JSX, like
 * usePastPeriodGuard). FinanceContext is mocked so resetPeriod is a spy.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useResetPeriod } from './useResetPeriod';

let mockResetPeriod = vi.fn().mockResolvedValue({ data: { categories_reset: 0, transactions_reset: 0 }, error: null });
let mockReloadCategories = vi.fn().mockResolvedValue(undefined);
vi.mock('../context/FinanceContext', () => ({
  useFinanceContext: () => ({ resetPeriod: mockResetPeriod }),
}));
vi.mock('../context/BudgetCentreContext', () => ({
  useBudgetCentreContext: () => ({ reloadCategories: mockReloadCategories }),
}));

const FUTURE = { id: 'cyc-future', name: 'August 2026', start_date: '2026-08-01', end_date: '2026-08-31' };

function Harness({ target, onClose }) {
  const { resetModal } = useResetPeriod({ target, onClose });
  return resetModal;
}

describe('useResetPeriod', () => {
  beforeEach(() => {
    mockResetPeriod = vi.fn().mockResolvedValue({ data: { categories_reset: 2, transactions_reset: 3 }, error: null });
    mockReloadCategories = vi.fn().mockResolvedValue(undefined);
  });

  it('renders nothing when no target (modal closed)', () => {
    render(<Harness target={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the reset confirm naming the period, with a danger Reset button', () => {
    render(<Harness target={FUTURE} onClose={vi.fn()} />);
    expect(screen.getByText('Reset August 2026?')).toBeTruthy();
    expect(screen.getByText(/only August 2026 — other periods are not changed/)).toBeTruthy();
    const resetBtn = screen.getByText('Reset');
    expect(resetBtn.style.background).toMatch(/dc2626|c-danger/);
  });

  it('Cancel closes without calling resetPeriod', () => {
    const onClose = vi.fn();
    render(<Harness target={FUTURE} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockResetPeriod).not.toHaveBeenCalled();
  });

  it('Confirm closes optimistically and calls resetPeriod with the cycle id', async () => {
    const onClose = vi.fn();
    render(<Harness target={FUTURE} onClose={onClose} />);
    fireEvent.click(screen.getByText('Reset'));
    expect(onClose).toHaveBeenCalledTimes(1);                       // optimistic close
    await waitFor(() => expect(mockResetPeriod).toHaveBeenCalledWith('cyc-future'));
  });

  it('re-syncs categories after a successful reset (the cache-coherency fix)', async () => {
    render(<Harness target={FUTURE} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Reset'));
    await waitFor(() => expect(mockReloadCategories).toHaveBeenCalledTimes(1));
  });

  it('does NOT re-sync categories when the reset fails', async () => {
    mockResetPeriod = vi.fn().mockResolvedValue({ data: null, error: { code: 'CYC04', message: 'cannot reset' } });
    render(<Harness target={FUTURE} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Reset'));
    expect(await screen.findByText(/Couldn't reset this period/)).toBeTruthy();
    expect(mockReloadCategories).not.toHaveBeenCalled();
  });

  it('surfaces an error toast when resetPeriod fails (CYC04 / role-denied)', async () => {
    mockResetPeriod = vi.fn().mockResolvedValue({ data: null, error: { code: 'CYC04', message: 'cannot reset' } });
    render(<Harness target={FUTURE} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Reset'));
    expect(await screen.findByText(/Couldn't reset this period/)).toBeTruthy();
  });
});
