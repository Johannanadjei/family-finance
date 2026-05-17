import { useState } from 'react';
import { WEEKS } from '../constants';
import { FIXED_EXPENSES } from '../constants';
import { fmt } from '../lib/finance';
import { getGuestCategories, buildGuestTransaction } from '../lib/guest';

const EMPTY_FORM = { category: '', week: 'Week 1', date: new Date().toISOString().split('T')[0], amount: '', description: '' };

/** Guest-only expense logger — no income, no totals, no family data */
export function GuestView({ guestUser, guestSettings, onAddTransaction, onSignOut, isPortalUrl }) {
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [myTxs,     setMyTxs]    = useState([]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const allCats = FIXED_EXPENSES.map(e => e.category);
  const cats    = getGuestCategories(allCats, guestSettings.allowedCategories);
  const valid   = form.category && form.amount && parseFloat(form.amount) > 0;
  const today   = new Date().toISOString().split('T')[0];

  const handleSubmit = () => {
    if (!valid) return;
    const tx = buildGuestTransaction({ ...form, guestName: guestUser.name });
    onAddTransaction(tx);
    setMyTxs(prev => [{ ...tx, id: Date.now() }, ...prev]);
    setForm(EMPTY_FORM);
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2500);
  };

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", maxWidth: 440, margin: '0 auto', minHeight: '100vh', background: '#f0f9ff' }}>

      {/* Header — blue to distinguish from owner view */}
      <div style={{ background: 'linear-gradient(145deg,#1e3a5f,#2563eb)', padding: '44px 20px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: '#93c5fd', textTransform: 'uppercase', margin: '0 0 4px' }}>
              Guest Portal
            </p>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: 0 }}>Hi, {guestUser.name} 👋</h1>
            <p style={{ fontSize: 12, color: '#bfdbfe', margin: '3px 0 0' }}>Log household expenses below</p>
          </div>
          <button onClick={onSignOut} style={{ background: 'rgba(255,255,255,.12)', border: 'none', borderRadius: 10, padding: '7px 12px', color: '#bfdbfe', fontWeight: 800, fontSize: 11, cursor: 'pointer' }}>
            {isPortalUrl ? 'Sign out' : '← Back to dashboard'}
          </button>
        </div>

        {/* Guest-visible stat: only their own submission count today */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
          {[
            ['Today\'s entries', myTxs.filter(t => t.date === today).length],
            ['Total submitted', myTxs.length],
          ].map(([l, v]) => (
            <div key={l} style={{ background: 'rgba(255,255,255,.1)', borderRadius: 12, padding: '10px 14px' }}>
              <p style={{ fontSize: 10, color: '#93c5fd', margin: 0 }}>{l}</p>
              <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '2px 0 0' }}>{v}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 16px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Success toast */}
        {submitted && (
          <div style={{ background: '#d1fae5', borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, border: '1.5px solid #6ee7b7' }}>
            <span style={{ fontSize: 20 }}>✅</span>
            <div>
              <p style={{ fontWeight: 800, fontSize: 14, color: '#065f46', margin: 0 }}>Expense logged!</p>
              <p style={{ fontSize: 11, color: '#059669', margin: '1px 0 0' }}>The family can see it on their dashboard</p>
            </div>
          </div>
        )}

        {/* Expense form */}
        <div style={{ background: '#fff', borderRadius: 20, padding: '18px', boxShadow: '0 1px 8px rgba(0,0,0,.06)' }}>
          <p style={{ fontWeight: 900, fontSize: 16, color: '#1c1917', margin: '0 0 16px' }}>Log an Expense</p>

          {/* Category chips */}
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Category</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {cats.map(cat => {
                const icon = FIXED_EXPENSES.find(e => e.category === cat)?.icon || '💸';
                return (
                  <button key={cat} onClick={() => set('category', cat)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: form.category === cat ? 'none' : '1.5px solid #e5e7eb', background: form.category === cat ? '#1e3a5f' : '#f9fafb', color: form.category === cat ? '#fff' : '#374151' }}>
                    {icon} {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Week */}
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Week</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {WEEKS.map(w => (
                <button key={w} onClick={() => set('week', w)}
                  style={{ flex: 1, padding: '9px 0', borderRadius: 12, fontWeight: 800, fontSize: 11, cursor: 'pointer', border: form.week === w ? 'none' : '1.5px solid #e5e7eb', background: form.week === w ? '#2563eb' : '#f9fafb', color: form.week === w ? '#fff' : '#9ca3af' }}>
                  {w.replace('Week ', 'W')}
                </button>
              ))}
            </div>
          </div>

          {/* Date */}
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Date</p>
            <input type="date" value={form.date} max={today} onChange={e => set('date', e.target.value)}
              style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: '1.5px solid #e5e7eb', fontSize: 14, fontWeight: 600, outline: 'none', background: '#f9fafb', boxSizing: 'border-box' }} />
          </div>

          {/* Amount */}
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Amount (GHS)</p>
            <input type="number" placeholder="0.00" min="0" value={form.amount} onChange={e => set('amount', e.target.value)}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #e5e7eb', fontSize: 26, fontWeight: 900, outline: 'none', background: '#f9fafb', textAlign: 'center', boxSizing: 'border-box' }} />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 18 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>What was it for? (optional)</p>
            <input type="text" placeholder="e.g. Kids snacks from market" value={form.description} onChange={e => set('description', e.target.value)}
              style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: '1.5px solid #e5e7eb', fontSize: 14, fontWeight: 600, outline: 'none', background: '#f9fafb', boxSizing: 'border-box' }} />
          </div>

          <button onClick={handleSubmit} disabled={!valid}
            style={{ width: '100%', padding: '16px', borderRadius: 14, border: 'none', fontSize: 16, fontWeight: 900, cursor: valid ? 'pointer' : 'not-allowed', background: valid ? 'linear-gradient(135deg,#2563eb,#1d4ed8)' : '#e5e7eb', color: valid ? '#fff' : '#9ca3af' }}>
            {valid ? 'Submit Expense — ' + fmt(parseFloat(form.amount) || 0) : 'Fill in all fields'}
          </button>
        </div>

        {/* Guest's own submission log */}
        {myTxs.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 20, padding: '16px 18px', boxShadow: '0 1px 8px rgba(0,0,0,.06)' }}>
            <p style={{ fontWeight: 900, fontSize: 15, color: '#1c1917', margin: '0 0 14px' }}>
              Your submissions ({myTxs.length})
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {myTxs.map(tx => (
                <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: '#f0f9ff', borderRadius: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                    {FIXED_EXPENSES.find(e => e.category === tx.category)?.icon || '💸'}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: '#1c1917', margin: 0 }}>{tx.category}</p>
                    {tx.description && <p style={{ fontSize: 11, color: '#9ca3af', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</p>}
                    <div style={{ display: 'flex', gap: 5, marginTop: 3 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, background: '#e0e7ff', color: '#4338ca', padding: '1px 7px', borderRadius: 10 }}>{tx.week}</span>
                    </div>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 900, color: '#1c1917', flexShrink: 0 }}>{fmt(tx.amount)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info note */}
        <div style={{ background: '#eff6ff', borderRadius: 14, padding: '12px 16px', display: 'flex', gap: 10 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>ℹ️</span>
          <p style={{ fontSize: 12, color: '#1e40af', margin: 0, lineHeight: 1.6 }}>
            Your submissions go straight to the family dashboard. Only log real expenses — everything you submit is reviewed by the family.
          </p>
        </div>
      </div>
    </div>
  );
}
