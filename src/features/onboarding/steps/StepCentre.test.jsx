import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
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

  it('calls onNext with trimmed name and a default calendar anchor when valid', async () => {
    const onNext = vi.fn();
    renderStep({ data: { name: 'Test Centre', currency: 'GHS', icon: '🏠' }, onNext });
    await act(async () => { screen.getByText('Continue →').click(); });
    expect(onNext).toHaveBeenCalledWith({
      name: 'Test Centre', currency: 'GHS', icon: '🏠',
      cycle_anchor_type: 'calendar', cycle_anchor_day: null,
    });
  });

  it('shows all centre icon options', () => {
    renderStep();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(1);
  });

  // ── Configure budget cycle (Commit 14b) ──────────────────────────────────────
  it('keeps the cycle picker hidden until "Configure budget cycle" is clicked', () => {
    renderStep();
    expect(screen.queryByTestId('cycle-anchor-select')).toBeNull();
    act(() => { screen.getByTestId('configure-cycle-toggle').click(); });
    expect(screen.getByTestId('cycle-anchor-select')).toBeTruthy();
  });

  it('reveals the day input only for the fixed_day anchor', () => {
    renderStep();
    act(() => { screen.getByTestId('configure-cycle-toggle').click(); });
    expect(screen.queryByTestId('cycle-anchor-day')).toBeNull();
    act(() => { fireEvent.change(screen.getByTestId('cycle-anchor-select'), { target: { value: 'fixed_day' } }); });
    expect(screen.getByTestId('cycle-anchor-day')).toBeTruthy();
  });

  it('passes a configured fixed_day anchor + day through onNext', async () => {
    const onNext = vi.fn();
    renderStep({ data: { name: 'Test Centre', currency: 'GHS', icon: '🏠' }, onNext });
    act(() => { screen.getByTestId('configure-cycle-toggle').click(); });
    act(() => { fireEvent.change(screen.getByTestId('cycle-anchor-select'), { target: { value: 'fixed_day' } }); });
    act(() => { fireEvent.change(screen.getByTestId('cycle-anchor-day'), { target: { value: '25' } }); });
    await act(async () => { screen.getByText('Continue →').click(); });
    expect(onNext).toHaveBeenCalledWith(expect.objectContaining({ cycle_anchor_type: 'fixed_day', cycle_anchor_day: 25 }));
  });

  it('nulls the day for a non-fixed_day configured anchor', async () => {
    const onNext = vi.fn();
    renderStep({ data: { name: 'Test Centre', currency: 'GHS', icon: '🏠' }, onNext });
    act(() => { screen.getByTestId('configure-cycle-toggle').click(); });
    act(() => { fireEvent.change(screen.getByTestId('cycle-anchor-select'), { target: { value: 'last_working_day' } }); });
    await act(async () => { screen.getByText('Continue →').click(); });
    expect(onNext).toHaveBeenCalledWith(expect.objectContaining({ cycle_anchor_type: 'last_working_day', cycle_anchor_day: null }));
  });
});
