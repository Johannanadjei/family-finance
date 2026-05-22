/**
 * components/layout/Header.jsx
 *
 * Top navigation bar.
 * Left: centre icon + name — tap opens SidePanel
 * Right: available now amount + info icon + settings icon
 *
 * Reads fmt and centre from BudgetCentreContext.
 * Receives availableNow, totalReceived as props from App.jsx.
 *
 * @param {number}   availableNow
 * @param {number}   totalReceived
 * @param {function} onOpenPanel
 */

import { useNavigate } from 'react-router-dom';
import { useBudgetCentreContext } from '../../context/BudgetCentreContext';
import { useFinanceContext }      from '../../context/FinanceContext';

export function Header({ onOpenPanel }) {
  const { centre, fmt }            = useBudgetCentreContext();
  const { availableNow, totalReceived } = useFinanceContext();
  const navigate                   = useNavigate();
  const noIncome                   = totalReceived === 0;
  const isNegative                 = availableNow < 0;

  return (
    <header style={{
      background:    'linear-gradient(135deg, var(--c-header-from, #064e3b), var(--c-header-to, #0d7060))',
      padding:       '16px 20px 14px',
      display:       'flex',
      alignItems:    'center',
      justifyContent: 'space-between',
      position:      'sticky',
      top:           0,
      zIndex:        100,
    }}>
      {/* Left — centre name, tap opens panel */}
      <button
        onClick={onOpenPanel}
        aria-label="Open budget centres panel"
        style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: 0 }}
      >
        <span style={{ fontSize: 22 }}>{centre?.icon || '🏠'}</span>
        <div style={{ textAlign: 'left' }}>
          <p style={{ fontSize: 13, fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.2 }}>
            {centre?.name || 'My Budget'}
          </p>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,.7)', margin: 0, fontWeight: 600 }}>
            {centre?.currency || 'GHS'}
          </p>
        </div>
      </button>

      {/* Right — available now */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,.7)', margin: '0 0 1px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Available
          </p>
          <p style={{
            fontSize:   16,
            fontWeight: 900,
            margin:     0,
            color:      noIncome ? 'rgba(255,255,255,.5)' : isNegative ? 'var(--c-danger-light, #fca5a5)' : 'var(--c-success-light, #6ee7b7)',
          }}>
            {fmt(availableNow)}
          </p>
        </div>

        {/* Info icon — tapping navigates to Payday to confirm income */}
        {noIncome && (
          <button
            onClick={() => navigate('/payday')}
            aria-label="No income confirmed — tap to go to Payday"
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="6.25" y="6" width="1.5" height="4" rx=".75" fill="currentColor"/>
              <circle cx="7" cy="4.5" r=".75" fill="currentColor"/>
            </svg>
          </button>
        )}

        {/* Settings */}
        <button
          onClick={() => navigate('/settings')}
          aria-label="Open settings"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.8)', padding: 0, display: 'flex', alignItems: 'center' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M19.07 4.93l-1.77 1.77M6.7 17.3l-1.77 1.77" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </header>
  );
}
