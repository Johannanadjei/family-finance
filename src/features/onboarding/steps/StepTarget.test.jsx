/**
 * features/onboarding/steps/StepTarget.test.jsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { StepTarget }               from './StepTarget';

const mockFmt = (n) => `GHS ${Math.round(n || 0).toLocaleString()}`;

const renderStep = (props = {}) =>
  render(
    <StepTarget
      data={0}
      totalIncome={45000}
      totalBudgeted={25400}
      fmt={mockFmt}
      onNext={vi.fn()}
      onBack={vi.fn()}
      {...props}
    />
  );

describe('StepTarget', () => {
  it('renders the step title', () => {
    renderStep();
    expect(screen.getByText('Set your surplus target')).toBeTruthy();
  });

  it('suggested surplus is income minus budgeted — not 10%', () => {
    renderStep({ totalIncome: 45000, totalBudgeted: 25400 });
    expect(screen.getByTestId('suggested-surplus').textContent).toBe('GHS 19,600');
  });

  it('shows zero suggestion when budgeted exceeds income', () => {
    renderStep({ totalIncome: 10000, totalBudgeted: 12000 });
    expect(screen.getByTestId('suggested-surplus').textContent).toBe('GHS 0');
  });

  it('shows income reference figure', () => {
    renderStep();
    expect(screen.getByTestId('total-income').textContent).toBe('GHS 45,000');
  });

  it('shows budgeted reference figure', () => {
    renderStep();
    expect(screen.getByTestId('total-budgeted').textContent).toBe('GHS 25,400');
  });

  it('input defaults to suggested surplus', () => {
    renderStep({ totalIncome: 45000, totalBudgeted: 25400 });
    expect(screen.getByTestId('surplus-input').value).toBe('19600');
  });

  it('calls onNext with parsed number', () => {
    const onNext = vi.fn();
    renderStep({ onNext });
    screen.getByText('Continue →').click();
    expect(onNext).toHaveBeenCalledWith(expect.any(Number));
  });

  it('calls onBack when back tapped', () => {
    const onBack = vi.fn();
    renderStep({ onBack });
    screen.getByText('← Back').click();
    expect(onBack).toHaveBeenCalled();
  });
});
