/**
 * components/layout/SidePanel.jsx
 *
 * Slides in from left when centre name tapped in Header.
 * Shows all budget centres user belongs to.
 * Active centre highlighted. Centre switching in Session 11.
 *
 * @param {boolean}       isOpen
 * @param {function}      onClose
 * @param {BudgetCentre[]} centres
 * @param {string|null}   activeCentreId
 */

import { useState }               from 'react';
import { useBudgetCentreContext } from '../../context/BudgetCentreContext';

export function SidePanel({ isOpen, onClose, centres, activeCentreId }) {
  const { fmt } = useBudgetCentreContext();
  const [hoveredClose, setHoveredClose] = useState(false);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          aria-hidden="true"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
            zIndex: 300, transition: 'opacity .2s',
          }}
        />
      )}

      {/* Panel */}
      <aside
        aria-label="Budget centres"
        style={{
          position:   'fixed',
          top:        0,
          left:       isOpen
            ? 'max(0px, calc(50vw - 220px))'
            : 'calc(max(0px, calc(50vw - 220px)) - 280px)',
          width:      280,
          height:     '100vh',
          background: 'var(--c-card, #fff)',
          zIndex:     400,
          transition: 'left .25s ease',
          overflowY:  'auto',
          boxShadow:  isOpen ? '4px 0 24px rgba(0,0,0,.15)' : 'none',
          display:    'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 20px 12px', background: 'linear-gradient(135deg, var(--c-header-from, #064e3b), var(--c-header-to, #0d7060))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: 14, fontWeight: 900, color: '#fff', margin: 0 }}>Budget Centres</p>
          <button
            onClick={onClose}
            aria-label="Close panel"
            onMouseEnter={() => setHoveredClose(true)}
            onMouseLeave={() => setHoveredClose(false)}
            style={{ background: hoveredClose ? 'rgba(255,255,255,.15)' : 'none', border: 'none', borderRadius: 8, color: 'rgba(255,255,255,.8)', cursor: 'pointer', padding: '4px 6px', display: 'flex', alignItems: 'center', transition: 'background .15s' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Centre list */}
        <div style={{ flex: 1, padding: '12px 0' }}>
          {centres.map(c => {
            const active = c.id === activeCentreId;
            return (
              <div
                key={c.id}
                style={{
                  padding:    '14px 20px',
                  background: active ? 'var(--c-accent-light, #f0fdf4)' : 'transparent',
                  borderLeft: active ? '3px solid var(--c-accent, #059669)' : '3px solid transparent',
                  cursor:     'default',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{c.icon}</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 2px' }}>{c.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--c-muted, #6b7280)', margin: 0 }}>{c.currency}</p>
                  </div>
                  {active && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: 'var(--c-accent, #059669)' }}>Active</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Create new centre — disabled on free plan */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--c-border, #e5e7eb)' }}>
          <button
            disabled
            title="Upgrade to Pro to create multiple budget centres"
            style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1.5px dashed var(--c-border, #e5e7eb)', background: 'transparent', color: 'var(--c-muted, #9ca3af)', fontSize: 13, fontWeight: 700, cursor: 'not-allowed', fontFamily: "'Nunito', sans-serif" }}
          >
            + New budget centre (Pro)
          </button>
        </div>
      </aside>
    </>
  );
}
