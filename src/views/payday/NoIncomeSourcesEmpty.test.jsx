/**
 * views/payday/NoIncomeSourcesEmpty.test.jsx
 *
 * Three-state rollforward empty state (Phase 2B):
 *   State 1 — no previous-month sources  → "+ Add manually" only.
 *   State 2 — exactly one  → "Yes, copy 1 source".
 *   State 3 — two or more  → "Yes, copy N sources".
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NoIncomeSourcesEmpty }      from './NoIncomeSourcesEmpty';

const base = {
  monthLabel:     'June 2026',
  lastMonthLabel: 'May 2026',
  prevSourceCount: 0,
  onCopyAll:      () => {},
  onChooseWhich:  () => {},
  onAddManually:  () => {},
};

describe('NoIncomeSourcesEmpty — three-state rollforward', () => {
  // ── State 1: no previous sources ──────────────────────────────────────────
  it('State 1 (no prev sources): shows "+ Add manually" only, no copy CTAs', () => {
    render(<NoIncomeSourcesEmpty {...base} prevSourceCount={0} />);
    expect(screen.getByText(/No income tracked for June 2026 yet/)).toBeTruthy();
    expect(screen.getByTestId('add-manually-btn')).toBeTruthy();
    expect(screen.queryByTestId('copy-all-btn')).toBeNull();
    expect(screen.queryByTestId('choose-which-btn')).toBeNull();
  });

  // ── State 2: exactly one previous source ──────────────────────────────────
  it('State 2 (1 prev source): shows "Yes, copy 1 source" with the question heading', () => {
    render(<NoIncomeSourcesEmpty {...base} prevSourceCount={1} />);
    expect(screen.getByText(/Income same as May 2026\?/)).toBeTruthy();
    expect(screen.getByTestId('copy-all-btn').textContent).toBe('Yes, copy 1 source');
    expect(screen.getByTestId('choose-which-btn')).toBeTruthy();
    expect(screen.getByTestId('add-manually-btn')).toBeTruthy();
  });

  // ── State 3: multiple previous sources (pluralised) ───────────────────────
  it('State 3 (3 prev sources): pluralises to "Yes, copy 3 sources"', () => {
    render(<NoIncomeSourcesEmpty {...base} prevSourceCount={3} />);
    expect(screen.getByTestId('copy-all-btn').textContent).toBe('Yes, copy 3 sources');
  });

  // ── Wiring ────────────────────────────────────────────────────────────────
  it('calls onCopyAll when the primary CTA is clicked', () => {
    const onCopyAll = vi.fn();
    render(<NoIncomeSourcesEmpty {...base} prevSourceCount={2} onCopyAll={onCopyAll} />);
    fireEvent.click(screen.getByTestId('copy-all-btn'));
    expect(onCopyAll).toHaveBeenCalledTimes(1);
  });

  it('calls onChooseWhich when the secondary CTA is clicked', () => {
    const onChooseWhich = vi.fn();
    render(<NoIncomeSourcesEmpty {...base} prevSourceCount={2} onChooseWhich={onChooseWhich} />);
    fireEvent.click(screen.getByTestId('choose-which-btn'));
    expect(onChooseWhich).toHaveBeenCalledTimes(1);
  });

  it('calls onAddManually when the add button is clicked', () => {
    const onAddManually = vi.fn();
    render(<NoIncomeSourcesEmpty {...base} prevSourceCount={2} onAddManually={onAddManually} />);
    fireEvent.click(screen.getByTestId('add-manually-btn'));
    expect(onAddManually).toHaveBeenCalledTimes(1);
  });

  // ── Loading + error ───────────────────────────────────────────────────────
  it('shows "Copying…" and disables the CTA while copying', () => {
    render(<NoIncomeSourcesEmpty {...base} prevSourceCount={2} copying />);
    const btn = screen.getByTestId('copy-all-btn');
    expect(btn.textContent).toBe('Copying…');
    expect(btn.disabled).toBe(true);
  });

  it('renders an inline error when copyError is set', () => {
    render(<NoIncomeSourcesEmpty {...base} prevSourceCount={2} copyError="Couldn't copy. Try again." />);
    expect(screen.getByText(/Couldn't copy\. Try again\./)).toBeTruthy();
  });
});
