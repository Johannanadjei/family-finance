/**
 * DuplicatePrompt.jsx
 * Confirmation modal shown when a duplicate budget category is detected.
 * Reusable wherever categories can be added.
 */

export function DuplicatePrompt({ matchType, categoryName, onAddAnyway, onCancel }) {
  const message = matchType === 'name_and_amount'
    ? 'A category with the same name and amount already exists.'
    : 'A category with a similar name already exists.';

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 16px 32px', background: 'rgba(0,0,0,.4)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, padding: '24px', width: '100%', maxWidth: 440 }}>
        <p style={{ fontSize: 22, margin: '0 0 8px', textAlign: 'center' }}>⚠️</p>
        <p style={{ fontWeight: 900, fontSize: 16, color: '#1c1917', margin: '0 0 8px', textAlign: 'center' }}>Possible duplicate</p>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 4px', textAlign: 'center' }}>{message}</p>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', margin: '0 0 20px', textAlign: 'center' }}>Do you still want to add <strong>{categoryName}</strong>?</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel}
            style={{ flex: 1, padding: '13px', borderRadius: 12, border: '1.5px solid #e5e7eb', background: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', color: '#6b7280' }}>
            Cancel
          </button>
          <button onClick={onAddAnyway}
            style={{ flex: 1, padding: '13px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#064e3b,#0d7060)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
            Add Anyway
          </button>
        </div>
      </div>
    </div>
  );
}
