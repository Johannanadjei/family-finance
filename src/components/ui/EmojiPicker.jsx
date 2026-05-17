/**
 * EmojiPicker.jsx
 * Preset emoji picker for budget category icons.
 * Reusable across onboarding, budget settings, and add modal.
 */

const PRESET_EMOJIS = [
  '🏠','🛒','🚗','💡','💧','🔥','📱','🏫','⚽','💊',
  '👶','💇','💅','💰','🧾','🙏','🧓','📦','🎓','🚙',
  '✈️','🏥','🛡️','📺','💼','🎁','🍔','☕',
];

export function EmojiPicker({ onSelect, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 16px 32px', background: 'rgba(0,0,0,.4)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, padding: '20px 16px', width: '100%', maxWidth: 440 }}>
        <p style={{ fontWeight: 800, fontSize: 14, color: '#1c1917', margin: '0 0 14px' }}>Choose an icon</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PRESET_EMOJIS.map(emoji => (
            <button key={emoji} onClick={() => { onSelect(emoji); onClose(); }}
              style={{ fontSize: 24, background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 10, width: 44, height: 44, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {emoji}
            </button>
          ))}
        </div>
        <button onClick={onClose} style={{ width: '100%', marginTop: 16, padding: '11px', borderRadius: 12, border: 'none', background: '#f3f4f6', fontWeight: 700, fontSize: 14, color: '#6b7280', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
