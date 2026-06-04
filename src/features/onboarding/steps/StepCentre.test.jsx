import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { StepCentre }               from './StepCentre';

const renderStep = (props = {}) =>
  render(
    <StepCentre
      data={{ name: '', currency: 'GHS', icon: '🏠' }}
      onNext={vi.fn()}
      {...props}
    />
  );

describe('StepCentre', () => {
  it('renders step title', () => {
    renderStep();
    expect(screen.getByText('Name your BOS Hub')).toBeTruthy();
  });

  it('renders name input', () => {
    renderStep();
    expect(screen.getByPlaceholderText("e.g. The Adjei's")).toBeTruthy();
  });

  it('renders currency selector', () => {
    renderStep();
    expect(screen.getByDisplayValue('GHS — Ghanaian Cedi')).toBeTruthy();
  });

  it('shows validation error when name is empty', async () => {
    renderStep();
    await act(async () => { screen.getByText('Continue →').click(); });
    expect(screen.getByText(/Please give your BOS Hub a name/)).toBeTruthy();
  });

  it('does not call onNext when name is empty', async () => {
    const onNext = vi.fn();
    renderStep({ onNext });
    await act(async () => { screen.getByText('Continue →').click(); });
    expect(onNext).not.toHaveBeenCalled();
  });

  it('calls onNext with the trimmed name, currency, and icon when valid', async () => {
    const onNext = vi.fn();
    renderStep({ data: { name: 'Test Centre', currency: 'GHS', icon: '🏠' }, onNext });
    await act(async () => { screen.getByText('Continue →').click(); });
    expect(onNext).toHaveBeenCalledWith({ name: 'Test Centre', currency: 'GHS', icon: '🏠' });
  });

  it('shows all centre icon options', () => {
    renderStep();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(1);
  });
});
