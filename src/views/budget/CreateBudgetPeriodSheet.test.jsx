/**
 * views/budget/CreateBudgetPeriodSheet.test.jsx
 *
 * Two-mode period creator: a quick one-tap save of the next month this hub has no
 * period for, and the custom form (name + DD/MM/YYYY start/end + copy toggle).
 *
 * The quick range now comes from nextUncoveredMonthRange(cycles, today), so the suite
 * needs BOTH a frozen clock and a cycle list. Default: 2026-06-15 with JUNE covered
 * (the normal auto-continue world) → the offer is July 2026. Tests that care about the
 * uncovered-today case pass `cycles: []` explicitly. Only the Date object is faked,
 * leaving setTimeout real for RTL's async helpers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CreateBudgetPeriodSheet }   from './CreateBudgetPeriodSheet';

const ok = () => ({ error: null });
// A period covering the frozen "today" — auto-continue's normal end state, which is
// what makes "next month" the right quick-create offer.
const JUNE = { id: 'jun', start_date: '2026-06-01', end_date: '2026-06-30', deleted_at: null };
const DEC  = { id: 'dec', start_date: '2026-12-01', end_date: '2026-12-31', deleted_at: null };
const base = { isOpen: true, onClose: () => {}, cycles: [JUNE], onCreate: ok };

const renderSheet = (props = {}) => render(<CreateBudgetPeriodSheet {...base} {...props} />);
const goCustom = () => fireEvent.click(screen.getByTestId('custom-period-btn'));

describe('CreateBudgetPeriodSheet', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-06-15T12:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('renders nothing when closed', () => {
    renderSheet({ isOpen: false });
    expect(screen.queryByTestId('create-period-sheet')).toBeNull();
  });

  it('opens in choose mode with the next-month quick button labelled', () => {
    renderSheet();
    expect(screen.getByTestId('quick-next-month-btn').textContent).toContain('July 2026');
    expect(screen.getByTestId('custom-period-btn')).toBeTruthy();
  });

  it('quick-create calls onCreate with the next-month range and no copy', async () => {
    const onCreate = vi.fn().mockResolvedValue({ error: null });
    renderSheet({ onCreate });
    fireEvent.click(screen.getByTestId('quick-next-month-btn'));
    expect(onCreate).toHaveBeenCalledWith({
      name: null, startDate: '2026-07-01', endDate: '2026-07-31', copyPrevious: false,
    });
  });

  it('Custom button reveals the form pre-filled from the next-month range', () => {
    renderSheet();
    goCustom();
    expect(screen.getByTestId('period-start-day').value).toBe('1');
    expect(screen.getByTestId('period-start-month').value).toBe('7');
    expect(screen.getByTestId('period-start-year').value).toBe('2026');
    // suggested name follows the start month until edited
    expect(screen.getByTestId('period-name-input').value).toBe('July 2026');
  });

  it('custom save passes the entered dates + suggested name (copy off by default)', async () => {
    const onCreate = vi.fn().mockResolvedValue({ error: null });
    renderSheet({ onCreate });
    goCustom();
    fireEvent.click(screen.getByTestId('period-save-btn'));
    expect(onCreate).toHaveBeenCalledWith({
      name: 'July 2026', startDate: '2026-07-01', endDate: '2026-07-31', copyPrevious: false,
    });
  });

  it('blank name → onCreate receives name: null (server auto-names)', () => {
    const onCreate = vi.fn().mockResolvedValue({ error: null });
    renderSheet({ onCreate });
    goCustom();
    fireEvent.change(screen.getByTestId('period-name-input'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('period-save-btn'));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ name: null }));
  });

  it('passes copyPrevious: true when the toggle is on', () => {
    const onCreate = vi.fn().mockResolvedValue({ error: null });
    renderSheet({ onCreate });
    goCustom();
    fireEvent.click(screen.getByTestId('copy-prev-toggle'));
    fireEvent.click(screen.getByTestId('period-save-btn'));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ copyPrevious: true }));
  });

  it('rejects an invalid date without calling onCreate', () => {
    const onCreate = vi.fn().mockResolvedValue({ error: null });
    renderSheet({ onCreate });
    goCustom();
    fireEvent.change(screen.getByTestId('period-start-day'), { target: { value: '99' } });
    fireEvent.click(screen.getByTestId('period-save-btn'));
    expect(screen.getByText(/valid start and end dates/i)).toBeTruthy();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('rejects an end date before the start date', () => {
    const onCreate = vi.fn().mockResolvedValue({ error: null });
    renderSheet({ onCreate });
    goCustom();
    // set end to 2026-06-01, before the 2026-07-01 start
    fireEvent.change(screen.getByTestId('period-end-day'),   { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('period-end-month'), { target: { value: '6' } });
    fireEvent.change(screen.getByTestId('period-end-year'),  { target: { value: '2026' } });
    fireEvent.click(screen.getByTestId('period-save-btn'));
    expect(screen.getByText(/on or after the start date/i)).toBeTruthy();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('shows a friendly overlap message when onCreate returns CYC01', async () => {
    const onCreate = vi.fn().mockResolvedValue({ error: { code: 'CYC01', message: 'overlap' } });
    renderSheet({ onCreate });
    fireEvent.click(screen.getByTestId('quick-next-month-btn'));
    expect(await screen.findByText(/overlaps an existing budget period/i)).toBeTruthy();
  });

  it('Back returns to choose mode', () => {
    renderSheet();
    goCustom();
    fireEvent.click(screen.getByTestId('period-cancel-btn'));
    expect(screen.getByTestId('quick-next-month-btn')).toBeTruthy();
  });

  // ── The quick range is hub-aware now (was blindly today + 1 month) ──────────────
  it('offers THIS month when no period covers today (auto-continue did not run)', () => {
    const onCreate = vi.fn().mockResolvedValue({ error: null });
    renderSheet({ onCreate, cycles: [] });
    expect(screen.getByTestId('quick-next-month-btn').textContent).toContain('June 2026');
    fireEvent.click(screen.getByTestId('quick-next-month-btn'));
    expect(onCreate).toHaveBeenCalledWith({
      name: null, startDate: '2026-06-01', endDate: '2026-06-30', copyPrevious: false,
    });
  });

  it('skips a month already planned rather than offering it and taking a CYC01 back', () => {
    const JULY = { id: 'jul', start_date: '2026-07-01', end_date: '2026-07-31', deleted_at: null };
    const onCreate = vi.fn().mockResolvedValue({ error: null });
    renderSheet({ onCreate, cycles: [JUNE, JULY] });
    expect(screen.getByTestId('quick-next-month-btn').textContent).toContain('August 2026');
    fireEvent.click(screen.getByTestId('quick-next-month-btn'));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      startDate: '2026-08-01', endDate: '2026-08-31',
    }));
  });

  it('quick-create stays enabled in December while December itself is uncovered', () => {
    vi.setSystemTime(new Date('2026-12-10T12:00:00Z'));
    const onCreate = vi.fn().mockResolvedValue({ error: null });
    renderSheet({ onCreate, cycles: [] });
    const btn = screen.getByTestId('quick-next-month-btn');
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toContain('December 2026');
  });

  // ── Phase 2: Cancel affordance (Bug 2) ──────────────────────────────────────────
  it('choose mode shows a Cancel button wired to onClose', () => {
    const onClose = vi.fn();
    renderSheet({ onClose });
    fireEvent.click(screen.getByTestId('period-close-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── December cross-year disables quick-create (Bug 1) ───────────────────────────
  it('disables quick-create in December once December is covered, with the wait-for-next-year message', () => {
    vi.setSystemTime(new Date('2026-12-10T12:00:00Z'));
    const onCreate = vi.fn().mockResolvedValue({ error: null });
    renderSheet({ onCreate, cycles: [DEC] });
    const btn = screen.getByTestId('quick-next-month-btn');
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('Wait until 2027 to plan ahead');
    fireEvent.click(btn);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('custom mode in December pre-fills the current month (within this year)', () => {
    vi.setSystemTime(new Date('2026-12-10T12:00:00Z'));
    renderSheet({ cycles: [DEC] });
    goCustom();
    expect(screen.getByTestId('period-start-month').value).toBe('12');
    expect(screen.getByTestId('period-start-year').value).toBe('2026');
  });

  // ── Phase 2: custom-period year constraint (pre-submit guard + CYC03) ────────────
  it('rejects a custom period that spills into next year, without calling onCreate', () => {
    const onCreate = vi.fn().mockResolvedValue({ error: null });
    renderSheet({ onCreate });
    goCustom();
    // start stays 2026-07-01; push the end into 2027
    fireEvent.change(screen.getByTestId('period-end-year'), { target: { value: '2027' } });
    fireEvent.click(screen.getByTestId('period-save-btn'));
    expect(screen.getByText(/must be within 2026/i)).toBeTruthy();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('shows the year-constraint message when onCreate returns CYC03', async () => {
    const onCreate = vi.fn().mockResolvedValue({ error: { code: 'CYC03', message: 'year' } });
    renderSheet({ onCreate });
    fireEvent.click(screen.getByTestId('quick-next-month-btn'));
    expect(await screen.findByText(/must be within 2026/i)).toBeTruthy();
  });
});
