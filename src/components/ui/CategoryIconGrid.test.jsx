/**
 * components/ui/CategoryIconGrid.test.jsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CategoryIconGrid, CATEGORY_ICONS } from './CategoryIconGrid';

describe('CategoryIconGrid', () => {
  it('renders a button for every icon', () => {
    render(<CategoryIconGrid value="🏠" onSelect={vi.fn()} />);
    CATEGORY_ICONS.forEach(icon => {
      expect(screen.getByLabelText(`Use icon ${icon}`)).toBeTruthy();
    });
  });

  it('marks the selected icon as pressed and others not', () => {
    render(<CategoryIconGrid value="🚗" onSelect={vi.fn()} />);
    expect(screen.getByLabelText('Use icon 🚗').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Use icon 🏠').getAttribute('aria-pressed')).toBe('false');
  });

  it('calls onSelect with the tapped icon', () => {
    const onSelect = vi.fn();
    render(<CategoryIconGrid value="🏠" onSelect={onSelect} />);
    fireEvent.click(screen.getByLabelText('Use icon 🛒'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('🛒');
  });
});
