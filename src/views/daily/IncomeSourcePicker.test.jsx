/**
 * views/daily/IncomeSourcePicker.test.jsx
 *
 * The three-state contract (#4b): undefined = nothing picked, null = deliberate
 * one-off, uuid = linked. Conflating undefined with null is what would let
 * unattributable income be created silently again.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IncomeSourcePicker }        from './IncomeSourcePicker';

const SOURCES = [
  { id: 'src-1', label: 'Adjei' },
  { id: 'src-2', label: 'Dita' },
];

const renderPicker = (props = {}) =>
  render(
    <IncomeSourcePicker
      sources={SOURCES}
      value={undefined}
      onChange={vi.fn()}
      name=""
      onNameChange={vi.fn()}
      {...props}
    />
  );

describe('IncomeSourcePicker', () => {
  it('renders a chip per source plus the one-off option', () => {
    renderPicker();
    expect(screen.getByTestId('income-source-src-1').textContent).toBe('Adjei');
    expect(screen.getByTestId('income-source-src-2').textContent).toBe('Dita');
    expect(screen.getByTestId('income-source-other')).toBeTruthy();
  });

  it('still offers the one-off option when the hub has no sources', () => {
    renderPicker({ sources: [] });
    expect(screen.getByTestId('income-source-other')).toBeTruthy();
  });

  it('reports the chosen source id', () => {
    const onChange = vi.fn();
    renderPicker({ onChange });
    fireEvent.click(screen.getByTestId('income-source-src-2'));
    expect(onChange).toHaveBeenCalledWith('src-2');
  });

  it('reports null — not undefined — for Other / one-off', () => {
    const onChange = vi.fn();
    renderPicker({ onChange });
    fireEvent.click(screen.getByTestId('income-source-other'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('marks the active chip with aria-pressed', () => {
    renderPicker({ value: 'src-1' });
    expect(screen.getByTestId('income-source-src-1').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('income-source-other').getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the free-text name field only for one-off income', () => {
    const { rerender } = renderPicker({ value: 'src-1' });
    expect(screen.queryByTestId('add-category-input')).toBeNull();
    rerender(
      <IncomeSourcePicker sources={SOURCES} value={null} onChange={vi.fn()} name="" onNameChange={vi.fn()} />
    );
    expect(screen.getByTestId('add-category-input')).toBeTruthy();
  });

  it('reports one-off name edits', () => {
    const onNameChange = vi.fn();
    renderPicker({ value: null, onNameChange });
    fireEvent.change(screen.getByTestId('add-category-input'), { target: { value: 'Gift' } });
    expect(onNameChange).toHaveBeenCalledWith('Gift');
  });
});
