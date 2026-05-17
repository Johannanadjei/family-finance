/**
 * EmojiPicker.jsx
 * Preset emoji picker for budget category icons.
 * Supports skin tone variants for person emojis — like WhatsApp.
 * Reusable across onboarding, budget settings, and add modal.
 */

import { useState } from 'react';

const SKIN_TONES = ['', '🏻', '🏼', '🏽', '🏾', '🏿'];

const PERSON_EMOJIS = ['👶','🧒','👧','👦','🧑','👩','👨','🧓','👴','👵','🤱','💆','💇','🏋️','🧘'];

const FLAT_EMOJIS = [
  '🏠','🏡','🏢','💡','💧','🔥','🔌','🛁',
  '🛒','🍔','🍗','🍚','🍜','🥘','🫕','🌮','🍞','☕','🧃',
  '🚗','🚙','🏍️','🚌','✈️','⛽',
  '💊','🏥','💉','🩺',
  '🎓','🏫','📚','✏️',
  '💰','💳','🏦','📈','💼','🧾','🪙',
  '📺','🎮','⚽','🏀','🎵','🎬','🎁','🎉',
  '⛪','🕌','🛕','🤲','🤝',
  '📦','🧹','🌿','🐕','🐈','🌍','💑','👨‍👩‍👧‍👦',
];

export function EmojiPicker({ onSelect, onClose }) {
  const [toneFor, setToneFor] = useState(null);

  const handlePersonTap = (emoji) => {
    setToneFor(toneFor === emoji ? null : emoji);
  };

  const handleSelectWithTone = (emoji, tone) => {
    onSelect(emoji + tone);
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 16px 32px', background: 'rgba(0,0,0,.4)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, padding: '20px 16px', width: '100%', maxWidth: 440, maxHeight: '80vh', overflowY: 'auto' }}>
        <p style={{ fontWeight: 800, fontSize: 14, color: '#1c1917', margin: '0 0 6px' }}>Choose an icon</p>
        <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 14px' }}>Tap a person emoji to choose a skin tone</p>

        {/* Person emojis with skin tone support */}
        <p style={{ fontSize: 10, fontWeight: 800, color: '#9ca3af', letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 8px' }}>People</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
          {PERSON_EMOJIS.map(emoji => (
            <div key={emoji} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <button onClick={() => handlePersonTap(emoji)}
                style={{ fontSize: 24, background: toneFor === emoji ? '#d1fae5' : '#f9fafb', border: toneFor === emoji ? '1.5px solid #059669' : '1.5px solid #e5e7eb', borderRadius: 10, width: 44, height: 44, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {emoji}
              </button>
              {toneFor === emoji && (
                <div style={{ display: 'flex', gap: 4, background: '#f0fdf4', borderRadius: 10, padding: '6px 8px', border: '1px solid #6ee7b7' }}>
                  {SKIN_TONES.map((tone, i) => (
                    <button key={i} onClick={() => handleSelectWithTone(emoji, tone)}
                      style={{ fontSize: 20, background: 'none', border: 'none', cursor: 'pointer', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6 }}>
                      {emoji + tone}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* All other emojis flat grid */}
        <p style={{ fontSize: 10, fontWeight: 800, color: '#9ca3af', letterSpacing: 1, textTransform: 'uppercase', margin: '16px 0 8px' }}>Categories</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {FLAT_EMOJIS.map(emoji => (
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
