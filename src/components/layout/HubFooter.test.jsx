/**
 * components/layout/HubFooter.test.jsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HubFooter }                 from './HubFooter';

describe('HubFooter', () => {
  it('free + at cap: shows an active "Upgrade to add more hubs" button', () => {
    render(<HubFooter userPlan="free" hubCount={1} onCreateHub={vi.fn()} />);
    const btn = screen.getByText('Upgrade to add more hubs');
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBeFalsy();   // no longer a dead disabled button
  });

  it('free + at cap: clicking upgrade opens the modal; its CTA delegates to onUpgradeNavigate', () => {
    const onUpgradeNavigate = vi.fn();
    render(<HubFooter userPlan="free" hubCount={1} onCreateHub={vi.fn()} onUpgradeNavigate={onUpgradeNavigate} />);
    expect(screen.queryByText(/reached your plan's hub limit/i)).toBeNull();   // modal closed initially

    fireEvent.click(screen.getByText('Upgrade to add more hubs'));
    expect(screen.getByText(/reached your plan's hub limit/i)).toBeTruthy();
    expect(screen.getByText(/manage up to 10 hubs/i)).toBeTruthy();            // present-tense Pro copy

    fireEvent.click(screen.getByText('Upgrade to Pro'));         // the modal's primary CTA
    expect(onUpgradeNavigate).toHaveBeenCalledTimes(1);          // SidePanel owns the close-drawer + navigate
    expect(screen.queryByText(/reached your plan's hub limit/i)).toBeNull();   // modal closed
  });

  it('pro + under cap: shows "+ New BOS Hub" and calls onCreateHub on click', () => {
    const onCreateHub = vi.fn();
    render(<HubFooter userPlan="pro" hubCount={2} onCreateHub={onCreateHub} />);
    fireEvent.click(screen.getByText('+ New BOS Hub'));
    expect(onCreateHub).toHaveBeenCalledTimes(1);
  });

  it('pro + at cap (10): shows the static "Maximum 10 hubs reached" message', () => {
    render(<HubFooter userPlan="pro" hubCount={10} onCreateHub={vi.fn()} />);
    expect(screen.getByText('Maximum 10 hubs reached')).toBeTruthy();
    expect(screen.queryByText('+ New BOS Hub')).toBeNull();
  });

  it('free + under cap (0 hubs): shows the create button, not the upgrade prompt', () => {
    render(<HubFooter userPlan="free" hubCount={0} onCreateHub={vi.fn()} />);
    expect(screen.getByText('+ New BOS Hub')).toBeTruthy();
    expect(screen.queryByText('Upgrade to add more hubs')).toBeNull();
  });

  it('exposes upgrade-add-hub-btn (free at-cap) and new-hub-btn (under-cap) testids', () => {
    const { rerender } = render(<HubFooter userPlan="free" hubCount={1} onCreateHub={vi.fn()} onUpgradeNavigate={vi.fn()} />);
    expect(screen.getByTestId('upgrade-add-hub-btn')).toBeTruthy();

    rerender(<HubFooter userPlan="free" hubCount={0} onCreateHub={vi.fn()} />);
    expect(screen.getByTestId('new-hub-btn')).toBeTruthy();
  });
});
