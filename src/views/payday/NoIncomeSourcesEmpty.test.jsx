/**
 * views/payday/NoIncomeSourcesEmpty.test.jsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NoIncomeSourcesEmpty }      from './NoIncomeSourcesEmpty';

describe('NoIncomeSourcesEmpty', () => {
  it('renders the empty-state copy', () => {
    render(<NoIncomeSourcesEmpty onGoToSettings={() => {}} />);
    expect(screen.getByText(/No income sources set up yet/)).toBeTruthy();
  });

  it('calls onGoToSettings when the button is clicked', () => {
    const onGoToSettings = vi.fn();
    render(<NoIncomeSourcesEmpty onGoToSettings={onGoToSettings} />);
    fireEvent.click(screen.getByText('Go to Settings'));
    expect(onGoToSettings).toHaveBeenCalledTimes(1);
  });
});
