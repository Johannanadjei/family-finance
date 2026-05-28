/**
 * views/home/StatCard.test.jsx
 * Written before fixing StatCard — TDD.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { StatCard }                 from './StatCard';

const renderCard = (props = {}) =>
  render(
    <StatCard
      label="Budget Left"
      value="GHS 28,000"
      infoKey="fixed"
      activeInfo={null}
      onInfo={vi.fn()}
      {...props}
    />
  );

describe('StatCard', () => {
  it('renders label', () => {
    renderCard();
    expect(screen.getByText('Budget Left')).toBeTruthy();
  });

  it('renders formatted string value', () => {
    renderCard();
    expect(screen.getByText('GHS 28,000')).toBeTruthy();
  });

  it('renders subtitle when provided', () => {
    renderCard({ subtitle: 'Confirm income first' });
    expect(screen.getByText('Confirm income first')).toBeTruthy();
  });

  it('does not render subtitle when not provided', () => {
    renderCard();
    expect(screen.queryByText('Confirm income first')).toBeNull();
  });

  it('shows info tooltip when active', () => {
    renderCard({ activeInfo: 'fixed' });
    expect(screen.getByText('How much of your monthly budget is still unspent. Overspend draws from Spare Money.')).toBeTruthy();
  });

  it('hides info tooltip when not active', () => {
    renderCard({ activeInfo: null });
    expect(screen.queryByText('How much of your monthly budget is still unspent. Overspend draws from Spare Money.')).toBeNull();
  });

  it('calls onInfo when info button tapped', () => {
    const onInfo = vi.fn();
    renderCard({ onInfo });
    screen.getByLabelText('Info about Budget Left').click();
    expect(onInfo).toHaveBeenCalledWith('fixed');
  });

  it('calls onInfo with null when already active — dismisses', () => {
    const onInfo = vi.fn();
    renderCard({ activeInfo: 'fixed', onInfo });
    screen.getByLabelText('Info about Budget Left').click();
    expect(onInfo).toHaveBeenCalledWith(null);
  });
});
