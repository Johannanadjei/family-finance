/**
 * views/settings/ThemeSection.jsx
 *
 * Theme skin selector.
 * family_warmth is the free skin — all others require Pro.
 * Reads prefs and saveThemeSkin from FinanceContext.
 */

import { useFinanceContext }      from '../../context/FinanceContext';
import { useBudgetCentreContext } from '../../context/BudgetCentreContext';

const SKINS = [
  { key: 'family_warmth',         label: 'Family Warmth', emoji: '🌿', pro: false },
  { key: 'global_international',  label: 'Global',        emoji: '🌐', pro: true  },
  { key: 'corporate_professional',label: 'Corporate',     emoji: '💼', pro: true  },
  { key: 'nature_fresh',          label: 'Nature',        emoji: '🌿', pro: true  },
  { key: 'sunset_warm',           label: 'Sunset',        emoji: '🌅', pro: true  },
  { key: 'neon_futuristic',       label: 'Neon',          emoji: '⚡', pro: true  },
  { key: 'dark_executive',        label: 'Dark',          emoji: '🌙', pro: true  },
  { key: 'minimal_light',         label: 'Minimal',       emoji: '◻️', pro: true  },
  { key: 'royal_luxury',          label: 'Royal',         emoji: '👑', pro: true  },
];

export function ThemeSection() {
  const { prefs, saveThemeSkin, userPlan } = useFinanceContext();
  const { updateCentre }                   = useBudgetCentreContext();
  const current = prefs?.themeSkin || 'family_warmth';

  const handleSelect = (skin, locked) => {
    if (locked) return;
    saveThemeSkin(skin);
    updateCentre({ skin_id: skin });
  };

  return (
    <div style={{ background: 'var(--c-card, #fff)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--c-shadow)', marginBottom: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 900, color: 'var(--c-muted, #6b7280)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 0.8 }}>Theme</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {SKINS.map(s => {
          const locked = s.pro && userPlan !== 'pro';
          return (
            <button
              key={s.key}
              data-testid={`theme-${s.key}`}
              onClick={() => handleSelect(s.key, locked)}
              disabled={locked}
              aria-label={s.label + (locked ? ' (Pro)' : '')}
              style={{
                padding:      '8px 12px',
                borderRadius: 10,
                border:       `1.5px solid ${current === s.key ? 'var(--c-primary, #064e3b)' : 'var(--c-border, #e5e7eb)'}`,
                background:   current === s.key ? 'var(--c-chip-selected-bg, #f0fdf4)' : 'var(--c-chip-bg, #f3f4f6)',
                fontSize:     13,
                fontWeight:   700,
                cursor:       locked ? 'default' : 'pointer',
                color:        locked ? 'var(--c-muted, #9ca3af)' : 'var(--c-text, #1c1917)',
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
    </div>
  );
}
