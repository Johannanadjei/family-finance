/**
 * components/layout/Header.jsx
 *
 * Top navigation bar.
 * Left: centre icon + name + chevron — tap opens SidePanel
 * Right: settings icon
 *
 * Reads centre from BudgetCentreContext.
 */

import { useState }     from 'react';
import { useNavigate } from 'react-router-dom';
import { useBudgetCentreContext } from '../../context/BudgetCentreContext';
import { currencySymbol } from '../../lib/currencies';

export function Header({ onOpenPanel }) {
  const { centre } = useBudgetCentreContext();
  const navigate   = useNavigate();
  const [hovered, setHovered] = useState(false);

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
      {/* Left — centre name + chevron, tap opens panel */}
      <button
        onClick={onOpenPanel}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label="Open BOS Hubs panel"
        style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', cursor: 'pointer', padding: 0 }}
      >
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          8,
          background:   hovered ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.12)',
          borderRadius: 20,
          padding:      '5px 12px',
          border:       `1px solid ${hovered ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.18)'}`,
          transition:   'background .15s, border-color .15s',
        }}>
          <span style={{ fontSize: 22 }}>{centre?.icon || '🏠'}</span>
          <div style={{ textAlign: 'left' }}>
            <p style={{ fontSize: 14, fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.2 }}>
              {(centre?.name || 'My Budget').length > 20
                ? (centre?.name || 'My Budget').slice(0, 20) + '…'
                : (centre?.name || 'My Budget')}
            </p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', margin: 0, fontWeight: 600 }}>
              {currencySymbol(centre?.currency || 'GHS')}
            </p>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"
            style={{ color: 'rgba(255,255,255,.7)', flexShrink: 0 }}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      {/* Right — settings */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
