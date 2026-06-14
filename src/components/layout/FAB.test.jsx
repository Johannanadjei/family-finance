/**
 * components/layout/FAB.test.jsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FAB }                       from './FAB';

describe('FAB', () => {
  it('renders with the fab-add-transaction testid and fires onClick when tapped', () => {
    const onClick = vi.fn();
    render(<FAB onClick={onClick} />);
    const btn = screen.getByTestId('fab-add-transaction');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
