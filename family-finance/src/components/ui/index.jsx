/** Reusable UI primitives */

/** Horizontal progress bar */
export function ProgressBar({ pct = 0, overspent = false }) {
  const clamped = Math.min(pct, 100);
  const bg = overspent ? '#ef4444' : pct > 80 ? '#f59e0b' : 'var(--c-progress, #10b981)';
  return (
    <div style={{ background: 'var(--c-border, #f3f4f6)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
      <div style={{ width: String(clamped) + '%', height: '100%', background: bg, borderRadius: 6, transition: 'width .4s' }} />
    </div>
  );
}

/** Toggle switch */
export function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} aria-pressed={on}
      style={{ position: 'relative', width: 48, height: 26, borderRadius: 13, background: on ? 'var(--c-accent, #059669)' : '#d1d5db', border: 'none', cursor: 'pointer', transition: 'background .2s', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', left: on ? 25 : 3, transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
    </button>
  );
}

/** Filter chip */
export function Chip({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      style={{ padding: '4px 12px', borderRadius: 'var(--r-chip, 20px)', fontSize: 12, fontWeight: 700, border: active ? 'none' : '1.5px solid var(--c-input-border, #e5e7eb)', background: active ? 'var(--c-chip-active, #064e3b)' : 'transparent', color: active ? '#fff' : 'var(--c-muted, #6b7280)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {label}
    </button>
  );
}

/** Section label */
export function Label({ children }) {
  return (
    <p style={{
      fontSize: 11, fontWeight: 800, color: '#6b7280',
      margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: 1,
    }}>
      {children}
    </p>
  );
}

/** Shared card style object */
export const cardStyle = {
  background:   'var(--c-card, #fff)',
  borderRadius: 'var(--r-card, 18px)',
  padding:      '16px 18px',
  boxShadow:    'var(--c-card-shadow, 0 1px 6px rgba(0,0,0,.06))',
};

/** Shared hero card style */
export const heroStyle = {
  background:   'linear-gradient(145deg, var(--c-header-from, #064e3b), var(--c-header-to, #0d7060))',
  borderRadius: 'var(--r-card, 18px)',
  padding:      '18px 20px',
  color:        '#fff',
};

/** Shared input style */
export const inputStyle = {
  width:       '100%',
  padding:     '12px 14px',
  borderRadius: 12,
  border:      '1.5px solid var(--c-input-border, #e5e7eb)',
  fontSize:    15,
  fontWeight:  600,
  color:       'var(--c-text, #1c1917)',
  background:  'var(--c-input-bg, #f9fafb)',
  outline:     'none',
  boxSizing:   'border-box',
  fontFamily:  "'Nunito', sans-serif",
};
