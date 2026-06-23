/**
 * features/onboarding/steps/StepHubType.test.jsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { StepHubType }              from './StepHubType';
import { HUB_TYPES }                from '../../../lib/hubTypes';

const renderStep = (props = {}) =>
  render(
    <StepHubType
      selected={null}
      onSelect={vi.fn()}
      onNext={vi.fn()}
      onBack={vi.fn()}
      {...props}
    />
  );

describe('StepHubType', () => {
  it('renders a tile for every hub type', () => {
    renderStep();
    HUB_TYPES.forEach(h => {
      expect(screen.getByText(h.label)).toBeTruthy();
    });
  });

  it('renders each hub type description', () => {
    renderStep();
    HUB_TYPES.forEach(h => {
      expect(screen.getByText(h.description)).toBeTruthy();
    });
  });

  it('Continue button is disabled when nothing is selected', () => {
    renderStep();
    const btn = screen.getByText('Continue →');
    expect(btn.disabled).toBe(true);
  });

  it('Continue button enables after a type is selected', () => {
    renderStep({ selected: 'family_home' });
    const btn = screen.getByText('Continue →');
    expect(btn.disabled).toBe(false);
  });

  it('calls onSelect with hub type id when tile is clicked', () => {
    const onSelect = vi.fn();
    renderStep({ onSelect });
    screen.getByLabelText('Select Family Home').click();
    expect(onSelect).toHaveBeenCalledWith('family_home');
  });

  it('calls onNext with the selected id when Continue is clicked', () => {
    const onNext = vi.fn();
    renderStep({ selected: 'rental', onNext });
    screen.getByText('Continue →').click();
    expect(onNext).toHaveBeenCalledWith('rental');
  });

  it('does not call onNext when nothing is selected', () => {
    const onNext = vi.fn();
    renderStep({ onNext });
    screen.getByText('Continue →').click();
    expect(onNext).not.toHaveBeenCalled();
  });

  it('calls onBack when Back button clicked', () => {
    const onBack = vi.fn();
    renderStep({ onBack });
    screen.getByText('← Back').click();
    expect(onBack).toHaveBeenCalled();
  });

  it('does not show Back button when onBack is not provided', () => {
    renderStep({ onBack: undefined });
    expect(screen.queryByText('← Back')).toBeNull();
  });

  // ── testid coverage (Stage 1 traversal) ───────────────────────────────────
  it('exposes continue testid', () => {
    renderStep();
    expect(screen.getByTestId('hub-type-continue-btn')).toBeTruthy();
  });

  it('exposes back testid when onBack provided', () => {
    renderStep();
    expect(screen.getByTestId('hub-type-back-btn')).toBeTruthy();
  });

  it('omits back testid when onBack is not provided', () => {
    renderStep({ onBack: undefined });
    expect(screen.queryByTestId('hub-type-back-btn')).toBeNull();
  });
});
