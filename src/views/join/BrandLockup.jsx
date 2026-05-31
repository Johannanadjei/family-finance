/**
 * views/join/BrandLockup.jsx
 *
 * Money B.O.S brand lockup for the invite-join flow — white icon + wordmark +
 * tagline on the green backdrop. Pure display, no props.
 *
 * Mirrors AuthScreen's inline lockup verbatim (AuthScreen.jsx). Hardcoded white
 * (#fff / rgba(255,255,255,…)) is intentional: this is a pre-sign-in surface on a
 * fixed green gradient, same as AuthScreen — not theme-token territory.
 *
 * Deliberately JoinView-local, not shared with AuthScreen, to keep the join-branding
 * change off the sign-in regression path. See backlog: hoist BrandLockup to shared.
 */

export function BrandLockup() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 32 }}>
      <img src="/icons/bos-icon-v2-white-512.png" alt="Money B.O.S logo" style={{ width: 120, height: 120, marginBottom: 14, objectFit: 'contain' }} />
      <h1 style={{ fontFamily: "'Nunito', sans-serif", fontSize: 32, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', margin: '0 0 6px', lineHeight: 1.1 }}>
        Money B.O.S
      </h1>
      <p style={{ fontFamily: "'Nunito', sans-serif", fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.7)', margin: 0 }}>
        Budget · Overview · System
      </p>
    </div>
  );
}
