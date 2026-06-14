/**
 * views/settings/ThemeSection.jsx
 *
 * Theme skin selector.
 * family_warmth is the free skin — all others require Pro (lib/plans.isProSkin is
 * the single source of truth for that split; this component no longer keeps its own
 * tier flags). Reads prefs + saveThemeSkin from FinanceContext, updateCentreSkin
 * from BudgetCentreContext (the RPC-backed, server-gated skin write).
 *
 * Locked chips are tappable (not disabled): tapping opens the UpgradeModal with
 * SKIN_CAP_BODY — consistent with every other plan gate (history/member/category).
 */

import { useState }              from 'react';
import { useNavigate }            from 'react-router-dom';
import { useFinanceContext }      from '../../context/FinanceContext';
import { useBudgetCentreContext } from '../../context/BudgetCentreContext';
import { applyTheme }             from '../../lib/themes';
import { isProSkin }              from '../../lib/plans';
import { SKIN_CAP_BODY }          from '../../lib/planCopy';
import { UpgradeModal }           from '../../components/ui/UpgradeModal';

const SKINS = [
  { key: 'family_warmth',          label: 'Family Warmth', emoji: '🌿' },
  { key: 'global_international',   label: 'Global',        emoji: '🌐' },
  { key: 'corporate_professional', label: 'Corporate',     emoji: '💼' },
  { key: 'sunset_warm',            label: 'Sunset',        emoji: '🌅' },
  { key: 'neon_futuristic',        label: 'Neon',          emoji: '⚡' },
  { key: 'dark_executive',         label: 'Dark',          emoji: '🌙' },
  { key: 'minimal_light',          label: 'Minimal',       emoji: '◻️' },
  { key: 'royal_luxury',           label: 'Royal',         emoji: '👑' },
  { key: 'panda',                  label: 'Panda',         emoji: '🐼' },
];

export function ThemeSection() {
  const navigate = useNavigate();
  const { prefs, saveThemeSkin, userPlan } = useFinanceContext();
  const { updateCentreSkin, can }          = useBudgetCentreContext();
  const [showUpgrade, setShowUpgrade]      = useState(false);
  const current = prefs?.themeSkin || 'family_warmth';

  if (!can('settings')) return null;

  const handleSelect = (skin, locked) => {
    if (locked) { setShowUpgrade(true); return; }
    applyTheme(skin);
    saveThemeSkin(skin);
    // Server-gated write (SKN01). The UI never sends a Pro skin from a free hub
    // (locked chips open the modal instead), so SKN01 here is the DevTools-bypass
    // path — surface it by opening the same upgrade modal.
    updateCentreSkin(skin).then(({ error }) => { if (error?.code === 'SKN01') setShowUpgrade(true); });
  };

  return (
    <div style={{ background: 'var(--c-card, #fff)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--c-shadow)', marginBottom: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 900, color: 'var(--c-muted, #6b7280)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 0.8 }}>Theme</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {SKINS.map(s => {
          const locked = isProSkin(s.key) && userPlan !== 'pro';
          return (
            <button
              key={s.key}
              data-testid={`theme-${s.key}`}
              onClick={() => handleSelect(s.key, locked)}
              aria-label={s.label + (locked ? ' (Pro)' : '')}
              style={{
                padding:      '8px 12px',
                borderRadius: 10,
                border:       `1.5px solid ${current === s.key ? 'var(--c-active-bg, var(--c-primary, #064e3b))' : 'var(--c-border, #e5e7eb)'}`,
                background:   current === s.key ? 'var(--c-chip-selected-bg, #f0fdf4)' : 'var(--c-chip-bg, #f3f4f6)',
                fontSize:     13,
                fontWeight:   700,
                cursor:       'pointer',
                color:        locked ? 'var(--c-muted, #9ca3af)' : current === s.key ? 'var(--c-chip-selected-text, var(--c-text, #1c1917))' : 'var(--c-text, #1c1917)',
                fontFamily:   "'Nunito', sans-serif",
                opacity:      locked ? 0.7 : 1,
                display:      'flex',
                alignItems:   'center',
                gap:          4,
              }}
            >
              {s.emoji} {s.label}
              {locked && <span style={{ fontSize: 10, background: 'var(--c-border, #e5e7eb)', borderRadius: 4, padding: '1px 5px', fontWeight: 800 }}>PRO</span>}
            </button>
          );
        })}
      </div>

      <UpgradeModal testid="upgrade-modal-skin" open={showUpgrade} onClose={() => setShowUpgrade(false)} onUpgrade={() => { setShowUpgrade(false); navigate('/pricing'); }} body={SKIN_CAP_BODY} />
    </div>
  );
}
