/**
 * components/layout/BottomNav.jsx
 *
 * Tab navigation bar — fixed to bottom of screen.
 * Active tab detected from current URL path via useLocation.
 * Navigation via useNavigate.
 * Text labels only — no emoji icons.
 */

import { useNavigate, useLocation } from 'react-router-dom';

const TABS = [
  { label: 'Home',   path: '/'       },
  { label: 'Payday', path: '/payday' },
  { label: 'Daily',  path: '/daily'  },
  { label: 'Budget', path: '/budget' },
  { label: 'Log',    path: '/log'    },
];

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav
      aria-label="Main navigation"
      style={{
        position:       'fixed',
        bottom:         0,
        left:           '50%',
        transform:      'translateX(-50%)',
        width:          '100%',
        maxWidth:       440,
        background:     'var(--c-card, #ffffff)',
        borderTop:      '1px solid var(--c-border, #e5e7eb)',
        display:        'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        paddingBottom:  'env(safe-area-inset-bottom)',
        zIndex:         200,
      }}
    >
      {TABS.map(tab => {
        const active = location.pathname === tab.path;
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            aria-label={tab.label}
            aria-current={active ? 'page' : undefined}
            style={{
              background:  'none',
              border:      'none',
              padding:     '12px 4px',
              cursor:      'pointer',
              fontSize:    11,
              fontWeight:  active ? 900 : 600,
              color:       active ? 'var(--c-primary, #064e3b)' : 'var(--c-muted, #6b7280)',
              borderTop:   active ? '2px solid var(--c-primary, #064e3b)' : '2px solid transparent',
              transition:  'all .15s',
              fontFamily:  "'Nunito', sans-serif",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
