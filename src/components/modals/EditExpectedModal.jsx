import { useState } from 'react';

/** Modal to edit expected income amount — fmt passed from parent PaydayView */
export function EditExpectedModal({ income, fmt, onSave, onClose }) {
  const [amount, setAmount] = useState(String(income.expectedAmount));
  const [saved,  setSaved]  = useState(false);

  const handle = () => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return;
    onSave(income.id, parsed);
    setSaved(true);
    setTimeout(onClose, 1200);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 16px 32px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, padding: '28px 24px', width: '100%', maxWidth: 440 }}>
        {saved ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <p style={{ fontSize: 28, margin: '0 0 8px' }}>✅</p>
            <p style={{ fontWeight: 800, fontSize: 16, color: '#065f46', margin: 0 }}>Expected income updated</p>
          </div>
        ) : (
          <>
            <p style={{ fontWeight: 900, fontSize: 17, margin: '0 0 4px', color: '#1c1917' }}>Edit Expected Income</p>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>{income.source}</p>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 6px' }}>Current: {fmt(income.expectedAmount)}</p>
            <input
              type="number"
              placeholder="New expected amount"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              style={{ width: '100%', padding: '13px 16px', borderRadius: 12, border: '1.5px solid #e5e7eb', fontSize: 15, fontWeight: 600, outline: 'none', background: '#f9fafb', boxSizing: 'border-box', marginBottom: 8, fontFamily: 'Nunito, sans-serif' }}
            />
            <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 16px' }}>Editing expected income updates your budget plan, not the received payment record.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handle} style={{ flex: 2, padding: '13px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#064e3b,#0d7060)', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>Save Changes</button>
              <button onClick={onClose} style={{ flex: 1, padding: '13px', borderRadius: 12, border: '1.5px solid #e5e7eb', background: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', color: '#6b7280' }}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
