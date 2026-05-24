// views/settings/GuestSettingsSection.jsx

import { useState, useEffect, useCallback } from 'react';
import { useBudgetCentreContext }           from '../../context/BudgetCentreContext';
import { useFinanceContext }                from '../../context/FinanceContext';
import { getGuestUsers, createGuestUser, updateGuestUser, setGuestActive, deleteGuestUser } from '../../services/guests.service';
import { AddGuestSheet }                   from './AddGuestSheet';

const card  = { background: 'var(--c-card, #fff)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--c-shadow)', marginBottom: 16 };
const slbl  = { fontSize: 13, fontWeight: 900, color: 'var(--c-muted, #6b7280)', textTransform: 'uppercase', letterSpacing: 0.8 };

export function GuestSettingsSection() {
  const { centre, categories } = useBudgetCentreContext();
  const { userPlan }           = useFinanceContext();
  const [guests,    setGuests]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editGuest, setEditGuest] = useState(null);
  const [deleteId,  setDeleteId]  = useState(null);
  const [copied,    setCopied]    = useState(false);
  const [error,     setError]     = useState(null);

  const loadGuests = useCallback(async () => {
    if (!centre?.id) return;
    const { data } = await getGuestUsers(centre.id);
    setGuests(data || []); setLoading(false);
  }, [centre?.id]);

  useEffect(() => { loadGuests(); }, [loadGuests]);

  const portalLink = centre
    ? `${window.location.origin}?guest=1&c=${centre.id}&cur=${centre.currency || 'GHS'}`
    : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(portalLink).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const handleSave = async ({ name, pin, allowedCategories }) => {
    const result = editGuest
      ? await updateGuestUser(editGuest.id, { name, allowedCategories, ...(pin ? { pin } : {}) })
      : await createGuestUser(centre.id, { name, pin, allowedCategories });
    if (result.error) return { error: result.error };
    await loadGuests();
    return { error: null };
  };

  const handleToggleActive = async (g) => {
    const { error: e } = await setGuestActive(g.id, !g.is_active);
    if (e) { setError('Could not update guest. Please try again.'); return; }
    setGuests(prev => prev.map(x => x.id === g.id ? { ...x, is_active: !g.is_active } : x));
  };

  const handleDeleteConfirm = async () => {
    if (!deleteId) return;
    const { error: e } = await deleteGuestUser(deleteId);
    if (e) { setError('Could not delete guest. Please try again.'); setDeleteId(null); return; }
    setGuests(prev => prev.filter(g => g.id !== deleteId)); setDeleteId(null);
  };

  const canAddMore = userPlan === 'pro' || guests.length === 0;
  const catNames   = categories.map(c => c.name);

  return (
    <>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <p style={{ ...slbl, margin: 0 }}>Guest Access</p>
          {canAddMore
            ? <button data-testid="add-guest-btn" onClick={() => { setEditGuest(null); setSheetOpen(true); setError(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-primary, #064e3b)', fontSize: 13, fontWeight: 800, padding: 0, fontFamily: "'Nunito', sans-serif" }}>+ Add Guest</button>
            : <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--c-muted, #6b7280)', background: 'var(--c-bg, #f3f4f6)', padding: '3px 8px', borderRadius: 20 }}>PRO to add more</span>
          }
        </div>

        <p style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: '0 0 12px', lineHeight: 1.5 }}>
          Share a link so household members can log expenses without a full account.
        </p>

        {centre && (
          <>
            <p data-testid="portal-link-label" style={{ fontSize: 12, fontWeight: 800, color: 'var(--c-muted, #6b7280)', margin: '0 0 6px' }}>
              Guest portal link for: <span style={{ color: 'var(--c-primary, #064e3b)' }}>{centre.name}</span>
            </p>
            <div style={{ background: 'var(--c-bg, #f3f4f6)', borderRadius: 10, padding: '10px 12px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <p data-testid="portal-link" style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: 0, flex: 1, wordBreak: 'break-all' }}>{portalLink}</p>
              <button data-testid="copy-link-btn" onClick={handleCopy} style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 8, border: 'none', background: copied ? 'var(--c-success, #059669)' : 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </>
        )}

        {error && <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}><p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{error}</p></div>}

        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: 0 }}>Loading…</p>
        ) : guests.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: 0 }}>No guests yet</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {guests.map(g => (
              <div key={g.id} data-testid={`guest-row-${g.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--c-bg, #f3f4f6)', opacity: g.is_active ? 1 : 0.6 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text, #1c1917)', margin: '0 0 2px' }}>{g.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--c-muted, #6b7280)', margin: 0 }}>{g.is_active ? 'Active' : 'Inactive'}{g.allowed_categories?.length > 0 ? ` · ${g.allowed_categories.join(', ')}` : ''}</p>
                </div>
                <button data-testid={`guest-toggle-${g.id}`} onClick={() => handleToggleActive(g)} aria-label={g.is_active ? 'Deactivate' : 'Activate'} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--c-muted, #6b7280)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={g.is_active ? 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0' : 'M4 4l16 16M9 17H3s1-2 3-7M13.73 21a2 2 0 0 1-3.46 0M8.56 2.75A6 6 0 0 1 18 8c0 3-.7 5.3-1.7 7'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <button data-testid={`guest-edit-${g.id}`} onClick={() => { setEditGuest(g); setSheetOpen(true); setError(null); }} aria-label="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--c-muted, #6b7280)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                {deleteId === g.id ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button data-testid={`guest-delete-confirm-${g.id}`} onClick={handleDeleteConfirm} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'var(--c-danger, #dc2626)', color: 'var(--c-btn-text, #ffffff)', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>Delete</button>
                    <button onClick={() => setDeleteId(null)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--c-border, #e5e7eb)', background: 'var(--c-card, #fff)', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)' }}>Cancel</button>
                  </div>
                ) : (
                  <button data-testid={`guest-delete-${g.id}`} onClick={() => setDeleteId(g.id)} aria-label="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--c-danger, #dc2626)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AddGuestSheet isOpen={sheetOpen} onClose={() => { setSheetOpen(false); setEditGuest(null); }} onSave={handleSave} categories={catNames} editGuest={editGuest} />
    </>
  );
}
