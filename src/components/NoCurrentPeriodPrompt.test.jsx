/**
 * components/NoCurrentPeriodPrompt.test.jsx
 *
 * Visibility rule + CTA. "Today" is the real system clock, so cases are built around
 * it: a cycle spanning a wide window always contains today; a clearly past cycle never
 * does. No fake timers needed.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NoCurrentPeriodPrompt }      from './NoCurrentPeriodPrompt';

// A cycle wide enough to always contain "today" regardless of when the suite runs.
const ALWAYS_NOW   = [{ id: 'now', start_date: '2000-01-01', end_date: '2099-12-31', deleted_at: null }];
// A cycle that ended long ago — today is never inside it.
const LONG_PAST    = [{ id: 'old', start_date: '2000-01-01', end_date: '2000-12-31', deleted_at: null }];

describe('NoCurrentPeriodPrompt', () => {
  it('renders nothing when a live cycle contains today', () => {
    const { container } = render(<NoCurrentPeriodPrompt cycles={ALWAYS_NOW} onCreate={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the prompt when no cycle covers today', () => {
    render(<NoCurrentPeriodPrompt cycles={LONG_PAST} onCreate={vi.fn()} />);
    expect(screen.getByTestId('no-current-period-prompt')).toBeTruthy();
    expect(screen.getByText('No budget period for today')).toBeTruthy();
  });

  it('renders the prompt when there are no cycles at all', () => {
    render(<NoCurrentPeriodPrompt cycles={[]} onCreate={vi.fn()} />);
    expect(screen.getByTestId('no-current-period-prompt')).toBeTruthy();
  });

  it('ignores a soft-deleted cycle that would otherwise cover today', () => {
    const deletedNow = [{ ...ALWAYS_NOW[0], deleted_at: '2020-01-01T00:00:00Z' }];
    render(<NoCurrentPeriodPrompt cycles={deletedNow} onCreate={vi.fn()} />);
    expect(screen.getByTestId('no-current-period-prompt')).toBeTruthy();
  });

  it('calls onCreate when the CTA is clicked', () => {
    const onCreate = vi.fn();
    render(<NoCurrentPeriodPrompt cycles={LONG_PAST} onCreate={onCreate} />);
    fireEvent.click(screen.getByTestId('create-period-cta'));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
