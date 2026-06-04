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
vi.mock('../context/FinanceContext', () => ({
  useFinanceContext: () => ({ resetPeriod: mockResetPeriod }),
}));

const FUTURE = { id: 'cyc-future', name: 'August 2026', start_date: '2026-08-01', end_date: '2026-08-31' };

function Harness({ target, onClose }) {
  const { resetModal } = useResetPeriod({ target, onClose });
  return resetModal;
}

describe('useResetPeriod', () => {
  beforeEach(() => {
    mockResetPeriod = vi.fn().mockResolvedValue({ data: { categories_reset: 2, transactions_reset: 3 }, error: null });
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

  it('surfaces an error toast when resetPeriod fails (CYC04 / 42501)', async () => {
    mockResetPeriod = vi.fn().mockResolvedValue({ data: null, error: { code: 'CYC04', message: 'cannot reset' } });
    render(<Harness target={FUTURE} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Reset'));
    expect(await screen.findByText(/Couldn't reset this period/)).toBeTruthy();
  });
});
