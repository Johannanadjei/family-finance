import { SKINS, ACCENTS } from '../constants/skins';
import { getSkin, getAccent } from '../lib/themes';

/** Preview swatch showing how a skin looks */
function SkinCard({ skin, isActive, isPremium, plan, onSelect }) {
  const locked = !skin.free && plan !== 'premium';

  return (
    <button onClick={() => !locked && onSelect(skin.id)}
      style={{
        borderRadius: 16, overflow: 'hidden', border: 'none',
        outline: isActive ? '3px solid var(--c-accent, #f59e0b)' : '2px solid var(--c-border, #f3f4f6)',
        outlineOffset: isActive ? 2 : 0,
        cursor: locked ? 'not-allowed' : 'pointer',
        background: 'var(--c-card, #fff)',
        textAlign: 'left', width: '100%',
        opacity: locked ? 0.7 : 1,
      }}>
      {/* Skin preview strip */}
      <div style={{ height: 52, background: 'linear-gradient(135deg,' + skin.vars['--c-header-from'] + ',' + skin.vars['--c-header-to'] + ')', position: 'relative', display: 'flex', alignItems: 'flex-end', padding: '0 12px 8px', gap: 6 }}>
        {/* Mock card previews */}
        <div style={{ width: 28, height: 16, borderRadius: Number(skin.vars['--r-card']) > 10 ? 6 : 3, background: 'rgba(255,255,255,.9)' }} />
        <div style={{ width: 20, height: 12, borderRadius: Number(skin.vars['--r-card']) > 10 ? 5 : 2, background: 'rgba(255,255,255,.5)', marginBottom: 1 }} />
        {locked && (
          <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 9, fontWeight: 800, background: 'rgba(0,0,0,.5)', color: '#fcd34d', padding: '2px 7px', borderRadius: 8 }}>
            ⭐ PRO
          </span>
        )}
        {isActive && (
          <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 9, fontWeight: 800, background: 'rgba(255,255,255,.9)', color: skin.vars['--c-header-from'], padding: '2px 7px', borderRadius: 8 }}>
            ✓ Active
          </span>
        )}
      </div>
      <div style={{ padding: '10px 12px' }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-text, #1c1917)', margin: '0 0 2px' }}>{skin.emoji} {skin.name}</p>
        <p style={{ fontSize: 11, color: 'var(--c-muted, #9ca3af)', margin: 0 }}>{skin.desc}</p>
      </div>
    </button>
  );
}

/** Accent colour dot picker */
function AccentPicker({ currentAccentId, onSelect }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {ACCENTS.map(accent => {
        const isActive = accent.id === currentAccentId;
        return (
          <button key={accent.id} onClick={() => onSelect(accent.id)}
            title={accent.name}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: accent.primary,
              outline: isActive ? '3px solid ' + accent.primary : '2px solid transparent',
              outlineOffset: 2,
              boxShadow: isActive ? '0 0 0 4px ' + accent.light : 'none',
              transition: 'all .15s',
            }} />
            <span style={{ fontSize: 9, fontWeight: isActive ? 800 : 600, color: isActive ? accent.dark : 'var(--c-muted, #9ca3af)' }}>
              {accent.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Full skins + accent picker view — rendered inside Settings */
export function SkinsView({ theme, setTheme, plan }) {
  const currentSkin   = getSkin(theme.skinId);
  const currentAccent = getAccent(theme.accentId);

  const selectSkin   = (skinId)   => setTheme(t => ({ ...t, skinId }));
  const selectAccent = (accentId) => setTheme(t => ({ ...t, accentId }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Current theme preview */}
      <div style={{ borderRadius: 'var(--r-card, 18px)', overflow: 'hidden', boxShadow: 'var(--c-card-shadow, 0 1px 6px rgba(0,0,0,.07))' }}>
        <div style={{ background: 'linear-gradient(145deg, var(--c-header-from, #064e3b), var(--c-header-to, #0d7060))', padding: '18px 20px', color: '#fff' }}>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: 'rgba(255,255,255,.7)', textTransform: 'uppercase', margin: '0 0 4px' }}>Active Theme</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 26 }}>{currentSkin.emoji}</span>
            <div>
              <p style={{ fontSize: 16, fontWeight: 900, margin: 0 }}>{currentSkin.name}</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', margin: '2px 0 0' }}>{currentSkin.desc}</p>
            </div>
          </div>
        </div>
        <div style={{ background: 'var(--c-page, #f3f4f6)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 'var(--r-btn, 14px)', background: 'var(--c-accent, #f59e0b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>💰</div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-text, #1c1917)', margin: 0 }}>Sample card</p>
            <p style={{ fontSize: 11, color: 'var(--c-muted, #9ca3af)', margin: '1px 0 0' }}>This is how your app looks</p>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, background: 'var(--c-accent, #f59e0b)', color: '#fff', padding: '4px 10px', borderRadius: 'var(--r-chip, 20px)' }}>
            {currentAccent.name}
          </span>
        </div>
      </div>

      {/* Skin selector */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--c-muted, #9ca3af)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 1 }}>
          Choose a skin
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {SKINS.map(skin => (
            <SkinCard
              key={skin.id}
              skin={skin}
              isActive={skin.id === theme.skinId}
              plan={plan}
              onSelect={selectSkin}
            />
          ))}
        </div>
        {plan === 'free' && (
          <div style={{ marginTop: 12, background: 'linear-gradient(135deg,#1e1b4b,#4f46e5)', borderRadius: 'var(--r-card, 16px)', padding: '14px 16px' }}>
            <p style={{ fontWeight: 800, fontSize: 13, color: '#fff', margin: '0 0 4px' }}>⭐ 4 more skins with Premium</p>
            <p style={{ fontSize: 11, color: '#a5b4fc', margin: 0 }}>Minimal, Chic, Corporate and Cosy Home — each with your accent colour</p>
          </div>
        )}
      </div>

      {/* Accent colour picker */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--c-muted, #9ca3af)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>
          Accent colour
        </p>
        <AccentPicker currentAccentId={theme.accentId} onSelect={selectAccent} />
      </div>
    </div>
  );
}
