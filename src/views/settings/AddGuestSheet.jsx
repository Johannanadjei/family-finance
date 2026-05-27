// views/settings/AddGuestSheet.jsx

import { useState, useEffect } from 'react';

const inp = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '1.5px solid var(--c-border, #e5e7eb)', fontSize: 14, fontWeight: 700,
  background: 'var(--c-input-bg, #f9fafb)', boxSizing: 'border-box',
  fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)', outline: 'none',
};
const lbl = { fontSize: 12, fontWeight: 900, color: 'var(--c-muted, #6b7280)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 0.8 };

export function AddGuestSheet({ isOpen, onClose, onSave, categories = [], editGuest = null }) {
  const isEditing = !!editGuest;
  const [name,       setName]       = useState('');
  const [pin,        setPin]        = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [allowedCats,setAllowedCats]= useState([]);
  const [error,      setError]      = useState(null);
  const [saving,     setSaving]     = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(editGuest?.name || '');
      setPin(''); setConfirmPin('');
      setAllowedCats(editGuest?.allowed_categories || []);
      setError(null);
    }
  }, [isOpen, editGuest?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const toggleCat = (cat) =>
    setAllowedCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);

  const validate = () => {
    if (!name.trim()) { setError('Please enter a name'); return false; }
    const hasPin = pin.length > 0;
    if (!isEditing && !hasPin)              { setError('Please set a 4-digit PIN'); return false; }
    if (hasPin && pin.length !== 4)         { setError('PIN must be exactly 4 digits'); return false; }
    if (hasPin && pin !== confirmPin)       { setError('PINs do not match'); return false; }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true); setError(null);
    const payload = { name: name.trim(), allowedCategories: allowedCats };
    if (pin) payload.pin = pin;
    const { error: e } = await onSave(payload);
    setSaving(false);
    if (e) { setError('Could not save. Please try again.'); return; }
    onClose();
  };

  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 440 }} />
      <div role="dialog" aria-label={isEditing ? 'Edit guest' : 'Add guest'} style={{ position: 'fixed', bottom: 0, left: 'max(0px, calc(50vw - 220px))', width: '100%', maxWidth: 440, background: 'var(--c-modal-bg, var(--c-card, #fff))', borderRadius: '20px 20px 0 0', padding: '24px 20px calc(24px + env(safe-area-inset-bottom))', zIndex: 450, boxShadow: '0 -8px 32px rgba(0,0,0,.12)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ width: 40, height: 4, background: 'var(--c-border, #e5e7eb)', borderRadius: 2, margin: '0 auto 20px' }} />
        <p style={{ fontSize: 18, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 20px' }}>
          {isEditing ? 'Edit Guest' : 'Add Guest'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <p style={lbl}>Name</p>
            <input data-testid="add-guest-name" type="text" value={name} onChange={e => { setName(e.target.value); setError(null); }} placeholder="e.g. Sarah" style={inp} />
          </div>
          <div>
            <p style={lbl}>{isEditing ? 'New PIN (leave blank to keep current)' : 'PIN'}</p>
            <input data-testid="add-guest-pin" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(null); }} placeholder="••••" style={{ ...inp, textAlign: 'center', letterSpacing: 6, fontSize: 18 }} />
          </div>
          <div>
            <p style={lbl}>Confirm PIN</p>
            <input data-testid="add-guest-confirm-pin" type="password" inputMode="numeric" maxLength={4} value={confirmPin} onChange={e => { setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(null); }} placeholder="••••" style={{ ...inp, textAlign: 'center', letterSpacing: 6, fontSize: 18 }} />
          </div>
          {categories.length > 0 && (
            <div>
              <p style={lbl}>Category access</p>
              <p style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: '0 0 8px' }}>Leave all unchecked to allow all categories.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {categories.map(cat => (
                  <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input data-testid={`guest-cat-check-${cat}`} type="checkbox" checked={allowedCats.includes(cat)} onChange={() => toggleCat(cat)} style={{ width: 18, height: 18, accentColor: 'var(--c-primary, #064e3b)' }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text, #1c1917)' }}>{cat}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {error && (
            <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '10px 14px' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{error}</p>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginTop: 4 }}>
            <button onClick={onClose} disabled={saving} style={{ padding: '13px', borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'var(--c-card, #fff)', fontSize: 14, fontWeight: 800, cursor: 'pointer', color: 'var(--c-text, #1c1917)', fontFamily: "'Nunito', sans-serif" }}>
              Cancel
            </button>
            <button data-testid="add-guest-save-btn" onClick={handleSave} disabled={saving} style={{ padding: '13px', borderRadius: 12, border: 'none', background: saving ? 'var(--c-border, #e5e7eb)' : 'var(--c-primary, #064e3b)', color: saving ? 'var(--c-muted, #9ca3af)' : 'var(--c-btn-text, #ffffff)', fontSize: 14, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif" }}>
              {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Save Guest'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
