/**
 * views/payday/PastIncomeCard.test.jsx
 * Pure display component — receives pre-formatted name + amount strings.
 */

import { describe, it, expect } from 'vitest';
import { render, screen }       from '@testing-library/react';
import { PastIncomeCard }       from './PastIncomeCard';

describe('PastIncomeCard', () => {
  it('renders the source name', () => {
    render(<PastIncomeCard name="Adjei Salary" amount="GHS 30,000" />);
    expect(screen.getByText('Adjei Salary')).toBeTruthy();
  });

  it('renders the pre-formatted amount string', () => {
    render(<PastIncomeCard name="Adjei Salary" amount="GHS 30,000" />);
    expect(screen.getByText('GHS 30,000')).toBeTruthy();
  });

  it('shows a Received status badge', () => {
    render(<PastIncomeCard name="Dita Salary" amount="GHS 15,000" />);
    expect(screen.getByText('Received')).toBeTruthy();
  });
});
