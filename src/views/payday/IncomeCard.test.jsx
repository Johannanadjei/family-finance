/**
 * views/payday/IncomeCard.test.jsx
 * Written before IncomeCard.jsx — TDD.
 */

import { describe, it, expect, vi }      from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { IncomeCard }                    from './IncomeCard';
import { mockFmt, mockIncomes }          from '../../test-utils/fixtures';

const pendingIncome = mockIncomes[1]; // Dita Salary, not received
const receivedIncome = mockIncomes[0]; // Adjei Salary, received

const renderCard = (props = {}) =>
  render(
    <IncomeCard
      income={pendingIncome}
      fmt={mockFmt}
      onConfirm={vi.fn()}
      onMarkPending={vi.fn()}
      onUpdateExpected={vi.fn().mockResolvedValue({ error: null })}
      disabled={false}
      {...props}
    />
  );

// A period whose end (Sat 31 Oct 2026) falls on a weekend, so a last-working-day
// source resolves to Fri 30 Oct — the case that used to resolve to nothing at all.
const OCT = { start_date: '2026-10-01', end_date: '2026-10-31' };
const lastWorkIncome = { ...pendingIncome, pay_day: null, pay_day_type: 'last_working_day' };

describe('IncomeCard — pay dates resolve against the period', () => {
  // THE bug: pay_day is null for this type, so the badge read "Flexible" directly above
  // a subtitle reading "Last working day", and the countdown block was skipped entirely.
  it('gives a last_working_day source a countdown and a real badge, not "Flexible"', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));       // 2 days before Fri 30 Oct
    renderCard({ income: lastWorkIncome, cycle: OCT });
    expect(screen.getByTestId(`income-next-pay-${lastWorkIncome.id}`).textContent).toBe('2 days away');
    expect(screen.getByText('Coming soon')).toBeTruthy();     // not the Flexible badge
    expect(screen.queryByText('Flexible')).toBeNull();
    vi.useRealTimers();
  });

  // Bug 4: the old midnight-vs-now comparison rolled the date to next month on the day
  // itself, so "Due today" and the "Today! 🎉" badge were unreachable.
  it('says Due today on the pay day itself', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));       // pendingIncome pays day 25
    renderCard({ cycle: OCT });
    expect(screen.getByTestId(`income-next-pay-${pendingIncome.id}`).textContent).toBe('Due today');
    vi.useRealTimers();
  });

  it('counts against the PERIOD, not the clock’s calendar month', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-20T12:00:00Z'));
    // Period runs 15 Sep – 14 Oct; a day-5 source pays 5 Oct, 15 days out. Anchored on
    // the clock's month it would have resolved to 5 Oct too — but as "next month", not
    // as a date inside this period.
    renderCard({ income: { ...pendingIncome, pay_day: 5 }, cycle: { start_date: '2026-09-15', end_date: '2026-10-14' } });
    expect(screen.getByTestId(`income-next-pay-${pendingIncome.id}`).textContent).toBe('15 days away');
    vi.useRealTimers();
  });

  // Countdown language belongs to the period you are living in; any other shows a date.
  it('shows a date instead of a countdown for a non-current period', () => {
    renderCard({ cycle: OCT, isCurrent: false });
    expect(screen.getByTestId(`income-next-pay-${pendingIncome.id}`).textContent).toBe('25 Oct 2026');
  });

  it('still shows no date for a genuinely flexible source, badge and subtitle agreeing', () => {
    renderCard({ income: { ...pendingIncome, pay_day: null, pay_day_type: 'flexible' }, cycle: OCT });
    expect(screen.queryByTestId(`income-next-pay-${pendingIncome.id}`)).toBeNull();
    // Both the schedule subtitle and the badge read "Flexible" — and for THIS type that
    // agreement is correct. The bug was a last_working_day source getting the same
    // badge while its subtitle said something else entirely.
    expect(screen.getAllByText('Flexible')).toHaveLength(2);
  });
});

describe('IncomeCard', () => {
  it('shows income label', () => {
    renderCard();
    expect(screen.getByText('Dita Salary')).toBeTruthy();
  });

  it('shows expected amount', () => {
    renderCard();
    expect(screen.getByTestId('income-expected-inc-2').textContent).toBe('GHS 15,000');
  });

  it('shows confirm received button when pending', () => {
    renderCard();
    expect(screen.getByText('Confirm Received')).toBeTruthy();
  });

  it('does not show mark pending button when pending', () => {
    renderCard();
    expect(screen.queryByText('Mark as Pending')).toBeNull();
  });

  it('shows received amount when received', () => {
    renderCard({ income: receivedIncome });
    expect(screen.getByTestId('income-received-inc-1').textContent).toBe('GHS 30,000');
  });

  it('shows mark as pending button when received', () => {
    renderCard({ income: receivedIncome });
    expect(screen.getByText('Mark as Pending')).toBeTruthy();
  });

  it('does not show confirm button when received', () => {
    renderCard({ income: receivedIncome });
    expect(screen.queryByText('Confirm Received')).toBeNull();
  });

  it('shows flexible label for flexible income', () => {
    const flexIncome = { ...pendingIncome, pay_day: null, pay_day_type: 'flexible' };
    renderCard({ income: flexIncome });
    expect(screen.getAllByText(/Flexible/).length).toBeGreaterThan(0);
  });

  it('does not render the income currency code in the meta line (hub-authoritative)', () => {
    // Regression: the hub is the single source of truth for currency — amounts use
    // the hub fmt, so a divergent income.currency (e.g. a legacy EUR row on a GHS
    // hub) must never surface as a label. Meta line shows only the pay schedule.
    const divergentIncome = { ...pendingIncome, currency: 'EUR' };
    renderCard({ income: divergentIncome });
    expect(screen.queryByText(/EUR/)).toBeNull();
    expect(screen.queryByText(/·/)).toBeNull();
    expect(screen.getByText('Day 25')).toBeTruthy();
  });

  it('calls onConfirm with income when confirm tapped', () => {
    const onConfirm = vi.fn();
    renderCard({ onConfirm });
    screen.getByText('Confirm Received').click();
    expect(onConfirm).toHaveBeenCalledWith(pendingIncome);
  });

  it('calls onMarkPending with sourceId when mark pending tapped', () => {
    const onMarkPending = vi.fn();
    renderCard({ income: receivedIncome, onMarkPending });
    screen.getByText('Mark as Pending').click();
    expect(onMarkPending).toHaveBeenCalledWith('inc-1');
  });

  it('disables buttons when disabled prop is true', () => {
    renderCard({ disabled: true });
    expect(screen.getByText('Confirming…').disabled).toBe(true);
  });

  it('shows edit pencil button on expected amount', () => {
    renderCard();
    expect(screen.getByLabelText('Edit expected amount')).toBeTruthy();
  });

  it('shows inline input when edit pencil tapped', async () => {
    renderCard();
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    expect(screen.getByTestId('edit-expected-input-inc-2')).toBeTruthy();
  });

  it('calls onUpdateExpected with sourceId, amount and extras when saved', async () => {
    const onUpdateExpected = vi.fn().mockResolvedValue({ error: null });
    renderCard({ onUpdateExpected });
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    fireEvent.change(screen.getByTestId('edit-expected-input-inc-2'), { target: { value: '20000' } });
    await act(async () => { screen.getByLabelText('Save expected amount').click(); });
    expect(onUpdateExpected).toHaveBeenCalledWith('inc-2', 20000, { pay_day_type: 'fixed_date', pay_day: 25 });
  });

  it('allows saving zero as expected amount', async () => {
    const onUpdateExpected = vi.fn().mockResolvedValue({ error: null });
    renderCard({ onUpdateExpected });
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    fireEvent.change(screen.getByTestId('edit-expected-input-inc-2'), { target: { value: '0' } });
    await act(async () => { screen.getByLabelText('Save expected amount').click(); });
    expect(onUpdateExpected).toHaveBeenCalledWith('inc-2', 0, { pay_day_type: 'fixed_date', pay_day: 25 });
  });

  it('shows pay day type select when editing', async () => {
    renderCard();
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    expect(screen.getByTestId('edit-pay-day-type-inc-2')).toBeTruthy();
  });

  it('pre-fills pay day type select with income pay_day_type', async () => {
    renderCard();
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    expect(screen.getByTestId('edit-pay-day-type-inc-2').value).toBe('fixed_date');
  });

  it('shows pay day input when pay_day_type is fixed_date', async () => {
    renderCard();
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    expect(screen.getByTestId('edit-pay-day-inc-2')).toBeTruthy();
  });

  it('hides pay day input when pay_day_type changed to flexible', async () => {
    renderCard();
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('edit-pay-day-type-inc-2'), { target: { value: 'flexible' } });
    });
    expect(screen.queryByTestId('edit-pay-day-inc-2')).toBeNull();
  });

  it('pre-fills pay day input with income pay_day', async () => {
    renderCard();
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    expect(screen.getByTestId('edit-pay-day-inc-2').value).toBe('25');
  });

  // ── Received amount update prompt ─────────────────────────────────────────

  it('shows received update prompt when editing received income and saving a different amount', async () => {
    const onUpdateExpected = vi.fn().mockResolvedValue({ error: null });
    renderCard({ income: receivedIncome, onUpdateExpected });
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    fireEvent.change(screen.getByTestId('edit-expected-input-inc-1'), { target: { value: '25000' } });
    await act(async () => { screen.getByLabelText('Save expected amount').click(); });
    expect(screen.getByTestId('received-update-prompt-inc-1')).toBeTruthy();
  });

  it('does not show prompt when saving same amount as received', async () => {
    const onUpdateExpected = vi.fn().mockResolvedValue({ error: null });
    renderCard({ income: receivedIncome, onUpdateExpected });
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    fireEvent.change(screen.getByTestId('edit-expected-input-inc-1'), { target: { value: '30000' } });
    await act(async () => { screen.getByLabelText('Save expected amount').click(); });
    expect(screen.queryByTestId('received-update-prompt-inc-1')).toBeNull();
  });

  it('does not show prompt when editing a pending (not received) income', async () => {
    const onUpdateExpected = vi.fn().mockResolvedValue({ error: null });
    renderCard({ onUpdateExpected });
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    fireEvent.change(screen.getByTestId('edit-expected-input-inc-2'), { target: { value: '20000' } });
    await act(async () => { screen.getByLabelText('Save expected amount').click(); });
    expect(screen.queryByTestId('received-update-prompt-inc-2')).toBeNull();
  });

  it('calls onMarkPending and onConfirm when yes update received tapped', async () => {
    const onUpdateExpected = vi.fn().mockResolvedValue({ error: null });
    const onMarkPending    = vi.fn().mockResolvedValue({ error: null });
    const onConfirm        = vi.fn();
    renderCard({ income: receivedIncome, onUpdateExpected, onMarkPending, onConfirm });
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    fireEvent.change(screen.getByTestId('edit-expected-input-inc-1'), { target: { value: '25000' } });
    await act(async () => { screen.getByLabelText('Save expected amount').click(); });
    await act(async () => { screen.getByTestId('received-update-confirm-inc-1').click(); });
    expect(onMarkPending).toHaveBeenCalledWith('inc-1');
    expect(onConfirm).toHaveBeenCalledWith(receivedIncome);
  });

  it('hides prompt and closes edit when keep as tapped', async () => {
    const onUpdateExpected = vi.fn().mockResolvedValue({ error: null });
    renderCard({ income: receivedIncome, onUpdateExpected });
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    fireEvent.change(screen.getByTestId('edit-expected-input-inc-1'), { target: { value: '25000' } });
    await act(async () => { screen.getByLabelText('Save expected amount').click(); });
    await act(async () => { screen.getByTestId('received-update-keep-inc-1').click(); });
    expect(screen.queryByTestId('received-update-prompt-inc-1')).toBeNull();
    expect(screen.queryByTestId('edit-expected-input-inc-1')).toBeNull();
  });

  it('shows error when amount is negative on save', async () => {
    renderCard();
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('edit-expected-input-inc-2'), { target: { value: '-100' } });
    });
    await act(async () => { screen.getByLabelText('Save expected amount').click(); });
    expect(screen.getByText('Please enter a valid amount')).toBeTruthy();
  });

  it('shows error when fixed_date pay day is out of range on save', async () => {
    renderCard();
    await act(async () => { screen.getByLabelText('Edit expected amount').click(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('edit-pay-day-inc-2'), { target: { value: '50' } });
    });
    await act(async () => { screen.getByLabelText('Save expected amount').click(); });
    expect(screen.getByText('Please enter a day between 1 and 31')).toBeTruthy();
  });
});
