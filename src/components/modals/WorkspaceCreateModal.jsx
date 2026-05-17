import { useState } from 'react';
import { WORKSPACE_TYPES, CURRENCIES } from '../../constants/workspaces';

const STEP = { TYPE: 'type', DETAILS: 'details' };

const ICON_OPTIONS = ['🏪','🏬','✈️','🌍','📈','💰','🏘️','🏗️','💼','🎓','🚗','🐾','🛍️','📌'];

export function WorkspaceCreateModal({ onConfirm, onClose }) {
  const [step,     setStep]     = useState(STEP.TYPE);
  const [typeId,   setTypeId]   = useState('');
  const [name,     setName]     = useState('');
  const [currency, setCurrency] = useState('GHS');
  const [budget,   setBudget]   = useState('');
  const [icon,     setIcon]     = useState('');

  const selectedType = WORKSPACE_TYPES.find(t => t.id === typeId);
  const valid = name.trim().length > 0;

  const handleTypeSelect = (type) => {
    setTypeId(type.id);
    setIcon(type.icon);
    setStep(STEP.DETAILS);
  };

  const handleConfirm = () => {
    if (!valid) return;
    onConfirm({ name, typeId, currency, monthlyBudget: budget, icon: icon || selectedType?.icon });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: '#fff', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 440, margin: '0 auto', maxHeight: '90vh', overflowY: 'auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <p style={{ fontWeight: 900, fontSize: 18, color: '#1c1917', margin: 0 }}>New Control Centre</p>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>
              {step === STEP.TYPE ? 'Choose a type' : 'Set it up'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        {/* Step 1 — pick type */}
        {step === STEP.TYPE && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {WORKSPACE_TYPES.map(type => (
              <button key={type.id} onClick={() => handleTypeSelect(type)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 16, border: '1.5px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: type.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                  {type.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 800, color: '#1c1917', margin: 0 }}>{type.label}</p>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>{type.desc}</p>
                </div>
                <span style={{ color: '#d1d5db', fontSize: 20 }}>›</span>
              </button>
            ))}
          </div>
        )}

        {/* Step 2 — details */}
        {step === STEP.DETAILS && selectedType && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <button onClick={() => setStep(STEP.TYPE)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 13, fontWeight: 700, padding: 0, width: 'fit-content' }}>
              ‹ Back
            </button>

            {/* Type preview */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#f9fafb', borderRadius: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: selectedType.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
                {icon || selectedType.icon}
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#1c1917', margin: 0 }}>{selectedType.label}</p>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>{selectedType.desc}</p>
              </div>
            </div>

            {/* Icon picker */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Pick an icon</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ICON_OPTIONS.map(ic => (
                  <button key={ic} onClick={() => setIcon(ic)}
                    style={{ fontSize: 22, width: 40, height: 40, borderRadius: 10, border: icon === ic ? '2px solid #064e3b' : '1.5px solid #e5e7eb', background: icon === ic ? '#f0fdf4' : '#f9fafb', cursor: 'pointer' }}>
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Name</p>
              <input autoFocus value={name} onChange={e => setName(e.target.value)}
                placeholder={selectedType.id === 'business' ? 'e.g. My Shop' : selectedType.id === 'overseas' ? 'e.g. London Expenses' : 'e.g. Investment Account'}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #e5e7eb', fontSize: 15, fontWeight: 600, outline: 'none', background: '#f9fafb', boxSizing: 'border-box' }} />
            </div>

            {/* Currency */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Currency</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {CURRENCIES.map(c => (
                  <button key={c.code} onClick={() => setCurrency(c.code)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: currency === c.code ? 'none' : '1.5px solid #e5e7eb', background: currency === c.code ? '#064e3b' : '#f9fafb', color: currency === c.code ? '#fff' : '#374151' }}>
                    {c.flag} {c.code}
                  </button>
                ))}
              </div>
            </div>

            {/* Monthly budget */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Monthly budget (optional)</p>
              <input type="number" value={budget} onChange={e => setBudget(e.target.value)}
                placeholder="e.g. 5000"
                style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #e5e7eb', fontSize: 15, fontWeight: 600, outline: 'none', background: '#f9fafb', boxSizing: 'border-box' }} />
            </div>

            <button onClick={handleConfirm} disabled={!valid}
              style={{ width: '100%', padding: '16px', borderRadius: 14, border: 'none', fontSize: 16, fontWeight: 900, cursor: valid ? 'pointer' : 'not-allowed', background: valid ? 'linear-gradient(135deg,#064e3b,#0d7060)' : '#e5e7eb', color: valid ? '#fff' : '#9ca3af' }}>
              {valid ? 'Create ' + (icon || selectedType.icon) + ' ' + name : 'Enter a name to continue'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
