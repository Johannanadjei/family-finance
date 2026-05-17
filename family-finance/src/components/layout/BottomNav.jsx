import { Home, CalendarCheck, BarChart2, FileText, Settings, Wallet } from 'lucide-react';

const TABS = [
  { id: 'home',     label: 'Home',   Icon: Home          },
  { id: 'payday',   label: 'Payday', Icon: Wallet        },
  { id: 'daily',    label: 'Daily',  Icon: CalendarCheck },
  { id: 'budget',   label: 'Budget', Icon: BarChart2     },
  { id: 'log',      label: 'Log',    Icon: FileText      },
];

export function BottomNav({ activeTab, onTabChange }) {
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 440, background: '#fff',
      borderTop: '1px solid #f3f4f6', display: 'flex', zIndex: 25,
    }}>
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '10px 0 8px', gap: 3, border: 'none', background: 'none',
            cursor: 'pointer', color: activeTab === id ? 'var(--c-nav-active, #064e3b)' : '#9ca3af',
          }}
        >
          <Icon size={20} strokeWidth={activeTab === id ? 2.5 : 1.8} />
          <span style={{ fontSize: 10, fontWeight: activeTab === id ? 900 : 600 }}>{label}</span>
        </button>
      ))}
    </nav>
  );
}
