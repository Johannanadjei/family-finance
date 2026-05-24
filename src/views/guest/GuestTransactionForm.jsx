// views/guest/GuestTransactionForm.jsx

import { useState } from 'react';
import { submitGuestTransaction } from '../../services/guests.service';
import { getWeekForDate } from '../../lib/finance';

const inp = {
  width: '100%', padding: '14px 16px', borderRadius: 12,
  border: '1.5px solid var(--c-border, #e5e7eb)', fontSize: 16, fontWeight: 700,
  background: 'var(--c-input-bg, #f9fafb)', boxSizing: 'border-box',
  fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)', outline: 'none',
};
const dateInp = { ...inp, padding: '12px 8px', textAlign: 'center', fontSize: 16 };
const lbl = { fontSize: 12, fontWeight: 900, color: 'var(--c-muted, #6b7280)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 0.8 };

export function GuestTransactionForm({ session, currency, onSignOut }) {
  const now = new Date();
  const [category,    setCategory]    = useState('');
  const [amount,      setAmount]      = useState('');
  const [description, setDescription] = useState('');
  const [day,         setDay]         = useState(String(now.getDate()));
  const [month,       setMonth]       = useState(String(now.getMonth() + 1));
  const [year,        setYear]        = useState(String(now.getFullYear()));
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState(null);
  const [success,     setSuccess]     = useState(false);

  const handleSubmit = async () => {
    const n = parseFloat(amount);
    if (!amount || isNaN(n) || n <= 0)                                        { setError('Please enter an amount greater than zero'); return; }
    const d = parseInt(day), m = parseInt(month), y = parseInt(year);
    if (!day   || isNaN(d) || d < 1   || d > 31)                             { setError('Please enter a valid day (1-31)');        return; }
    if (!month || isNaN(m) || m < 1   || m > 12)                             { setError('Please enter a valid month (1-12)');      return; }
    if (!year  || isNaN(y) || y < 2020 || y > 2030)                          { setError('Please enter a valid year (2020-2030)'); return; }
    if (new Date(y, m - 1, d).getDate() !== d)                               { setError('Please enter a valid date'); return; }
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    setSaving(true); setError(null);
    const { error: e } = await submitGuestTransaction({
      guestId: session.guestId, centreId: session.centreId,
      amount: Math.round(n), categoryName: category || 'Other',
      description: description.trim(), date: dateStr,
      week: getWeekForDate(dateStr), currency: currency || 'GHS',
    });
    setSaving(false);
    if (e) { setError('Could not save. Please try again.'); return; }
    const fresh = new Date();
    setCategory(''); setAmount(''); setDescription('');
    setDay(String(fresh.getDate())); setMonth(String(fresh.getMonth() + 1)); setYear(String(fresh.getFullYear()));
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  const allowedCats = session.allowedCategories || [];
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(145deg, var(--c-header-from, #064e3b), var(--c-header-to, #0d7060))', fontFamily: "'Nunito', sans-serif" }}>
      <div style={{ padding: '52px 20px 28px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 4px' }}>👋 {session.guestName}</p>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', margin: 0 }}>Log an expense</p>
        </div>
        <button onClick={onSignOut} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '7px 13px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>
          Sign out
        </button>
      </div>

      <div style={{ background: 'var(--c-bg, #f3f4f6)', borderRadius: '24px 24px 0 0', minHeight: 'calc(100vh - 172px)', padding: '24px 20px' }}>
        {success && (
          <div style={{ background: '#d1fae5', borderRadius: 10, padding: '12px 16px', marginBottom: 16, textAlign: 'center' }}>
            <p data-testid="guest-success-msg" style={{ fontSize: 14, fontWeight: 800, color: '#065f46', margin: 0 }}>✓ Expense saved!</p>
          </div>
        )}

        {allowedCats.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={lbl}>Category</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {allowedCats.map(cat => (
                <button key={cat} data-testid={`guest-cat-${cat}`} onClick={() => setCategory(cat === category ? '' : cat)} style={{ padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${cat === category ? 'var(--c-primary, #064e3b)' : 'var(--c-border, #e5e7eb)'}`, background: cat === category ? 'var(--c-chip-selected-bg, #f0fdf4)' : 'var(--c-chip-bg, #f3f4f6)', color: cat === category ? 'var(--c-chip-selected-text, #064e3b)' : 'var(--c-chip-text, #1c1917)', fontFamily: "'Nunito', sans-serif" }}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <p style={lbl}>Amount</p>
          <input data-testid="guest-amount-input" type="number" value={amount} onChange={e => { setAmount(e.target.value); setError(null); }} placeholder="0" min="0" style={{ ...inp, fontSize: 22 }} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <p style={lbl}>Description (optional)</p>
          <input data-testid="guest-description-input" type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. weekly groceries" style={{ ...inp, fontSize: 14, fontWeight: 600 }} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={lbl}>Date</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input data-testid="guest-date-day"   type="number" min="1"    max="31"   placeholder="DD"   value={day}   onChange={e => { setDay(e.target.value.replace(/\D/g, ''));   setError(null); }} style={{ ...dateInp, width: 60 }} />
            <span style={{ color: 'var(--c-muted, #6b7280)', fontWeight: 800, fontSize: 18, flexShrink: 0 }}>/</span>
            <input data-testid="guest-date-month" type="number" min="1"    max="12"   placeholder="MM"   value={month} onChange={e => { setMonth(e.target.value.replace(/\D/g, '')); setError(null); }} style={{ ...dateInp, width: 60 }} />
            <span style={{ color: 'var(--c-muted, #6b7280)', fontWeight: 800, fontSize: 18, flexShrink: 0 }}>/</span>
            <input data-testid="guest-date-year"  type="number" min="2020" max="2030" placeholder="YYYY" value={year}  onChange={e => { setYear(e.target.value.replace(/\D/g, ''));  setError(null); }} style={{ ...dateInp, width: 80 }} />
          </div>
        </div>

        {error && (
          <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
            <p data-testid="guest-form-error" style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{error}</p>
          </div>
        )}

        <button data-testid="guest-save-btn" onClick={handleSubmit} disabled={saving} style={{ width: '100%', padding: '15px', borderRadius: 12, border: 'none', background: saving ? 'var(--c-border, #e5e7eb)' : 'var(--c-primary, #064e3b)', color: saving ? 'var(--c-muted, #9ca3af)' : 'var(--c-btn-text, #ffffff)', fontSize: 15, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'Nunito', sans-serif" }}>
          {saving ? 'Saving…' : 'Save Expense'}
        </button>
      </div>
    </div>
  );
}
