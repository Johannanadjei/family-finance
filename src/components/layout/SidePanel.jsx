/**
 * components/layout/SidePanel.jsx
 *
 * Hub switcher panel — slides in from left when the centre name is tapped.
 * Lists all control centres; tapping one switches the active hub.
 * Archived hubs rendered by ArchivedHubsList at the bottom of the list.
 */

import { useState }                        from 'react';
import { useNavigate }                     from 'react-router-dom';
import { ArchivedHubsList }                from './ArchivedHubsList';
import { getInstallPrompt, triggerInstall } from '../../lib/pwa';

const _isIOS        = /iphone|ipad|ipod/i.test(navigator.userAgent);
const _isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches ?? false;

export function SidePanel({ isOpen, onClose, centres, archivedCentres = [], activeCentreId, onSwitch, onCreateHub, onRestore, userPlan }) {
  const [hoveredRow,  setHoveredRow]  = useState(null);
  const [installing,  setInstalling]  = useState(false);
  const navigate                      = useNavigate();

  const handleInstall = async () => {
    setInstalling(true);
    await triggerInstall();
    setInstalling(false);
  };

  const handleSwitch = (centreId) => {
    if (centreId === activeCentreId) { onClose(); return; }
    onSwitch(centreId);
    onClose();
    navigate('/');
  };

  const atProLimit = userPlan === 'pro' && centres.length >= 10;
  const n          = centres.length;
  const countLabel = n === 0 ? 'Control Centres' : n === 1 ? '1 Control Centre' : `${n} Control Centres`;

  return (
    <>
      {isOpen && (
        <div onClick={onClose} aria-hidden="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 300 }} />
      )}

      <aside aria-label="Control centres" style={{
        position: 'fixed', top: 0,
        left: isOpen ? 'max(0px, calc(50vw - 220px))' : 'calc(max(0px, calc(50vw - 220px)) - 290px)',
        width: 290, height: '100dvh',
        background: 'var(--c-card, #fff)', zIndex: 400,
        transition: 'left .25s ease',
        boxShadow: isOpen ? '6px 0 32px rgba(0,0,0,.18)' : 'none',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '22px 20px 16px',
          background: 'linear-gradient(135deg, var(--c-header-from, #064e3b), var(--c-header-to, #0d7060))',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <p style={{ fontSize: 16, fontWeight: 900, color: '#fff', margin: '0 0 2px' }}>{countLabel}</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,.65)', margin: 0, fontWeight: 600 }}>Tap a hub to switch</p>
          </div>
          <button onClick={onClose} aria-label="Close panel" style={{
            background: 'rgba(255,255,255,.12)', border: 'none', borderRadius: 8,
            color: 'rgba(255,255,255,.9)', cursor: 'pointer', padding: '6px 8px',
            display: 'flex', alignItems: 'center', marginTop: 2,
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Centre list */}
        <div style={{ flex: 1, padding: '10px 0', overflowY: 'auto' }}>
          {centres.map(c => {
            const active  = c.id === activeCentreId;
            const hovered = hoveredRow === c.id && !active;
            return (
              <button key={c.id} onClick={() => handleSwitch(c.id)} aria-label={`Switch to ${c.name}`}
                onMouseEnter={() => setHoveredRow(c.id)} onMouseLeave={() => setHoveredRow(null)}
                style={{
                  width: '100%', padding: '12px 16px 12px 14px', textAlign: 'left',
                  background: active ? 'var(--c-chip-selected-bg, #f0fdf4)' : hovered ? 'var(--c-chip-bg, #f3f4f6)' : 'transparent',
                  borderTop: 'none', borderRight: 'none', borderBottom: 'none',
                  borderLeft: `4px solid ${active ? 'var(--c-primary, #064e3b)' : 'transparent'}`,
                  cursor: 'pointer', display: 'block', transition: 'background .15s',
                  fontFamily: "'Nunito', sans-serif",
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 11, flexShrink: 0,
                    background: active ? 'var(--c-primary, #064e3b)' : 'var(--c-bg, #f3f4f6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                  }}>
                    {c.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 900, margin: '0 0 2px', color: active ? 'var(--c-chip-selected-text, var(--c-primary, #064e3b))' : 'var(--c-text, #1c1917)' }}>
                      {c.name}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: 0 }}>{c.currency}</p>
                  </div>
                  {active ? (
                    <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--c-btn-text, #ffffff)', background: 'var(--c-primary, #064e3b)', padding: '3px 8px', borderRadius: 20, flexShrink: 0 }}>
                      Active
                    </span>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                      <path d="M5 3l4 4-4 4" stroke="var(--c-muted, #9ca3af)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              </button>
            );
          })}

          <ArchivedHubsList archivedCentres={archivedCentres} onRestore={onRestore} />
        </div>

        {/* Install prompt — contained block, no fixed/absolute positioning */}
        {!_isStandalone && (
          <div style={{ borderTop: '1px solid var(--c-border, #e5e7eb)', padding: '12px 16px', flexShrink: 0, width: '100%', boxSizing: 'border-box', fontFamily: "'Nunito', sans-serif" }}>
            {_isIOS ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flexShrink: 0, background: 'var(--c-accent-light, #f0fdf4)', borderRadius: 8, padding: '6px 8px', display: 'flex', alignItems: 'center', color: 'var(--c-primary, #064e3b)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 2v13M7 7l5-5 5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M20 13v7a1 1 0 01-1 1H5a1 1 0 01-1-1v-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
                  </svg>
                </div>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--c-muted, #6b7280)', lineHeight: 1.4 }}>
                  Tap <strong style={{ color: 'var(--c-text, #1c1917)' }}>Share</strong> → <strong style={{ color: 'var(--c-text, #1c1917)' }}>Add to Home Screen</strong>
                </p>
              </div>
            ) : getInstallPrompt() ? (
              <button onClick={handleInstall} disabled={installing} style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: 'var(--c-primary, #064e3b)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: installing ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif" }}>
                {installing ? 'Opening…' : '📲 Install Money B.O.S'}
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flexShrink: 0, background: 'var(--c-accent-light, #f0fdf4)', borderRadius: 8, padding: '6px 8px', display: 'flex', alignItems: 'center', color: 'var(--c-primary, #064e3b)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="5"  r="1.5" fill="currentColor"/>
                    <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                    <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
                  </svg>
                </div>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--c-muted, #6b7280)', lineHeight: 1.4 }}>
                  Tap <strong style={{ color: 'var(--c-text, #1c1917)' }}>⋮ menu</strong> → <strong style={{ color: 'var(--c-text, #1c1917)' }}>Add to Home Screen</strong>
                </p>
              </div>
            )}
          </div>
        )}

        {/* Footer — create / upgrade */}
        <div style={{ padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 20px))', borderTop: '1px solid var(--c-border, #e5e7eb)', flexShrink: 0 }}>
          {userPlan === 'free' ? (
            <div style={{ background: 'var(--c-bg, #f3f4f6)', borderRadius: 12, padding: '12px 14px' }}>
              <p style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: '0 0 8px', fontWeight: 700 }}>Free plan · 1 hub included</p>
              <button disabled style={{ width: '100%', padding: '11px', borderRadius: 10, border: '1.5px dashed var(--c-border, #e5e7eb)', background: 'transparent', color: 'var(--c-muted, #9ca3af)', fontSize: 14, fontWeight: 700, cursor: 'not-allowed', fontFamily: "'Nunito', sans-serif" }}>
                Upgrade to add more hubs
              </button>
            </div>
          ) : atProLimit ? (
            <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: 0, fontWeight: 600, textAlign: 'center' }}>Maximum 10 hubs reached</p>
          ) : (
            <button onClick={onCreateHub} style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              + New Control Centre
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
