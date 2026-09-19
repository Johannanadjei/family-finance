/**
 * views/budget/DateFields.test.jsx
 *
 * The DD/MM/YYYY row extracted from CreateBudgetPeriodSheet. Its one behaviour
 * beyond rendering is the digit-stripping keystroke filter.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DateFields }                from './DateFields';

const parts = { d: '18', m: '9', y: '2026' };
const renderFields = (props = {}) =>
  render(<DateFields label="Starts" parts={parts} onChange={vi.fn()} testid="period-start" {...props} />);

describe('DateFields', () => {
  it('renders the label and the three inputs with their values', () => {
    renderFields();
    expect(screen.getByText('Starts')).toBeTruthy();
    expect(screen.getByTestId('period-start-day').value).toBe('18');
    expect(screen.getByTestId('period-start-month').value).toBe('9');
    expect(screen.getByTestId('period-start-year').value).toBe('2026');
  });

  it('namespaces its testids by the testid prop', () => {
    renderFields({ testid: 'period-end' });
    expect(screen.getByTestId('period-end-day')).toBeTruthy();
  });

  it('reports the changed part and leaves the others alone', () => {
    const onChange = vi.fn();
    renderFields({ onChange });
    fireEvent.change(screen.getByTestId('period-start-day'), { target: { value: '21' } });
    expect(onChange).toHaveBeenCalledWith({ d: '21', m: '9', y: '2026' });
  });

  // The inputs are type="number", so the browser rejects a mixed string outright and
  // the field arrives empty — the handler's digit filter never sees it. Asserted as it
  // actually behaves, not as the filter implies: an empty field is the real outcome,
  // and the parent's isValidYMD check is what turns that into "enter valid dates".
  it('yields an empty field when a non-numeric value is entered', () => {
    const onChange = vi.fn();
    renderFields({ onChange });
    fireEvent.change(screen.getByTestId('period-start-month'), { target: { value: '1a2' } });
    expect(onChange).toHaveBeenCalledWith({ d: '18', m: '', y: '2026' });
  });

  it('clears a field without disturbing the others', () => {
    const onChange = vi.fn();
    renderFields({ onChange });
    fireEvent.change(screen.getByTestId('period-start-year'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ d: '18', m: '9', y: '' });
  });
});
