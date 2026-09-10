/**
 * views/settings/AddIncomeSourceForm.test.jsx
 *
 * The add form owns its input state and hands the parent (payload, cycleId).
 * The load-bearing contract: the period picker is ID-VALUED and `month` is never
 * in the payload — the mutation derives it from the chosen period.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent }       from '@testing-library/react';
import { AddIncomeSourceForm }                  from './AddIncomeSourceForm';
import { mockCycles, mockSplitMonthCycles }     from '../../test-utils/fixtures';

const onSave  = vi.fn().mockResolvedValue({ error: null });
const onSaved = vi.fn();

const renderForm = (props = {}) => render(
  <AddIncomeSourceForm
    periods={mockCycles}
    activeCycleId={mockCycles[0].id}
    currency="GHS"
    onSave={onSave}
    onSaved={onSaved}
    {...props}
  />
);

const typeLabel = async (value) => {
  await act(async () => {
    fireEvent.change(screen.getByTestId('new-source-label'), { target: { value } });
  });
};

beforeEach(() => {
  onSave.mockClear().mockResolvedValue({ error: null });
  onSaved.mockClear();
});

describe('AddIncomeSourceForm', () => {
  it('renders one option per period, defaulting to the active one', () => {
    renderForm();
    const select = screen.getByTestId('new-source-period');
    expect(select.value).toBe(mockCycles[0].id);
    expect(select.querySelectorAll('option')).toHaveLength(mockCycles.length);
  });

  it('labels each option with the period name and marks the active one', () => {
    renderForm();
    const options = [...screen.getByTestId('new-source-period').querySelectorAll('option')];
    expect(options[0].textContent).toContain(mockCycles[0].name);
    expect(options[0].textContent).toContain('this period');
    expect(options[1].textContent).not.toContain('this period');
  });

  it('saves with the period ID and NO month in the payload', async () => {
    renderForm();
    await typeLabel('Freelance');
    await act(async () => { screen.getByTestId('save-income-source-btn').click(); });

    expect(onSave).toHaveBeenCalledTimes(1);
    const [payload, cycleId] = onSave.mock.calls[0];
    expect(cycleId).toBe(mockCycles[0].id);
    expect(payload.label).toBe('Freelance');
    expect('month' in payload).toBe(false);   // derived downstream, never sent
    expect(onSaved).toHaveBeenCalledWith(mockCycles[0].id);
  });

  it('saves against a different period when one is picked', async () => {
    renderForm();
    await typeLabel('Bonus');
    await act(async () => {
      fireEvent.change(screen.getByTestId('new-source-period'), { target: { value: mockCycles[1].id } });
    });
    await act(async () => { screen.getByTestId('save-income-source-btn').click(); });

    expect(onSave.mock.calls[0][1]).toBe(mockCycles[1].id);
  });

  // Two options can share a calendar month; only their ids tell them apart. This is
  // the case the old month picker could not express at all.
  it('distinguishes two periods that start in the same month', async () => {
    renderForm({ periods: mockSplitMonthCycles, activeCycleId: 'cyc-sep-a' });
    const options = [...screen.getByTestId('new-source-period').querySelectorAll('option')];
    expect(options.map(o => o.value)).toEqual(['cyc-sep-a', 'cyc-sep-b']);
    expect(options[0].textContent).not.toBe(options[1].textContent);

    await typeLabel('Second September');
    await act(async () => {
      fireEvent.change(screen.getByTestId('new-source-period'), { target: { value: 'cyc-sep-b' } });
    });
    await act(async () => { screen.getByTestId('save-income-source-btn').click(); });

    expect(onSave.mock.calls[0][1]).toBe('cyc-sep-b');
  });

  it('rejects an empty label without calling onSave', async () => {
    renderForm();
    await act(async () => { screen.getByTestId('save-income-source-btn').click(); });
    expect(screen.getByText(/Please enter a source name/)).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range day for a fixed-date source', async () => {
    renderForm();
    await typeLabel('Salary');
    await act(async () => {
      fireEvent.change(screen.getByTestId('new-source-pay-day-type'), { target: { value: 'fixed_date' } });
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('new-source-pay-day'), { target: { value: '45' } });
    });
    await act(async () => { screen.getByTestId('save-income-source-btn').click(); });

    expect(screen.getByText(/between 1 and 31/)).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows an error and does not call onSaved when the save fails', async () => {
    onSave.mockResolvedValue({ error: new Error('nope') });
    renderForm();
    await typeLabel('Freelance');
    await act(async () => { screen.getByTestId('save-income-source-btn').click(); });

    expect(screen.getByText(/Could not save/)).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('refuses to save when the hub has no periods at all', async () => {
    renderForm({ periods: [], activeCycleId: null });
    expect(screen.getByTestId('new-source-period').textContent).toContain('No budget periods yet');
    await typeLabel('Freelance');
    await act(async () => { screen.getByTestId('save-income-source-btn').click(); });

    expect(screen.getByText(/Create a budget period first/)).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });
});
