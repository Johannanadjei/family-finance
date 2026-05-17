import { Settings } from 'lucide-react';
import { HOUSEHOLD } from '../../data/mockData';
import { fmt } from '../../lib/finance';
import { getWorkspaceType } from '../../lib/workspaces';

export function Header({ remaining, activeWs, isExtraWs, workspaceCount, onSettingsClick, onWorkspaceClick }) {
  const wsType    = getWorkspaceType(isExtraWs ? activeWs?.typeId : 'home');
  const bgColor   = wsType.color;
  const accentColor = wsType.accent;
  const displayName = isExtraWs ? activeWs?.name : HOUSEHOLD.name;
  const displayIcon = wsType.icon;
  const subtitle    = isExtraWs
    ? wsType.label + ' · ' + (activeWs?.currency || 'GHS')
    : HOUSEHOLD.adults + ' adults · ' + HOUSEHOLD.children + ' kids · ' + HOUSEHOLD.month;

  return (
    <div style={{
      background: 'linear-gradient(145deg,' + bgColor + ',' + bgColor + 'cc)',
      padding: '40px 20px 20px',
      position: 'sticky', top: 0, zIndex: 20,
    }}>
      {/* Workspace switcher */}
      <button onClick={onWorkspaceClick}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.12)', border: 'none', borderRadius: 20, padding: '5px 12px', cursor: 'pointer', marginBottom: 10 }}>
        <span style={{ fontSize: 12 }}>⊞</span>
        <span style={{ fontSize: 10, fontWeight: 800, color: accentColor, letterSpacing: 1 }}>
          {workspaceCount} CONTROL CENTRE{workspaceCount !== 1 ? 'S' : ''}
        </span>
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 900, color: '#fff', margin: 0 }}>
            {displayIcon} {displayName}
          </h1>
          <p style={{ fontSize: 11, color: accentColor, margin: '2px 0 0', opacity: 0.85 }}>
            {subtitle}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 9, color: accentColor, margin: 0 }}>Remaining</p>
            <p style={{ fontSize: 16, fontWeight: 900, color: remaining < 0 ? '#fca5a5' : '#fff', margin: 0 }}>
              {fmt(remaining)}
            </p>
          </div>
          <button onClick={onSettingsClick} aria-label="Settings"
            style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 10, width: 34, height: 34, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Settings size={16} color={accentColor} />
          </button>
        </div>
      </div>
    </div>
  );
}
