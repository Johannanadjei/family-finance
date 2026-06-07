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

  it('free + at cap: clicking upgrade opens the UpgradeModal, "Got it" closes it', () => {
    render(<HubFooter userPlan="free" hubCount={1} onCreateHub={vi.fn()} />);
    expect(screen.queryByText(/coming soon/i)).toBeNull();        // modal closed initially

    fireEvent.click(screen.getByText('Upgrade to add more hubs'));
    expect(screen.getByText(/reached your plan's hub limit/i)).toBeTruthy();
    expect(screen.getByText(/coming soon/i)).toBeTruthy();

    fireEvent.click(screen.getByText('Got it'));
    expect(screen.queryByText(/coming soon/i)).toBeNull();        // modal dismissed
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
});
