/**
 * components/ui/InstallPrompt.test.jsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../lib/pwa', () => ({
  getInstallPrompt:   vi.fn(() => null),
  triggerInstall:     vi.fn(async () => ({ outcome: 'accepted' })),
  clearInstallPrompt: vi.fn(),
}));

import { getInstallPrompt, triggerInstall } from '../../lib/pwa';

// Helper to set matchMedia return value
const setStandalone = (matches) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({ matches, media: '', onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }),
  });
};

// Helper to set userAgent (for iOS detection)
const setUserAgent = (ua) => {
  Object.defineProperty(navigator, 'userAgent', { writable: true, value: ua });
};

// Import after mocks are set up — module-level constants (isIOS, isStandalone) are
// evaluated once on import, so we must set UA and matchMedia before importing.
// We reimport for iOS-specific tests via vi.resetModules().

describe('InstallPrompt — Android (non-standalone, no prompt yet)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    setUserAgent('Mozilla/5.0 Chrome/120');
    setStandalone(false);
    getInstallPrompt.mockReturnValue(null);
    triggerInstall.mockResolvedValue({ outcome: 'accepted' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when no prompt is available', async () => {
    const { InstallPrompt } = await import('./InstallPrompt');
    render(<InstallPrompt />);
    expect(screen.queryByTestId('install-prompt')).toBeNull();
  });

  it('shows banner after pwaInstallReady event fires', async () => {
    getInstallPrompt.mockReturnValue(null);
    const { InstallPrompt } = await import('./InstallPrompt');
    render(<InstallPrompt />);
    await act(async () => {
      window.dispatchEvent(new CustomEvent('pwaInstallReady'));
    });
    // Note: the banner visibility depends on kind state which is set by the event
    // The component sets kind='android' when pwaInstallReady fires and !isIOS
    expect(screen.queryByTestId('install-prompt')).not.toBeNull();
  });

  it('shows banner immediately when prompt was already captured before mount', async () => {
    getInstallPrompt.mockReturnValue({ prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    const { InstallPrompt } = await import('./InstallPrompt');
    render(<InstallPrompt />);
    expect(screen.getByTestId('install-prompt')).toBeTruthy();
  });

  it('hides banner and sets sessionStorage on Dismiss', async () => {
    getInstallPrompt.mockReturnValue({ prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    const { InstallPrompt } = await import('./InstallPrompt');
    render(<InstallPrompt />);
    fireEvent.click(screen.getByTestId('install-prompt-dismiss'));
    expect(screen.queryByTestId('install-prompt')).toBeNull();
    expect(sessionStorage.getItem('ffc_install_dismissed')).toBe('1');
  });

  it('calls triggerInstall on Install click', async () => {
    getInstallPrompt.mockReturnValue({ prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'accepted' }) });
    const { InstallPrompt } = await import('./InstallPrompt');
    render(<InstallPrompt />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('install-prompt-install'));
    });
    expect(triggerInstall).toHaveBeenCalledOnce();
  });

  it('does not show when session dismissed flag is set', async () => {
    sessionStorage.setItem('ffc_install_dismissed', '1');
    getInstallPrompt.mockReturnValue({ prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    const { InstallPrompt } = await import('./InstallPrompt');
    render(<InstallPrompt />);
    expect(screen.queryByTestId('install-prompt')).toBeNull();
  });
});

describe('InstallPrompt — standalone mode', () => {
  beforeEach(() => {
    sessionStorage.clear();
    setUserAgent('Mozilla/5.0 Chrome/120');
    setStandalone(true);
    // Reset module cache so isStandalone re-evaluates with matchMedia returning true
    vi.resetModules();
  });

  it('renders nothing in standalone mode', async () => {
    // Re-mock pwa after resetModules
    vi.doMock('../../lib/pwa', () => ({
      getInstallPrompt:   vi.fn(() => ({ prompt: vi.fn() })),
      triggerInstall:     vi.fn(async () => ({ outcome: 'accepted' })),
      clearInstallPrompt: vi.fn(),
    }));
    const { InstallPrompt } = await import('./InstallPrompt');
    render(<InstallPrompt />);
    expect(screen.queryByTestId('install-prompt')).toBeNull();
  });
});
