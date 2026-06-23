import { describe, it, expect, vi } from 'vitest';
import { render, screen, act }      from '@testing-library/react';
import { StepIncome }               from './StepIncome';
import { MAX_FREE_INCOMES }         from '../onboarding.constants';

const renderStep = (props = {}) =>
  render(
    <StepIncome
      data={[]}
      centreCurrency="GHS"
      plan="free"
      onNext={vi.fn()}
      onBack={vi.fn()}
      {...props}
    />
  );

describe('StepIncome', () => {
  it('renders step title', () => {
    renderStep();
    expect(screen.getByText('Add your income streams')).toBeTruthy();
  });

  it('starts with one empty income stream', () => {
    renderStep();
    expect(screen.getByText(/Income Stream/)).toBeTruthy();
  });

  it('shows add button on free plan when under limit', () => {
    renderStep({ plan: 'free', data: [] });
    expect(screen.getByText('+ Add income stream')).toBeTruthy();
  });

  it('hides add button and shows upgrade message at free plan limit', () => {
    const maxIncomes = Array.from({ length: MAX_FREE_INCOMES }, (_, i) => ({
      id: `inc-${i}`, label: `Income ${i}`, icon: '💰',
      expected_amount: 1000, currency: 'GHS', pay_day: null, pay_day_type: 'flexible', notes: '',
    }));
    renderStep({ plan: 'free', data: maxIncomes });
    expect(screen.queryByText('+ Add income stream')).toBeNull();
    expect(screen.getByText(/Upgrade to Pro/)).toBeTruthy();
  });

  it('shows add button on pro plan regardless of count', () => {
    const maxIncomes = Array.from({ length: MAX_FREE_INCOMES }, (_, i) => ({
      id: `inc-${i}`, label: `Income ${i}`, icon: '💰',
      expected_amount: 1000, currency: 'GHS', pay_day: null, pay_day_type: 'flexible', notes: '',
    }));
    renderStep({ plan: 'pro', data: maxIncomes });
    expect(screen.getByText('+ Add income stream')).toBeTruthy();
  });

  it('shows pay day input only when fixed_date selected', () => {
    const fixedIncome = [{
      id: 'inc-1', label: 'Salary', icon: '💰',
      expected_amount: 5000, currency: 'GHS',
      pay_day: 25, pay_day_type: 'fixed_date', notes: '',
    }];
    renderStep({ data: fixedIncome });
    expect(screen.getByPlaceholderText('Day of month (1-31)')).toBeTruthy();
  });

  it('hides pay day input for flexible type', () => {
    const flexIncome = [{
      id: 'inc-1', label: 'Salary', icon: '💰',
      expected_amount: 5000, currency: 'GHS',
      pay_day: null, pay_day_type: 'flexible', notes: '',
    }];
    renderStep({ data: flexIncome });
    expect(screen.queryByPlaceholderText('Day of month (1-31)')).toBeNull();
  });

  it('shows validation error when submitting with empty label', async () => {
    renderStep({ data: [] });
    await act(async () => { screen.getByText('Continue →').click(); });
    // Component starts with one empty stream — error is "needs a name" not "add at least one"
    expect(screen.getByText(/Every income stream needs a name/)).toBeTruthy();
  });

  it('calls onBack when back tapped', () => {
    const onBack = vi.fn();
    renderStep({ onBack });
    screen.getByText('← Back').click();
    expect(onBack).toHaveBeenCalled();
  });

  it('shows Skip button', () => {
    renderStep();
    expect(screen.getByText('Skip for now')).toBeTruthy();
  });

  it('calls onNext with empty array when skip tapped', () => {
    const onNext = vi.fn();
    renderStep({ onNext });
    screen.getByText('Skip for now').click();
    expect(onNext).toHaveBeenCalledWith([]);
  });

  // ── testid coverage (Stage 1 traversal) ───────────────────────────────────
  const twoStreams = [
    { id: 'inc-1', label: 'Salary', icon: '💰', expected_amount: 5000, currency: 'GHS', pay_day: null, pay_day_type: 'flexible', notes: '' },
    { id: 'inc-2', label: 'Side gig', icon: '💼', expected_amount: 800, currency: 'GHS', pay_day: null, pay_day_type: 'flexible', notes: '' },
  ];

  it('exposes nav + add + skip testids', () => {
    renderStep({ plan: 'free', data: [] });
    expect(screen.getByTestId('income-stream-add-btn')).toBeTruthy();
    expect(screen.getByTestId('income-stream-skip-btn')).toBeTruthy();
    expect(screen.getByTestId('income-stream-continue-btn')).toBeTruthy();
    expect(screen.getByTestId('income-stream-back-btn')).toBeTruthy();
  });

  it('exposes id-keyed per-card testids', () => {
    renderStep({ data: twoStreams });
    expect(screen.getByTestId('income-stream-label-inc-1')).toBeTruthy();
    expect(screen.getByTestId('income-stream-amount-inc-1')).toBeTruthy();
    expect(screen.getByTestId('income-stream-paydaytype-inc-1')).toBeTruthy();
    expect(screen.getByTestId('income-stream-label-inc-2')).toBeTruthy();
  });

  it('exposes per-card remove testid only when more than one stream', () => {
    renderStep({ data: twoStreams });
    expect(screen.getByTestId('income-stream-remove-inc-1')).toBeTruthy();
    expect(screen.getByTestId('income-stream-remove-inc-2')).toBeTruthy();
  });

  it('omits remove testid when only one stream', () => {
    renderStep({ data: [twoStreams[0]] });
    expect(screen.queryByTestId('income-stream-remove-inc-1')).toBeNull();
  });
});
