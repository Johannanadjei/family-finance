/**
 * StateScreens.jsx
 *
 * Full-screen state components rendered by App.jsx before the dashboard mounts:
 *   - LoadingScreen — branded splash shown during auth / centre loads
 *   - ErrorScreen   — fatal centre-load error
 *   - RemovedScreen — the member was removed from the active hub
 *
 * Pure, prop-only display components. No App-specific logic — extracted from App.jsx
 * to keep that file within its size budget (gate-sequence refactor remains separate).
 */

export function LoadingScreen({ message }) {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(145deg, var(--c-header-from, #064e3b), var(--c-header-to, #0d7060))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <img src="/icons/bos-icon-v2-white-512.png" alt="" style={{ width: 140, height: 140, objectFit: 'contain' }} />
      <h1 style={{ fontFamily: "'Nunito', sans-serif", fontSize: 32, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.1, margin: '14px 0 6px' }}>
        Money B.O.S
      </h1>
      <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--c-success-light, #6ee7b7)', margin: 0 }}>{message}</p>
    </div>
  );
}

export function ErrorScreen({ message }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-danger-bg, #fef2f2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24 }}>
      <div style={{ fontSize: 48 }}>⚠️</div>
      <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--c-danger, #dc2626)', margin: 0, textAlign: 'center' }}>{message}</p>
    </div>
  );
}

export function RemovedScreen({ otherCentres, onSwitchHub, onSignOut }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg, #f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24, textAlign: 'center', fontFamily: "'Nunito', sans-serif" }}>
      <p style={{ fontSize: 32, margin: 0 }}>🔒</p>
      <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: 0 }}>Removed from hub</p>
      <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: 0, lineHeight: 1.5, maxWidth: 280 }}>
        You have been removed from this hub. Contact the hub owner if you think this is a mistake.
      </p>
      {otherCentres.length > 0 && (
        <button onClick={() => onSwitchHub(otherCentres[0].id)}
          style={{ padding: '12px 24px', borderRadius: 12, border: 'none', background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>
          Switch to {otherCentres[0].name}
        </button>
      )}
      <button onClick={onSignOut}
        style={{ padding: '12px 24px', borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'transparent', color: 'var(--c-muted, #6b7280)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>
        Sign out
      </button>
    </div>
  );
}
