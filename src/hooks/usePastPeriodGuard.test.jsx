/**
 * hooks/usePastPeriodGuard.test.jsx
 *
 * Tested through a tiny harness (the hook owns UI), exercising routing + the modal
 * callbacks end-to-end.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { usePastPeriodGuard } from './usePastPeriodGuard';

function Harness({ isPast, periodLabel = 'May 2026', action }) {
  const { requestMutation, guardModal } = usePastPeriodGuard({ isPast, periodLabel });
  return (
    <>
      <button onClick={() => requestMutation(action)}>go</button>
      {guardModal}
    </>
  );
}

describe('usePastPeriodGuard', () => {
  it('runs the action immediately and shows no modal when not past', () => {
    const action = vi.fn();
    render(<Harness isPast={false} action={action} />);
    fireEvent.click(screen.getByText('go'));
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Edit past period?')).toBeNull();
  });

  it('holds the action and opens the modal (with the period name) when past', () => {
    const action = vi.fn();
    render(<Harness isPast periodLabel="January 2020" action={action} />);
    fireEvent.click(screen.getByText('go'));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText('Edit past period?')).toBeTruthy();
    expect(screen.getByText(/changing January 2020, which has ended/)).toBeTruthy();
  });

  it('Continue runs the held action and closes the modal', () => {
    const action = vi.fn();
    render(<Harness isPast action={action} />);
    fireEvent.click(screen.getByText('go'));
    fireEvent.click(screen.getByText('Continue'));
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Edit past period?')).toBeNull();
  });

  it('Cancel drops the held action and closes the modal', () => {
    const action = vi.fn();
    render(<Harness isPast action={action} />);
    fireEvent.click(screen.getByText('go'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(action).not.toHaveBeenCalled();
    expect(screen.queryByText('Edit past period?')).toBeNull();
  });
});
