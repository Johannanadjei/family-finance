import { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { WEEKS } from '../../constants';
import { useHouseholdContext } from '../../context/HouseholdContext';
import { inputStyle } from '../ui';

const today = () => new Date().toISOString().split('T')[0];

const EMPTY_FORM = {
  type:        'Expense',
  week:        'Week 1',
  date:        today(),
  category:    '',
  amount:      '',
  description: '',
};

export function AddModal({ onSubmit, onClose }) {
  const { fmt, categories, household } = useHouseholdContext();
  const [form, setForm] = useState(EMPTY_FORM);
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  // Expense categories come from Supabase via context
  // Income uses income source names or a simple fallback
  const expenseCats = categories.map(c => c.name);
  const incomeCats  = ['Salary', 'Freelance', 'Business', 'Investment', 'Other Income'];
  const cats        = form.type === 'Income' ? incomeCats : expenseCats;
  const currency    = household?.currency || 'GHS';
  const valid       = form.category && form.amount && parseFloat(form.amount) > 0;

  const handleSubmit = () => {
    if (!valid) return;
    onSubmit({
      date:        form.date || today(),
      week:        form.week,
      type:        form.type,
      category:    form.category,
      description: form.description,
      amount:      parseFloat(form.amount) || 0,
    });
    setForm(EMPTY_FORM);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: '#fff', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 440, margin: '0 auto', maxHeight: '92vh', overflowY: 'auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <p style={{ fontWeight: 900, fontSize: 18, color: '#1c1917', margin: 0 }}>Add Transaction</p>
          <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="#6b7280" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>Type</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {['Expense', 'Income'].map(t => (
                <button key={t} onClick={() => { set('type', t); set('category', ''); }}
                  style={{ padding: '12px', borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: 'pointer',
                    border: form.type === t ? 'none' : '1.5px solid #e5e7eb',
                    background: form.type === t ? (t === 'Income' ? '#d1fae5' : '#fee2e2') : '#f9fafb',
                    color: form.type === t ? (t === 'Income' ? '#059669' : '#dc2626') : '#9ca3af' }}>
                  {t === 'Income' ? '↑ Income' : '↓ Expense'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>Week</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {WEEKS.map(w => (
                <button key={w} onClick={() => set('week', w)}
                  style={{ padding: '8px 14px', borderRadius: 20, fontWeight: 800, fontSize: 12, cursor: 'pointer',
                    border: form.week === w ? 'none' : '1.5px solid #e5e7eb',
                    background: form.week === w ? '#064e3b' : '#f9fafb',
                    color: form.week === w ? '#fff' : '#9ca3af' }}>
                  {w}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>Date</p>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
              max={today()} style={inputStyle} />
          </div>

          <div>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>Category</p>
            <div style={{ position: 'relative' }}>
              <select value={form.category} onChange={e => set('category', e.target.value)}
                style={{ ...inputStyle, appearance: 'none', paddingRight: 36 }}>
                <option value="">Choose category…</option>
                {cats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={16} color="#9ca3af" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>
          </div>

          <div>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>Amount ({currency})</p>
            <input type="number" placeholder="0" value={form.amount} onChange={e => set('amount', e.target.value)}
              min="0" style={{ ...inputStyle, fontSize: 22, fontWeight: 900 }} />
          </div>

          <div>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>Description (optional)</p>
            <input type="text" placeholder="e.g. Weekly groceries" value={form.description}
              onChange={e => set('description', e.target.value)} style={inputStyle} />
          </div>

          <button onClick={handleSubmit} disabled={!valid}
            style={{ width: '100%', padding: '16px', borderRadius: 14, border: 'none', marginTop: 4, cursor: valid ? 'pointer' : 'not-allowed',
              background: valid ? 'linear-gradient(135deg,#f59e0b,#d97706)' : '#e5e7eb',
              color: valid ? '#fff' : '#9ca3af', fontSize: 16, fontWeight: 900 }}>
            {valid ? 'Add ' + form.type + ' · ' + fmt(parseFloat(form.amount) || 0) : 'Fill in all fields'}
          </button>
        </div>
      </div>
    </div>
  );
}
