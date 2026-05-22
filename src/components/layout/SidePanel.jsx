/**
 * components/layout/SidePanel.jsx
 *
 * Slides in from left when the centre name is tapped in Header.
 * Lists all control centres the user belongs to.
 * Tapping a centre switches the active hub.
 * Count in header is always accurate — never shows 0 while loading.
 *
 * @param {boolean}        isOpen
 * @param {function}       onClose
 * @param {BudgetCentre[]} centres
 * @param {string|null}    activeCentreId
 * @param {function}       onSwitch(centreId)  — called on hub tap
 * @param {function}       onCreateHub         — called when + New tapped (Phase 3)
 * @param {'free'|'pro'}   userPlan
 */

import { useState } from 'react';

export function SidePanel({ isOpen, onClose, centres, activeCentreId, onSwitch, onCreateHub, userPlan }) {
  const [hoveredClose, setHoveredClose] = useState(false);
  const [hoveredRow,   setHoveredRow]   = useState(null);

  const handleSwitch = (centreId) => {
    if (centreId === activeCentreId) { onClose(); return; }
    onSwitch(centreId);
    onClose();
  };

  const atProLimit = userPlan === 'pro' && centres.length >= 10;
  const canCreate  = userPlan === 'pro' && !atProLimit;

  const countLabel = centres.length === 0
    ? 'Control Centres'
    : centres.length === 1
      ? '1 Control Centre'
      : `${centres.length} Control Centres`;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          aria-hidden="true"
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,.4)',
            zIndex: 300,
          }}
        />
      )}

      {/* Panel */}
      <aside
        aria-label="Control centres"
        style={{
          position:      'fixed',
          top:           0,
          left:          isOpen
            ? 'max(0px, calc(50vw - 220px))'
            : 'calc(max(0px, calc(50vw - 220px)) - 280px)',
          width:         280,
          height:        '100vh',
          background:    'var(--c-card, #fff)',
          zIndex:        400,
          transition:    'left .25s ease',
          overflowY:     'auto',
          boxShadow:     isOpen ? '4px 0 24px rgba(0,0,0,.15)' : 'none',
          display:       'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding:         '20px 20px 12px',
          background:      'linear-gradient(135deg, var(--c-header-from, #064e3b), var(--c-header-to, #0d7060))',
          display:         'flex',
          justifyContent:  'space-between',
          alignItems:      'center',
        }}>
          <p style={{ fontSize: 14, fontWeight: 900, color: '#fff', margin: 0 }}>
            {countLabel}
          </p>
          <button
            onClick={onClose}
            aria-label="Close panel"
            onMouseEnter={() => setHoveredClose(true)}
            onMouseLeave={() => setHoveredClose(false)}
            style={{
              background:  hoveredClose ? 'rgba(255,255,255,.15)' : 'none',
              border:      'none',
              borderRadius: 8,
              color:       'rgba(255,255,255,.8)',
              cursor:      'pointer',
              padding:     '4px 6px',
              display:     'flex',
              alignItems:  'center',
              transition:  'background .15s',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Centre list */}
        <div style={{ flex: 1, padding: '12px 0' }}>
          {centres.map(c => {
            const active  = c.id === activeCentreId;
            const hovered = hoveredRow === c.id && !active;
            return (
              <button
                key={c.id}
                onClick={() => handleSwitch(c.id)}
                aria-label={`Switch to ${c.name}`}
                onMouseEnter={() => setHoveredRow(c.id)}
                onMouseLeave={() => setHoveredRow(null)}
                style={{
                  width:         '100%',
                  padding:       '14px 20px',
                  textAlign:     'left',
                  background:    active  ? 'var(--c-accent-light, #f0fdf4)'
                               : hovered ? 'var(--c-bg, #f3f4f6)'
                               : 'transparent',
                  borderTop:    'none',
                  borderRight:  'none',
                  borderBottom: 'none',
                  borderLeft:   `3px solid ${active ? 'var(--c-accent, #059669)' : 'transparent'}`,
                  cursor:       'pointer',
                  display:      'block',
                  transition:   'background .15s',
                  fontFamily:   "'Nunito', sans-serif",
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{c.icon}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 2px' }}>
                      {c.name}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--c-muted, #6b7280)', margin: 0 }}>
                      {c.currency}
                    </p>
                  </div>
                  {active && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--c-accent, #059669)' }}>
                      Active
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer — create / upgrade */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--c-border, #e5e7eb)' }}>
          {userPlan === 'free' ? (
            <>
              <p style={{ fontSize: 11, color: 'var(--c-muted, #6b7280)', margin: '0 0 8px', fontWeight: 600 }}>
                Free plan · 1 control centre
              </p>
              <button
                disabled
                style={{
                  width: '100%', padding: '12px', borderRadius: 10,
                  border: '1.5px dashed var(--c-border, #e5e7eb)',
                  background: 'transparent', color: 'var(--c-muted, #9ca3af)',
                  fontSize: 13, fontWeight: 700, cursor: 'not-allowed',
                  fontFamily: "'Nunito', sans-serif",
                }}
              >
                Upgrade to add more hubs
              </button>
            </>
          ) : atProLimit ? (
            <p style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: 0, fontWeight: 600, textAlign: 'center' }}>
              Maximum 10 hubs reached
            </p>
          ) : (
            <button
              onClick={onCreateHub}
              style={{
                width: '100%', padding: '12px', borderRadius: 10,
                border: '1.5px dashed var(--c-primary, #064e3b)',
                background: 'transparent', color: 'var(--c-primary, #064e3b)',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                fontFamily: "'Nunito', sans-serif",
              }}
            >
              + New Control Centre
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
