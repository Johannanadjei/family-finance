import { getWorkspaceType, buildWorkspaceSnapshot, fmtCurrency } from '../../lib/workspaces';
import { ProgressBar } from '../ui';

const PRIMARY_WS_ID = 'ws_primary';

function WorkspaceCard({ ws, isActive, onClick }) {
  const type     = getWorkspaceType(ws.typeId);
  const snap     = buildWorkspaceSnapshot(ws);
  const currency = ws.currency || 'GHS';

  return (
    <button onClick={onClick}
      style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: 16, padding: '14px 16px', marginBottom: 10, background: isActive ? type.color : '#f9fafb', outline: isActive ? '2px solid ' + type.accent : 'none', outlineOffset: 2 }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: isActive ? 'rgba(255,255,255,.2)' : type.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
          {type.icon}
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <p style={{ fontSize: 14, fontWeight: 900, color: isActive ? '#fff' : '#1c1917', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ws.name}</p>
            {isActive && <span style={{ fontSize: 10, fontWeight: 800, background: 'rgba(255,255,255,.25)', color: '#fff', padding: '2px 7px', borderRadius: 10, flexShrink: 0 }}>Active</span>}
          </div>
          <p style={{ fontSize: 11, color: isActive ? type.accent : '#9ca3af', margin: '1px 0 6px' }}>
            {type.label} · {currency}
          </p>
          {/* Mini health bar */}
          <div style={{ background: isActive ? 'rgba(255,255,255,.2)' : '#e5e7eb', borderRadius: 4, height: 4, overflow: 'hidden' }}>
            <div style={{ width: String(snap.healthPct) + '%', height: '100%', background: isActive ? type.accent : (snap.healthPct > 50 ? '#10b981' : snap.healthPct > 20 ? '#f59e0b' : '#ef4444'), borderRadius: 4 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 10, color: isActive ? type.accent : '#9ca3af' }}>
              {fmtCurrency(snap.spent, currency)} spent
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? '#fff' : (snap.healthPct > 30 ? '#059669' : '#dc2626') }}>
              {snap.healthPct}% left
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

export function WorkspacePanel({ allWorkspaces, activeWsId, plan, canAddWorkspace, onSwitch, onAdd, onClose }) {
  const totalWs = allWorkspaces.length;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,.5)' }} />

      {/* Panel */}
      <div style={{ position: 'fixed', top: 0, left: 'max(0px, calc(50% - 220px))', bottom: 0, width: 300, zIndex: 41, background: '#fff', boxShadow: '4px 0 32px rgba(0,0,0,.2)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(145deg,#064e3b,#0d7060)', padding: '48px 18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: '#6ee7b7', textTransform: 'uppercase', margin: '0 0 4px' }}>Control Centres</p>
              <p style={{ fontSize: 18, fontWeight: 900, color: '#fff', margin: 0 }}>
                {totalWs} workspace{totalWs !== 1 ? 's' : ''}
              </p>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 10, width: 32, height: 32, cursor: 'pointer', color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
          {/* Plan badge */}
          <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, background: plan === 'premium' ? 'rgba(245,158,11,.25)' : 'rgba(255,255,255,.1)', borderRadius: 20, padding: '4px 12px' }}>
            <span style={{ fontSize: 12 }}>{plan === 'premium' ? '⭐' : '🔒'}</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: plan === 'premium' ? '#fcd34d' : '#a7f3d0' }}>
              {plan === 'premium' ? 'Premium — unlimited workspaces' : 'Free — 1 workspace'}
            </span>
          </div>
        </div>

        {/* Workspace list */}
        <div style={{ flex: 1, padding: '16px 14px 8px' }}>
          {allWorkspaces.map(ws => (
            <WorkspaceCard
              key={ws.id}
              ws={ws}
              isActive={ws.id === activeWsId}
              onClick={() => { onSwitch(ws.id); onClose(); }}
            />
          ))}

          {/* Add workspace button */}
          {canAddWorkspace ? (
            <button onClick={onAdd}
              style={{ width: '100%', padding: '14px', borderRadius: 16, border: '2px dashed #6ee7b7', background: '#f0fdf4', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>＋</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#064e3b' }}>Add Control Centre</span>
            </button>
          ) : (
            <div style={{ borderRadius: 16, border: '2px dashed #e5e7eb', padding: '16px', textAlign: 'center' }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#9ca3af', margin: '0 0 4px' }}>🔒 Upgrade to Premium</p>
              <p style={{ fontSize: 11, color: '#d1d5db', margin: 0 }}>Unlock up to 10 control centres</p>
            </div>
          )}
        </div>

        {/* Premium features list */}
        <div style={{ padding: '14px 14px 32px', borderTop: '1px solid #f3f4f6' }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: '#9ca3af', letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 10px' }}>Premium features</p>
          {[
            ['🏪', 'Multiple control centres'],
            ['🔑', 'Guest / staff access'],
            ['📊', 'Yearly dashboard'],
            ['📤', 'CSV export'],
          ].map(([icon, label]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
              <span style={{ fontSize: 14 }}>{icon}</span>
              <p style={{ fontSize: 12, color: plan === 'premium' ? '#059669' : '#9ca3af', fontWeight: 700, margin: 0 }}>{label}</p>
              {plan === 'premium' && <span style={{ marginLeft: 'auto', fontSize: 14, color: '#059669' }}>✓</span>}
              {plan === 'free'    && <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, background: '#f3f4f6', color: '#9ca3af', padding: '1px 7px', borderRadius: 8 }}>Pro</span>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
