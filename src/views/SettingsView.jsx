import { useState } from 'react';
import { Toggle, cardStyle } from '../components/ui';
import { useHouseholdContext } from '../context/HouseholdContext';
import { buildGuestPortalUrl } from '../lib/guest';
import { SkinsView } from './SkinsView';

const NOTIF_ITEMS = [
  { key: 'newPayment',        label: 'New payment added',           sub: 'Alert when any transaction is logged' },
  { key: 'categoryOverspent', label: 'Category overspent',          sub: 'Warn when a category exceeds budget' },
  { key: 'spreadsheetUpdate', label: 'Spreadsheet manually updated', sub: 'Sync alert from Google Sheets' },
  { key: 'weeklySummary',     label: 'Weekly summary email',         sub: 'Digest every Sunday' },
  { key: 'monthlySummary',    label: 'Monthly summary email',        sub: 'Full report at month end' },
];

const SYNC_ITEMS = [
  { icon: '📊', label: 'Google Sheets Sync',  sub: 'Connect your family spreadsheet' },
  { icon: '🔥', label: 'Firebase Real-time',  sub: 'Live updates for husband & wife' },
  { icon: '👥', label: 'Multi-user Access',   sub: 'Add your spouse as co-manager'   },
  { icon: '📧', label: 'Email Notifications', sub: 'Weekly & monthly email reports'  },
];

function GuestSettings({ guestSettings, setGuestSettings }) {
  const { categories } = useHouseholdContext();
  const [expanded, setExpanded] = useState(false);
  const [copied,   setCopied]   = useState(false);
  const set = (k, v) => setGuestSettings(prev => ({ ...prev, [k]: v }));

  const portalUrl = buildGuestPortalUrl(guestSettings);

  const handleCopy = () => {
    navigator.clipboard.writeText(portalUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const toggleCat = (name) => {
    const cur  = guestSettings.allowedCategories || [];
    const next = cur.includes(name) ? cur.filter(c => c !== name) : [...cur, name];
    set('allowedCategories', next);
  };

  return (
    <div style={{ ...cardStyle, borderRadius: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🔑</div>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 800, fontSize: 14, color: '#1c1917', margin: 0 }}>Guest Access</p>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>
            {guestSettings.enabled ? 'Enabled · PIN: ' + guestSettings.pin : 'Disabled'}
          </p>
        </div>
        <Toggle on={guestSettings.enabled} onChange={v => set('enabled', v)} />
        <button onClick={() => setExpanded(e => !e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 18, padding: 4, lineHeight: 1 }}>
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f3f4f6' }}>
          {!guestSettings.enabled && (
            <div style={{ background: '#fef3c7', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
              <p style={{ fontSize: 12, color: '#92400e', margin: 0 }}>Enable guest access above to configure.</p>
            </div>
          )}

          {guestSettings.enabled && (
            <div style={{ background: '#eff6ff', borderRadius: 14, padding: '14px', marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: '#1d4ed8', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>📤 Staff Portal Link</p>
              <p style={{ fontSize: 11, color: '#3b82f6', margin: '0 0 10px', lineHeight: 1.5 }}>
                Share this link with your nanny or driver. They go straight to the PIN screen — they never see the family dashboard.
              </p>
              <div style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, border: '1.5px solid #bfdbfe' }}>
                <p style={{ fontSize: 11, color: '#1e40af', margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>{portalUrl}</p>
                <button onClick={handleCopy}
                  style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 8, border: 'none', background: copied ? '#059669' : '#2563eb', color: '#fff', fontWeight: 800, fontSize: 11, cursor: 'pointer' }}>
                  {copied ? '✓ Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>Portal name</p>
            <input value={guestSettings.label} onChange={e => set('label', e.target.value)}
              disabled={!guestSettings.enabled}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, fontWeight: 600, outline: 'none', background: '#f9fafb', boxSizing: 'border-box' }} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>4-digit PIN</p>
            <input value={guestSettings.pin}
              onChange={e => set('pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
              disabled={!guestSettings.enabled} type="password" inputMode="numeric" maxLength={4} placeholder="1234"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 22, fontWeight: 800, outline: 'none', background: '#f9fafb', textAlign: 'center', letterSpacing: 8, boxSizing: 'border-box' }} />
            <p style={{ fontSize: 11, color: '#9ca3af', margin: '6px 0 0' }}>Share the PIN verbally only — never include it in the link.</p>
          </div>

          <div>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>
              Allowed categories (empty = all)
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, opacity: guestSettings.enabled ? 1 : 0.4 }}>
              {categories.map(cat => {
                const selected = (guestSettings.allowedCategories || []).includes(cat.name);
                return (
                  <button key={cat.id || cat.name}
                    onClick={() => guestSettings.enabled && toggleCat(cat.name)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: guestSettings.enabled ? 'pointer' : 'not-allowed', border: selected ? 'none' : '1.5px solid #e5e7eb', background: selected ? '#1e3a5f' : '#f9fafb', color: selected ? '#fff' : '#374151' }}>
                    {cat.icon || '💸'} {cat.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsView({ notifs, setNotifs, guestSettings, setGuestSettings, onPreviewGuest, theme, setTheme, plan }) {
  const { household, fmt } = useHouseholdContext();
  const toggle = (key) => setNotifs(prev => ({ ...prev, [key]: !prev[key] }));

  const month = new Date().toLocaleDateString('en-GH', { month: 'long', year: 'numeric' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontWeight: 900, fontSize: 18, color: '#1c1917', margin: 0 }}>Settings</p>

      {/* Household card — data from Supabase via context */}
      <div style={{ background: 'linear-gradient(145deg,#064e3b,#0d7060)', borderRadius: 18, padding: '16px 18px', color: '#fff' }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: '#6ee7b7', margin: '0 0 6px', letterSpacing: 1 }}>HOUSEHOLD</p>
        <p style={{ fontSize: 18, fontWeight: 900, margin: '0 0 4px' }}>🏡 {household?.name || ''}</p>
        <p style={{ fontSize: 12, color: '#a7f3d0', margin: 0 }}>
          {household?.adults_count || 0} Adults · {household?.children_count || 0} Children · {month}
        </p>
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.15)' }}>
          {[
            ['Monthly Income',  fmt(household?.monthly_income  || 0)],
            ['Surplus Target',  fmt(household?.surplus_target  || 0)],
            ['Currency',        household?.currency            || 'GHS'],
          ].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: '#6ee7b7' }}>{l}</span>
              <span style={{ fontSize: 13, fontWeight: 800 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Skins & Themes */}
      <div style={{ background: 'var(--c-card, #fff)', borderRadius: 'var(--r-card, 18px)', padding: '16px 18px', boxShadow: 'var(--c-card-shadow)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 20 }}>🎨</span>
          <p style={{ fontWeight: 800, fontSize: 14, color: 'var(--c-text, #1c1917)', margin: 0 }}>Skin & Colour Theme</p>
        </div>
        <SkinsView theme={theme} setTheme={setTheme} plan={plan} />
      </div>

      <GuestSettings guestSettings={guestSettings} setGuestSettings={setGuestSettings} />

      {guestSettings.enabled && (
        <button onClick={onPreviewGuest}
          style={{ width: '100%', padding: '13px', borderRadius: 14, border: '1.5px solid #dbeafe', background: '#eff6ff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🔑</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#1d4ed8' }}>Preview guest portal</span>
        </button>
      )}

      <div style={cardStyle}>
        <p style={{ fontWeight: 800, fontSize: 14, color: '#1c1917', margin: '0 0 14px' }}>🔔 Notifications</p>
        {NOTIF_ITEMS.map(({ key, label, sub }, i) => (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: i < NOTIF_ITEMS.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
            <div style={{ flex: 1, marginRight: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#1c1917', margin: 0 }}>{label}</p>
              <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>{sub}</p>
            </div>
            <Toggle on={notifs[key]} onChange={() => toggle(key)} />
          </div>
        ))}
      </div>

      <div style={cardStyle}>
        <p style={{ fontWeight: 800, fontSize: 14, color: '#1c1917', margin: '0 0 14px' }}>🔗 Integrations</p>
        {SYNC_ITEMS.map(({ icon, label, sub }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: '#f9fafb', borderRadius: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 18 }}>{icon}</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#374151', margin: 0 }}>{label}</p>
              <p style={{ fontSize: 11, color: '#9ca3af', margin: '1px 0 0' }}>{sub}</p>
            </div>
            <span style={{ fontSize: 10, fontWeight: 800, background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: 10 }}>Soon</span>
          </div>
        ))}
      </div>
    </div>
  );
}
