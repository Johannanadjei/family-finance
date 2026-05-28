/**
 * views/settings/ArchiveHubSheet.jsx
 *
 * Two-step bottom sheet for archiving or permanently deleting a hub.
 * Step 'archive' — explains archive, offers permanent delete escape hatch.
 * Step 'delete'  — requires typing the hub name; delete button gated until match.
 *
 * @param {boolean}  isOpen
 * @param {function} onClose
 * @param {string}   centreName  — displayed in both steps; required for delete confirmation
 * @param {function} onArchive          — async () => Promise<{ error }>
 * @param {function} onPermanentDelete  — async () => Promise<{ error }>
 */

import { useState, useEffect } from 'react';
import { createPortal }        from 'react-dom';
import { useModalChrome }      from '../../hooks/useModalChrome';

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '1.5px solid var(--c-border, #e5e7eb)', fontSize: 15, fontWeight: 700,
  outline: 'none', background: 'var(--c-input-bg, #f9fafb)', boxSizing: 'border-box',
  fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)',
};

export function ArchiveHubSheet({ isOpen, onClose, centreName, onArchive, onPermanentDelete }) {
  const [step,      setStep]      = useState('archive');
  const [nameInput, setNameInput] = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);

  useEffect(() => {
    if (isOpen) { setStep('archive'); setNameInput(''); setError(null); }
  }, [isOpen]);

  useModalChrome({ isOpen, onClose });

  if (!isOpen) return null;

  const handleArchive = async () => {
    setLoading(true);
    const { error: err } = await onArchive();
    setLoading(false);
    if (err) { setError("Couldn't archive. Please try again."); return; }
    onClose();
  };

  const handleDelete = async () => {
    if (nameInput !== centreName) return;
    setLoading(true);
    const { error: err } = await onPermanentDelete();
    setLoading(false);
    if (err) { setError("Couldn't delete. Please try again."); return; }
    onClose();
  };

  const nameMatches = nameInput === centreName;

  return createPortal(
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 340 }} />
      <div
        role="dialog"
        aria-label={step === 'archive' ? 'Archive hub' : 'Permanently delete hub'}
        data-testid="archive-hub-dialog"
        style={{
          position: 'fixed', bottom: 0,
          left: 'max(0px, calc(50vw - 220px))',
          width: '100%', maxWidth: 440,
          background: 'var(--c-card, #fff)',
          borderRadius: '20px 20px 0 0',
          padding: '24px 20px calc(24px + env(safe-area-inset-bottom))',
          zIndex: 350,
          boxShadow: '0 -8px 32px rgba(0,0,0,.12)',
        }}
      >
        <div style={{ width: 40, height: 4, background: 'var(--c-border, #e5e7eb)', borderRadius: 2, margin: '0 auto 20px' }} />

        {step === 'archive' ? (
          <>
            <p style={{ fontSize: 18, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: '0 0 8px' }}>
              Archive hub?
            </p>
            <p style={{ fontSize: 14, color: 'var(--c-muted, #6b7280)', margin: '0 0 24px', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--c-text, #1c1917)' }}>{centreName}</strong> will be hidden from your hub list. Your data is kept and nothing is lost.
            </p>

            {error && (
              <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{error}</p>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
              <button
                onClick={onClose}
                disabled={loading}
                style={{ padding: '14px', borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'var(--c-card, #fff)', fontSize: 14, fontWeight: 800, cursor: 'pointer', color: 'var(--c-text, #1c1917)', fontFamily: "'Nunito', sans-serif" }}
              >
                Cancel
              </button>
              <button
                data-testid="archive-confirm-btn"
                onClick={handleArchive}
                disabled={loading}
                style={{ padding: '14px', borderRadius: 12, border: 'none', background: loading ? 'var(--c-border, #e5e7eb)' : 'var(--c-primary, #064e3b)', color: loading ? 'var(--c-muted, #9ca3af)' : 'var(--c-btn-text, #ffffff)', fontSize: 14, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif" }}
              >
                {loading ? 'Archiving…' : 'Archive'}
              </button>
            </div>

            <button
              data-testid="archive-delete-link"
              onClick={() => { setError(null); setStep('delete'); }}
              style={{ width: '100%', marginTop: 16, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--c-muted, #9ca3af)', fontFamily: "'Nunito', sans-serif", fontWeight: 700, textAlign: 'center', padding: '4px 0' }}
            >
              Permanently delete instead →
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 18, fontWeight: 900, color: 'var(--c-danger, #dc2626)', margin: '0 0 8px' }}>
              Permanently delete?
            </p>
            <p style={{ fontSize: 14, color: 'var(--c-muted, #6b7280)', margin: '0 0 16px', lineHeight: 1.5 }}>
              This cannot be undone. All data in this hub will be gone forever.
            </p>
            <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--c-muted, #6b7280)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>
              Type hub name to confirm
            </p>
            <input
              data-testid="delete-name-input"
              value={nameInput}
              onChange={e => { setNameInput(e.target.value); setError(null); }}
              placeholder={centreName}
              style={{ ...inputStyle, marginBottom: 16 }}
            />

            {error && (
              <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{error}</p>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
              <button
                data-testid="delete-back-btn"
                onClick={() => { setStep('archive'); setError(null); setNameInput(''); }}
                disabled={loading}
                style={{ padding: '14px', borderRadius: 12, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'var(--c-card, #fff)', fontSize: 14, fontWeight: 800, cursor: 'pointer', color: 'var(--c-text, #1c1917)', fontFamily: "'Nunito', sans-serif" }}
              >
                ← Back
              </button>
              <button
                data-testid="delete-forever-btn"
                onClick={handleDelete}
                disabled={!nameMatches || loading}
                style={{ padding: '14px', borderRadius: 12, border: 'none', background: nameMatches && !loading ? 'var(--c-danger, #dc2626)' : 'var(--c-border, #e5e7eb)', color: nameMatches && !loading ? '#ffffff' : 'var(--c-muted, #9ca3af)', fontSize: 14, fontWeight: 800, cursor: nameMatches && !loading ? 'pointer' : 'not-allowed', fontFamily: "'Nunito', sans-serif" }}
              >
                {loading ? 'Deleting…' : 'Delete Forever'}
              </button>
            </div>
          </>
        )}
      </div>
    </>,
    document.body
  );
}
