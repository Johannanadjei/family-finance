import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { FromSpareToggle }          from './FromSpareToggle';

describe('FromSpareToggle', () => {
  it('renders label and subtitle', () => {
    render(<FromSpareToggle on={false} onToggle={vi.fn()} />);
    expect(screen.getByText('Take from Spare Money')).toBeTruthy();
    expect(screen.getByText(/instead of from Budget/)).toBeTruthy();
  });

  it('reflects on prop via aria-pressed', () => {
    const { rerender } = render(<FromSpareToggle on={false} onToggle={vi.fn()} />);
    expect(screen.getByTestId('from-spare-toggle').getAttribute('aria-pressed')).toBe('false');
    rerender(<FromSpareToggle on={true} onToggle={vi.fn()} />);
    expect(screen.getByTestId('from-spare-toggle').getAttribute('aria-pressed')).toBe('true');
  });

  it('calls onToggle when tapped', () => {
    const onToggle = vi.fn();
    render(<FromSpareToggle on={false} onToggle={onToggle} />);
    screen.getByTestId('from-spare-toggle').click();
    expect(onToggle).toHaveBeenCalled();
  });
});
