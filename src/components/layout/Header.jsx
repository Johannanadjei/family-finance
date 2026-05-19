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

export function Header({ availableNow, totalReceived, onOpenPanel }) {
  const { centre, fmt } = useBudgetCentreContext();
  const navigate        = useNavigate();
  const noIncome        = totalReceived === 0;
  const isNegative      = availableNow < 0;

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
            color:      noIncome ? 'rgba(255,255,255,.5)' : isNegative ? '#fca5a5' : '#6ee7b7',
          }}>
            {fmt(availableNow)}
          </p>
        </div>

        {/* Info icon — shown when no income confirmed */}
        {noIncome && (
          <div
            title="Confirm income received in the Payday screen to see it reflected here"
            aria-label="No income confirmed yet"
            style={{ fontSize: 14, color: 'rgba(255,255,255,.6)', cursor: 'help' }}
          >
            ℹ️
          </div>
        )}

        {/* Settings */}
        <button
          onClick={() => navigate('/settings')}
          aria-label="Open settings"
          style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'rgba(255,255,255,.8)', padding: 0 }}
        >
          ⚙️
        </button>
      </div>
    </header>
  );
}
