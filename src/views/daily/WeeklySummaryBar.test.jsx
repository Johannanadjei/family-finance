/**
 * views/daily/WeeklySummaryBar.test.jsx
 * Written before WeeklySummaryBar.jsx — TDD.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen }           from '@testing-library/react';
import { WeeklySummaryBar }         from './WeeklySummaryBar';
import { mockFmt, mockWeeklyData }  from '../../test-utils/fixtures';

const renderBar = (props = {}) =>
  render(
    <WeeklySummaryBar
      weeklyData={mockWeeklyData}
      fmt={mockFmt}
      activeMonth="2026-05"
      {...props}
    />
  );

describe('WeeklySummaryBar', () => {
  it('shows all 5 week tabs', () => {
    renderBar();
    expect(screen.getByTestId('week-tab-Week 1')).toBeTruthy();
    expect(screen.getByTestId('week-tab-Week 2')).toBeTruthy();
    expect(screen.getByTestId('week-tab-Week 3')).toBeTruthy();
    expect(screen.getByTestId('week-tab-Week 4')).toBeTruthy();
    expect(screen.getByTestId('week-tab-Week 5')).toBeTruthy();
  });

  it('shows variable spending for each week', () => {
    renderBar();
    expect(screen.getByTestId('week-tab-Week 3').textContent).toContain('GHS 200');
  });

  it('shows zero spend for empty weeks', () => {
    renderBar();
    expect(screen.getByTestId('week-tab-Week 1').textContent).toContain('GHS 0');
  });

  it('does not highlight any week when viewing past month', () => {
    renderBar({ activeMonth: '2026-04' });
    const tabs = screen.getAllByTestId(/week-tab-/);
    const highlighted = tabs.filter(t => t.getAttribute('data-active') === 'true');
    expect(highlighted.length).toBe(0);
  });

  it('highlights current week when viewing current month', () => {
    renderBar({ activeMonth: '2026-05' });
    const tabs = screen.getAllByTestId(/week-tab-/);
    const highlighted = tabs.filter(t => t.getAttribute('data-active') === 'true');
    expect(highlighted.length).toBe(1);
  });
});
