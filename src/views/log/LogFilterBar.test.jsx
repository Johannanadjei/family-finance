/**
 * views/log/LogFilterBar.test.jsx
 * Written before LogFilterBar.jsx — TDD.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { LogFilterBar }             from './LogFilterBar';

const renderBar = (props = {}) =>
  render(
    <LogFilterBar
      filter="all"
      onFilter={vi.fn()}
      search=""
      onSearch={vi.fn()}
      {...props}
    />
  );

describe('LogFilterBar', () => {
  it('shows All filter tab', () => {
    renderBar();
    expect(screen.getByTestId('log-filter-all')).toBeTruthy();
  });

  it('shows Expenses filter tab', () => {
    renderBar();
    expect(screen.getByTestId('log-filter-expense')).toBeTruthy();
  });

  it('shows Income filter tab', () => {
    renderBar();
    expect(screen.getByTestId('log-filter-income')).toBeTruthy();
  });

  it('shows search input', () => {
    renderBar();
    expect(screen.getByTestId('log-search-input')).toBeTruthy();
  });

  it('calls onFilter with expense when Expenses tapped', () => {
    const onFilter = vi.fn();
    renderBar({ onFilter });
    screen.getByTestId('log-filter-expense').click();
    expect(onFilter).toHaveBeenCalledWith('expense');
  });

  it('calls onFilter with income when Income tapped', () => {
    const onFilter = vi.fn();
    renderBar({ onFilter });
    screen.getByTestId('log-filter-income').click();
    expect(onFilter).toHaveBeenCalledWith('income');
  });

  it('calls onFilter with all when All tapped', () => {
    const onFilter = vi.fn();
    renderBar({ filter: 'expense', onFilter });
    screen.getByTestId('log-filter-all').click();
    expect(onFilter).toHaveBeenCalledWith('all');
  });

  it('active filter tab is highlighted', () => {
    renderBar({ filter: 'expense' });
    const tab = screen.getByTestId('log-filter-expense');
    expect(tab.getAttribute('data-active')).toBe('true');
  });

  it('inactive tabs are not highlighted', () => {
    renderBar({ filter: 'expense' });
    expect(screen.getByTestId('log-filter-all').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('log-filter-income').getAttribute('data-active')).toBe('false');
  });
});
