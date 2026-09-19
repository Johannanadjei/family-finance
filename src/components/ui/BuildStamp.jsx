/**
 * components/ui/BuildStamp.jsx
 *
 * Small muted "Build: …" line showing which build this client is running.
 * Makes the PWA update test observable without opening DevTools: if the stamp
 * changes after a reload, the new service worker took over. See CLAUDE.md §13.
 *
 * Rendered in two places, on two different backgrounds:
 *   - AuthFooter   — pre-auth, over the green gradient → white-ish overlay colour
 *   - LegalSection — post-auth Settings card → muted token
 * so the colour comes in as a prop rather than being hardcoded here.
 */

import { BUILD_MARKER } from '../../lib/buildInfo';

export function BuildStamp({ color = 'var(--c-muted, #6b7280)' }) {
  return (
    <p
      data-testid="build-stamp"
      style={{ fontSize: 11, fontWeight: 700, color, margin: 0, textAlign: 'center' }}
    >
      Build: {BUILD_MARKER}
    </p>
  );
}
