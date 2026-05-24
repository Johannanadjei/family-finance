/**
 * views/pin/PinPad.test.jsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent }       from '@testing-library/react';
import { PinPad }                               from './PinPad';

const renderPad = (props = {}) =>
  render(<PinPad onComplete={vi.fn()} error={false} disabled={false} {...props} />);

describe('PinPad', () => {
  it('renders 10 digit keys (0–9)', () => {
    renderPad();
    for (let i = 0; i <= 9; i++) {
      expect(screen.getByTestId(`pin-key-${i}`)).toBeTruthy();
    }
  });

  it('renders a backspace button', () => {
    renderPad();
    expect(screen.getByTestId('pin-backspace')).toBeTruthy();
  });

  it('renders 4 dots in progress display', () => {
    renderPad();
    expect(screen.getByTestId('pin-dots')).toBeTruthy();
  });

  it('calls onComplete with entered 4-digit string after 4 presses', async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    renderPad({ onComplete });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-1')); });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-2')); });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-3')); });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-4')); vi.runAllTimers(); });
    expect(onComplete).toHaveBeenCalledWith('1234');
    vi.useRealTimers();
  });

  it('does not call onComplete before 4 digits', async () => {
    const onComplete = vi.fn();
    renderPad({ onComplete });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-1')); });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-2')); });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-3')); });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('backspace removes the last entered digit', async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    renderPad({ onComplete });
    // Enter 1, 2 — then backspace (removes 2) — then 9, 0, 5 → '1905' needs one more
    // Simpler: enter 1, 2, backspace → digits='1'; then 2,3,4 → '1234'
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-1')); });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-2')); });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-backspace')); });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-2')); });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-3')); });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-4')); vi.runAllTimers(); });
    expect(onComplete).toHaveBeenCalledWith('1234');
    vi.useRealTimers();
  });

  it('all digit buttons are disabled when disabled=true', () => {
    renderPad({ disabled: true });
    expect(screen.getByTestId('pin-key-0').disabled).toBe(true);
    expect(screen.getByTestId('pin-key-5').disabled).toBe(true);
    expect(screen.getByTestId('pin-backspace').disabled).toBe(true);
  });

  it('digit buttons are enabled when disabled=false', () => {
    renderPad({ disabled: false });
    expect(screen.getByTestId('pin-key-0').disabled).toBe(false);
  });

  it('does not call onComplete when disabled', async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    renderPad({ onComplete, disabled: true });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-1')); });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-2')); });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-3')); });
    await act(async () => { fireEvent.click(screen.getByTestId('pin-key-4')); vi.runAllTimers(); });
    expect(onComplete).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
