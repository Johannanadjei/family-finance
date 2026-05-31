/**
 * views/payday/PaydayIncomeBody.test.jsx
 *
 * Verifies the month-aware branch selection: future / past / current-empty /
 * current-with-sources.
 */

import { describe, it, expect } from 'vitest';
import { render, screen }       from '@testing-library/react';
import { PaydayIncomeBody }     from './PaydayIncomeBody';
import { mockFmt, mockIncomes } from '../../test-utils/fixtures';

const base = {
  isFutureMonth: false,
  isPastMonth: false,
  monthLabel: 'May 2026',
  lastMonthLabel: 'April 2026',
  pastIncomeTxs: [],
  incomes: mockIncomes,
  fmt: mockFmt,
  mutating: false,
  prevSourceCount: 0,
  copying: false,
  copyError: null,
  onCopyAll: () => {},
  onChooseWhich: () => {},
  onAddManually: () => {},
  onConfirm: () => {},
  onMarkPending: () => {},
  onUpdateExpected: () => {},
};

describe('PaydayIncomeBody', () => {
  it('future month: shows the "no payday data yet" placeholder', () => {
    render(<PaydayIncomeBody {...base} isFutureMonth incomes={[]} />);
    expect(screen.getByText(/No payday data for May 2026 yet/)).toBeTruthy();
  });

  it('past month with no income: shows the "no income recorded" placeholder', () => {
    render(<PaydayIncomeBody {...base} isPastMonth incomes={[]} pastIncomeTxs={[]} />);
    expect(screen.getByText(/No income recorded for May 2026/)).toBeTruthy();
  });

  it('past month with income txs: renders read-only past income cards', () => {
    render(<PaydayIncomeBody {...base} isPastMonth incomes={[]}
      pastIncomeTxs={[{ id: 'tx-i', category_name: 'Adjei Salary', amount: 12000 }]} />);
    expect(screen.getByText('Adjei Salary')).toBeTruthy();
    expect(screen.getByText('GHS 12,000')).toBeTruthy();
  });

  it('current month, no sources: renders the rollforward empty state', () => {
    render(<PaydayIncomeBody {...base} incomes={[]} prevSourceCount={2} />);
    expect(screen.getByText(/Income same as April 2026\?/)).toBeTruthy();
    expect(screen.getByTestId('copy-all-btn')).toBeTruthy();
  });

  it('current month with sources: renders the editable income list', () => {
    render(<PaydayIncomeBody {...base} />);
    expect(screen.getByText('Adjei Salary')).toBeTruthy();
    expect(screen.getByText('Dita Salary')).toBeTruthy();
  });
});
