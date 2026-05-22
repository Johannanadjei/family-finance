/**
 * components/layout/Header.jsx
 *
 * Top navigation bar.
 * Left: centre icon + name — tap opens SidePanel
 * Right: available now amount + settings icon
 *
 * Reads fmt and centre from BudgetCentreContext.
 * Reads availableNow from FinanceContext.
 */

import { useNavigate } from 'react-router-dom';
import { useBudgetCentreContext } from '../../context/BudgetCentreContext';
import { useFinanceContext }      from '../../context/FinanceContext';

export function Header({ onOpenPanel }) {
  const { centre, fmt }            = useBudgetCentreContext();
  const { availableNow } = useFinanceContext();
  const navigate         = useNavigate();
  const isNegative       = availableNow < 0;

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
        style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', cursor: 'pointer', padding: 0 }}
      >
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          8,
          background:   'rgba(255,255,255,0.12)',
          borderRadius: 20,
          padding:      '5px 12px',
          border:       '1px solid rgba(255,255,255,0.18)',
        }}>
          <span style={{ fontSize: 22 }}>{centre?.icon || '🏠'}</span>
          <div style={{ textAlign: 'left' }}>
            <p style={{ fontSize: 14, fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.2 }}>
              {(centre?.name || 'My Budget').length > 20
                ? (centre?.name || 'My Budget').slice(0, 20) + '…'
                : (centre?.name || 'My Budget')}
            </p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', margin: 0, fontWeight: 600 }}>
              {centre?.currency || 'GHS'}
            </p>
          </div>
        </div>
      </button>

      {/* Right — available now */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', margin: '0 0 1px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Available
          </p>
          <p style={{
            fontSize:   16,
            fontWeight: 900,
            margin:     0,
            color:      isNegative ? 'var(--c-danger-light, #fca5a5)' : 'var(--c-success-light, #6ee7b7)',
          }}>
            {fmt(availableNow)}
          </p>
        </div>

        {/* Settings */}
        <button
          onClick={() => navigate('/settings')}
          aria-label="Open settings"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.8)', padding: 0, display: 'flex', alignItems: 'center' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <line x1="3" y1="6"  x2="21" y2="6"  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="8"  cy="6"  r="2.5" fill="currentColor"/>
            <circle cx="16" cy="12" r="2.5" fill="currentColor"/>
            <circle cx="10" cy="18" r="2.5" fill="currentColor"/>
          </svg>
        </button>
      </div>
    </header>
  );
}
